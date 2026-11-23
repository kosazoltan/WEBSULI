// docs/specs/2026-11-17-minosegkapuk.md — a közös könyvtár: szűrő (E15), futtató / összesítő (D2), diff-elemzés, bizonyíték-tár, ítélet (D9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  STATUS, createGate, parseNumstat, parseUnifiedZero, prodLineStats, readEvidence, redact, resolveVerdict, verdictLine, verdictResult, writeEvidence, writeLog,
  loadConfig,
} from './lib.mjs';

// A szintetikus titkokat / címeket futásidőben rakjuk össze, hogy a repó saját őrei (no-real-emails-guard, lint-gate) ne lássák.
const at = '@';
const fakeMail = `valaki${at}gmail.com`;
const fakeDb = ['postgres', '://admin:titok123', at, 'ep-pelda.neon.tech/db'].join('');
const fakeGh = `ghp_${'A1b2C3d4E5f6'.repeat(3)}`;
const fakeAnt = `sk-ant-${'x9Y8z7W6'.repeat(3)}`;
const fakeAws = `AKIA${'ABCDEFGH12345678'}`;

test('redact: e-mail, kapcsolati szöveg, token, AWS-kulcs és Bearer helyőrzőre cserélve', () => {
  const s = `cím ${fakeMail}, db ${fakeDb}, gh ${fakeGh}, ant ${fakeAnt}, aws ${fakeAws}, Authorization: Bearer abcdefgh12345678`;
  const r = redact(s);
  for (const secret of [fakeMail, fakeDb, fakeGh, fakeAnt, fakeAws, 'abcdefgh12345678']) assert.ok(!r.includes(secret), secret.slice(0, 6));
  assert.match(r, /<email>/);
  assert.match(r, /<db-url>/);
  assert.match(r, /<token>/);
  assert.match(r, /<aws-key>/);
});

test('createGate: lépésenkénti állapot, összesítő tábla, kilépési kód; a kiírás is szűrt', async () => {
  const lines = [];
  const g = createGate('proba', { log: (s) => lines.push(s) });
  await g.step('jó', () => ({ status: STATUS.PASS }));
  await g.step('figyelmeztet', () => ({ status: STATUS.WARN, note: `nézd: ${fakeMail}` }));
  await g.step('dob', () => { throw new Error('robbant\nmásodik sor'); });
  assert.equal(g.finish(), 1);
  const text = lines.join('\n');
  assert.match(text, /FAIL\s+dob — robbant/);
  assert.ok(!text.includes('második sor'));
  assert.ok(!text.includes(fakeMail));
  assert.match(text, /== proba — összesítés ==/);
  assert.match(text, /BUKOTT/);
});

test('createGate: NOT RUN csak --strict mellett bukás; WARN / SKIP / KIVÉTEL nem bukás', async () => {
  const quiet = { log: () => {} };
  const a = createGate('a', quiet);
  a.add('x', STATUS.NOT_RUN); a.add('y', STATUS.WARN); a.add('z', STATUS.SKIP); a.add('k', STATUS.EXCEPTION);
  assert.equal(a.finish(), 0);
  const b = createGate('b', { ...quiet, strict: true });
  b.add('x', STATUS.NOT_RUN);
  assert.equal(b.finish(), 1);
});

test('parseUnifiedZero: hozzáadott sorok fájl:sor szerint, törölt fájl nélkül', () => {
  const diff = [
    'diff --git a/x.ts b/x.ts', '--- a/x.ts', '+++ b/x.ts', '@@ -3,0 +4,2 @@', '+első', '+második',
    '@@ -10 +12 @@', '-régi', '+új',
    'diff --git a/torolt.ts b/torolt.ts', '--- a/torolt.ts', '+++ /dev/null', '@@ -1 +0,0 @@', '-volt',
  ].join('\n');
  assert.deepEqual(parseUnifiedZero(diff), [
    { file: 'x.ts', line: 4, text: 'első' }, { file: 'x.ts', line: 5, text: 'második' }, { file: 'x.ts', line: 12, text: 'új' },
  ]);
});

test('bizonyíték-tár: írás / olvasás, a napló szűrve', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-ev-'));
  writeEvidence(dir, 'pre-push-abc', { ok: true, head: 'abc' });
  assert.deepEqual(readEvidence(dir, 'pre-push-abc'), { ok: true, head: 'abc' });
  assert.equal(readEvidence(dir, 'nincs'), null);
  const p = writeLog(dir, 'g', 'lépés neve', `kimenet ${fakeDb}`);
  assert.ok(!readFileSync(p, 'utf8').includes('titok123'));
});

test('resolveVerdict: helyi bizonyíték, PR-sor előtag-egyezéssel, idegen fej nem számít, az utolsó sor nyer', () => {
  const head = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
  assert.deepEqual(resolveVerdict({ head, evidence: { head, verdict: 'IGEN' } }), { verdict: 'IGEN', source: 'helyi bizonyíték (record-review)' });
  assert.equal(resolveVerdict({ head, evidence: { head: 'ffff', verdict: 'IGEN' } }), null);
  assert.equal(resolveVerdict({ head, texts: [verdictLine('IGEN', 'b'.repeat(40))] }), null);
  const v = resolveVerdict({ head, texts: ['leírás', `${verdictLine('NEM', head)}\n…\n${verdictLine('IGEN, FELTÉTELLEL', head)}`] });
  assert.deepEqual(v, { verdict: 'IGEN, FELTÉTELLEL', source: 'PR-komment' });
  assert.equal(resolveVerdict({ head, texts: [`Független ellenőr ítélete: IGEN (fej: ${head.slice(0, 6)})`] }), null, '7 jegynél rövidebb hash nem elég');
});

test('verdictResult: IGEN → PASS, FELTÉTELLEL → WARN, NEM / hiány → FAIL érthető teendővel', () => {
  const h = 'c'.repeat(40);
  assert.equal(verdictResult({ verdict: 'IGEN', source: 's' }, h).status, STATUS.PASS);
  assert.equal(verdictResult({ verdict: 'IGEN, FELTÉTELLEL', source: 's' }, h).status, STATUS.WARN);
  assert.equal(verdictResult({ verdict: 'NEM', source: 's' }, h).status, STATUS.FAIL);
  const none = verdictResult(null, h);
  assert.equal(none.status, STATUS.FAIL);
  assert.match(none.note, /record-review\.mjs --head c{12}/);
});

// --- Terv docs/specs/2026-11-23-aranyos-kapuk.md (A1, A2): kis javítás ---

test('parseNumstat: sorszámok, bináris fájl, tabulátoros út', () => {
  assert.deepEqual(parseNumstat('3\t1\tsource/server/a.ts\n-\t-\tsource/client/x.png\n'), [
    { path: 'source/server/a.ts', add: 3, del: 1, binary: false },
    { path: 'source/client/x.png', add: 0, del: 0, binary: true },
  ]);
  assert.deepEqual(parseNumstat(''), []);
});

test('prodLineStats: csak az éles kód számít; ≤ 30 sor kis javítás, 31 nem; kizárt útvonal és bináris soha', () => {
  const smallFix = loadConfig().smallFix;
  const e = (path, add, del = 0, binary = false) => ({ path, add, del, binary });
  const ok = prodLineStats([e('source/server/a.ts', 20, 10), e('source/tests/a.test.ts', 300), e('docs/specs/x.md', 80), e('source/client/src/b.spec.ts', 50)], smallFix);
  assert.equal(ok.lines, 30);
  assert.equal(ok.files, 1);
  assert.equal(ok.small, true, '30 éles sor: kis javítás');
  assert.equal(prodLineStats([e('source/server/a.ts', 31)], smallFix).small, false, '31 éles sor: nem kis javítás');
  const never = prodLineStats([e('source/server/a.ts', 2), e('scripts/qa/gates/lib.mjs', 1)], smallFix);
  assert.equal(never.small, false, 'kapu-fájl: soha nem kis javítás');
  assert.deepEqual(never.never, ['scripts/qa/gates/lib.mjs']);
  for (const p of ['.github/workflows/ci.yml', 'source/package.json', 'source/migrations/0050_x.sql', 'source/shared/schema.ts', 'render.yaml', '.claude/settings.json', '.agents/skills/a/SKILL.md']) {
    assert.equal(prodLineStats([e(p, 1)], smallFix).small, false, p);
  }
  assert.equal(prodLineStats([e('source/client/src/logo.png', 0, 0, true)], smallFix).small, false, 'bináris éles fájl: fail-closed');
  assert.equal(prodLineStats([e('docs/a.md', 500), e('source/tests/x.test.ts', 400)], smallFix).small, true, 'csak teszt és dokumentáció: 0 éles sor');
  assert.equal(prodLineStats([e('source/server/a.ts', 1)], undefined).small, false, 'konfiguráció nélkül soha nem kis javítás');
});

test('verdictResult kis javítással: ítélet nélkül PASS; NEM mindig FAIL; nem kis javításnál a hiány FAIL, megnevezett okkal', () => {
  const h = 'a'.repeat(40);
  const smallFix = loadConfig().smallFix;
  const small = prodLineStats([{ path: 'source/server/a.ts', add: 5, del: 2 }], smallFix);
  const pass = verdictResult(null, h, small);
  assert.equal(pass.status, STATUS.PASS);
  assert.match(pass.note, /KIS JAVÍTÁS \(7 éles sor ≤ 30/);
  assert.equal(verdictResult({ verdict: 'NEM', source: 's' }, h, small).status, STATUS.FAIL, 'kis javításnál is: a NEM ítélet bukás');
  const big = prodLineStats([{ path: 'source/server/a.ts', add: 40 }], smallFix);
  const fail = verdictResult(null, h, big);
  assert.equal(fail.status, STATUS.FAIL);
  assert.match(fail.note, /40 éles sor > 30/);
  assert.match(verdictResult(null, h, prodLineStats([{ path: 'scripts/qa/x.mjs', add: 1 }], smallFix)).note, /kizárt útvonal: scripts\/qa\/x\.mjs/);
  assert.equal(verdictResult(null, h).status, STATUS.FAIL, 'a régi hívás (méret nélkül) változatlan');
});
