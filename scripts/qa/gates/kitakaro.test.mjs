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
    assert.ok(!maskClip(s, key, MASK_WINDOW).includes('ab#cd'), `vissza ${back}`);
  }
});

test('vak L6 (169cb025): `Bearer` végű ártalmatlan szó a hosszú futás előtti külön sorban megmarad', () => {
  const s = 'MODE: LifeboatBearer\n' + 'A'.repeat(MASK_WINDOW + 10);
  assert.equal(maskClip(s, CALLER_KEY, 600), 'MODE: LifeboatBearer\n');
});
