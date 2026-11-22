// docs/specs/2026-11-19-kitakaro-negyzetes-regex.md — 2. vak kör (169cb025): táblázatos tulajdonság-teszt. Minden ismert
// tokenforma × minden kimeneti alak (sima, JSON-escape-elt, \uXXXX) × minden kapus / külső ellenőri kimeneti út × vágási helyzet
// (előtte / a vágásponton / az ablakhatáron / utána), átfedő kulcs-előfordulás, L5 / L6 határesetek.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { redact, writeLog } from './lib.mjs';
import { generate, maskClip, maskSecrets, MASK_WINDOW } from './external-review.mjs';
import { CALLER_KEY, ENCODINGS, OVERLAP_KEY, OVERLAP_TEXT, SECRET_CASES, clipPlacements, leak } from './kitakaro-cases.mjs';

const ctx = (out) => out.includes('pre') && out.includes('post');

test('kapu redact: minden forma × minden alak — nincs titokdarab, a környezet megmarad', () => {
  for (const c of SECRET_CASES.filter((x) => !x.keyed)) {
    for (const [encName, enc] of Object.entries(ENCODINGS)) {
      const out = redact(enc(c.raw));
      assert.equal(leak(out, c.body), null, `${c.name} / ${encName}: ${JSON.stringify(out)}`);
      assert.ok(ctx(out), `${c.name} / ${encName}: környezet`);
    }
  }
});

test('kapu writeLog: a visszaolvasott napló minden forma × alak esetén titokmentes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kitakaro-'));
  const cases = SECRET_CASES.filter((x) => !x.keyed);
  const text = cases.flatMap((c) => Object.values(ENCODINGS).map((enc) => enc(c.raw))).join('\n');
  const got = readFileSync(writeLog(dir, 'stage', 'tabla', text), 'utf8');
  for (const c of cases) assert.equal(leak(got, c.body), null, c.name);
});

test('külső maskSecrets / maskClip (rövid): minden forma × alak — nincs titokdarab', () => {
  for (const c of SECRET_CASES) {
    for (const [encName, enc] of Object.entries(ENCODINGS)) {
      for (const [fn, out] of [['maskSecrets', maskSecrets(enc(c.raw), CALLER_KEY)], ['maskClip', maskClip(enc(c.raw), CALLER_KEY, 600)]]) {
        assert.equal(leak(out, c.body), null, `${fn} ${c.name} / ${encName}: ${JSON.stringify(out)}`);
        assert.ok(ctx(out), `${fn} ${c.name} / ${encName}: környezet`);
      }
    }
  }
});

test('külső maskClip (nagy): minden forma × alak × vágási helyzet — nincs titokdarab, a kimenet nem üres', () => {
  const margin = Math.max(64, CALLER_KEY.length);
  for (const c of SECRET_CASES) {
    for (const [encName, enc] of Object.entries(ENCODINGS)) {
      for (const { pos, text } of clipPlacements(enc(c.raw), MASK_WINDOW, margin)) {
        const out = maskClip(text, CALLER_KEY, MASK_WINDOW);
        assert.equal(leak(out, c.body), null, `${c.name} / ${encName} / ${pos}`);
        assert.ok(out.length > 1000, `${c.name} / ${encName} / ${pos}: hossz ${out.length}`);
      }
    }
  }
});

test('külső generate: az újrapróbálási napló és a végső hiba minden forma × alak esetén titokmentes', async () => {
  for (const c of SECRET_CASES) {
    for (const [encName, enc] of Object.entries(ENCODINGS)) {
      const logs = [];
      const t = async () => ({ status: 503, text: enc(c.raw), retryAfter: '0' });
      let msg = '';
      await assert.rejects(generate({ model: 'm', key: CALLER_KEY, systemText: 's', userText: 'u', thinking: 'high', retries: 1, log: (s) => logs.push(s), transport: t, sleep: async () => {} }), (e) => { msg = e.message; return true; });
      assert.equal(leak(msg, c.body), null, `hiba ${c.name} / ${encName}`);
      assert.equal(leak(logs.join('\n'), c.body), null, `napló ${c.name} / ${encName}`);
    }
  }
});

test('vak L4 (169cb025): átfedő kulcs-előfordulások — sem teljes szövegen, sem vágásnál nem marad darab', () => {
  const frag = 'RTY#RT';
  assert.ok(!maskSecrets(`pre ${OVERLAP_TEXT} post`, OVERLAP_KEY).includes(frag));
  const margin = Math.max(64, OVERLAP_KEY.length);
  // a vágáspont (limit - margin) a második előfordulás egy `#` jele elé esik
  for (let shift = 1; shift < OVERLAP_TEXT.length; shift++) {
    const start = MASK_WINDOW - margin - shift;
    const s = 'y'.repeat(start - 1) + ' ' + OVERLAP_TEXT + ' ' + 'z '.repeat(3000);
    const out = maskClip(s, OVERLAP_KEY, MASK_WINDOW);
    assert.ok(!out.includes(frag) && !out.includes('#QWE'), `eltolás ${shift}`);
  }
});

test('vak L5 (169cb025): a pontos (nem token-karakteres) kulcs pont a vágásponton — a vágási ág fut, a kulcs eleje sem marad', () => {
  const key = 'ab#cd#' + 'ef#01#'.repeat(12);
  const margin = Math.max(64, key.length);
  for (const back of [1, 5, 30]) {
    const start = MASK_WINDOW - margin - back;
    const s = 'w '.repeat(start).slice(0, start) + key + ' ' + 'v '.repeat(3000);
    assert.ok(s.length > MASK_WINDOW, 'a bemenet hosszabb a tényleges limitnél (vágási ág)');
    const out = maskClip(s, key, MASK_WINDOW);
    assert.ok(!out.includes('ab#cd'), `vissza ${back}`);
    // a vágáspontot metsző kulcs a vágás ELŐTT marad ki (cutPoint), nem csak félbevágott helyőrzőként (replaceRanges)
    assert.ok(!out.includes('***'), `vissza ${back}: a vágáspont a kulcs elé kerül`);
  }
});

test('vak L6 (169cb025): `Bearer` végű ártalmatlan szó a hosszú futás előtti külön sorban megmarad', () => {
  const s = 'MODE: LifeboatBearer\n' + 'A'.repeat(MASK_WINDOW + 10);
  assert.equal(maskClip(s, CALLER_KEY, 600), 'MODE: LifeboatBearer\n');
});

// ---- 3. vak kör (25de6739) -------------------------------------------------------------------------------------------

test('vak L4 (25de6739): sűrű nagy bemenetnél a tárolt találatok és a vizsgált hossz a kimeneti korláttal arányos', async () => {
  const { clipText, PH_EXTERNAL, WINDOW } = await import('./kitakaro.mjs');
  const line = 'Bearer x\n';
  const s = line.repeat(1_000_000); // 9 000 000 karakter, 1 000 000 találat
  const stats = {};
  const out = clipText(s, { keys: [CALLER_KEY], ph: PH_EXTERNAL, max: 300, stats });
  assert.ok(stats.scanned <= WINDOW + 8 * 1024, `vizsgált hossz: ${stats.scanned}`);
  assert.ok(stats.stored <= (WINDOW + 8 * 1024) / line.length + 2, `tárolt találat: ${stats.stored}`);
  assert.ok(out.startsWith('Bearer <token>\nBearer <token>\n') && out.length <= 300);
});

test('vak L5 (25de6739): JSON-hibában a DB-URL nem nyeli el a következő sort és az idézőjelezést', () => {
  const dsn = ['postgres', '://admin:', 'titok123', '@', 'ep-pelda.neon.tech/db'].join('');
  const a = JSON.stringify({ error: `connect ${dsn}\nConnectionRefused` });
  const b = JSON.stringify({ error: `dsn "${dsn}" rossz` });
  for (const [name, out] of [['redact', redact(a)], ['maskSecrets', maskSecrets(a, CALLER_KEY)], ['maskClip', maskClip(a, CALLER_KEY, 600)]]) {
    assert.equal(JSON.parse(out).error, 'connect <db-url>\nConnectionRefused', name);
  }
  for (const [name, out] of [['redact', redact(b)], ['maskSecrets', maskSecrets(b, CALLER_KEY)], ['maskClip', maskClip(b, CALLER_KEY, 600)]]) {
    assert.equal(JSON.parse(out).error, 'dsn "<db-url>" rossz', name);
  }
});

test('vak L6 (25de6739): nagy bemenet — a megtartott előtag pontosan maszkolt, a hosszú AIza-futás saját részlete sincs', () => {
  const key = ['AI', 'za', 'Sy', 'X'.repeat(33)].join('');
  const s = `pre ${key} kozte ` + 'AI' + 'za' + 'b'.repeat(20_000_000);
  const out = maskClip(s, key, 600);
  assert.equal(out, 'pre *** kozte ');
  assert.ok(!out.includes('bbbbbbbb'));
});

// ---- 4. vak kör (ac6447f5) és a tulajdonosi osztályszabály (2026-11-22, D7) -----------------------------------------

test('D7: az ártalmatlan környezet megmarad (rövid szavak, magyar szöveg, HTTP-státusz, fájl:sor, dátum)', () => {
  const s = [
    'HTTP 503: Service Unavailable — a szolgáltató túlterhelt, próbáld újra később.',
    'Hiba a scripts/qa/gates/lib.mjs:192 sorban; a kitakaro.test.mjs:115 bukott.',
    'Árvíztűrő tükörfúrógép, 2026-11-22, 14:05, PASS 142 / FAIL 0.',
  ].join('\n');
  for (const [name, out] of [['redact', redact(s)], ['maskSecrets', maskSecrets(s, CALLER_KEY)], ['maskClip', maskClip(s, CALLER_KEY, 600)]]) {
    assert.equal(out, s, name);
  }
});

test('vak L3 (ac6447f5): többsoros Bearer-token — a kapu konzolja és a .log is titokmentes (a formázás előtt takar)', async () => {
  const { createGate, STATUS } = await import('./lib.mjs');
  // a záró sor nem token-karakterrel kezdődik: a D7 szerint a sortörésen átnyúló futás különben ide is átérne
  const detail = ['✖ failing tests:', 'Authorization: Bearer Ab12Cd34+Ef/Gh', 'Ij56Kl78=Mn90Op', '— vége'].join('\n');
  const lines = [];
  const g = createGate('proba', { log: (s) => lines.push(s) });
  g.add('lépés', STATUS.FAIL, '', detail);
  const text = lines.join('\n');
  for (const frag of ['Ab12Cd', 'Ij56Kl', 'Mn90Op']) assert.ok(!text.includes(frag), `konzol: ${frag}`);
  assert.ok(text.includes('vége') && text.includes('failing tests:'), 'a környezet megmarad');
  const dir = mkdtempSync(join(tmpdir(), 'kitakaro-l3-'));
  const got = readFileSync(writeLog(dir, 'stage', 'unit', detail), 'utf8');
  for (const frag of ['Ab12Cd', 'Ij56Kl', 'Mn90Op']) assert.ok(!got.includes(frag), `napló: ${frag}`);
});

test('vak L2 / L4 (ac6447f5): JSON-hibában a backslashes DB-jelszó teljesen takart, a cím utáni sortörés-escape ép', () => {
  const dsn = ['postgres', '://admin:', 'jel', '\\', 'szo_SYNTHETIC_PASSWORD_TAIL', '@', '10.0.0.5:5432/db'].join('');
  const a = JSON.stringify({ error: `connect ${dsn}\nkeep` });
  const mail = ['owner.x', 'pelda.hu'].join('@');
  const b = JSON.stringify({ error: `timeout\n${mail}\nkeep` });
  for (const [name, fn] of [['redact', (x) => redact(x)], ['maskSecrets', (x) => maskSecrets(x, CALLER_KEY)], ['maskClip', (x) => maskClip(x, CALLER_KEY, 600)]]) {
    const oa = fn(a);
    assert.ok(!oa.includes('SYNTHETIC') && !oa.includes('PASSWORD'), `${name}: DB-jelszó`);
    assert.equal(JSON.parse(oa).error, 'connect <db-url>\nkeep', name);
    assert.equal(JSON.parse(fn(b)).error, 'timeout\n<email>\nkeep', name);
  }
  assert.ok(!redact(`connect ${dsn} kész`).includes('SYNTHETIC'), 'nyers (nem JSON) szövegben is');
});

test('vak L5 (ac6447f5): escape-sűrű JSON-on a rövid clip csak korlátos előtagot vizsgál', async () => {
  const { clipText, PH_EXTERNAL, WINDOW } = await import('./kitakaro.mjs');
  const s = JSON.stringify({ error: '\n'.repeat(10_000_000) });
  const stats = {};
  const out = clipText(s, { keys: [CALLER_KEY], ph: PH_EXTERNAL, max: 160, stats });
  assert.ok(stats.scanned <= WINDOW + 8 * 1024, `vizsgált hossz: ${stats.scanned}`);
  assert.ok(out.startsWith('{"error":"') && out.length <= 160);
});

// ---- Szűkítés (tulajdonos, 2026-11-22: „Szűkítés + bontás (Javasolt)”) és az 5. vak kör (5c9568c5) -------------------

// 6. vak kör (485ac4b0) L5: az orákulum halmaz-alapú — az új kimenetben látható titokrészletek (minden 6 karakteres darab, rövid
// titoknál a teljes titok) részhalmaza a főág kimenetében láthatóknak; plusz rögzített regressziós minták (L1–L4).
const sub = async (now, base, body, msg) => {
  const { extraLeaks, leakSet } = await import('./kitakaro-cases.mjs');
  const extra = extraLeaks(leakSet(now, body), leakSet(base, body));
  assert.deepEqual(extra, [], `${msg}: új, a főágon nem látható részlet: ${JSON.stringify(extra.slice(0, 3))}`);
};

test('nem gyengébb a főágnál: kapu redact / writeLog — minden eset × alak + regressziós minták, részhalmaz-orákulum', async () => {
  const { mainRedact } = await import('./kitakaro-main-baseline.mjs');
  const at = '@';
  const extra = [
    // 6. kör L2: Windows-út, a cím helyi része escape-szerű (` `) — a főág nyers regexe kitakarta
    { name: 'L2(6) Windows-út címmel', raw: ['lookup C:', '\\', 'temp', '\\', 'u0020', at, 'pelda.hu'].join(''), body: ['u0020', at, 'pelda.hu'].join('') },
    { name: 'L2(6) Windows-út címmel 2', raw: ['C:', '\\', 'Users', '\\', 'fiok.tulaj', at, 'pelda.hu.txt'].join(''), body: ['fiok.tulaj', at, 'pelda.hu'].join('') },
  ];
  for (const c of [...SECRET_CASES.filter((x) => !x.keyed), ...extra]) {
    for (const [encName, enc] of Object.entries(ENCODINGS)) {
      const s = enc(c.raw);
      await sub(redact(s), mainRedact(s), c.body, `${c.name} / ${encName}`);
    }
    await sub(redact(c.raw), mainRedact(c.raw), c.body, `${c.name} / nyers`);
  }
});

test('nem gyengébb a főágnál: külső maskSecrets / maskClip — rövid, nagy (vágási helyzetekkel) és a 600-as hívóhatár', async () => {
  const { mainMaskSecrets } = await import('./kitakaro-main-baseline.mjs');
  const margin = Math.max(64, CALLER_KEY.length);
  for (const c of SECRET_CASES) {
    for (const [encName, enc] of Object.entries(ENCODINGS)) {
      const s = enc(c.raw);
      await sub(maskSecrets(s, CALLER_KEY), mainMaskSecrets(s, CALLER_KEY), c.body, `maskSecrets ${c.name} / ${encName}`);
      await sub(maskClip(s, CALLER_KEY, 600), mainMaskSecrets(s, CALLER_KEY).slice(0, 600), c.body, `maskClip ${c.name} / ${encName}`);
      for (const { pos, text } of clipPlacements(s, MASK_WINDOW, margin)) {
        await sub(maskClip(text, CALLER_KEY, MASK_WINDOW), mainMaskSecrets(text, CALLER_KEY).slice(0, MASK_WINDOW), c.body, `maskClip nagy ${c.name} / ${encName} / ${pos}`);
      }
    }
  }
  // 6. kör L4: a rövidítő találat nem hozhat be szöveget a főág 600-as láthatósági határa mögül
  const key = 'AIzaSyQWERTYUIOP' + 'B'.repeat(24);
  const s = 'build-id=' + 'a1'.repeat(310) + '; key prefix AIzaSyQWERTYUIOP';
  for (const max of [160, 400, 600]) {
    await sub(maskClip(s, key, max), mainMaskSecrets(s, key).slice(0, max), 'AIzaSyQWERTYUIOP', `L4(6) max ${max}`);
  }
});

test('vak L1 (485ac4b0): a DB-URL query-jelszava / -tokenje backslash-sel — kapunapló, külső és JSON-alak', () => {
  const dsn = ['postgres', '://app', '@', 'db.pelda.hu/prod?sslmode=require&password=jel', '\\', 'SYNTHETICPASSWORD&token=QUERYTOKENVALUE'].join('');
  const dir = mkdtempSync(join(tmpdir(), 'kitakaro-l1-6-'));
  const outs = [
    redact(`connection failed ${dsn}`), maskSecrets(`connection failed ${dsn}`, CALLER_KEY), maskClip(`connection failed ${dsn}`, CALLER_KEY, 600),
    readFileSync(writeLog(dir, 'stage', 'db', `connection failed ${dsn}`), 'utf8'),
    redact(JSON.stringify({ error: `connection failed ${dsn}` })), maskClip(JSON.stringify({ error: `connection failed ${dsn}` }), CALLER_KEY, 600),
  ];
  for (const out of outs) for (const frag of ['SYNTHETIC', 'PASSWORD', 'QUERYTOKEN']) assert.ok(!out.includes(frag), `${frag}: ${out}`);
});

test('lineáris: az esettábla összefűzve ~3 M karakterig — a redact és a maskClip 2 s alatt', () => {
  const unit = SECRET_CASES.flatMap((c) => Object.values(ENCODINGS).map((enc) => enc(c.raw))).join('\n');
  const big = unit.repeat(Math.ceil(3_000_000 / unit.length));
  let t0 = performance.now();
  redact(big);
  const ms1 = performance.now() - t0;
  t0 = performance.now();
  maskClip(big, CALLER_KEY, 600);
  const ms2 = performance.now() - t0;
  assert.ok(ms1 < 2000 && ms2 < 2000, `redact ${ms1.toFixed(0)} ms, maskClip ${ms2.toFixed(0)} ms (${big.length} kar.)`);
});

test('vak L3 (5c9568c5): a kapulépés többsoros kivétele a teljes üzeneten takart, az első sor kivétele ELŐTT', async () => {
  const { createGate } = await import('./lib.mjs');
  const lines = [];
  const g = createGate('proba', { log: (s) => lines.push(s) });
  await g.step('dobó lépés', () => { throw new Error(['abcdefghijklmnopqrstuv', 'wx12345678yz'].join('\n')); });
  g.finish();
  const text = lines.join('\n');
  assert.ok(!text.includes('abcdefghij'), text);
  assert.match(text, /FAIL\s+dobó lépés — <token>/);
});

test('vak L1 (5c9568c5): a `Bearer-` / `Bearer.` kezdetű hitelesítő takart; a különálló második séma utáni token is', () => {
  for (const sep of ['-', '.', '/']) {
    assert.equal(redact(`Authorization: Bearer Bearer${sep}abcdefghij`), 'Authorization: Bearer <token>', sep);
  }
  const out = redact(['Auth scheme: Bearer', 'Bearer M4synthetic+/Q8=~Tail'].join('\n'));
  assert.ok(!out.includes('M4synthetic'), out);
});

test('vak L4 (5c9568c5): JSON-ban a kitakart, két sorra tördelt token sortörés-escape-je megmarad', () => {
  const s = JSON.stringify({ error: ['Ab12Cd34Ef56Gh78', 'Ij90Kl12Mn34Op56'].join('\n') });
  for (const [name, out] of [['redact', redact(s)], ['maskSecrets', maskSecrets(s, CALLER_KEY)], ['maskClip', maskClip(s, CALLER_KEY, 600)]]) {
    assert.equal(JSON.parse(out).error, '<token>\n<token>', name);
  }
});
