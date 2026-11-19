// docs/specs/2026-11-17-minosegkapuk.md — a közös könyvtár: szűrő (E15), futtató / összesítő (D2), diff-elemzés, bizonyíték-tár, ítélet (D9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  STATUS, createGate, parseUnifiedZero, readEvidence, redact, resolveVerdict, verdictLine, verdictResult, writeEvidence, writeLog,
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
  // 3. vak kör L1 (spec-változás): a helyi bizonyíték megbízható (trusted) és fejhez kötött
  assert.deepEqual(resolveVerdict({ head, evidence: { head, verdict: 'IGEN' } }), { verdict: 'IGEN', source: 'helyi bizonyíték (record-review)', trusted: true, head });
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
