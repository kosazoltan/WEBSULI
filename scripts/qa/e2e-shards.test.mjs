// A CI böngészős körének felosztója és számláló-ellenőre (docs/specs/2026-11-18-ci-e2e-szeleteles.md).
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  SEP, checkCoverage, flattenTests, inexpressible, main, measuredWeights, partition, reportName, testListText, validateWeights,
} from './e2e-shards.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

/** Egy JSON-riporter alakú spec (egy projekt). `results`: az eredmények ideje ms-ban (üres = nem futott). */
const spec = (file, title, id, results = []) => ({
  title, id, file, line: 1, column: 1,
  tests: [{ projectName: 'chromium', status: results.length ? 'expected' : 'skipped', results: results.map((duration) => ({ duration, status: 'passed' })) }],
});

/** Lista `files` szerint: `{ fájl: tesztszám }` → egy fájl-szvit fájlonként, a tesztek közvetlenül benne. */
function listOf(files, ran = false) {
  return {
    suites: Object.entries(files).map(([file, n]) => ({
      title: file, file,
      specs: Array.from({ length: n }, (_, i) => spec(file, `eset ${i + 1}`, `${file}-${i + 1}`, ran ? [1000] : [])),
    })),
  };
}

const W = { defaultSecPerTest: 1, files: {} };

test('flattenTests: beágyazott describe a címút része, a névtelen describe és a fájl-szvit címe nem; a fájl a teszt forrásfájlja', () => {
  const json = {
    suites: [{
      title: 'game-mobile-quality.spec.ts', file: 'game-mobile-quality.spec.ts',
      specs: [spec('game-mobile-quality.spec.ts', 'gyökér', 'a')],
      suites: [
        { title: 'tsunami', specs: [], suites: [{ title: '390x844', specs: [spec('support/game-mobile-quality.ts', 'M1', 'b', [1200, 300])], suites: [] }] },
        { title: '', specs: [spec('game-mobile-quality.spec.ts', 'névtelenben', 'c')], suites: [] },
      ],
    }],
  };
  const t = flattenTests(json);
  assert.deepEqual(t.map((x) => x.key), [
    `[chromium]${SEP}game-mobile-quality.spec.ts${SEP}gyökér`,
    `[chromium]${SEP}support/game-mobile-quality.ts${SEP}tsunami${SEP}390x844${SEP}M1`,
    `[chromium]${SEP}game-mobile-quality.spec.ts${SEP}névtelenben`,
  ]);
  assert.equal(t[1].id, 'b::chromium');
  assert.equal(t[1].results, 2);
  assert.equal(t[1].durationMs, 1500);
  assert.equal(t[0].results, 0);
});

test('partition: minden teszt pontosan egy szeletben, determinisztikusan, a szeleten belül a lista sorrendjében', () => {
  const tests = flattenTests(listOf({ 'a.spec.ts': 7, 'b.spec.ts': 3, 'c.spec.ts': 11, 'd.spec.ts': 1, 'e.spec.ts': 5 }));
  for (const total of [1, 2, 3, 4]) {
    const buckets = partition(tests, W, total);
    assert.equal(buckets.length, total);
    const ids = buckets.flatMap((b) => b.tests.map((t) => t.id));
    assert.equal(ids.length, tests.length);
    assert.deepEqual([...ids].sort(), tests.map((t) => t.id).sort());
    assert.deepEqual(partition(tests, W, total).map((b) => b.tests.map((t) => t.id)), buckets.map((b) => b.tests.map((t) => t.id)));
    for (const b of buckets) {
      const pos = b.tests.map((t) => tests.indexOf(t));
      assert.deepEqual(pos, [...pos].sort((x, y) => x - y));
    }
  }
});

test('partition: a nem bontható fájl egy szeletben marad akkor is, ha nehezebb a célnál', () => {
  const tests = flattenTests(listOf({ 'nagy.spec.ts': 40, 'k1.spec.ts': 2, 'k2.spec.ts': 2, 'k3.spec.ts': 2 }));
  const buckets = partition(tests, W, 3);
  const withBig = buckets.filter((b) => b.tests.some((t) => t.file === 'nagy.spec.ts'));
  assert.equal(withBig.length, 1);
  assert.equal(withBig[0].tests.filter((t) => t.file === 'nagy.spec.ts').length, 40);
});

test('partition: a bontható nehéz fájl egymást követő darabokra oszlik, és a szeletek kiegyensúlyozottak', () => {
  const tests = flattenTests(listOf({ 'nagy.spec.ts': 40, 'k1.spec.ts': 2, 'k2.spec.ts': 2, 'k3.spec.ts': 2 }));
  const buckets = partition(tests, { ...W, splittable: ['nagy.spec.ts'] }, 3);
  assert.ok(buckets.filter((b) => b.tests.some((t) => t.file === 'nagy.spec.ts')).length >= 2);
  const weights = buckets.map((b) => b.weight);
  assert.ok(Math.max(...weights) - Math.min(...weights) <= 46 / 3 / 2 + 1e-9, `szórás: ${weights.join(' / ')}`);
  assert.equal(buckets.reduce((n, b) => n + b.tests.length, 0), 46);
});

test('partition: a súlyfájl fájlonkénti súlya számít (a nehéz fájl egyedül, a könnyűek együtt)', () => {
  const tests = flattenTests(listOf({ 'lassu.spec.ts': 2, 'gyors1.spec.ts': 10, 'gyors2.spec.ts': 10 }));
  const buckets = partition(tests, { defaultSecPerTest: 1, files: { 'lassu.spec.ts': 10 } }, 2);
  const slow = buckets.find((b) => b.tests.some((t) => t.file === 'lassu.spec.ts'));
  assert.deepEqual([...new Set(slow.tests.map((t) => t.file))], ['lassu.spec.ts']);
  assert.deepEqual(buckets.map((b) => b.weight).sort((a, b) => a - b), [20, 20]);
});

test('partition: hibás szeletszám kivétel', () => {
  assert.throws(() => partition([], W, 0), /pozitív egész/);
  assert.throws(() => partition([], W, 1.5), /pozitív egész/);
});

test('testListText: soronként egy „[projekt] › fájl › cím” sor, lezáró újsorral', () => {
  const tests = flattenTests(listOf({ 'a.spec.ts': 2 }));
  assert.equal(testListText(tests), `[chromium]${SEP}a.spec.ts${SEP}eset 1\n[chromium]${SEP}a.spec.ts${SEP}eset 2\n`);
});

test('inexpressible: „›”, üres és szélső szóközös cím a --test-list-ben nem fejezhető ki', () => {
  const json = { suites: [{ title: 'a.spec.ts', file: 'a.spec.ts', specs: [spec('a.spec.ts', 'jó', '1'), spec('a.spec.ts', 'rossz › cím', '2'), spec('a.spec.ts', ' szóköz', '3')] }] };
  assert.equal(inexpressible(flattenTests(json)).length, 2);
});

test('validateWeights: hibás súlyfájl kivétel', () => {
  assert.throws(() => validateWeights({ files: {} }), /defaultSecPerTest/);
  assert.throws(() => validateWeights({ defaultSecPerTest: 1, files: { 'a.spec.ts': 0 } }), /a\.spec\.ts/);
  assert.throws(() => validateWeights({ defaultSecPerTest: 1, splittable: 'a.spec.ts' }), /splittable/);
  assert.equal(validateWeights({ defaultSecPerTest: 2, files: { 'a.spec.ts': 3 } }).defaultSecPerTest, 2);
});

/** A lista tesztjei „lefutott” jelentésként, két szeletre vágva. */
function coverageFixture() {
  const listed = flattenTests(listOf({ 'a.spec.ts': 3, 'b.spec.ts': 2 }));
  const ran = flattenTests(listOf({ 'a.spec.ts': 3, 'b.spec.ts': 2 }, true));
  return { listed, ran };
}

test('checkCoverage: hiánytalan, átfedésmentes, lefutott szeletek → egyezik', () => {
  const { listed, ran } = coverageFixture();
  const res = checkCoverage(listed, new Map([[1, ran.slice(0, 3)], [2, ran.slice(3)]]));
  assert.equal(res.ok, true, res.problems.join('\n'));
  assert.equal(res.sum, 5);
  assert.equal(res.expected, 5);
  assert.deepEqual(res.rows.map((r) => [r.part, r.count, r.ran]), [['1', 3, 3], ['2', 2, 2]]);
});

test('checkCoverage: hiányzó jelentés, hiányzó teszt, kétszer futó, listán kívüli és meg nem futott teszt bukás', () => {
  const { listed, ran } = coverageFixture();
  const problemsOf = (shards) => { const r = checkCoverage(listed, new Map(shards)); assert.equal(r.ok, false); return r.problems.join('\n'); };
  assert.match(problemsOf([[1, ran.slice(0, 3)], [2, null]]), /2\. szelet jelentése hiányzik/);
  assert.match(problemsOf([[1, ran.slice(0, 3)], [2, ran.slice(4)]]), /Egyik szeletben sem futott: .*b\.spec\.ts › eset 1/);
  assert.match(problemsOf([[1, ran.slice(0, 3)], [2, ran.slice(2)]]), /Kétszer futott \(a 1\. és a 2\. szeletben\)/);
  const extra = flattenTests(listOf({ 'z.spec.ts': 1 }, true));
  assert.match(problemsOf([[1, ran.slice(0, 3)], [2, [...ran.slice(3), ...extra]]]), /listán nem szereplő teszt futott: .*z\.spec\.ts/);
  const notRun = [...ran.slice(3, 4), { ...ran[4], results: 0 }];
  const text = problemsOf([[1, ran.slice(0, 3)], [2, notRun]]);
  assert.match(text, /nem futott le \(nincs eredménye\)/);
  assert.match(text, /összege 4, a lista teljes száma 5/);
});

test('measuredWeights: fájlonkénti mp / teszt a jelentésből; a splittable megmarad', () => {
  const ran = flattenTests({ suites: [{ title: 'a.spec.ts', file: 'a.spec.ts', specs: [spec('a.spec.ts', '1', 'x', [2000, 1000]), spec('a.spec.ts', '2', 'y', [1000])] }] });
  const w = measuredWeights(ran, { splittable: ['a.spec.ts'], defaultSecPerTest: 9 });
  assert.deepEqual(w.files, { 'a.spec.ts': 2 });
  assert.deepEqual(w.splittable, ['a.spec.ts']);
  assert.equal(w.defaultSecPerTest, 2);
});

test('main: plan minden részre → a részek „lefutott” jelentései → check egyezik; kivett teszt és hiányzó jelentés bukás', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-shards-'));
  try {
    const files = { 'a.spec.ts': 9, 'b.spec.ts': 4, 'c.spec.ts': 6, 'd.spec.ts': 2 };
    const list = join(dir, 'lista.json');
    const weights = join(dir, 'sulyok.json');
    writeFileSync(list, JSON.stringify(listOf(files)));
    writeFileSync(weights, JSON.stringify({ defaultSecPerTest: 1, splittable: ['a.spec.ts'], files: {} }));
    const ran = flattenTests(listOf(files, true));
    const out = [];
    const log = (s) => out.push(s);
    const total = 3;
    for (let part = 1; part <= total; part++) {
      const shard = join(dir, `szelet-${part}.txt`);
      assert.equal(main(['plan', '--list', list, '--weights', weights, '--total', String(total), '--part', String(part), '--out', shard], log), 0, out.join('\n'));
      const keys = new Set(readFileSync(shard, 'utf8').split('\n').filter(Boolean));
      // A rész jelentése: pontosan a kijelölt tesztek, eredménnyel (a JSON-riporter alakjában).
      const report = { suites: [{ title: 'mind', file: 'mind', specs: ran.filter((t) => keys.has(t.key)).map((t) => spec(t.file, t.titles.at(-1), t.id.split('::')[0], [500])) }] };
      writeFileSync(join(dir, reportName(part)), JSON.stringify(report));
    }
    const measured = join(dir, 'mert.json');
    assert.equal(main(['check', '--list', list, '--reports', dir, '--total', String(total), '--weights', weights, '--weights-out', measured], log), 0, out.join('\n'));
    assert.match(out.join('\n'), /összege: 21; a lista teljes száma: 21 → EGYEZIK/);
    assert.deepEqual(JSON.parse(readFileSync(measured, 'utf8')).splittable, ['a.spec.ts']);

    // Egy teszt kiesik az egyik jelentésből → bukás.
    const broken = JSON.parse(readFileSync(join(dir, reportName(1)), 'utf8'));
    broken.suites[0].specs.pop();
    writeFileSync(join(dir, reportName(1)), JSON.stringify(broken));
    assert.equal(main(['check', '--list', list, '--reports', dir, '--total', String(total)], log), 1);
    assert.match(out.join('\n'), /→ ELTÉR/);
    // Hiányzó jelentés (a mátrix és az E2E_SHARDS eltérése) → bukás.
    assert.equal(main(['check', '--list', list, '--reports', dir, '--total', String(total + 1)], log), 1);
    // Hibás hívások.
    assert.equal(main(['plan', '--list', list, '--weights', weights, '--total', '3', '--part', '4', '--out', join(dir, 'x.txt')], log), 1);
    assert.equal(main(['plan', '--list', list, '--weights', weights, '--total', '30', '--part', '1', '--out', join(dir, 'x.txt')], log), 1);
    assert.equal(main(['mas'], log), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ---------------- őr a valódi fájlokra ---------------- */

const ci = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8').replace(/\r\n/g, '\n');

/** Egy job blokkja a `jobs:` alatt (a következő, két szóközzel behúzott kulcsig). */
function jobBlock(id) {
  const m = new RegExp(`\\n  ${id}:\\n([\\s\\S]*?)(?=\\n  [A-Za-z0-9_-]+:\\n|$)`).exec(ci);
  assert.ok(m, `nincs ${id} job a ci.yml-ben`);
  return m[1];
}

test('ci.yml: a mátrix számozott részei 1…E2E_SHARDS, plusz a kiegészítő rész', () => {
  const total = Number(/\n  E2E_SHARDS: (\d+)\n/.exec(ci)?.[1]);
  assert.ok(Number.isInteger(total) && total >= 2, 'workflow-szintű env.E2E_SHARDS kell');
  const parts = /\n        part: \[([^\]]+)\]/.exec(jobBlock('e2e-parts'))?.[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(parts, [...Array.from({ length: total }, (_, i) => String(i + 1)), 'kiegeszito']);
  assert.match(jobBlock('e2e-parts'), /fail-fast: false/);
});

test('ci.yml: pontosan egy „Playwright E2E” nevű job van, always() feltétellel, a részekre várva, a rész-eredményt ellenőrizve', () => {
  assert.equal(ci.match(/^\s+name: Playwright E2E\s*$/gm)?.length, 1);
  const summary = jobBlock('e2e-tests');
  assert.match(summary, /^    name: Playwright E2E$/m);
  assert.match(summary, /^    needs: \[lint-typecheck, e2e-parts\]$/m);
  assert.match(summary, /^    if: \$\{\{ always\(\) \}\}$/m);
  assert.match(summary, /PARTS_RESULT: \$\{\{ needs\.e2e-parts\.result \}\}/);
  assert.match(summary, /test "\$PARTS_RESULT" = "success"/);
  assert.match(summary, /e2e-shards\.mjs check .*--total "\$E2E_SHARDS"/);
  assert.doesNotMatch(jobBlock('e2e-parts'), /name: Playwright E2E/);
});

test('ci.yml: a részek a szeletet a felosztóval jelölik ki, és ennek a tesztfájlnak a futtatása a CI része', () => {
  const parts = jobBlock('e2e-parts');
  assert.match(parts, /e2e-shards\.mjs plan .*--total "\$E2E_SHARDS" --part "\$E2E_PART"/);
  assert.match(parts, /npx playwright test --test-list "\$RUNNER_TEMP\/e2e-shard\.txt" --reporter=dot,html,json/);
  assert.match(jobBlock('three-phase'), /node --test .*scripts\/qa\/e2e-shards\.test\.mjs/);
});

test('a valódi súlyfájl érvényes, és a bontható fájlok súlya ismert', () => {
  const w = validateWeights(JSON.parse(readFileSync(join(here, 'e2e-shard-weights.json'), 'utf8')));
  for (const f of w.splittable ?? []) assert.ok(w.files[f] > 0, `${f}: nincs súlya`);
});
