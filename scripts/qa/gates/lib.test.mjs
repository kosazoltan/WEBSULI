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

// ---- docs/specs/2026-11-19-kitakaro-negyzetes-regex.md: lineáris kitakarás, összeomlás nélkül ----------------------------

test('redact: lineáris idő hosszú, @ nélküli és tartomány-futáson (300 000 kar. < 1 s bemenetenként)', () => {
  const n = 300_000;
  // [bemenet, elvárt kimenet] — a kimenetet is ellenőrizzük, hogy egy „nagy bemenetet változatlanul visszaadó” gyors út bukjon (#521).
  const same = (s) => [s, s];
  const inputs = {
    betuk: same('a'.repeat(n)),
    pontsor: same('a.'.repeat(n / 2)),
    hex: same('0123456789abcdef'.repeat(n / 16)),
    tartomany: same(`x${at}${'a'.repeat(n)}`),
    cimkek: same(`x${at}${'a.'.repeat(n / 2)}1`),
    kotojelek: same(`x${at}${'a-'.repeat(n / 2)}`),
    hosszuHelyi: [`${'b'.repeat(n)}${at}pelda.hu`, '<email>'],
    sokCimke: [`x${at}${'a.'.repeat(n / 2)}com`, '<email>'],
    cimAVegen: [`${'a'.repeat(n)} info${at}pelda.hu`, `${'a'.repeat(n)} <email>`],
    cimAzElejen: [`info${at}pelda.hu ${'0123456789abcdef'.repeat(n / 16)}`, `<email> ${'0123456789abcdef'.repeat(n / 16)}`],
  };
  for (const [name, [s, expected]] of Object.entries(inputs)) {
    const t0 = performance.now();
    const out = redact(s);
    const ms = performance.now() - t0;
    assert.ok(ms < 1000, `${name}: ${ms.toFixed(0)} ms`);
    assert.ok(out === expected, `${name}: a kimenet eltér (hossz ${out.length}, eleje ${JSON.stringify(out.slice(0, 20))})`);
  }
});

// A régi minták itt (Windows x64, Node) már 6–7 M karakternél dobtak; a 10 M tartalékkal bukik a régi kódon, és ~10 s alatt fut.
test('redact: 10 M karakteres token-, Bearer- és tartomány-futás nem omlik össze', () => {
  const n = 10_000_000;
  const cases = [
    [`ghp_${'a'.repeat(n)}_`, null],
    [`github_pat_${'a'.repeat(n)}-`, '<token>'],
    [`sk-${'a'.repeat(n)}`, '<token>'],
    [`sk-${'-'.repeat(n)}`, null],
    [`Bearer x${'a'.repeat(n)}`, 'Bearer <token>'],
    [`x${at}${'a.'.repeat(n / 2)}`, null],
  ];
  for (const [s, expected] of cases) {
    let out;
    assert.doesNotThrow(() => { out = redact(s); }, s.slice(0, 12));
    if (expected) assert.ok(out.startsWith(expected), `${s.slice(0, 12)} kitakarva`);
  }
  // #521: a nagy bemenetek kitakarása is ellenőrizve (pontos kimenet), nem csak a futás.
  assert.ok(redact(`${'b'.repeat(n)}${at}pelda.hu`) === '<email>', '10 M helyi rész + tartomány → <email>');
  assert.ok(redact(`x${at}${'a.'.repeat(n / 2)}com`) === '<email>', '5 M címke → <email>');
  assert.ok(redact(`sk-${'a'.repeat(n)}`) === '<token>', '10 M sk-token → <token>');
});

test('redact: valós címek továbbra is kitakarva (64 karakteres helyi rész, aldomain, plusz-címke, több cím)', () => {
  assert.equal(redact(`${'a'.repeat(64)}${at}pelda.hu`), '<email>');
  assert.equal(redact(`kovacs.janos+teszt${at}mail.pelda.co.uk`), '<email>');
  assert.equal(redact(`elso${at}pelda.hu, masodik_2${at}x-y.pelda.org`), '<email>, <email>');
  assert.equal(redact(`írj ide: (info${at}pelda.hu).`), 'írj ide: (<email>).');
  // RFC-n kívüli (80 karakteres) helyi rész: a tartomány és a cím vége akkor is rejtve marad.
  const hosszu = redact(`${'b'.repeat(16)}.${'c'.repeat(63)}${at}${'d'.repeat(63)}.pelda.com`);
  assert.match(hosszu, /<email>$/);
  assert.ok(!hosszu.includes('pelda.com') && !hosszu.includes(at));
  // #521: a teljes cím-szerű érték rejtve — a 64-nél hosszabb helyi rész eleje sem látszik.
  assert.equal(hosszu, '<email>');
});

test('redact (#521): 16-nál több (numerikus / egykarakteres) tartománycímke és hosszú TLD is teljesen kitakarva', () => {
  assert.equal(redact(`person${at}${'1.'.repeat(17)}example.com`), '<email>');
  assert.equal(redact(`a${at}${'b.'.repeat(40)}hu vége`), '<email> vége');
  assert.equal(redact(`a${at}x.${'c'.repeat(80)}`), '<email>');
  assert.equal(redact(`a${at}${'d'.repeat(70)}.pelda.hu`), '<email>');
  // ami a régi mintán sem volt cím, ma sem az: TLD nélküli, egybetűs TLD-s, üres címkés
  for (const s of [`a${at}localhost`, `a${at}b.c`, `a${at}b..com`, `${at}pelda.hu`]) assert.equal(redact(s), s);
  // a TLD betűs eleje számít (a régi minta szerint): a szám-farok marad
  assert.equal(redact(`a${at}b.com123`), '<email>123');
});
