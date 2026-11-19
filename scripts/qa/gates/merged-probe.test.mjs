// Kapu-gyorsítás (docs/specs/2026-11-19-kapu-gyorsitas.md A; vak review 1. kör L2, L3, L4, L6, L9): az összefésült próba.
// A `mergedProbe` valódi futása ideiglenes git-tárakban (a `tsx` egy üres csonk-csomag: a Node 24 a .ts-t maga betölti) — a próbák a
// független ellenőr `probak/probe1.mjs` szkriptjéből.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { STATUS, makeContext, realExec } from './lib.mjs';
import { guardShortfall, junitCases, mergedProbe, probeEnv, probeScope, selectProbeTests, tapCounts, tapCountsByFile } from './merged-probe.mjs';

test('selectProbeTests: a PR-ből a node-os egységtesztek és a scripts/qa tesztek; őr, integrációs, e2e és törölt fájl nem', () => {
  const files = [
    'source/tests/a.test.ts', 'source/tests/b-guard.test.ts', 'source/tests/c.integration.ts', 'source/tests/d.spec.ts',
    'source/tests/sub/e.test.ts', 'scripts/qa/gates/x.test.mjs', 'scripts/qa/y.test.mjs', 'scripts/qa/gates/x.mjs', 'docs/a.md',
    'source/tests/torolt.test.ts',
  ];
  const exists = (p) => p !== 'source/tests/torolt.test.ts';
  assert.deepEqual(selectProbeTests(files, exists), { unit: ['tests/a.test.ts'], qa: ['scripts/qa/gates/x.test.mjs', 'scripts/qa/y.test.mjs'] });
});

test('tapCounts / tapCountsByFile: az UTOLSÓ összesítő (TAP és JUnit); a tesztek fájlonként a JUnit file attribútumából', () => {
  assert.deepEqual(tapCounts('# pass 999\nx\n# tests 5\n# pass 4\n# fail 1'), { tests: 5, pass: 4, fail: 1 });
  assert.deepEqual(tapCounts('<testsuites>\n\t<!-- tests 3 -->\n\t<!-- pass 2 -->\n\t<!-- fail 1 -->'), { tests: 3, pass: 2, fail: 1 });
  assert.equal(tapCounts('semmi'), null);
  const junit = ['<testcase name="a" file="D:\\r\\source\\tests\\x-guard.test.ts"/>', '<testcase name="b" time="1" file="D:\\r\\source\\tests\\x-guard.test.ts">',
    '<testcase name="c" file="/r/source/tests/y-guard.test.ts"/>'].join('\n');
  // 3. vak kör L5 (dokumentált spec-változás): csak a sikeres (önzáró) eset számít — a gyermekelemes „b” (hiba / kihagyás) nem
  assert.deepEqual(tapCountsByFile(junit), { 'x-guard.test.ts': 1, 'y-guard.test.ts': 1 });
});

test('probeScope / guardShortfall / probeEnv: hatókör, őr alsó korlát, szűrt környezet', () => {
  assert.deepEqual(probeScope({ prFiles: ['source/a.ts'], mainFiles: ['docs/x.md'] }), { qaFull: false, unitFull: false });
  assert.deepEqual(probeScope({ prFiles: ['source/a.ts'], mainFiles: ['source/b.ts'] }), { qaFull: false, unitFull: true });
  for (const f of ['scripts/qa/x.mjs', '.github/workflows/ci.yml', '.claude/settings.json', '.agents/skills/a/SKILL.md']) {
    assert.equal(probeScope({ prFiles: ['source/a.ts'], mainFiles: [f] }).qaFull, true, `main: ${f}`);
    assert.equal(probeScope({ prFiles: [f], mainFiles: [] }).qaFull, true, `PR: ${f}`);
  }
  assert.deepEqual(guardShortfall(['tests/a-guard.test.ts', 'tests/b-guard.test.ts'], { 'a-guard.test.ts': 3, 'b-guard.test.ts': 1 }, ['tests/a-guard.test.ts', 'tests/b-guard.test.ts'], { 'a-guard.test.ts': 3, 'b-guard.test.ts': 1 }), []);
  assert.match(guardShortfall(['tests/a-guard.test.ts'], {}, [], {})[0], /hiányzik/);
  assert.match(guardShortfall(['tests/a-guard.test.ts'], { 'a-guard.test.ts': 3 }, ['tests/a-guard.test.ts'], { 'a-guard.test.ts': 1 })[0], /kiüresített/);
  const env = probeEnv({ PATH: '/bin', TEMP: '/t', NODE_OPTIONS: '-x', NODE_TEST_CONTEXT: 'child', NODE_AUTH_TOKEN: 'x', OPENROUTER_API_KEY: 'k', DATABASE_URL: 'p', GH_TOKEN: 't', WEBSULI_QA_EVIDENCE_DIR: 'd', CI: 'true' });
  assert.deepEqual(Object.keys(env).sort(), ['CI', 'NODE_OPTIONS', 'PATH', 'TEMP']);
});

const GUARD_OK = "import { test } from 'node:test';\ntest('or', () => {});\n";
function repo({ prFiles = {}, prDelete = [], mainFiles = {}, mainDelete = [], baseFiles = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'probe-'));
  const run = (args) => realExec('git', ['-c', 'user.name=t', '-c', 'user.email=t@pelda.hu', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd: dir, timeoutMs: 60_000 });
  const ok = (args) => { const r = run(args); assert.equal(r.code, 0, `${args.join(' ')}: ${r.stderr}${r.stdout}`); return r.stdout.trim(); };
  const write = (f, t) => { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), t); };
  ok(['init', '-q', '-b', 'main']);
  write('.gitignore', 'node_modules/\n.claude/\n');
  write('source/node_modules/tsx/package.json', '{"name":"tsx","version":"0.0.0","main":"index.js"}\n');
  write('source/node_modules/tsx/index.js', '');
  write('source/tests/a-guard.test.ts', GUARD_OK);
  write('k.txt', '1\n2\n3\n');
  for (const [f, t] of Object.entries(baseFiles)) write(f, t);
  ok(['add', '.']); ok(['commit', '-q', '-m', 'alap']);
  ok(['switch', '-q', '-c', 'pr']);
  for (const [f, t] of Object.entries(prFiles)) write(f, t);
  for (const f of prDelete) ok(['rm', '-q', f]);
  ok(['add', '.']); ok(['commit', '-q', '--allow-empty', '-m', 'pr']);
  const head = ok(['rev-parse', 'HEAD']);
  ok(['switch', '-q', 'main']);
  for (const [f, t] of Object.entries(mainFiles)) write(f, t);
  for (const f of mainDelete) ok(['rm', '-q', f]);
  ok(['add', '.']); ok(['commit', '-q', '--allow-empty', '-m', 'main']);
  ok(['switch', '-q', 'pr']);
  return { dir, ok, write, ctx: makeContext({ cwd: dir, cfg: {} }), head };
}
const probe = (r, extra = {}) => mergedProbe(r.ctx, { head: r.head, base: 'main', label: 'proba', ...extra });

test('mergedProbe (valódi): zöld alapeset PASS (darabszám, fa, hatókör); ütközés → FAIL; piros őr → FAIL', async () => {
  const p = await probe(repo());
  assert.equal(p.status, STATUS.PASS, p.note);
  assert.ok(p.counts.pass >= 1);
  assert.match(p.tree, /^[0-9a-f]{40}$/);
  assert.deepEqual(p.scope, { qaFull: false, unitFull: false });
  const c = await probe(repo({ prFiles: { 'k.txt': '1\nPR\n3\n' }, mainFiles: { 'k.txt': '1\nMAIN\n3\n' } }));
  assert.deepEqual([c.status, /ütközik/.test(c.note)], [STATUS.FAIL, true]);
  const red = await probe(repo({
    mainFiles: { 'source/tests/b-guard.test.ts': "import { test } from 'node:test';\nimport { existsSync } from 'node:fs';\ntest('tiltott', () => { if (existsSync(new URL('../../tiltott.txt', import.meta.url))) throw new Error('tiltott'); });\n" },
    prFiles: { 'tiltott.txt': 'x\n' },
  }));
  assert.deepEqual([red.status, /bukik egy teszt/.test(red.note)], [STATUS.FAIL, true]);
});

test('mergedProbe (L4): a main az alsó korlát — törölt őr → FAIL (más teszt mellett is); szűkített őr → FAIL; 0 őr nem fut le saját felderítéssel', async () => {
  const del = await probe(repo({ prDelete: ['source/tests/a-guard.test.ts'] }));
  assert.equal(del.status, STATUS.FAIL);
  assert.match(del.note, /nincs egyetlen őr-teszt|hiányzik|nincs source\/ mappa/);
  const del2 = await probe(repo({ prDelete: ['source/tests/a-guard.test.ts'], baseFiles: { 'source/tests/b-guard.test.ts': GUARD_OK, 'source/tests/masik.test.ts': "import { test } from 'node:test';\ntest('nem or', () => {});\n" } }));
  assert.deepEqual([del2.status, /a-guard\.test\.ts: a mainen létező őr hiányzik/.test(del2.note)], [STATUS.FAIL, true]);
  const two = "import { test } from 'node:test';\ntest('or1', () => {});\ntest('or2', () => {});\n";
  const shrunk = await probe(repo({ baseFiles: { 'source/tests/a-guard.test.ts': two }, prFiles: { 'source/tests/a-guard.test.ts': GUARD_OK } }));
  assert.deepEqual([shrunk.status, /1 teszt futott, a mainen 2/.test(shrunk.note)], [STATUS.FAIL, true]);
  // ha a mainen sincs őr (a PR és a main is törli), a „nincs őr” ág dönt — nem az alsó korlát
  const none = await probe(repo({ prDelete: ['source/tests/a-guard.test.ts'], mainDelete: ['source/tests/a-guard.test.ts'], baseFiles: { 'source/tests/masik.test.ts': "import { test } from 'node:test';\ntest('nem or', () => {});\n" } }));
  assert.deepEqual([none.status, /nincs egyetlen őr-teszt/.test(none.note)], [STATUS.FAIL, true], none.note);
});

test('mergedProbe (L6): PR-egységteszt mellett az őrök is ténylegesen lefutnak (az őr bukása megállít)', async () => {
  const red = await probe(repo({
    mainFiles: { 'source/tests/b-guard.test.ts': "import { test } from 'node:test';\nimport { existsSync } from 'node:fs';\ntest('tiltott', () => { if (existsSync(new URL('../../tiltott.txt', import.meta.url))) throw new Error('tiltott'); });\n" },
    prFiles: { 'tiltott.txt': 'x\n', 'source/tests/u.test.ts': "import { test } from 'node:test';\ntest('u', () => {});\n" },
  }));
  assert.deepEqual([red.status, /bukik egy teszt/.test(red.note)], [STATUS.FAIL, true], red.note);
});

test('mergedProbe (L6): ha egyetlen teszt sem fut le (üres őr a mainen és a PR-ben is), FAIL — „0 teszt” nem zöld', async () => {
  const empty = await probe(repo({ baseFiles: { 'source/tests/a-guard.test.ts': 'export {};\n' } }));
  assert.equal(empty.status, STATUS.FAIL, empty.note);
  assert.match(empty.note, /nem futtatott tesztet/);
  // a teszt nélküli fájl álteszte nem pótolja a mainen futó őr-tesztet
  const emptied = await probe(repo({ prFiles: { 'source/tests/a-guard.test.ts': 'export {};\n' } }));
  assert.deepEqual([emptied.status, /a-guard\.test\.ts: 0 teszt futott, a mainen 1/.test(emptied.note)], [STATUS.FAIL, true], emptied.note);
  const xml = '<testcase name="tests\\e.test.ts" file="C:\\x\\tests\\e.test.ts"/>\n<testcase name="or" file="/y/f.test.ts"/>\n<testcase name="f.test.ts" file="/y/f.test.ts">\n<failure/></testcase>';
  assert.deepEqual(junitCases(xml).map((c) => [c.file, c.pseudo, c.passed]), [['e.test.ts', true, true], ['f.test.ts', false, true], ['f.test.ts', true, false]]);
  assert.deepEqual(tapCountsByFile(xml), { 'f.test.ts': 1 });
});

test('mergedProbe (L2): a scripts/qa hatókörben a TELJES scripts/qa kör fut — a változatlan teszt is megfogja a szemantikai ütközést', async () => {
  const r = repo({
    baseFiles: { 'scripts/qa/lib.mjs': 'export const regi = 1;\n', 'scripts/qa/x.mjs': "import { regi } from './lib.mjs';\nexport const x = () => regi;\n", 'scripts/qa/x.test.mjs': "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { x } from './x.mjs';\ntest('x', () => assert.equal(x(), 1));\n" },
    prFiles: { 'scripts/qa/x.mjs': "import { regi } from './lib.mjs';\nexport const x = () => regi * 1;\n" },
    mainFiles: { 'scripts/qa/lib.mjs': 'export const uj = 1;\n' },
  });
  const p = await probe(r);
  assert.equal(p.status, STATUS.FAIL, p.note);
  assert.equal(p.scope.qaFull, true);
  assert.match(p.note, /scripts\/qa teszt/);
});

test('mergedProbe (L2 c): ha a PR és a main is a source/-ba nyúl, a teljes egységteszt-kör fut; csak a PR-nál nem', async () => {
  const base = { 'source/lib.ts': 'export const regi = 1;\n', 'source/tests/u.test.ts': "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { regi } from '../lib.ts';\ntest('u', () => assert.equal(regi, 1));\n" };
  const both = await probe(repo({ baseFiles: base, prFiles: { 'source/other.ts': 'export const o = 1;\n' }, mainFiles: { 'source/lib.ts': 'export const uj = 1;\n' } }));
  assert.deepEqual([both.status, both.scope.unitFull], [STATUS.FAIL, true], both.note);
  const prOnly = await probe(repo({ baseFiles: base, prFiles: { 'source/other.ts': 'export const o = 1;\n' }, mainFiles: { 'docs/a.md': 'x\n' } }));
  assert.deepEqual([prOnly.status, prOnly.scope.unitFull], [STATUS.PASS, false], prOnly.note);
});

test('mergedProbe (L3, L9): a tesztkód nem látja a szülő titkait; hiányzó node_modules → érthető FAIL; időkorlát → FAIL', async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'probe-env-')), 'env.json').replace(/\\/g, '/');
  process.env.PROBA_HAMIS_TITOK_KEY = 'hamis-titok-ertek-123';
  try {
    const r = repo({ prFiles: { 'source/tests/a-guard.test.ts': `import { test } from 'node:test';\nimport { writeFileSync } from 'node:fs';\ntest('or', () => { writeFileSync(${JSON.stringify(out)}, JSON.stringify({ titok: process.env.PROBA_HAMIS_TITOK_KEY ?? null })); });\n` } });
    const p = await probe(r);
    assert.equal(p.status, STATUS.PASS, p.note);
    assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), { titok: null });
  } finally {
    delete process.env.PROBA_HAMIS_TITOK_KEY;
  }
  const nm = repo();
  renameSync(join(nm.dir, 'source', 'node_modules'), join(nm.dir, 'source', 'nm-el'));
  const p9 = await probe(nm);
  assert.deepEqual([p9.status, /npm\.cmd ci/.test(p9.note)], [STATUS.FAIL, true]);
  // 3. vak kör L8: a takarítást a TÉNYLEGESEN lassú futás tárában kell nézni (nem a node_modules nélküli, el sem indult tárban)
  const slowRepo = repo({ prFiles: { 'source/tests/a-guard.test.ts': "import { test } from 'node:test';\ntest('lassu', async () => { await new Promise((r) => setTimeout(r, 60_000)); });\n" } });
  const slow = await probe(slowRepo, { timeoutMs: 15_000 });
  assert.equal(slow.status, STATUS.FAIL);
  const left = existsSync(join(slowRepo.dir, '.claude', 'worktrees')) ? readdirSync(join(slowRepo.dir, '.claude', 'worktrees')) : [];
  assert.deepEqual(left, [], 'nem marad ideiglenes munkafa a lassú futás után');
  assert.equal(slowRepo.ok(['worktree', 'list', '--porcelain']).split('\n').filter((l) => l.startsWith('worktree ')).length, 1, 'a git sem tart nyilván ideiglenes munkafát');
});

test('3. vak kör L5: ha a main őr-alapmérése bukik, a próba FAIL (a PR „javítása” sem pótolja az érvényes alapot)', async () => {
  const p = await probe(repo({
    mainFiles: { 'source/tests/b-guard.test.ts': "import { test } from 'node:test';\nimport { existsSync } from 'node:fs';\ntest('kell', () => { if (!existsSync(new URL('../../javitas.txt', import.meta.url))) throw new Error('hiányzik'); });\n" },
    prFiles: { 'javitas.txt': 'x\n' },
  }));
  assert.deepEqual([p.status, /alapmérés/.test(p.note)], [STATUS.FAIL, true], p.note);
});

const QA_BASE = {
  'scripts/qa/gates/skills-sync-check.mjs': 'process.exit(0);\n',
  // a háromfázisú ellenőrző itt azt igazolja, hogy összefésült (kétszülős) commiton fut (L7)
  'scripts/qa/three-phase-check.mjs': "import { execFileSync } from 'node:child_process';\nconst p = execFileSync('git', ['rev-list', '--parents', '-n', '1', 'HEAD'], { encoding: 'utf8' }).trim().split(' ');\nif (p.length !== 3) { console.error('nem merge-commit: ' + p.length); process.exit(1); }\n",
  'scripts/qa/x.test.mjs': "import { test } from 'node:test';\ntest('x', () => {});\n",
};

test('3. vak kör L6 + L7: teljes QA-körnél a kötelező ellenőrző hiánya FAIL; a háromfázisú ellenőrző az összefésült (kétszülős) commiton fut', async () => {
  const ok = await probe(repo({ baseFiles: QA_BASE, prFiles: { 'scripts/qa/y.mjs': 'export {};\n' } }));
  assert.equal(ok.status, STATUS.PASS, ok.note);
  const missing = await probe(repo({ baseFiles: QA_BASE, prDelete: ['scripts/qa/gates/skills-sync-check.mjs'] }));
  assert.deepEqual([missing.status, /kötelező ellenőrző hiányzik.*skills-sync-check/.test(missing.note)], [STATUS.FAIL, true], missing.note);
});

test('3. vak kör L3: a már beolvasztott main-változás is a hatókörbe kerül, ha a próba a régi fejet kapja történeti alapnak (scopeHead)', async () => {
  const base = { 'source/lib.ts': 'export const regi = 1;\n', 'source/tests/u.test.ts': "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { regi } from '../lib.ts';\ntest('u', () => assert.equal(regi, 1));\n" };
  const r = repo({ baseFiles: base, prFiles: { 'source/other.ts': 'export const o = 1;\n' }, mainFiles: { 'source/lib.ts': 'export const uj = 1;\n' } });
  const old = r.head;
  r.ok(['merge', '-q', '--no-edit', 'main']);
  const merged = r.ok(['rev-parse', 'HEAD']);
  const p = await mergedProbe(r.ctx, { head: merged, base: r.ok(['rev-parse', 'main']), scopeHead: old, label: 'proba' });
  assert.deepEqual([p.status, p.scope.unitFull], [STATUS.FAIL, true], p.note);
});

test('3. vak kör L9: lejárt együttes határidő → FAIL, a határidő megnevezésével', async () => {
  const p = await probe(repo(), { timeoutMs: 1 });
  assert.deepEqual([p.status, /határid/.test(p.note)], [STATUS.FAIL, true], p.note);
});

test('3. vak kör L10: átnevezés esetén a régi útvonal is a PR-fájlok között (a hatókör nem veszti el a scripts/qa-t)', async () => {
  const r = repo({ baseFiles: { ...QA_BASE, 'scripts/qa/regi.mjs': 'export const a = 1;\n'.repeat(20) } });
  r.ok(['mv', 'scripts/qa/regi.mjs', 'regi-archiv.mjs']);
  r.ok(['commit', '-q', '-m', 'athelyezes']);
  const p = await mergedProbe(r.ctx, { head: r.ok(['rev-parse', 'HEAD']), base: 'main', label: 'proba' });
  assert.equal(p.scope.qaFull, true, p.note);
});
