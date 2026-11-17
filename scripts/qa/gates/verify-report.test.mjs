// S2 — állítás- és hivatkozás-ellenőrző (docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum-vegrehajtas.md S2.3, S2.3b).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STATUS } from './lib.mjs';
import { appendRecord, verifyChain } from './evidence-chain.mjs';
import { buildRunRecord, testCounts } from './evidence-run.mjs';
import { buildRecord } from './record-review.mjs';
import {
  FALSE, SCHEMA, TRUE, UNKNOWN, checkClaims, checkReferences, extractClaimsBlock, extractRefs, stripFences,
} from './verify-report.mjs';

const H = 'a'.repeat(40);
const FILE = ['import x from "y";', 'export function verifyReport(md) {', '  const refs = extractRefs(md);', '  return refs;', '}'].join('\n');

function fakeRepo(over = {}) {
  return {
    files: new Set(['scripts/qa/gates/verify-report.mjs', 'source/client/src/lib/tornado/sim.ts', 'source/tests/a.test.ts', 'source/tests/b/a.test.ts']),
    dirs: new Set(['scripts', 'scripts/qa', 'scripts/qa/gates', 'source', 'source/tests']),
    read: (p) => (p === 'scripts/qa/gates/verify-report.mjs' ? FILE : p === 'source/client/src/lib/tornado/sim.ts' ? 'a\nb\nc' : 'egy sor'),
    scripts: new Set(['gate:stage', 'check']),
    commitExists: (h) => h.startsWith('abc1234'),
    pr: (n) => (n === 492 ? { state: 'OPEN' } : null),
    record: (id) => ({ 'run-0123456789ab': { head: H, ok: true, code: 0, counts: { tests: 12, pass: 12, fail: 0 } } })[id] ?? null,
    ...over,
  };
}

const st = (items) => items.map((x) => [x.kind, x.status]);

test('extractRefs: fájl:sor, tartomány, kódrészlet, útvonal, npm / node, commit, PR, tesztszám; kódblokk és idegen út kimarad', () => {
  const md = [
    'A `scripts/qa/gates/verify-report.mjs:2` `export function verifyReport` sor.',
    'Lásd source/client/src/lib/tornado/sim.ts:1-3 és `docs/nincs.md`.',
    'Futtasd: `npm run gate:stage`, majd node scripts/qa/gates/verify-report.mjs; commit `abc1234f`, PR #492.',
    '12/12 teszt zöld (run-0123456789ab).',
    '```', 'source/tests/a.test.ts:99', '```',
    'Saját fájl: C:\\Users\\x\\scratchpad\\r.md:3 és `origin/main` meg `chore/kapu-allitas-ellenor` (ág, nem út).',
  ].join('\n');
  const r = extractRefs(md);
  assert.deepEqual(r.map((x) => [x.kind, x.ref]), [
    ['file-line', 'scripts/qa/gates/verify-report.mjs:2'], ['file-line', 'source/client/src/lib/tornado/sim.ts:1-3'], ['path', 'docs/nincs.md'],
    ['npm-script', 'npm run gate:stage'], ['node-script', 'node scripts/qa/gates/verify-report.mjs'], ['commit', 'abc1234f'], ['pr', 'PR #492'],
    ['test-count', '12/12 teszt'],
  ]);
  assert.equal(r[0].snippet, 'export function verifyReport');
  assert.deepEqual([r[1].from, r[1].to], [1, 3]);
  assert.equal(r[7].evidence, 'run-0123456789ab');
  assert.equal(stripFences('a\n```\nb\n```\nc').join('|'), 'a||||c');
});

test('checkRef: létező fájl / sor / kódrészlet ±3 soron belül IGAZ; túl nagy sor, hiányzó fájl, rossz kódrészlet HAMIS', () => {
  const repo = fakeRepo();
  const items = checkReferences([
    '`scripts/qa/gates/verify-report.mjs:2` `export function verifyReport`',
    '`scripts/qa/gates/verify-report.mjs:5` `const refs = extractRefs(md);`',
    '`scripts/qa/gates/verify-report.mjs:9`',
    '`scripts/qa/gates/verify-report.mjs:1` `return nothing`',
    '`scripts/qa/nincs.mjs:1`',
    'tests/a.test.ts:1 (source/ nélkül) és lib/tornado/sim.ts:2 (utótag) és a.test.ts:1 (csak név: két találat)',
  ].join('\n'), repo);
  assert.deepEqual(items.map((x) => [x.ref, x.status]), [
    ['scripts/qa/gates/verify-report.mjs:2', TRUE],
    ['scripts/qa/gates/verify-report.mjs:5', TRUE],
    ['scripts/qa/gates/verify-report.mjs:9', FALSE],
    ['scripts/qa/gates/verify-report.mjs:1', FALSE],
    ['scripts/qa/nincs.mjs:1', FALSE],
    ['tests/a.test.ts:1', TRUE],
    ['lib/tornado/sim.ts:2', TRUE],
    ['a.test.ts:1', UNKNOWN],
  ]);
  assert.match(items[2].detail, /5 soros/);
  assert.match(items[3].detail, /±3/);
});

test('checkRef: npm-szkript, node-szkript, commit, PR (gh nélkül NEM ELLENŐRIZHETŐ), tesztszám bizonyítékkal', () => {
  const md = ['`npm run gate:stage` és `npm run gate:nincs`', 'node scripts/qa/gates/verify-report.mjs', 'commit `abc1234f` és `def5678a`', 'PR #492, PR #9',
    '12/12 teszt (run-0123456789ab)', '11/12 teszt (run-0123456789ab)', '5 teszt zöld', '3 teszt (run-ffffffffffff)'].join('\n');
  assert.deepEqual(st(checkReferences(md, fakeRepo())), [
    ['npm-script', TRUE], ['npm-script', FALSE], ['node-script', TRUE], ['commit', TRUE], ['commit', FALSE], ['pr', TRUE], ['pr', FALSE],
    ['test-count', TRUE], ['test-count', FALSE], ['test-count', UNKNOWN], ['test-count', FALSE],
  ]);
  assert.deepEqual(st(checkReferences('PR #492', fakeRepo({ pr: () => undefined }))), [['pr', UNKNOWN]]);
});

// ---- gépi blokk ----

const claims = (over = {}) => ({
  schema: SCHEMA, branch: 'chore/x', head: H, base: 'origin/main', changedFiles: ['scripts/qa/gates/verify-report.mjs'],
  commands: [{ cmd: 'npm run gate:stage', status: 'PASS', evidence: `stage-${H}` }],
  tests: [{ cmd: 'node --test x', pass: 12, fail: 0, evidence: 'run-0123456789ab' }],
  refs: [{ file: 'scripts/qa/gates/verify-report.mjs', line: 2, text: 'export function verifyReport' }],
  pr: { number: 492, state: 'OPEN', ci: 'green' },
  gates: ['stage', 'push', 'review', 'pr'],
  notRun: [{ what: 'E2E', reason: 'nincs UI', risk: 'nincs' }],
  ...over,
});

function env(over = {}) {
  const recs = {
    [`stage-${H}`]: { head: H, ok: true }, [`pre-push-${H}`]: { head: H, ok: true }, [`pre-pr-${H}`]: { head: H, ok: true },
    [`review-${H}`]: { head: H, verdict: 'IGEN' }, 'run-0123456789ab': { head: H, ok: true, code: 0, counts: { tests: 12, pass: 12, fail: 0 } },
  };
  return {
    resolve: (r) => (r === H || r === 'chore/x' ? H : null),
    diffNames: () => ['scripts/qa/gates/verify-report.mjs'],
    record: (id) => recs[id] ?? null,
    chain: () => ({ ok: true, problems: [] }),
    pr: () => ({ state: 'OPEN', headRefOid: H, statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }] }),
    repo: fakeRepo(),
    ...over,
  };
}

const fails = (rs) => rs.filter((r) => r.status === STATUS.FAIL).map((r) => r.name);

test('checkClaims: a valósággal egyező blokk zöld', () => {
  assert.deepEqual(fails(checkClaims(claims(), env())), []);
});

test('checkClaims: minden eltérés a konkrét ponttal bukik', () => {
  assert.deepEqual(fails(checkClaims(claims({ schema: 'x' }), env())), ['séma']);
  assert.deepEqual(fails(checkClaims(claims({ head: 'b'.repeat(40) }), env())), ['fej']);
  assert.deepEqual(fails(checkClaims(claims(), env({ resolve: (r) => (r === H ? H : 'c'.repeat(40)) }))), ['fej = az ág feje']);
  assert.deepEqual(fails(checkClaims(claims({ changedFiles: ['x.md'] }), env())), ['módosított fájlok = git diff']);
  assert.deepEqual(fails(checkClaims(claims({ refs: [{ file: 'scripts/qa/gates/verify-report.mjs', line: 2, text: 'nincs ilyen' }] }), env())), ['hivatkozás scripts/qa/gates/verify-report.mjs:2']);
  assert.deepEqual(fails(checkClaims(claims({ commands: [{ cmd: 'npm test', status: 'PASS' }] }), env())), ['parancs: npm test'], 'PASS bizonyíték nélkül');
  assert.deepEqual(fails(checkClaims(claims({ tests: [{ cmd: 't', pass: 13, fail: 0, evidence: 'run-0123456789ab' }] }), env())), ['teszt: t'], 'eltérő darabszám');
  assert.deepEqual(fails(checkClaims(claims(), env({ record: (id) => (id === 'run-0123456789ab' ? { head: 'd'.repeat(40), ok: true } : env().record(id)) }))), ['teszt: node --test x'], 'más fejre szóló bizonyíték');
  assert.deepEqual(fails(checkClaims(claims({ pr: { number: 492, state: 'MERGED', ci: 'green' } }), env())), ['PR #492 állapota']);
  assert.deepEqual(fails(checkClaims(claims({ pr: { number: 492, state: 'OPEN', ci: 'pending' } }), env())), ['PR #492 állapota']);
  assert.deepEqual(fails(checkClaims(claims({ gates: ['pr'] }), env())).sort(), ['kapu-lánc', 'kapu-lánc'].sort(), 'a pr mellől hiányzik a push és a review');
  assert.deepEqual(fails(checkClaims(claims(), env({ record: (id) => (id.startsWith('review-') ? null : env().record(id)) }))), ['kapu: review']);
  assert.deepEqual(fails(checkClaims(claims({ notRun: [{ what: 'E2E' }] }), env())), ['NOT RUN: E2E']);
  assert.deepEqual(fails(checkClaims(claims(), env({ chain: () => ({ ok: false, problems: [`stage-${H}: a rekord tartalma eltér a láncba írt hash-től`] }) }))), ['bizonyíték-lánc']);
});

test('checkClaims: a bukás bevallása (FAIL / NOT RUN) bizonyíték nélkül is elfogadott', () => {
  assert.deepEqual(fails(checkClaims(claims({ commands: [{ cmd: 'npm run lint', status: 'FAIL' }], gates: [] }), env())), []);
});

test('extractClaimsBlock: hiányzó, kettőzött, hibás JSON blokk → hiba', () => {
  assert.match(extractClaimsBlock('nincs blokk').error, /nincs/);
  const b = '```json allitasok\n{"schema":"x"}\n```';
  assert.equal(extractClaimsBlock(`a\n${b}\n`).claims.schema, 'x');
  assert.match(extractClaimsBlock(`${b}\n${b}`).error, /pontosan egy/);
  assert.match(extractClaimsBlock('```json allitasok\n{nem json}\n```').error, /nem érvényes JSON/);
});

test('record-review (S2.5): hamis hivatkozású ellenőri jelentésből ítélet nem rögzíthető; igaz hivatkozással igen', () => {
  const base = { head: 'a'.repeat(12), verdict: 'IGEN', report: 'r.md', resolveHead: () => H };
  const repo = fakeRepo();
  const checkRefs = (text) => checkReferences(text, repo).filter((x) => x.status === FALSE).map((x) => `${x.ref} — ${x.detail}`);
  const bad = buildRecord({ ...base, readReport: () => 'Lelet: `scripts/qa/gates/verify-report.mjs:99`\nÍtélet: IGEN', checkRefs });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /HAMIS hivatkozás/);
  const good = buildRecord({ ...base, readReport: () => 'Lelet: `scripts/qa/gates/verify-report.mjs:2` `export function verifyReport`\nÍtélet: IGEN', checkRefs });
  assert.equal(good.ok, true, good.error);
});

// ---- bizonyíték-lánc és futás-rögzítés ----

test('evidence-chain: a lánc ép; egy rekord utólagos átírása és a lánc-sor törlése kiderül; újrafuttatott rekord nem hiba', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ev-chain-'));
  appendRecord(dir, 'stage-x', { head: H, ok: true });
  appendRecord(dir, 'run-y', { head: H, ok: true });
  appendRecord(dir, 'stage-x', { head: H, ok: true, again: 1 });
  assert.deepEqual(verifyChain(dir).problems, []);
  writeFileSync(join(dir, 'run-y.json'), JSON.stringify({ head: H, ok: true, code: 0, hamis: 1 }));
  assert.match(verifyChain(dir).problems.join('|'), /run-y: a rekord tartalma eltér/);
  assert.deepEqual(verifyChain(dir, ['stage-x']).problems, [], 'csak a kért rekordok');
});

test('evidence-run: darabszám a node:test összesítőből; a rekord titok nélkül, fejhez kötve', () => {
  assert.deepEqual(testCounts('ℹ tests 12\nℹ pass 11\nℹ fail 1'), { tests: 12, pass: 11, fail: 1 });
  assert.deepEqual(testCounts('# tests 3\n# pass 3\n# fail 0'), { tests: 3, pass: 3, fail: 0 });
  assert.equal(testCounts('semmi'), null);
  const tok = ['ghp', '_', 'abcDEF123456'.repeat(3)].join('');
  const { id, record } = buildRunRecord({ head: H, dirty: false, cmd: 'node', args: ['x', `--t=${tok}`], result: { code: 0, stdout: 'ℹ pass 2\nℹ fail 0', stderr: '', ms: 5 }, now: () => new Date('2026-11-17T20:00:00Z') });
  assert.match(id, /^run-[0-9a-f]{12}$/);
  assert.equal(record.ok, true);
  assert.equal(record.head, H);
  assert.ok(!record.cmd.includes(tok), 'a token nem kerül a rekordba');
  assert.deepEqual(record.counts, { tests: null, pass: 2, fail: 0 });
});
