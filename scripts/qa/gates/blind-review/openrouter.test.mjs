// docs/specs/2026-11-18-vak-ellenor-deepseek.md — D2 (titokkezelés), B9: a kulcs semmilyen kimenetbe nem kerül.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenRouterError, callOpenRouter, keyFromEnvText, loadApiKey, maskSecrets, usageCost } from './openrouter.mjs';

const KEY = ['sk', 'or', 'v1', 'PROBA0000111122223333444455556666'].join('-'); // hamis, futásidőben összerakott tesztérték
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

test('a .env szövegből CSAK az OPENROUTER_API_KEY sor értéke jön ki', () => {
  assert.equal(keyFromEnvText(`MASIK_KULCS=nem-ez\nexport OPENROUTER_API_KEY="${KEY}"\nHARMADIK=x`), KEY);
  assert.equal(keyFromEnvText('MASIK_KULCS=nem-ez\n'), null);
});

test('kulcs-betöltés sorrendje: környezeti változó → WEBSULI_SECRETS_ENV → helyi (nem követett) beállítás; a forrás leírása nem tartalmaz útvonalat', () => {
  const files = { '/titok/.env': `OPENROUTER_API_KEY=${KEY}\n`, '/git/websuli-qa-local.json': JSON.stringify({ secretsEnv: '/titok/.env' }) };
  const readFile = (p) => files[p] ?? null;
  assert.deepEqual(loadApiKey({ env: { OPENROUTER_API_KEY: 'kozvetlen' }, readFile }), { key: 'kozvetlen', source: 'OPENROUTER_API_KEY környezeti változó' });
  const viaVar = loadApiKey({ env: { WEBSULI_SECRETS_ENV: '/titok/.env' }, readFile });
  assert.equal(viaVar.key, KEY);
  assert.doesNotMatch(viaVar.source, /titok/);
  const viaLocal = loadApiKey({ env: {}, readFile, localConfigPath: '/git/websuli-qa-local.json' });
  assert.equal(viaLocal.key, KEY);
  assert.doesNotMatch(viaLocal.source, /titok/);
  const none = loadApiKey({ env: {}, readFile });
  assert.equal(none.key, null);
  assert.match(none.error, /nincs OpenRouter-kulcs/);
});

test('maszkolás: a kulcs pontos értéke, az Authorization-fejléc és az sk-or minta is eltűnik', () => {
  const other = ['sk', 'or', 'v1', 'abcdefgh12345678'].join('-');
  const out = maskSecrets(`hiba: ${KEY} | Authorization: Bearer ${KEY} | "authorization":"Bearer masik-titok-12345678" | ${other}`, KEY);
  assert.ok(!out.includes(KEY));
  assert.ok(!out.includes('masik-titok'));
  assert.doesNotMatch(out, /sk-or-v1-[a-z0-9]/);
  const odd = 'ISMERETLEN-ALAKU-KULCS-998877';
  assert.equal(maskSecrets(`a szolgáltató visszaírta: ${odd} és {"k":"${odd}"}`, odd).includes(odd), false, 'ismeretlen alakú kulcs pontos értéke is eltűnik (nem csak az ismert minták)');
  assert.equal(maskSecrets('rövid kulcs: ab', 'ab').includes('<kulcs>'), false, 'a túl rövid „kulcs” nem cserélődik (különben minden szöveget szétszabdalna)');
});

test('B9: HTTP-hiba törzse, amely visszhangozza a kulcsot és a fejlécet → a hibaüzenetben nincs kulcs', async () => {
  const fetchImpl = async () => res(401, { error: { message: `Invalid key ${KEY}`, headers: { Authorization: `Bearer ${KEY}` } } });
  await assert.rejects(callOpenRouter({ fetchImpl, endpoint: 'https://x.invalid', key: KEY, body: {} }), (e) => {
    assert.ok(e instanceof OpenRouterError);
    assert.equal(e.status, 401);
    assert.equal(e.retryable, false);
    assert.ok(!e.message.includes(KEY), 'a kulcs nem szivároghat');
    assert.ok(!JSON.stringify(e, Object.getOwnPropertyNames(e)).includes(KEY), 'a hibaobjektum mezőiben (cause, stack) sincs kulcs');
    return true;
  });
});

test('B9: kivétel a fetch-ből, amely a kérést (fejléccel) hordozza → maszkolt üzenet, lánc nélkül; 200-as válasz hibamezővel is maszkolt', async () => {
  const boom = async () => { throw new Error(`connect failed; request headers: Authorization: Bearer ${KEY}`); };
  await assert.rejects(callOpenRouter({ fetchImpl: boom, endpoint: 'https://x.invalid', key: KEY, body: {} }), (e) => {
    assert.ok(!e.message.includes(KEY));
    assert.equal(e.cause, undefined);
    assert.equal(e.retryable, true);
    return true;
  });
  const soft = async () => res(200, { error: { code: 429, message: `rate limited for ${KEY}` } });
  await assert.rejects(callOpenRouter({ fetchImpl: soft, endpoint: 'https://x.invalid', key: KEY, body: {} }), (e) => !e.message.includes(KEY) && e.retryable === true && e.status === 429);
});

test('a kulcs csak az Authorization-fejlécben megy ki, a kérés törzsében és az URL-ben nem', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return res(200, { choices: [] }); };
  await callOpenRouter({ fetchImpl, endpoint: 'https://x.invalid/v1', key: KEY, body: { model: 'm' } });
  assert.equal(seen.init.headers.Authorization, `Bearer ${KEY}`);
  assert.ok(!seen.url.includes(KEY));
  assert.ok(!seen.init.body.includes(KEY));
});

test('költség: a tényleges usage.cost az elsődleges; nélküle a tokenszám × tartalék-ár; usage nélkül null', () => {
  assert.deepEqual(usageCost({ cost: 0.0123, prompt_tokens: 1, completion_tokens: 1 }, { input: 100, output: 100 }), { usd: 0.0123, source: 'usage.cost' });
  const f = usageCost({ prompt_tokens: 1_000_000, completion_tokens: 100_000 }, { input: 1.425, output: 4.275 });
  assert.equal(f.source, 'usage tokenek × tartalék-ár');
  assert.ok(Math.abs(f.usd - (1.425 + 0.4275)) < 1e-9);
  assert.equal(usageCost(undefined, {}), null);
});
