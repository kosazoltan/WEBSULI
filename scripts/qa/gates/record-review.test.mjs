// docs/specs/2026-11-17-minosegkapuk.md D9: a független ellenőr ítéletének rögzítése.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecord, normalizeVerdict } from './record-review.mjs';
import { resolveVerdict } from './lib.mjs';

const FULL = '0123456789abcdef0123456789abcdef01234567';
const ok = { resolveHead: (h) => (FULL.startsWith(h) ? FULL : null), readReport: (p) => (p === 'j.md' ? '# Jelentés\nÍtélet: IGEN' : null) };

test('normalizeVerdict: IGEN / NEM / IGEN, FELTÉTELLEL (ASCII-alak is); más érték nem', () => {
  assert.equal(normalizeVerdict('igen'), 'IGEN');
  assert.equal(normalizeVerdict('NEM'), 'NEM');
  assert.equal(normalizeVerdict('IGEN, FELTÉTELLEL'), 'IGEN, FELTÉTELLEL');
  assert.equal(normalizeVerdict('igen-feltetellel'), 'IGEN, FELTÉTELLEL');
  assert.equal(normalizeVerdict('talán'), null);
});

test('buildRecord: teljes fej, ítélet, jelentés-hash; a PR-sor visszaolvasható a kapuk számára', () => {
  const r = buildRecord({ head: FULL.slice(0, 9), verdict: 'IGEN', report: 'j.md', ...ok, now: () => new Date('2026-11-17T08:00:00Z') });
  assert.equal(r.ok, true);
  assert.equal(r.record.head, FULL);
  assert.equal(r.record.verdict, 'IGEN');
  assert.match(r.record.reportSha256, /^[0-9a-f]{64}$/);
  assert.equal(r.line, `Független ellenőr ítélete: IGEN (fej: ${FULL.slice(0, 12)})`);
  assert.deepEqual(resolveVerdict({ head: FULL, texts: [r.line] }), { verdict: 'IGEN', source: 'PR-leírás' });
});

test('buildRecord: hibás ítélet / fej / hiányzó vagy üres jelentés → hiba', () => {
  assert.equal(buildRecord({ head: FULL, verdict: 'jó', report: 'j.md', ...ok }).ok, false);
  assert.equal(buildRecord({ head: 'zzz', verdict: 'IGEN', report: 'j.md', ...ok }).ok, false);
  assert.equal(buildRecord({ head: 'ffffffff', verdict: 'IGEN', report: 'j.md', ...ok }).ok, false);
  assert.equal(buildRecord({ head: FULL, verdict: 'IGEN', report: 'nincs.md', ...ok }).ok, false);
  assert.equal(buildRecord({ head: FULL, verdict: 'IGEN', report: undefined, ...ok }).ok, false);
  assert.equal(buildRecord({ head: FULL, verdict: 'IGEN', report: 'j.md', resolveHead: ok.resolveHead, readReport: () => '  ' }).ok, false);
});
