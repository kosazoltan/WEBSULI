// K-PR (SQL #24 / #272): a PR-leírás vázlata a kötelező szakaszokkal, a valós kapu-bizonyítékokból.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrBody, gateLine, TODO } from './pr-body.mjs';
import { checkPrBody } from './pre-pr-gate.mjs';

const HEAD = 'a'.repeat(40);
const prePush = { kind: 'pre-push', head: HEAD, ok: true, steps: [{ name: 'npm test', status: 'PASS' }, { name: 'PR-méret', status: 'WARN' }] };

test('a vázlat a bizonyítékból írja a kapu-eredményt és az ítéletsort; a fejhez nem tartozó bizonyítékot nem használja', () => {
  const body = buildPrBody({ head: HEAD, base: 'origin/main', commits: ['fix: x'], stat: ' 2 files changed', prePush, review: { head: HEAD, verdict: 'IGEN, FELTÉTELLEL' } });
  assert.match(body, /`npm run gate:push` — ZÖLD a `aaaaaaaaaaaa` fejen; WARN: PR-méret\./);
  assert.match(body, /Független ellenőr ítélete: IGEN, FELTÉTELLEL \(fej: aaaaaaaaaaaa\)/);
  assert.match(body, /- fix: x/);
  const other = buildPrBody({ head: HEAD, base: 'origin/main', prePush: { ...prePush, head: 'b'.repeat(40) }, review: { head: 'b'.repeat(40), verdict: 'IGEN' } });
  assert.match(other, /NEM FUTOTT a `aaaaaaaaaaaa` fejen/);
  assert.doesNotMatch(other, /Független ellenőr ítélete/, 'más fejre szóló ítélet nem kerül a leírásba');
});

test('a kitöltetlen vázlat NEM megy át a PR előtti kapu leírás-ellenőrzésén (nincs kitalált elfogadási tétel)', () => {
  const body = buildPrBody({ head: HEAD, base: 'origin/main', prePush });
  assert.ok(body.includes(TODO));
  assert.ok(checkPrBody(body).some((m) => /elfogadási lista/.test(m)), 'jelölőnégyzetes elfogadási tétel nélkül bukik');
  const filled = body.replace(/## Elfogadás\n[^\n]*/, '## Elfogadás\n- [x] E1 WHEN a THEN b SHALL c (teszt)');
  assert.deepEqual(checkPrBody(filled), []);
});

test('gateLine: bukott kapu a FAIL lépésekkel', () => {
  assert.equal(gateLine('npm run gate:pr', { head: HEAD, ok: false, steps: [{ name: 'build', status: 'FAIL' }] }, HEAD), '- `npm run gate:pr` — BUKOTT a `aaaaaaaaaaaa` fejen; FAIL: build.');
});
