// docs/specs/2026-11-17-minosegkapuk.md D9: a független ellenőr ítéletének rögzítése.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecord, normalizeVerdict, reportVerdict } from './record-review.mjs';
import { resolveVerdict } from './lib.mjs';

const FULL = '0123456789abcdef0123456789abcdef01234567';
// docs/specs/2026-11-20-itelet-fej-egyeztetes.md (spec-változás): a jelentés záró `Fej:` sora a vizsgált fej teljes hash-e
const ok = { resolveHead: (h) => (FULL.startsWith(h) ? FULL : null), readReport: (p) => (p === 'j.md' ? `# Jelentés\nFej: ${FULL}\nÍtélet: IGEN` : null) };

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

test('reportVerdict / review J6: a --verdict a jelentés utolsó ítéletével egyezzen', () => {
  assert.equal(reportVerdict('## Ítélet: ÖSSZEVONHATÓ — NEM (a B1 javítása után: IGEN, FELTÉTELLEL)'), 'NEM');
  assert.equal(reportVerdict('## Ítélet: **IGEN, FELTÉTELLEL**'), 'IGEN, FELTÉTELLEL');
  assert.equal(reportVerdict('## Ítélet: NEM\n…\n# Visszaellenőrzés\n## Ítélet: ÖSSZEVONHATÓ — IGEN'), 'IGEN');
  assert.equal(reportVerdict('nincs ilyen sor'), null);
  const mismatch = buildRecord({ head: FULL, verdict: 'IGEN', report: 'n.md', resolveHead: ok.resolveHead, readReport: () => `Fej: ${FULL}\n## Ítélet: NEM` });
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.error, /eltér/);
  assert.equal(buildRecord({ head: FULL, verdict: 'IGEN', report: 'x.md', resolveHead: ok.resolveHead, readReport: () => 'jelentés ítélet nélkül' }).ok, false);
});

test('buildRecord: hibás ítélet / fej / hiányzó vagy üres jelentés → hiba', () => {
  assert.equal(buildRecord({ head: FULL, verdict: 'jó', report: 'j.md', ...ok }).ok, false);
  assert.equal(buildRecord({ head: 'zzz', verdict: 'IGEN', report: 'j.md', ...ok }).ok, false);
  assert.equal(buildRecord({ head: 'ffffffff', verdict: 'IGEN', report: 'j.md', ...ok }).ok, false);
  assert.equal(buildRecord({ head: FULL, verdict: 'IGEN', report: 'nincs.md', ...ok }).ok, false);
  assert.equal(buildRecord({ head: FULL, verdict: 'IGEN', report: undefined, ...ok }).ok, false);
  assert.equal(buildRecord({ head: FULL, verdict: 'IGEN', report: 'j.md', resolveHead: ok.resolveHead, readReport: () => '  ' }).ok, false);
});

test('záró Fej: sor (ítélet-fej egyeztetés): hiány / rövid hash / más fej / szabad szöveges említés / ítélet nélküli szakasz → hiba', () => {
  const OLD = 'fedcba9876543210fedcba9876543210fedcba98';
  const rep = (t) => ({ resolveHead: ok.resolveHead, readReport: () => t });
  const err = (t) => buildRecord({ head: FULL, verdict: 'IGEN', report: 'r.md', ...rep(t) });
  assert.match(err('# Jelentés\nÍtélet: IGEN').error, /Fej:/, 'fej-sor nélkül');
  assert.match(err(`Fej: ${FULL.slice(0, 12)}\nÍtélet: IGEN`).error, /nincs önálló.*40 jegyű/, 'rövid hash a Fej: sorban nem elég');
  assert.match(err(`Fej: ${OLD}\nÍtélet: IGEN`).error, /másik fejre/, 'más fejre szóló jelentés');
  // 6. vak kör L2: a régi jelentéshez fűzött szabad szöveges megjegyzés nem vált vizsgált fejet
  assert.match(err(`Fej: ${OLD}\nÍtélet: IGEN\nMegjegyzés: az új fej ${FULL} még nincs ellenőrizve.`).error, /másik fejre/);
  // a záró Fej: szakaszában nincs ítélet → hiba (az utolsó Ítélet: a régi szakaszé)
  assert.match(err(`Fej: ${OLD}\nÍtélet: IGEN\n# Visszaellenőrzés\nFej: ${FULL}\nmég folyamatban`).error, /ítélet/i);
  // review + visszaellenőrzés: a záró pár dönt
  const good = buildRecord({ head: FULL, verdict: 'IGEN', report: 'r.md', ...rep(`# Független review\n**Fej:** \`${OLD}\`\n## Ítélet: NEM\n# Visszaellenőrzés\nFej: ${FULL}\n## Ítélet: IGEN`) });
  assert.equal(good.ok, true, good.error);
  assert.equal(good.record.reportHead, FULL);
});
