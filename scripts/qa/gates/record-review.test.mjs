// docs/specs/2026-11-17-minosegkapuk.md D9: a független ellenőr ítéletének rögzítése.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_SECTIONS, buildRecord, missingSections, normalizeVerdict, reportHead, reportVerdict } from './record-review.mjs';
import { resolveVerdict } from './lib.mjs';

const FULL = '0123456789abcdef0123456789abcdef01234567';
// Terv 2026-11-18-vak-hibakereso-ellenor V4 (spec-változás): a jelentés kötelező eleme a Fej: sor és a két hibakereső szakasz.
const report = (verdict = 'IGEN', head = FULL.slice(0, 12)) => [
  '# Független review', `Fej: ${head}`, `## Ítélet: ${verdict}`, '## Leletek', '## Mit próbáltam megtörni, és nem sikerült', '- …',
  '## Mit NEM vizsgáltam', '- …', `Ítélet: ${verdict}`,
].join('\n');
const ok = { resolveHead: (h) => (FULL.startsWith(h) ? FULL : null), readReport: (p) => (p === 'j.md' ? report() : null) };

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
  const mismatch = buildRecord({ head: FULL, verdict: 'IGEN', report: 'n.md', resolveHead: ok.resolveHead, readReport: () => report('NEM') });
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

test('V4: a jelentésnek a rögzített fejre kell szólnia, és tartalmaznia kell a két hibakereső szakaszt', () => {
  const rec = (text) => buildRecord({ head: FULL, verdict: 'IGEN', report: 'x.md', resolveHead: ok.resolveHead, readReport: () => text });
  assert.equal(rec(report()).ok, true);
  // a Fej: sor hiányzik / más fejre szól
  const noHead = rec(report().split('\n').filter((l) => !l.startsWith('Fej:')).join('\n'));
  assert.equal(noHead.ok, false);
  assert.match(noHead.error, /nincs „Fej: <hash>” sor/);
  const other = rec(report('IGEN', 'ffffffff'));
  assert.equal(other.ok, false);
  assert.match(other.error, /nem a rögzítendő fejre/);
  // egyik vagy másik kötelező fejléc hiányzik → a hibaüzenet megnevezi
  for (const s of REQUIRED_SECTIONS) {
    const r = rec(report().split('\n').filter((l) => !l.includes(s)).join('\n'));
    assert.equal(r.ok, false, s);
    assert.ok(r.error.includes(s), r.error);
  }
  // a szakasz szövege nem fejlécként (folyó szövegben) nem számít
  const inline = rec(report().replace('## Mit NEM vizsgáltam', 'Mit NEM vizsgáltam'));
  assert.equal(inline.ok, false);
});

test('V4: reportHead / missingSections — az utolsó Fej: sor számít; a fejléc-szint #–######', () => {
  assert.equal(reportHead('Fej: aaaaaaa\n…\n# Visszaellenőrzés — új fej\nFej: `0123456789ab`'), '0123456789ab');
  assert.equal(reportHead('nincs ilyen sor'), null);
  assert.deepEqual(missingSections('### Mit próbáltam megtörni, és nem sikerült\n###### Mit NEM vizsgáltam (ok + kockázat)'), []);
  assert.deepEqual(missingSections('# Mit NEM vizsgáltam'), ['Mit próbáltam megtörni, és nem sikerült']);
});
