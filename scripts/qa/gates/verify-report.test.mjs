// S2 — állítás- és hivatkozás-ellenőrző (docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum-vegrehajtas.md S2, R; független review
// B1, M1). A valódi ellenőri jelentések NEM kerülnek a nyilvános repóba: a korpusz-futtatás helyi (verify-report-corpus.mjs); itt
// hibaosztályonként egy-egy anonimizált minta áll, és a szándékosan hamisított változatok, amelyeknek továbbra is bukniuk kell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS } from './lib.mjs';
import { buildRunRecord, redactMore, testCounts } from './evidence-run.mjs';
import { buildRecord } from './record-review.mjs';
import {
  FALSE, SCHEMA, TRUE, UNKNOWN, checkClaims, checkReferences, extractClaimsBlock, extractRefs, normCmd, stripFences, summarizeRefs,
} from './verify-report.mjs';

const H = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
const FILE = ['import x from "y";', 'export function verifyReport(md) {', '  const refs = extractRefs(md);', '  return refs;', '}'].join('\n');

/** Hamis repó-környezet: a fej (null) és egy régi fej (`bbbbbbb`) fájljai; a történetben létező, de a fejen hiányzó út. */
function fakeEnv(over = {}) {
  const heads = {
    [H]: { files: ['scripts/qa/gates/verify-report.mjs', 'source/client/src/lib/tornado/sim.ts', 'source/tests/a.test.ts', 'source/tests/b/a.test.ts', 'docs/specs/terv.md'], read: (p) => (p === 'scripts/qa/gates/verify-report.mjs' ? FILE : p.endsWith('sim.ts') ? 'a\nb\nc' : 'egy sor') },
    [OLD]: { files: ['source/client/src/lib/tornado/sim.ts'], read: () => Array.from({ length: 300 }, (_, i) => `sor ${i + 1}`).join('\n') },
  };
  const repoAt = (h) => {
    const key = h == null ? H : Object.keys(heads).find((k) => k.startsWith(h));
    if (!key) return null;
    const files = new Set(heads[key].files);
    const dirs = new Set();
    for (const f of files) { const parts = f.split('/'); for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/')); }
    return { files, dirs, read: heads[key].read };
  };
  return {
    repoAt,
    existsAnywhere: (p) => p === 'source/tests/mas-agon.spec.ts',
    scripts: new Set(['gate:stage', 'check']),
    commitExists: (h) => h.startsWith('abc1234'),
    pr: (n) => (n === 492 ? { state: 'OPEN' } : null),
    record: (id) => ({ 'run-0123456789ab': { head: H, ok: true, code: 0, counts: { tests: 29, pass: 29, fail: 0 } } })[id] ?? null,
    ...over,
  };
}

const st = (items) => items.map((x) => [x.ref, x.status]);

// ---- hibaosztályok a valódi ellenőri jelentésekből (B1): mindegyik IGAZ vagy NEM ELLENŐRIZHETŐ, egyik sem HAMIS ----

test('B1/a: backtickes fájl:sor + próza + backtickes azonosító — a próza NEM kódidézet (IGAZ)', () => {
  const items = checkReferences('- `scripts/qa/gates/verify-report.mjs:2`: a `verifyReport` a kézfogásban fut, lásd `:4`.', fakeEnv());
  assert.deepEqual(st(items), [['scripts/qa/gates/verify-report.mjs:2', TRUE]]);
  assert.equal(items[0].snippet, undefined);
});

test('B1/a: kódidézet CSAK explicit jelöléssel (→ vagy „idézet:”); helyes IGAZ, hamis HAMIS, túl rövid NEM ELLENŐRIZHETŐ', () => {
  const env = fakeEnv();
  assert.deepEqual(st(checkReferences('`scripts/qa/gates/verify-report.mjs:2` → `export function verifyReport`', env)), [['scripts/qa/gates/verify-report.mjs:2', TRUE]]);
  assert.deepEqual(st(checkReferences('`scripts/qa/gates/verify-report.mjs:5` idézet: `const refs = extractRefs(md);`', env)), [['scripts/qa/gates/verify-report.mjs:5', TRUE]]);
  assert.deepEqual(st(checkReferences('`scripts/qa/gates/verify-report.mjs:1` → `eval(userInput)`', env)), [['scripts/qa/gates/verify-report.mjs:1', FALSE]]);
  assert.deepEqual(st(checkReferences('`scripts/qa/gates/verify-report.mjs:4` → `return`', env)), [['scripts/qa/gates/verify-report.mjs:4', UNKNOWN]]);
  // a nyíl utáni MÁSIK hivatkozás nem idézet
  assert.deepEqual(st(checkReferences('`scripts/qa/gates/verify-report.mjs:2` → `sim.ts:1`, `:3`', env)).map((x) => x[1]), [TRUE, TRUE]);
});

test('B1/b: rövidítés-előtag (WT/, L/), …-os rövidítés, munkafa / scratchpad út, más ág, ágnév, helyőrző', () => {
  const env = fakeEnv();
  const md = [
    '`L/tornado/sim.ts:2` és `WT/nincs/ilyen.ts:3`',
    'végrehajtás `…-vegrehajtas.md:1593`',
    'munkafa: `.claude/worktrees/x/scripts/qa/gates/lib.mjs:26`, scratchpad: `review-482/probe.mts`',
    'más ágon: `source/tests/mas-agon.spec.ts:281`',
    'ág: `docs/szkriptkapuk-terv`; tervezett: `scripts/qa/gates/chain-repair.mjs`; parancs: `npm run gate:<x>`',
    'csak név, két találat: `a.test.ts:1`',
  ].join('\n');
  const items = checkReferences(md, env);
  assert.deepEqual(st(items), [
    ['L/tornado/sim.ts:2', TRUE],
    ['WT/nincs/ilyen.ts:3', UNKNOWN],
    ['-vegrehajtas.md:1593', UNKNOWN],
    ['review-482/probe.mts', UNKNOWN],
    ['source/tests/mas-agon.spec.ts:281', UNKNOWN],
    ['docs/szkriptkapuk-terv', UNKNOWN],
    ['scripts/qa/gates/chain-repair.mjs', UNKNOWN],
    ['a.test.ts:1', UNKNOWN],
  ]);
  assert.ok(!items.some((x) => x.status === FALSE));
});

test('B1/b: hiány-lelet explicit negatív hivatkozással — IGAZ, ha tényleg nincs; HAMIS, ha mégis létezik', () => {
  const env = fakeEnv();
  assert.deepEqual(st(checkReferences('A terv ígéri, de nincs: !`scripts/qa/gates/evidence-chain.test.mjs`', env)), [['!scripts/qa/gates/evidence-chain.test.mjs', TRUE]]);
  assert.deepEqual(st(checkReferences('nem létezik: `scripts/qa/gates/verify-report.mjs`', env)), [['!scripts/qa/gates/verify-report.mjs', FALSE]]);
});

test('B1/c: a korábbi kör sorszámai a SAJÁT fejükön — szakasz-fej, lista-elem fej, explicit <fej>: előtag', () => {
  const env = fakeEnv();
  const md = [
    '# Review — fej `bbbbbbb`',
    '- `source/client/src/lib/tornado/sim.ts:250` (a régi fejen 300 sor)',
    '# Visszaellenőrzés — új fej `aaaaaaa`',
    '- `source/client/src/lib/tornado/sim.ts:3`',
    '- **#418 (fej `bbbbbbb`) — 1 lelet:** source/client/src/lib/tornado/sim.ts 260. sorában',
    '  folytatás: `source/client/src/lib/tornado/sim.ts:270`',
    'Explicit: `bbbbbbb:source/client/src/lib/tornado/sim.ts:299`',
  ].join('\n');
  const items = checkReferences(md, env);
  assert.deepEqual(items.map((x) => [x.head, x.status]), [['bbbbbbb', TRUE], ['aaaaaaa', TRUE], ['bbbbbbb', TRUE], ['bbbbbbb', TRUE], ['bbbbbbb', TRUE]]);
  // ugyanaz a sorszám a JELENLEGI fejen: HAMIS (a fájl 3 soros)
  assert.equal(checkReferences('`source/client/src/lib/tornado/sim.ts:250`', env)[0].status, FALSE);
});

test('B1: npm run írásjellel és toldalékkal; rövid bizonyíték-azonosító; tilde-kerítés; kimenet-hash nem commit', () => {
  const env = fakeEnv({ record: (id) => (id.startsWith('run-0123456789ab') ? { head: H, ok: true, code: 0, counts: { tests: 29, pass: 29, fail: 0 } } : null) });
  const md = [
    'Futtasd az npm run gate:stage. Utána npm run gate:stage-et.',
    '29/29 teszt (run-0123456789ab).',
    '~~~', '`scripts/qa/nincs.mjs:1` npm run nincs', '~~~',
    'A kimenet-hash `a3f9c2d1e4b5` volt.',
  ].join('\n');
  assert.deepEqual(st(checkReferences(md, env)), [['npm run gate:stage', TRUE], ['npm run gate:stage-et', TRUE], ['29/29 teszt', TRUE], ['a3f9c2d1e4b5', UNKNOWN]]);
  assert.equal(stripFences('a\n~~~\nb\n~~~\nc').join('|'), 'a||||c');
});

// ---- a szándékosan hamisított változatoknak továbbra is bukniuk kell ----

test('hamisítás: nem létező sor, nem létező fájl, hamis idézet, nem létező szkript, „30/30” 29 mellett, nem létező commit — mind HAMIS', () => {
  const env = fakeEnv();
  const md = [
    '`scripts/qa/gates/verify-report.mjs:999`',
    '`scripts/qa/gates/nincs-ilyen.mjs:5`',
    '`scripts/qa/gates/verify-report.mjs:2` → `SELECT * FROM users`',
    'npm run nincs-ilyen',
    '30/30 teszt zöld (run-0123456789ab)',
    'a commit deadbeef12 javította',
    'lásd scripts/qa/gates/verify-report.mjs 9999. sorában és scripts/qa/gates/verify-report.mjs#L9999',
  ].join('\n');
  const items = checkReferences(md, env);
  assert.deepEqual(items.map((x) => x.status), Array(8).fill(FALSE), items.map((x) => `${x.ref}: ${x.status} ${x.detail}`).join('\n'));
});

test('summarizeRefs: a NEM ELLENŐRIZHETŐ arány küszöb fölött figyelmeztet', () => {
  const s = summarizeRefs([{ status: UNKNOWN }, { status: UNKNOWN }, { status: UNKNOWN }, { status: UNKNOWN }, { status: TRUE }], 0.5);
  assert.equal(s.unknownWarn, true);
  assert.equal(summarizeRefs([{ status: UNKNOWN }], 0.5).unknownWarn, false, '5-nél kevesebb hivatkozásnál nem');
  assert.equal(extractRefs('PR #492').length, 1);
});

// ---- (B) gépi blokk — a független review M1 kijátszásai negatív tesztként ----

const claims = (over = {}) => ({
  schema: SCHEMA, branch: 'chore/x', head: H, changedFiles: ['scripts/qa/gates/verify-report.mjs'],
  commands: [{ cmd: 'npm run gate:stage', status: 'PASS', evidence: `stage-${H}` }],
  tests: [{ cmd: 'node --test x.test.mjs', status: 'PASS', pass: 29, fail: 0, evidence: 'run-0123456789ab' }],
  refs: [{ file: 'scripts/qa/gates/verify-report.mjs', line: 2, text: 'export function verifyReport' }],
  pr: { number: 492, state: 'OPEN', ci: 'green' },
  gates: ['stage', 'push', 'review', 'pr'],
  notRun: [{ what: 'E2E', reason: 'nincs UI', risk: 'nincs' }],
  ...over,
});

function env(over = {}) {
  const recs = {
    [`stage-${H}`]: { kind: 'stage', head: H, ok: true }, [`pre-push-${H}`]: { kind: 'pre-push', head: H, ok: true }, [`pre-pr-${H}`]: { kind: 'pre-pr', head: H, ok: true },
    [`review-${H}`]: { kind: 'review', head: H, verdict: 'IGEN', ok: true }, 'run-0123456789ab': { kind: 'run', head: H, ok: true, code: 0, cmd: 'node --test x.test.mjs', counts: { tests: 29, pass: 29, fail: 0 } },
    'run-ffffffffffff': { kind: 'run', head: H, ok: true, code: 0, cmd: 'node -e 0', counts: null },
  };
  return {
    head: H, base: 'origin/main',
    resolve: (r) => (r === H || r === 'chore/x' ? H : r === OLD ? OLD : null),
    diffNames: () => ['scripts/qa/gates/verify-report.mjs'],
    record: (id) => recs[id] ?? null,
    chain: () => ({ status: 'ok', breaks: 0 }),
    chainEnforce: true,
    pr: () => ({ state: 'OPEN', headRefOid: H, statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }] }),
    noGh: false,
    refEnv: fakeEnv(),
    proseCounts: [],
    ...over,
  };
}

const fails = (rs) => rs.filter((r) => r.status === STATUS.FAIL).map((r) => r.name);

test('checkClaims: a valósággal egyező, teljes blokk zöld', () => {
  assert.deepEqual(fails(checkClaims(claims(), env())), []);
});

test('M1/E1: minimális blokk (séma + fej) + „30/30 teszt zöld” próza → kötelező mezők és prózai állítás bukik', () => {
  const r = checkClaims({ schema: SCHEMA, head: H }, env({ proseCounts: [{ ref: '30/30 teszt', pass: 30, total: 30 }] }));
  assert.ok(fails(r).includes('kötelező mezők'));
  assert.ok(fails(r).some((n) => n.startsWith('prózai állítás')));
});

test('M1/E3–E4: zárt állapot-szótár — „OK”, „PASSED”, „zöld”, állapot nélküli teszt-tétel bukik', () => {
  for (const status of ['OK', 'PASSED', 'zöld', undefined]) {
    assert.deepEqual(fails(checkClaims(claims({ commands: [{ cmd: 'npm test', status }], tests: [], gates: [] }), env())), ['parancs: npm test'], String(status));
  }
  assert.deepEqual(fails(checkClaims(claims({ commands: [], tests: [{ cmd: 'npm test', pass: 30 }], gates: [] }), env())), ['teszt: npm test']);
  assert.deepEqual(fails(checkClaims(claims({ commands: [{ cmd: 'npm run lint', status: 'FAIL' }, { cmd: 'npm run build', status: 'NOT RUN' }], gates: [] }), env())), [], 'a bukás / kihagyás bevallása elfogadott');
});

test('M1/E5: „npm test PASS, 3012 pass” egy `node -e 0` futás bizonyítékával → a parancs és a darabszám bukik', () => {
  const r = checkClaims(claims({ commands: [{ cmd: 'npm test', status: 'PASS', evidence: 'run-ffffffffffff' }], tests: [{ cmd: 'npm test', status: 'PASS', pass: 3012, fail: 0, evidence: 'run-ffffffffffff' }], gates: [] }), env());
  assert.deepEqual(fails(r), ['parancs: npm test', 'teszt: npm test']);
  assert.match(r.find((x) => x.name === 'parancs: npm test').note, /más parancsot/);
});

test('M1/E8–E9: a fej és a bázis a HÍVÓTÓL jön — régi blokk-fej bukik; a blokk „base” mezője nem számít', () => {
  assert.deepEqual(fails(checkClaims(claims({ head: OLD }), env())), ['fej = a hívó feje']);
  let usedBase = null;
  checkClaims(claims({ base: H, changedFiles: [] }), env({ diffNames: (b) => { usedBase = b; return ['x.mjs']; } }));
  assert.equal(usedBase, 'origin/main');
  assert.ok(fails(checkClaims(claims({ base: H, changedFiles: [] }), env({ diffNames: () => ['x.mjs'] }))).some((n) => n.startsWith('módosított fájlok')));
});

test('M1: prózai „N/M teszt” csak a blokk igazolt tételével egyezve fogadható el', () => {
  assert.deepEqual(fails(checkClaims(claims(), env({ proseCounts: [{ ref: '29/29 teszt', pass: 29, total: 29 }] }))), []);
  assert.ok(fails(checkClaims(claims(), env({ proseCounts: [{ ref: '30/30 teszt', pass: 30, total: 30 }] }))).some((n) => n.startsWith('prózai')));
});

test('M1: PR-állapot gh nélkül: --no-gh mellett WARN, különben FAIL', () => {
  const noGh = checkClaims(claims(), env({ pr: () => undefined, noGh: true }));
  assert.equal(noGh.find((r) => r.name.startsWith('PR #492')).status, STATUS.WARN);
  assert.ok(fails(checkClaims(claims(), env({ pr: () => undefined, noGh: false }))).includes('PR #492'));
});

test('M2: kézzel írt (láncon kívüli), lánc nélküli, átírt rekord és útvonal-bejáró azonosító', () => {
  for (const status of ['not-in-chain', 'no-chain', 'mismatch']) {
    const r = checkClaims(claims(), env({ chain: (id) => ({ status: id === 'run-0123456789ab' ? status : 'ok' }) }));
    assert.ok(fails(r).some((n) => n.startsWith('lánc: run-0123456789ab')), status);
  }
  const warnOnly = checkClaims(claims(), env({ chainEnforce: false, chain: () => ({ status: 'not-in-chain' }) }));
  assert.deepEqual(fails(warnOnly), [], 'bevezetési lépcső: chainEnforce nélkül csak figyelmeztet');
  const legacy = checkClaims(claims(), env({ chain: (id) => ({ status: id.startsWith('pre-pr-') ? 'not-in-chain' : 'ok' }) }));
  assert.ok(!fails(legacy).some((n) => n.startsWith('lánc: pre-pr')), 'a pre-pr író a #490 után kap láncot: addig WARN');
  assert.ok(fails(checkClaims(claims({ commands: [{ cmd: 'npm test', status: 'PASS', evidence: '../r-forged' }], tests: [], gates: [] }), env())).includes('parancs: npm test'));
});

test('extractClaimsBlock: hiányzó, kettőzött, hibás JSON blokk → hiba; normCmd', () => {
  assert.match(extractClaimsBlock('nincs').error, /nincs/);
  const b = '```json allitasok\n{"schema":"x"}\n```';
  assert.equal(extractClaimsBlock(`a\n${b}\n`).claims.schema, 'x');
  assert.match(extractClaimsBlock(`${b}\n${b}`).error, /pontosan egy/);
  assert.match(extractClaimsBlock('```json allitasok\n{nem json}\n```').error, /nem érvényes JSON/);
  assert.equal(normCmd('node scripts/qa/gates/evidence-run.mjs -- npm.cmd   test'), 'npm test');
});

// ---- record-review: bevezetési lépcső (B1/5) ----

test('record-review: warn módban a hamis hivatkozású jelentésből is rögzül az ítélet (figyelmeztetéssel); block módban nem', () => {
  const base = { head: 'a'.repeat(12), verdict: 'IGEN', report: 'r.md', resolveHead: () => H };
  const fenv = fakeEnv();
  const checkRefs = (text) => checkReferences(text, fenv).filter((x) => x.status === FALSE).map((x) => `${x.ref} — ${x.detail}`);
  const text = 'Lelet: `scripts/qa/gates/verify-report.mjs:99`\nÍtélet: IGEN';
  const warn = buildRecord({ ...base, readReport: () => text, checkRefs, refMode: 'warn' });
  assert.equal(warn.ok, true);
  assert.equal(warn.warnings.length, 1);
  assert.deepEqual(warn.record.refCheck, { mode: 'warn', false: 1 });
  const block = buildRecord({ ...base, readReport: () => text, checkRefs, refMode: 'block' });
  assert.equal(block.ok, false);
  assert.match(block.error, /HAMIS hivatkozás/);
  const good = buildRecord({ ...base, readReport: () => 'Lelet: `scripts/qa/gates/verify-report.mjs:2` → `export function verifyReport`\nÍtélet: IGEN', checkRefs, refMode: 'block' });
  assert.equal(good.ok, true, good.error);
});

// ---- evidence-run: darabszám, titok-szűrés (K5) ----

test('evidence-run: darabszám a node:test összesítőből; a rekord és a kimenet titok nélkül (K5)', () => {
  assert.deepEqual(testCounts('ℹ tests 12\nℹ pass 11\nℹ fail 1'), { tests: 12, pass: 11, fail: 1 });
  assert.equal(testCounts('semmi'), null);
  const tok = ['ghp', '_', 'abcDEF123456'.repeat(3)].join('');
  const jwt = ['eyJ', 'hbGciOiJIUzI1NiJ9', '.', 'eyJzdWIiOiIxMjMifQ', '.', 'c2lnbmF0dXJlLXRlc3Q'].join('');
  const secrets = [`--password=Titkos123`, `API_${'KEY'}=abc123def456`, jwt, ['sk', '-proj-', 'abcdefghijklmnop'].join(''), ['AIza', 'SyA1234567890abcdefgh'].join('')];
  for (const s of secrets) assert.ok(!redactMore(`x ${s} y`).includes(s.split('=').pop()), s.slice(0, 12));
  const { id, record } = buildRunRecord({ head: H, dirty: false, cmd: 'node', args: ['x', `--t=${tok}`, '--password', 'Titkos123'], result: { code: 0, stdout: 'ℹ pass 2\nℹ fail 0', stderr: '', ms: 5 }, now: () => new Date('2026-11-17T20:00:00Z') });
  assert.match(id, /^run-[0-9a-f]{12}$/);
  assert.ok(!record.cmd.includes(tok) && !record.cmd.includes('Titkos123'));
  assert.deepEqual(record.counts, { tests: null, pass: 2, fail: 0 });
});
