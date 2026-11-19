// docs/specs/2026-11-17-minosegkapuk.md E9: a merge előtti kapu döntése hamis gh / futásőr / rt-adatokkal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS, loadConfig, resolveVerdict } from './lib.mjs';
import {
  COMPARE_FILE_LIMIT, checkRunsFromPages, collectMergeData, compareFiles, decideMainMoved, decideMerge, flattenPages, prFromRest, requiredChecks,
  GRAPHQL_MAX_PAGES, mergeVerdict, rootReviewComments, threadsFromCcr, trustedAuthor, verdictTexts,
} from './pre-merge-gate.mjs';

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

// docs/specs/2026-11-18-merge-kapu-rest.md: a REST-es adatgyűjtés leképezői (felhős munkamenetben a GraphQL tiltott).
test('prFromRest: a REST-es PR a decideMerge alakjára képződik, és a zöld eset PASS marad', () => {
  const pull = { number: 7, state: 'open', draft: false, mergeable_state: 'clean', head: { sha: HEAD }, base: { sha: MAIN }, body: 'leírás' };
  const pr = prFromRest(pull, [{ filename: 'source/server/a.ts' }], [{ body: 'k1' }]);
  // SPEC-VÁLTOZÁS 2026-11-19 (docs/specs/2026-11-18-merge-kapu-rest.md K2): a leírás és a kommentek szerzője is átkerül (ítélet-szűrés).
  const anon = { login: null, type: null, association: null };
  assert.deepEqual(pr, {
    number: 7, state: 'OPEN', isDraft: false, mergeStateStatus: 'CLEAN', headRefOid: HEAD, baseRefOid: MAIN,
    files: [{ path: 'source/server/a.ts' }], body: 'leírás', bodyAuthor: anon, comments: [{ body: 'k1', author: anon }],
  });
  const res = decideMerge(base({ pr }));
  assert.equal(st(res, 'PR állapota'), STATUS.PASS);
  assert.ok(!res.some((r) => r.status === STATUS.FAIL), JSON.stringify(res.filter((r) => r.status === STATUS.FAIL)));
});

test('prFromRest: piszkozat, zárt, ismeretlen / hiányzó mergeable_state → FAIL a PR-állapotban', () => {
  const p = (over) => prFromRest({ state: 'open', draft: false, mergeable_state: 'clean', head: { sha: HEAD }, base: { sha: MAIN }, ...over });
  assert.equal(st(decideMerge(base({ pr: p({ draft: true }) })), 'PR állapota'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ pr: p({ state: 'closed' }) })), 'PR állapota'), STATUS.FAIL);
  assert.equal(p({ mergeable_state: null }).mergeStateStatus, 'UNKNOWN');
  assert.equal(p({ mergeable_state: undefined }).mergeStateStatus, 'UNKNOWN');
  assert.equal(st(decideMerge(base({ pr: p({ mergeable_state: 'blocked' }) })), 'PR állapota'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ pr: p({ mergeable_state: null }) })), 'PR állapota'), STATUS.FAIL);
});

test('threadsFromCcr: resolved=true lezárt, false nyitott; nem lista, üres lista, hiányzó / nem logikai resolved → kivétel (fail-closed)', () => {
  // SPEC-VÁLTOZÁS 2026-11-19 (docs/specs/2026-11-18-merge-kapu-rest.md K1): a hiányzó `resolved` és az üres lista már nem „nyitott szál”, hanem FAIL.
  assert.deepEqual(threadsFromCcr([{ resolved: true }, { resolved: false }]), [{ isResolved: true }, { isResolved: false }]);
  assert.throws(() => threadsFromCcr(null), /nem lista/);
  assert.throws(() => threadsFromCcr({ threads: [{ resolved: false }] }), /nem lista/);
  assert.throws(() => threadsFromCcr(''), /nem lista/);
  assert.throws(() => threadsFromCcr([]), /üres/);
  assert.throws(() => threadsFromCcr([{ resolved: true }, {}]), /resolved/);
  assert.throws(() => threadsFromCcr([{ is_resolved: true }]), /resolved/);
  assert.throws(() => threadsFromCcr([{ resolved: 'true' }]), /resolved/);
  assert.equal(st(decideMerge(base({ threads: threadsFromCcr([{ resolved: true }, { resolved: false }]) })), 'lezáratlan review-szálak'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ threads: threadsFromCcr([{ resolved: true }]) })), 'lezáratlan review-szálak'), STATUS.PASS);
});

test('flattenPages: az oldalak egy listává; nem lista vagy csonka fájllista → kivétel (fail-closed)', () => {
  assert.deepEqual(flattenPages([[1, 2], [3]], 3), [1, 2, 3]);
  assert.deepEqual(flattenPages([[]]), []);
  assert.throws(() => flattenPages([[1, 2]], 150, 'fájllista'), /csonka \(2 \/ 150\)/);
  assert.throws(() => flattenPages({ items: [] }), /nem lista/);
  assert.throws(() => flattenPages([{ a: 1 }]), /nem lista/);
  const comments = flattenPages([Array.from({ length: 100 }, () => ({ body: 'x' })), [{ body: 'késői' }]]);
  assert.equal(comments.length, 101, 'a 100. utáni komment (pl. a késői ítéletsor) is megjön');
});

// ---- Vak review #513 javítókör (docs/specs/2026-11-18-merge-kapu-rest.md „Javítókör”) ----

const owner = { user: { login: 'gazda', type: 'User' }, author_association: 'OWNER' };
const stranger = { user: { login: 'idegen', type: 'User' }, author_association: 'NONE' };
const bot = { user: { login: 'segito[bot]', type: 'Bot' }, author_association: 'MEMBER' };
const vline = (v) => `Független ellenőr ítélete: ${v} (fej: ${HEAD.slice(0, 12)})`;

test('K2: ítélet PR-szövegből csak megbízható szerzőtől; idegen vagy bot nem írhat felül', () => {
  assert.equal(trustedAuthor({ login: 'a', type: 'User', association: 'OWNER' }), true);
  assert.equal(trustedAuthor({ login: 'a', type: 'User', association: 'collaborator' }), true);
  for (const a of [{ login: 'a', type: 'User', association: 'NONE' }, { login: 'a', type: 'User', association: 'CONTRIBUTOR' }, { login: 'x[bot]', type: 'User', association: 'OWNER' }, { login: 'x', type: 'Bot', association: 'MEMBER' }, { login: '', association: 'OWNER' }, null]) {
    assert.equal(trustedAuthor(a), false, JSON.stringify(a));
  }
  const pull = (body, who) => ({ state: 'open', mergeable_state: 'clean', head: { sha: HEAD }, base: { sha: MAIN }, body, ...who });
  // a megbízható NEM után az idegen és a bot IGEN-je nem számít
  const pr = prFromRest(pull('leírás', owner), [], [{ body: vline('NEM'), ...owner }, { body: vline('IGEN'), ...stranger }, { body: vline('IGEN'), ...bot }]);
  assert.deepEqual(resolveVerdict({ head: HEAD, evidence: null, texts: verdictTexts(pr) }), { verdict: 'NEM', source: 'PR-komment' });
  // csak idegen szerzőjű leírás-sor → nincs ítélet
  const pr2 = prFromRest(pull(vline('IGEN'), stranger), [], []);
  assert.equal(resolveVerdict({ head: HEAD, evidence: null, texts: verdictTexts(pr2) }), null);
  // a merge-kapu ítélet-lépése (mergeVerdict) ugyanezt a szűrést használja; a helyi bizonyíték elsőbbsége megmarad
  assert.equal(mergeVerdict(pr2, null), null);
  assert.deepEqual(mergeVerdict(pr, null), { verdict: 'NEM', source: 'PR-komment' });
  assert.deepEqual(mergeVerdict(pr2, { head: HEAD, verdict: 'IGEN' }), { verdict: 'IGEN', source: 'helyi bizonyíték (record-review)' });
  const pr3 = prFromRest(pull(vline('IGEN'), owner), [], []);
  assert.deepEqual(resolveVerdict({ head: HEAD, evidence: null, texts: verdictTexts(pr3) }), { verdict: 'IGEN', source: 'PR-leírás' });
});

test('K6: previous_filename is útvonal; check-run lista lapozva, csonka / ismeretlen alak → kivétel; gyökér review-kommentek', () => {
  const pr = prFromRest({ state: 'open' }, [{ filename: 'docs/archiv/x.md', previous_filename: 'scripts/qa/gates/x.mjs' }, { filename: 'a.md' }]);
  assert.deepEqual(pr.files.map((f) => f.path), ['docs/archiv/x.md', 'scripts/qa/gates/x.mjs', 'a.md']);
  assert.deepEqual(checkRunsFromPages([{ total_count: 3, check_runs: [run('a'), run('b')] }, { total_count: 3, check_runs: [run('c')] }]).map((c) => c.name), ['a', 'b', 'c']);
  assert.throws(() => checkRunsFromPages([{ total_count: 150, check_runs: [run('a')] }]), /csonka \(1 \/ 150\)/);
  assert.throws(() => checkRunsFromPages([{ total_count: 1 }]), /ismeretlen alakú/);
  assert.throws(() => checkRunsFromPages([]), /ismeretlen alakú/);
  assert.equal(rootReviewComments([{ id: 1 }, { id: 2, in_reply_to_id: 1 }, { id: 3, in_reply_to_id: null }]), 2);
});

// Hamis gh: útvonal-minta → válasz (függvény is lehet); a hívások naplója a bekötés (lapozás, sorrend) ellenőrzéséhez.
function fakeGh(routeList) {
  const calls = [];
  const exec = (cmd, args) => {
    const line = args.join(' ');
    calls.push(line);
    for (const [re, resp] of routeList) {
      if (re.test(line)) {
        const r = typeof resp === 'function' ? resp(line, calls) : resp;
        if (r instanceof Error) return { code: 1, stdout: '', stderr: r.message };
        return { code: 0, stdout: JSON.stringify(r), stderr: '' };
      }
    }
    return { code: 1, stdout: '', stderr: `nincs hamis válasz: ${line}` };
  };
  return { exec, calls };
}
const PULL = { number: 9, state: 'open', draft: false, mergeable_state: 'clean', changed_files: 2, head: { sha: HEAD }, base: { sha: MAIN }, body: 'x', ...owner };
const gqlPage = (nodes, next = null) => ({ data: { repository: { pullRequest: { reviewThreads: { nodes, pageInfo: { hasNextPage: Boolean(next), endCursor: next } } } } } });
function routes(over = {}) {
  return [
    [/^api repos\/\{owner\}\/\{repo\}$/, { full_name: 'o/r' }],
    [/^api repos\/o\/r\/pulls\/9$/, over.pull ?? PULL],
    [/--paginate --slurp repos\/o\/r\/pulls\/9\/files/, over.files ?? [[{ filename: 'a.md' }], [{ filename: 'source/b.ts' }]]],
    [/--paginate --slurp repos\/o\/r\/issues\/9\/comments/, [[{ body: 'k', ...owner }]]],
    [/^api repos\/o\/r\/branches\/main$/, { commit: { sha: MAIN }, protection: { required_status_checks: { contexts: ['B'] } } }],
    [/^api repos\/o\/r\/branches\/main\/protection$/, over.protection ?? { required_status_checks: { contexts: ['A'] } }],
    [/--paginate --slurp repos\/o\/r\/commits\/[0-9a-f]+\/check-runs/, [{ total_count: 1, check_runs: [run('A')] }]],
    [/^api repos\/o\/r\/commits\/[0-9a-f]+\/status$/, { statuses: [] }],
    [/^api graphql /, over.graphql ?? ((line) => (/after=c1/.test(line) ? gqlPage([{ isResolved: false }]) : gqlPage([{ isResolved: true }], 'c1')))],
    [/--paginate --slurp repos\/o\/r\/pulls\/9\/ccr\/review_threads/, over.ccr ?? new Error('HTTP 404')],
    [/--paginate --slurp repos\/o\/r\/pulls\/9\/comments/, over.reviewComments ?? [[]]],
    [/^api repos\/o\/r\/actions\/runs/, { workflow_runs: [{ id: 5, name: 'CI', pull_requests: [{ base: { sha: MAIN } }] }] }],
  ];
}
function collect(over = {}) {
  const g = fakeGh(routes(over));
  const sleeps = [];
  return { g, sleeps, run: () => collectMergeData({ exec: g.exec, root: '.', n: '9', sleep: (ms) => sleeps.push(ms) }) };
}

test('K3: collectMergeData bekötése — lapozó kapcsolók, GraphQL-lapozás, a kötelező lista forrása', () => {
  const c = collect();
  const d = c.run();
  for (const what of ['pulls/9/files', 'issues/9/comments', '/check-runs']) {
    assert.ok(c.g.calls.some((l) => l.includes(what) && l.includes('--paginate') && l.includes('--slurp')), `${what} lapozva`);
  }
  assert.deepEqual(d.pr.files.map((f) => f.path), ['a.md', 'source/b.ts']);
  assert.deepEqual(d.threads, [{ isResolved: true }, { isResolved: false }], 'a GraphQL 2. oldala is megjön');
  assert.equal(d.threadSource, 'graphql');
  assert.ok(!c.g.calls.some((l) => l.includes('ccr/')), 'sikeres GraphQL mellett a CCR-út nem fut');
  assert.deepEqual(d.required, ['A'], 'előbb a védelmi végpont');
  assert.deepEqual(collect({ protection: new Error('HTTP 403') }).run().required, ['B'], '403-nál a branches/main protection mezője');
  assert.equal(d.mainSha, MAIN);
  assert.equal(d.ciBaseSha, MAIN);
});

test('K1: felhős út — a GraphQL bukása után a CCR (lapozva), REST-keresztellenőrzéssel; üres / csonka / ismeretlen → kivétel', () => {
  const gqlFail = new Error('HTTP 403 GraphQL tiltott');
  const ok = collect({ graphql: gqlFail, ccr: [[{ resolved: true }], [{ resolved: false }]], reviewComments: [[{ id: 1 }, { id: 2, in_reply_to_id: 1 }, { id: 3 }]] });
  const d = ok.run();
  assert.equal(d.threadSource, 'ccr');
  assert.deepEqual(d.threads, [{ isResolved: true }, { isResolved: false }]);
  const gi = ok.g.calls.findIndex((l) => l.startsWith('api graphql'));
  const ci = ok.g.calls.findIndex((l) => l.includes('ccr/review_threads'));
  assert.ok(gi >= 0 && ci > gi, 'előbb a GraphQL, aztán a CCR');
  assert.ok(ok.g.calls[ci].includes('--paginate') && ok.g.calls[ci].includes('--slurp'), 'a CCR-út lapozva');
  assert.throws(() => collect({ graphql: gqlFail, ccr: [[]] }).run(), /üres/);
  assert.throws(() => collect({ graphql: gqlFail, ccr: [[{ resolved: true }]], reviewComments: [[{ id: 1 }, { id: 2 }]] }).run(), /csonka: 1 szál, de .* 2 gyökér/);
  assert.throws(() => collect({ graphql: gqlFail, ccr: [[{ isResolved: true }]] }).run(), /resolved/);
  assert.throws(() => collect({ graphql: gqlFail, ccr: { threads: [] } }).run(), /nem lista/);
  assert.throws(() => collect({ graphql: gqlFail }).run(), /HTTP 404/, 'ha a CCR is bukik: kivétel');
  assert.throws(() => collect({ graphql: gqlPage([{ isResolved: 'nem' }]), ccr: [[]] }).run(), /üres/, 'ismeretlen GraphQL-alak → CCR, ott üres → kivétel');
});

test('K4 + K6: hiányzó changed_files → kivétel; mergeable_state unknown → korlátos újrakérés, utána UNKNOWN; végtelen lapozás → kivétel', () => {
  const noCount = { ...PULL };
  delete noCount.changed_files;
  assert.throws(() => collect({ pull: noCount }).run(), /changed_files/);
  assert.throws(() => collect({ files: [[{ filename: 'a.md' }]] }).run(), /fájllista csonka \(1 \/ 2\)/);
  let k = 0;
  const flip = collect({ pull: () => { k += 1; return { ...PULL, mergeable_state: k < 2 ? 'unknown' : 'clean' }; } });
  assert.equal(flip.run().pr.mergeStateStatus, 'CLEAN');
  assert.deepEqual(flip.sleeps, [2_000], 'egy újrakérés elég volt');
  const stuck = collect({ pull: { ...PULL, mergeable_state: 'unknown' } });
  assert.equal(stuck.run().pr.mergeStateStatus, 'UNKNOWN');
  assert.deepEqual(stuck.sleeps, [2_000, 4_000], 'legfeljebb két várakozás (három kérés)');
  assert.equal(stuck.g.calls.filter((l) => /^api repos\/o\/r\/pulls\/9$/.test(l)).length, 3);
  let p = 0;
  assert.throws(() => collect({ graphql: () => { p += 1; return gqlPage([{ isResolved: true }], `c${p}`); }, ccr: new Error('HTTP 404') }).run(), /HTTP 404/, 'végtelen lapozás → GraphQL-hiba → CCR, ott 404');
  assert.equal(p, GRAPHQL_MAX_PAGES, 'a lapozás pontosan a korlátig ment, tovább nem');
});
