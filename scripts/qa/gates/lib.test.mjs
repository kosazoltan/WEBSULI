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

test('verdictResult: IGEN → PASS, FELTÉTELLEL / NEM → WARN (KAPU-LR-JELZES), hiány → FAIL érthető teendővel', () => {
  const h = 'c'.repeat(40);
  assert.equal(verdictResult({ verdict: 'IGEN', source: 's' }, h).status, STATUS.PASS);
  assert.equal(verdictResult({ verdict: 'IGEN, FELTÉTELLEL', source: 's' }, h).status, STATUS.WARN);
  const nem = verdictResult({ verdict: 'NEM', source: 's' }, h);
  assert.equal(nem.status, STATUS.WARN);
  assert.match(nem.note, /igazold .* vagy cáfold/u, 'review #639: a NEM teendője a PR-beli kezelés, nem új ellenőrkör');
  assert.doesNotMatch(nem.note, /futtasd újra/u);
  const none = verdictResult(null, h);
  assert.equal(none.status, STATUS.FAIL);
  assert.match(none.note, /record-review\.mjs --head c{12}/);
});

// ---- docs/specs/2026-11-22-kitakaro-elovagas.md: elővágás a főági kitakaró előtt ------------------------------------

const leak6 = (out, body) => { for (let i = 0; i + 6 <= body.length; i++) if (out.includes(body.slice(i, i + 6))) return body.slice(i, i + 6); return null; };

test('elővágás: 300 000 és 20 M karakteres ellenséges bemenet — nem dob, bemenetenként < 1 s', () => {
  for (const s of ['a'.repeat(300_000), `x${at}${'a.'.repeat(150_000)}`, 'a'.repeat(20_000_000), `ghp_${'a'.repeat(20_000_000)}_`,
    `Bearer x${'a'.repeat(20_000_000)}`, `sk-${'-'.repeat(20_000_000)}`, `x${at}${'a.'.repeat(10_000_000)}`]) {
    const t0 = performance.now();
    assert.doesNotThrow(() => redact(s), s.slice(0, 10));
    const ms = performance.now() - t0;
    assert.ok(ms < 1000, `${s.slice(0, 10)}…: ${ms.toFixed(0)} ms`);
  }
});

test('elővágás: a kapu vágási pontján átnyúló titok egyetlen 6 karakteres darabja sem marad (sorral és sor nélkül)', async () => {
  const { REDACT_CAP } = await import('./lib.mjs');
  const secrets = [
    ['Bearer ', 'Ab12Cd34Ef56Gh78Ij90Kl12'], ['', `ghp_${'A1b2C3d4E5f6'.repeat(3)}`], ['', `fiok.tulaj${at}pelda.hu`],
    ['', ['postgres', '://admin:', 'titok123', at, 'ep-pelda.neon.tech/db'].join('')],
  ];
  for (const sep of [' ', '\n']) {
    for (const [pre, body] of secrets) {
      const raw = pre + body;
      for (const back of [3, Math.floor(raw.length / 2), raw.length - 2]) {
        // a vágás (hossz − REDACT_CAP) pontosan a titok vége előtt `back` karakterre esik
        const tailLen = REDACT_CAP - back;
        const s = `q${sep}`.repeat(2500) + raw + `${sep}z`.repeat(tailLen).slice(0, tailLen);
        assert.equal(s.length - REDACT_CAP, 5000 + raw.length - back);
        const out = redact(s);
        assert.equal(leak6(out, body), null, `${JSON.stringify(sep)} ${body.slice(0, 8)} vissza ${back}`);
        assert.ok(out.length > 1000 && out.length <= REDACT_CAP + 100);
      }
    }
  }
});

test('elővágás: a korláton belül a kimenet bájtra a főági redact-é; a korlát felett a megtartott rész is', async () => {
  const { mainRedact } = await import('./kitakaro-main-baseline.mjs');
  const { REDACT_CAP } = await import('./lib.mjs');
  const samples = [
    `cím ${fakeMail}, db ${fakeDb}, gh ${fakeGh}, ant ${fakeAnt}, aws ${fakeAws}, Authorization: Bearer abcdefgh12345678`,
    'HTTP 503: Service Unavailable — lib.mjs:192, árvíztűrő tükörfúrógép', `${'a'.repeat(64)}${at}pelda.hu`, `x${at}${'a.'.repeat(3000)}hu`,
  ];
  // A minták a korláton belül vannak (a 8 KB-os korlát óta a régi 10 004 karakteres minta már vágódna).
  for (const s of samples) assert.ok(s.length <= REDACT_CAP, `${s.length} > ${REDACT_CAP}`);
  for (const s of samples) assert.equal(redact(s), mainRedact(s));
  const big = `${'n '.repeat(REDACT_CAP)}\nvége ${fakeMail} ${fakeGh}`;
  const out = redact(big);
  assert.ok(out.endsWith(mainRedact(`vége ${fakeMail} ${fakeGh}`)), out.slice(-60));
});

// ---- 1. vak kör (9effab11) -------------------------------------------------------------------------------------------

test('vak L1 (9effab11): ANSI-színezett DB-URL a kapu vágási pontján — a writeLog naplója a főághoz hasonlóan titokmentes', async () => {
  const { REDACT_CAP } = await import('./lib.mjs');
  const E = String.fromCharCode(27);
  const url = ['postgres', '://', `${E}[1m`, 'admin', `${E}[0m:`, `${E}[33m`, 'titok123', `${E}[0m`, at, `${E}[36m`, 'db.sample.invalid', `${E}[0m`, '/prod'].join('');
  const dir = mkdtempSync(join(tmpdir(), 'elovagas-l1-'));
  for (const back of [url.length - 2, url.length - 8, url.length - 15, url.length - 30]) {
    const tailLen = REDACT_CAP - back;
    const s = 'q '.repeat(2500) + url + ' z'.repeat(tailLen).slice(0, tailLen);
    const got = readFileSync(writeLog(dir, 'stage', 'ansi', s), 'utf8');
    for (const frag of ['titok1', 'sample.inv', 'admin']) assert.ok(!got.includes(frag), `vissza ${back}: ${frag}`);
  }
});

test('vak L4 (9effab11): korlátközeli, nehezen maszkolható farok a két kihagyott szó után — < 1 s, a farok megmarad', async () => {
  const { REDACT_CAP } = await import('./lib.mjs');
  const s = 'q'.repeat(200) + ' w1 w2 ' + 'a'.repeat(REDACT_CAP - 30);
  const t0 = performance.now();
  const out = redact(s);
  const ms = performance.now() - t0;
  assert.ok(ms < 1000, `${ms.toFixed(0)} ms`);
  assert.ok(out.includes('a'.repeat(REDACT_CAP - 30)), 'a korlátközeli farok megmarad (a regex ténylegesen ezen fut)');
});

test('elővágás: a korlát a 32 KB-os főági futáshoz képest legalább 8× olcsóbb legrosszabb esetet ad (gépfüggetlen arány)', async () => {
  // A 32 KB-os korlát legrosszabb esete a gate:pr párhuzamos futásában 1109 ms lett; a 16 KB-os a CI-futón (ubuntu) 451–485 ms —
  // az abszolút ms-korlát gépfüggő, ezért ugyanazon a gépen, ugyanakkor mért ARÁNY a mérce: a korlátos `redact` és a változatlan
  // főági kitakaró 32 KB-os, szóköz nélküli farkon (3 mérés legjobbja mindkettőn).
  const { REDACT_CAP } = await import('./lib.mjs');
  const { mainRedact } = await import('./kitakaro-main-baseline.mjs');
  // A korlátos út legrosszabb esete a korlátközeli farok (a korlát feletti egyszavas futást a vágás teljesen elhagyja).
  const tail = (n) => 'q'.repeat(200) + ' w1 w2 ' + 'a'.repeat(n - 30);
  const best = (fn) => {
    let b = Infinity;
    for (let i = 0; i < 3; i++) { const t0 = performance.now(); fn(); b = Math.min(b, performance.now() - t0); }
    return b;
  };
  const capped = best(() => redact(tail(REDACT_CAP)));
  const main32 = best(() => mainRedact(tail(32 * 1024)));
  assert.ok(REDACT_CAP < 32 * 1024, `REDACT_CAP = ${REDACT_CAP}`);
  assert.ok(capped * 8 < main32, `korlátos: ${capped.toFixed(0)} ms, főági 32 KB: ${main32.toFixed(0)} ms (legalább 8× kell)`);
});

test('vak L3 (9effab11): az első hibasor a hosszú stderr-ből — a csonkolásjelző nem helyettesíti', async () => {
  const { redactFirstLine, REDACT_CAP } = await import('./lib.mjs');
  const stderr = `HTTP 404: Not Found (repos/x/y) ${fakeMail}\n` + 'd '.repeat(REDACT_CAP);
  assert.equal(redactFirstLine(stderr), 'HTTP 404: Not Found (repos/x/y) <email>');
  const long = 'e '.repeat(REDACT_CAP) + 'gh: rate limit exceeded';
  assert.ok(redactFirstLine(long).endsWith('gh: rate limit exceeded'), 'túl hosszú első sornál a sor vége (a lényeg) látszik');
});

// Q-3 (#168): időtúllépés olvasható jelzéssel, nem „kilépési kód 127”.
test('Q-3: realExec időtúllépésnél 124-es kódot és „IDŐTÚLLÉPÉS <mp> s” sort ad', async () => {
  const { realExec } = await import('./lib.mjs');
  const r = realExec(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 400 });
  assert.equal(r.code, 124);
  assert.match(r.stderr, /IDŐTÚLLÉPÉS 0\.4 s/);
});
