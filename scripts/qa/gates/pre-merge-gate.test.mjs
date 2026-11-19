// docs/specs/2026-11-17-minosegkapuk.md E9: a merge előtti kapu döntése hamis gh / futásőr / rt-adatokkal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS, loadConfig } from './lib.mjs';
import { COMPARE_FILE_LIMIT, compareFiles, decideMainMoved, decideMerge, requiredChecks, runMergeProbe } from './pre-merge-gate.mjs';

const cfg = loadConfig();
const HEAD = 'a'.repeat(40);
const MAIN = 'b'.repeat(40);
const REQUIRED = ['Háromfázisú rend', 'Lint & Typecheck', 'Unit Tests', 'Playwright E2E'];
const run = (name, conclusion = 'success', status = 'completed', id = 1) => ({ name, status, conclusion, id });

function base(over = {}) {
  return {
    pr: { state: 'OPEN', isDraft: false, mergeStateStatus: 'CLEAN', headRefOid: HEAD, baseRefOid: MAIN },
    required: REQUIRED,
    checkRuns: REQUIRED.map((n) => run(n)),
    statuses: [],
    threads: [{ isResolved: true }],
    mainSha: MAIN,
    ciBaseSha: MAIN,
    files: ['source/server/a.ts'],
    verdict: { verdict: 'IGEN', source: 'helyi bizonyíték' },
    guard: { code: 0, summary: 'AKTIV=0' },
    rt: { json: { mode: 'off', activeMatches: 0 } },
    repoWideScopes: cfg.repoWideScopes,
    ...over,
  };
}
const st = (res, prefix) => res.find((r) => r.name.startsWith(prefix))?.status;

test('decideMerge: minden zöld → nincs FAIL; a source/ változás „telepítést indít” jelzést kap', () => {
  const res = decideMerge(base());
  assert.ok(!res.some((r) => r.status === STATUS.FAIL), JSON.stringify(res.filter((r) => r.status === STATUS.FAIL)));
  assert.match(res.find((r) => r.name === 'telepítés').note, /TELEPÍTÉST INDÍT/);
  assert.equal(st(res, 'külső (Gemini)'), STATUS.WARN, 'a külső jelentés hiánya csak figyelmeztetés');
  assert.equal(st(decideMerge(base({ external: { head: HEAD, status: 'ok', model: 'm' } })), 'külső (Gemini)'), STATUS.PASS);
});

test('decideMerge: nem CLEAN / piszkozat / zárt → FAIL', () => {
  assert.equal(st(decideMerge(base({ pr: { ...base().pr, mergeStateStatus: 'BLOCKED' } })), 'PR állapota'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ pr: { ...base().pr, isDraft: true } })), 'PR állapota'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ pr: { ...base().pr, state: 'MERGED' } })), 'PR állapota'), STATUS.FAIL);
});

test('requiredChecks: hiányzó, futó, bukott kötelező ellenőrzés; azonos névnél a legutóbbi számít', () => {
  assert.deepEqual(requiredChecks(['A', 'B', 'C'], [run('A'), run('B', null, 'in_progress')]), ['B: még fut (in_progress)', 'C: nem futott a jelenlegi fejre']);
  assert.deepEqual(requiredChecks(['A'], [run('A', 'failure', 'completed', 1), run('A', 'success', 'completed', 2)]), []);
  assert.deepEqual(requiredChecks(['A'], [run('A', 'success', 'completed', 1), run('A', 'failure', 'completed', 2)]), ['A: failure']);
  assert.deepEqual(requiredChecks(['S'], [], [{ context: 'S', state: 'success' }]), []);
  assert.equal(st(decideMerge(base({ checkRuns: [run('Unit Tests')] })), 'kötelező'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ required: [] })), 'kötelező'), STATUS.FAIL);
});

test('decideMerge: nyitott review-szál → FAIL (ellenpróba)', () => {
  const res = decideMerge(base({ threads: [{ isResolved: true }, { isResolved: false }] }));
  assert.equal(st(res, 'lezáratlan'), STATUS.FAIL);
  assert.match(res.find((r) => r.name.startsWith('lezáratlan')).note, /1 nyitott szál/);
});

test('decideMerge (C-61): a main elmozdult + repó-szintű őr / ellenőrzés → FAIL; csak elmozdult → WARN', () => {
  const moved = { mainSha: 'c'.repeat(40) };
  assert.equal(st(decideMerge(base({ ...moved, files: ['source/tests/no-real-emails-guard.test.ts'] })), 'main elmozdulása'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ ...moved, files: ['scripts/qa/gates/lib.mjs'] })), 'main elmozdulása'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ ...moved, files: ['source/server/a.ts'] })), 'main elmozdulása'), STATUS.WARN);
  assert.equal(st(decideMerge(base({ ciBaseSha: null, pr: { ...base().pr, baseRefOid: MAIN } })), 'main elmozdulása'), STATUS.PASS, 'tartalék: baseRefOid');
});

// docs/specs/2026-11-17-kulso-ellenor.md 10. szakasz (kanban #92): C-61 hatókör-alapon, fail-closed.
test('C-61 pontosítás (C1–C5): csak az ellenőrzés által olvasott fájlkör main-változása kér új CI-t', () => {
  const moved = { base: MAIN, mainSha: 'c'.repeat(40), repoWideScopes: cfg.repoWideScopes };
  const qa = ['scripts/qa/gates/external-review.mjs'];
  const c = (over) => decideMainMoved({ ...moved, ...over }).status;
  // C1: scripts/qa-s PR, a main csak játékkódot / doksit hozott → WARN
  assert.equal(c({ files: qa, mainFiles: ['source/client/src/pages/BrainRotSteal.tsx', 'source/tests/brain-rot-core.test.ts', 'docs/handoffs/x.md'] }), STATUS.WARN);
  // C2: a main az ellenőrzés által olvasott fájlt változtatott → FAIL
  for (const m of ['scripts/qa/three-phase-check.mjs', 'docs/specs/2026-11-18-x-vegrehajtas.md', 'render.yaml', '.agents/skills/websuli-lint-ellenor/SKILL.md',
    '.claude/skills/websuli-merge-elotti-kapu/SKILL.md', '.github/workflows/ci.yml']) {
    assert.equal(c({ files: qa, mainFiles: ['source/client/src/a.ts', m] }), STATUS.FAIL, m);
  }
  // C3: őr-teszt vagy workflow a PR-ban + bármely main-változás → FAIL (a szigor marad)
  assert.equal(c({ files: ['source/tests/no-real-emails-guard.test.ts'], mainFiles: ['docs/a.md'] }), STATUS.FAIL);
  assert.equal(c({ files: ['.github/workflows/ci.yml'], mainFiles: ['source/client/src/a.ts'] }), STATUS.FAIL);
  // C4: olvashatatlan / csonka / üres fájllista → FAIL
  assert.equal(c({ files: qa, mainFiles: null }), STATUS.FAIL);
  assert.equal(c({ files: qa, mainFiles: Array.from({ length: COMPARE_FILE_LIMIT }, (_, i) => `source/f${i}.ts`) }), STATUS.FAIL);
  assert.equal(c({ files: qa, mainFiles: ['source/a.ts'], mainFilesTruncated: true }), STATUS.FAIL);
  assert.equal(c({ files: qa, mainFiles: [] }), STATUS.FAIL);
  // hiányzó / hibás hatókör-táblázat vagy -bejegyzés → fail-closed
  assert.equal(c({ files: qa, mainFiles: ['source/a.ts'], repoWideScopes: [] }), STATUS.FAIL);
  assert.equal(c({ files: qa, mainFiles: ['source/a.ts'], repoWideScopes: [{ pattern: '^scripts/qa/' }] }), STATUS.FAIL, 'mainScope nélkül → .*');
  assert.equal(c({ files: qa, mainFiles: ['source/a.ts'], repoWideScopes: [{ pattern: '^scripts/qa/', mainScope: ['(hibás'] }] }), STATUS.FAIL, 'hibás minta → .*');
  // repó-szintű ellenőrzést nem érintő PR: WARN (változatlan)
  assert.equal(c({ files: ['source/server/a.ts'], mainFiles: null }), STATUS.WARN);
  // C5: azonos SHA → PASS
  assert.equal(decideMainMoved({ ...moved, mainSha: MAIN, files: qa, mainFiles: null }).status, STATUS.PASS);
  // a decideMerge is ezt használja
  assert.equal(st(decideMerge(base({ mainSha: 'c'.repeat(40), files: qa, mainFiles: ['source/client/src/a.ts'] })), 'main elmozdulása'), STATUS.WARN);
});

test('C-61 (K4): a compare-válaszból az átnevezett fájl régi neve is számít; hibás válasz → fail-closed', () => {
  const cmp = { files: [{ filename: 'docs/archive/2026-11-18-x-vegrehajtas.md', previous_filename: 'docs/specs/2026-11-18-x-vegrehajtas.md', status: 'renamed' },
    { filename: 'source/client/src/a.ts', status: 'modified' }] };
  const got = compareFiles(cmp);
  assert.deepEqual(got.mainFiles, ['docs/archive/2026-11-18-x-vegrehajtas.md', 'docs/specs/2026-11-18-x-vegrehajtas.md', 'source/client/src/a.ts']);
  assert.equal(got.mainFilesTruncated, false);
  const moved = { base: MAIN, mainSha: 'c'.repeat(40), repoWideScopes: cfg.repoWideScopes, files: ['scripts/qa/gates/external-review.mjs'] };
  assert.equal(decideMainMoved({ ...moved, ...got }).status, STATUS.FAIL, 'a régi név a scripts/qa hatókörében (docs/specs) van');
  assert.equal(decideMainMoved({ ...moved, ...compareFiles({ files: [{ filename: 'docs/archive/y.md', status: 'added' }] }) }).status, STATUS.WARN);
  assert.deepEqual(compareFiles(null), { mainFiles: null, mainFilesTruncated: false });
  assert.deepEqual(compareFiles({ message: 'Not Found' }), { mainFiles: null, mainFilesTruncated: false });
  assert.equal(compareFiles({ files: Array.from({ length: COMPARE_FILE_LIMIT }, (_, i) => ({ filename: `f${i}` })) }).mainFilesTruncated, true);
});

test('a hatókör-táblázat minden sora indokolt, és az őr / workflow sora nem lazít', () => {
  for (const s of cfg.repoWideScopes) assert.ok(String(s.why ?? '').length > 30, s.pattern);
  const by = (p) => cfg.repoWideScopes.find((s) => s.pattern === p);
  assert.deepEqual(by('-guard\\.test\\.ts$').mainScope, ['.*']);
  assert.deepEqual(by('^\\.github/workflows/').mainScope, ['.*']);
  assert.ok(by('^scripts/qa/').mainScope.includes('^docs/specs/'), 'a three-phase-check a docs/specs-et olvassa');
});

test('decideMerge: hiányzó / NEM ítélet → FAIL; FELTÉTELLEL → WARN', () => {
  assert.equal(st(decideMerge(base({ verdict: null })), 'független'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ verdict: { verdict: 'NEM', source: 'x' } })), 'független'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ verdict: { verdict: 'IGEN, FELTÉTELLEL', source: 'x' } })), 'független'), STATUS.WARN);
});

test('decideMerge: futásőr 1 / 2 → FAIL', () => {
  assert.equal(st(decideMerge(base({ guard: { code: 1, summary: 'AKTIV=2' } })), 'futásőr'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ guard: { code: 2, summary: 'GUARD_ERROR' } })), 'futásőr'), STATUS.FAIL);
});

test('decideMerge: /api/rt/status — hálózati hiba FAIL, off PASS, aktív meccs FAIL', () => {
  assert.equal(st(decideMerge(base({ rt: { error: 'fetch failed' } })), 'valós idejű'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ rt: { json: { mode: 'on', activeMatches: 0 } } })), 'valós idejű'), STATUS.PASS);
  assert.equal(st(decideMerge(base({ rt: { json: { mode: 'admin', activeMatches: 2 } } })), 'valós idejű'), STATUS.FAIL);
});

// Kapu-gyorsítás A (docs/specs/2026-11-19-kapu-gyorsitas.md): a C-61 esetben a gépi összefésült próba dönt, nem új CI.
test('C-61 + összefésült próba: zöld próba → PASS (új CI nem kell); piros / nem futott → FAIL; konfighiba próba nélkül is FAIL', () => {
  const moved = { base: MAIN, mainSha: 'c'.repeat(40), repoWideScopes: cfg.repoWideScopes, files: ['scripts/qa/gates/lib.mjs'], mainFiles: ['scripts/qa/three-phase-check.mjs'] };
  const green = { status: STATUS.PASS, note: 'zöld', counts: { pass: 42 }, tree: 'f'.repeat(40), ms: 61_000 };
  const red = { status: STATUS.FAIL, note: 'bukik egy őr' };
  const pre = decideMainMoved(moved);
  assert.deepEqual([pre.status, pre.probeNeeded], [STATUS.FAIL, true], 'próba nélkül: FAIL, de próbát kér');
  assert.match(pre.note, /próba nem futott/);
  const ok = decideMainMoved({ ...moved, probe: green });
  assert.equal(ok.status, STATUS.PASS);
  assert.match(ok.note, /összefésült próba zöld \(42 teszt, fa ffffffffffff, 61 s\); új CI nem kell/);
  assert.doesNotMatch(ok.note, /várd meg az új CI-t/);
  assert.equal(decideMainMoved({ ...moved, probe: red }).status, STATUS.FAIL);
  for (const m of [null, []]) assert.equal(decideMainMoved({ ...moved, mainFiles: m, probe: green }).status, STATUS.PASS, `olvashatatlan main-lista (${m}): a próba dönt`);
  const cfgErr = decideMainMoved({ ...moved, repoWideScopes: [], probe: green });
  assert.deepEqual([cfgErr.status, Boolean(cfgErr.probeNeeded)], [STATUS.FAIL, false], 'hiányzó hatókör-tábla: konfighiba, próba sem ment fel');
  assert.equal(decideMainMoved({ ...moved, files: ['source/server/a.ts'] }).probeNeeded, undefined, 'nem érintett: nincs próba');
  assert.equal(st(decideMerge(base({ mainSha: 'c'.repeat(40), files: ['scripts/qa/gates/lib.mjs'], mainFiles: ['scripts/qa/x.mjs'], probe: green })), 'main elmozdulása'), STATUS.PASS, 'a decideMerge továbbadja');
});

test('runMergeProbe: a PR feje és a main hash-egyezéssel; lekérési hiba / eltérő fej / eltérő main → FAIL, a próba nem fut', async () => {
  const H = 'a'.repeat(40);
  const M = 'c'.repeat(40);
  const mk = ({ fetch = 0, pr = H, main = M } = {}) => ({ git: { run: (args) => {
    if (args[0] === 'fetch') return { code: fetch, stdout: '', stderr: 'hálózati hiba' };
    if (args[1] === 'refs/remotes/origin/gate-pr-7') return { code: 0, stdout: `${pr}\n` };
    if (args[1] === 'refs/remotes/origin/main') return { code: 0, stdout: `${main}\n` };
    return { code: 1, stdout: '', stderr: '' };
  } } });
  let called = null;
  const probe = async (ctx, opts) => { called = opts; return { status: STATUS.PASS, note: 'zöld', counts: { pass: 3 }, tree: 't', ms: 5 }; };
  const ok = await runMergeProbe({ ctx: mk(), n: '7', head: H, mainSha: M, files: ['scripts/qa/x.test.mjs'], probe });
  assert.equal(ok.status, STATUS.PASS);
  assert.deepEqual(called, { head: H, base: 'origin/main', files: ['scripts/qa/x.test.mjs'], label: 'pre-merge-gate' });
  for (const [over, re] of [[{ fetch: 1 }, /nem kérhető le/], [{ pr: 'b'.repeat(40) }, /nem a GitHub szerinti fej/], [{ main: 'd'.repeat(40) }, /nem a GitHub szerinti csúcs/]]) {
    called = null;
    const r = await runMergeProbe({ ctx: mk(over), n: '7', head: H, mainSha: M, files: [], probe });
    assert.equal(r.status, STATUS.FAIL);
    assert.match(r.note, re);
    assert.equal(called, null, 'a próba nem fut');
  }
  const boom = await runMergeProbe({ ctx: mk(), n: '7', head: H, mainSha: M, files: [], probe: async () => { throw new Error('lemez tele'); } });
  assert.deepEqual([boom.status, /nem futott \(lemez tele\)/.test(boom.note)], [STATUS.FAIL, true]);
});
