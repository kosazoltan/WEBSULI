// docs/specs/2026-11-18-vak-ellenor-deepseek.md — K1 (kizárólagosság): B11, B16, B19. Az ítélet csak a futtató bizonyítékával érvényes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CFG, REPORT } from './_fixture.mjs';
import { checkBlindEvidence } from './evidence.mjs';
import { STATUS, acceptRecordedReview, resolveVerdict, verdictResult } from '../lib.mjs';
import { buildRecord } from '../record-review.mjs';

const HEAD = 'c'.repeat(40);
const report = REPORT(HEAD, 'IGEN');
const sha = createHash('sha256').update(report).digest('hex');
const EV = Object.freeze({
  kind: 'blind-review', head: HEAD, complete: true, stopReason: null, verdict: 'IGEN', reportSha256: sha, modelRequested: CFG.model, modelReported: [CFG.model],
  generationIds: ['gen-1'], calls: 9, costUsd: 0.5, endedAt: '2026-11-19T10:00:00.000Z', toolCalls: { read_file: 4, git_diff: 1, search: 1, run_command: 1, submit_report: 1 },
});
const check = (over = {}, cfg = CFG) => checkBlindEvidence({ evidence: over === null ? null : { ...EV, ...over }, head: HEAD, reportSha256: sha, verdict: 'IGEN', cfg });
const record = (blindEvidence, { verdict = 'IGEN', cfg = CFG, text = report } = {}) => buildRecord({
  head: HEAD, verdict, report: 'j.md', resolveHead: () => HEAD, readReport: () => text, now: () => new Date('2026-11-19T10:05:00Z'),
  blind: { cfg, readEvidence: () => blindEvidence },
});

test('B11: érvényes futtató-bizonyítékkal az ítélet „blind-review” ítéletként rögzül, a modellel és a hívásszámmal', () => {
  assert.equal(check().ok, true);
  const r = record({ ...EV });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.record.reviewer, 'blind-review');
  assert.equal(r.record.blind.model, CFG.model);
  assert.equal(r.record.blind.toolCalls, 7);
});

test('B11: bizonyíték nélkül / hibás bizonyítékkal NINCS rögzítés — és az üzenet megmondja, mit kell tenni', () => {
  const cases = [
    [null, /Nincs futtató-bizonyíték/],
    [{ kind: 'review' }, /Nincs futtató-bizonyíték/],
    [{ head: 'd'.repeat(40) }, /más fejre szól/],
    [{ complete: false, stopReason: 'USD-plafon' }, /NEM TELJES \(USD-plafon\)/],
    [{ reportSha256: 'f'.repeat(64) }, /jelentés megváltozott/],
    [{ modelReported: ['anthropic/claude-opus'] }, /nem a konfigurált modell/],
    [{ modelReported: [CFG.model, 'masik/modell'] }, /nem a konfigurált modell/],
    [{ modelReported: [] }, /nem a konfigurált modell/],
    [{ modelRequested: 'masik/modell' }, /nem a konfigurált modell/],
    [{ toolCalls: { read_file: 2, submit_report: 9 } }, /csak 2 vizsgáló eszközhívást/],
    [{ toolCalls: { write_temp_file: 3, list_dir: 3 } }, /egyetlen olvasó \/ kereső \/ diff-hívást sem/],
    [{ verdict: 'NEM' }, /eltér a futtató által rögzített ítélettől/],
  ];
  for (const [over, re] of cases) {
    const c = check(over);
    assert.equal(c.ok, false, JSON.stringify(over));
    assert.match(c.error, re);
    assert.match(c.error, /npm run gate:blind-review/);
    assert.match(c.error, /a vak ellenőr nem futott; a tulajdonos dönt/);
    assert.equal(record(over === null ? null : { ...EV, ...over }).ok, false, `a record-review nem rögzíthet: ${JSON.stringify(over)}`);
  }
});

test('B11: a kézzel szerkesztett jelentés (más hash) nem rögzíthető; felmentő kapcsoló nincs a szkriptben', () => {
  const edited = record({ ...EV }, { text: `${report}\nutólag hozzáírt sor\n` });
  assert.equal(edited.ok, false);
  assert.match(edited.error, /jelentés megváltozott/);
  const src = readFileSync(fileURLToPath(new URL('../record-review.mjs', import.meta.url)), 'utf8');
  assert.doesNotMatch(src, /--[a-z-]*(felment|override|force|skip|no-blind|model|waive)/i, 'nincs megkerülő kapcsoló');
  assert.deepEqual([...src.matchAll(/argValue\(args, '(--[a-z-]+)'\)/g)].map((m) => m[1]).sort(), ['--head', '--report', '--verdict'], 'a szkript pontosan ezt a három kapcsolót olvassa');
});

test('B28: exclusive KI (alap) — a vak alügynök teljes jelentése rögzül; a futtató bizonyítéka kiegészítő', () => {
  const OFF = { ...CFG, exclusive: false };
  // 1) futtató-bizonyíték nélkül: a mai szabály — az alügynök jelentése elég
  const plain = record(null, { cfg: OFF });
  assert.equal(plain.ok, true, plain.error);
  assert.equal(plain.record.reviewer, 'subagent');
  assert.equal(plain.record.blindSupplement, undefined);
  // 2) a fejre van teljes futtató-bizonyíték, de a rögzített jelentés MÁS (az alügynöké) → kiegészítőként csatolva
  const other = { ...EV, reportSha256: 'e'.repeat(64), verdict: 'NEM', findings: { counts: { blokkoló: { total: 1 }, közepes: { total: 2 }, kicsi: { total: 0 } } } };
  const sup = record(other, { cfg: OFF });
  assert.equal(sup.ok, true, sup.error);
  assert.equal(sup.record.reviewer, 'subagent');
  assert.deepEqual(sup.record.blindSupplement.findings, { blokkoló: 1, közepes: 2, kicsi: 0 });
  assert.equal(sup.record.blindSupplement.verdict, 'NEM', 'a futtató eltérő ítélete is látszik');
  // 3) NEM TELJES futás nem kiegészítő
  assert.equal(record({ ...other, complete: false }, { cfg: OFF }).record.blindSupplement, undefined);
  // 4) maga a rögzített jelentés a futtatóé (egyező hash) → reviewer: blind-review
  const own = record({ ...EV }, { cfg: OFF });
  assert.equal(own.record.reviewer, 'blind-review');
  // 5) a kapuk KI állásban az alügynök-ítéletet elfogadják (a PR-szöveg sorát is, mint eddig)
  assert.equal(resolveVerdict({ head: HEAD, evidence: { ...plain.record }, blind: OFF }).verdict, 'IGEN');
  assert.equal(resolveVerdict({ head: HEAD, evidence: { head: HEAD, verdict: 'IGEN', at: '2027-01-01T00:00:00Z' }, blind: OFF }).verdict, 'IGEN');
});

test('B29: exclusive BE — az exclusiveSince előtti alügynök-rekord érvényes, utána csak a futtatóé', () => {
  const ON = { ...CFG, exclusive: true, exclusiveSince: '2026-12-01T00:00:00+01:00' };
  assert.equal(acceptRecordedReview({ verdict: 'IGEN', at: '2026-11-30T10:00:00Z' }, ON).ok, true);
  assert.equal(acceptRecordedReview({ verdict: 'IGEN', at: '2026-12-02T10:00:00Z' }, ON).ok, false);
  assert.equal(acceptRecordedReview({ verdict: 'IGEN', at: '2026-11-30T10:00:00Z' }, { ...ON, exclusiveSince: null }).ok, false, 'időpont nélkül minden nem-futtató rekord érvénytelen');
});

test('B16: a kapu csak a futtató által igazolt ítéletet fogadja el; az átállás előtti rekord érvényes marad', () => {
  const blindRec = { head: HEAD, verdict: 'IGEN', reviewer: 'blind-review', blind: { model: CFG.model }, at: '2026-11-20T08:00:00.000Z' };
  assert.deepEqual(acceptRecordedReview(blindRec, CFG), { ok: true });
  assert.equal(resolveVerdict({ head: HEAD, evidence: blindRec, blind: CFG }).verdict, 'IGEN');

  const manualAfter = { head: HEAD, verdict: 'IGEN', at: '2026-11-19T08:00:00.000Z' };
  const inv = resolveVerdict({ head: HEAD, evidence: manualAfter, blind: CFG });
  assert.equal(inv.verdict, null);
  assert.match(inv.invalid, /nem a vak ellenőr futtatója/);
  assert.equal(verdictResult(inv, HEAD).status, STATUS.FAIL);

  const otherModel = { ...blindRec, blind: { model: 'anthropic/claude-opus' } };
  assert.equal(resolveVerdict({ head: HEAD, evidence: otherModel, blind: CFG }).verdict, null);

  const legacy = { head: HEAD, verdict: 'IGEN, FELTÉTELLEL', at: '2026-11-18T20:00:00.000Z' };
  const l = resolveVerdict({ head: HEAD, evidence: legacy, blind: CFG });
  assert.equal(l.verdict, 'IGEN, FELTÉTELLEL');
  assert.match(l.source, /az átállás előtt rögzítve/);
  assert.equal(resolveVerdict({ head: HEAD, evidence: { head: HEAD, verdict: 'IGEN' }, blind: CFG }).verdict, null, 'időbélyeg nélküli kézi rekord nem érvényes');
});

test('B16: a PR-szöveg ítélet-sora required módban önmagában nem elég (a régi módban igen)', () => {
  const texts = [`Független ellenőr ítélete: IGEN (fej: ${HEAD.slice(0, 12)})`];
  const strict = resolveVerdict({ head: HEAD, evidence: null, texts, blind: CFG });
  assert.equal(strict.verdict, null);
  assert.match(strict.invalid, /önmagában nem bizonyíték/);
  assert.equal(verdictResult(strict, HEAD).status, STATUS.FAIL);
  assert.equal(resolveVerdict({ head: HEAD, evidence: null, texts }).verdict, 'IGEN');
  assert.equal(resolveVerdict({ head: HEAD, evidence: null, texts, blind: { ...CFG, exclusive: false } }).verdict, 'IGEN');
  assert.equal(resolveVerdict({ head: HEAD, evidence: null, texts: [], blind: CFG }), null);
});

test('B19: ítélet hiányában a kapu és a hook üzenete a futtató parancsát nevezi meg', () => {
  for (const v of [null, { verdict: null, source: 'PR-leírás', invalid: 'x' }]) {
    const r = verdictResult(v, HEAD);
    assert.equal(r.status, STATUS.FAIL);
    assert.match(r.note, /npm run gate:blind-review -- --base <ref> --head c{40}/);
    assert.match(r.note, /websuli-vak-ellenor/);
  }
  assert.match(verdictResult({ verdict: null, source: 'x', invalid: 'y' }, HEAD).note, /a vak ellenőr nem futott; a tulajdonos dönt/);
  const hook = readFileSync(fileURLToPath(new URL('../../hooks/check-quality-gates.mjs', import.meta.url)), 'utf8');
  assert.match(hook, /npm run gate:blind-review/);
  assert.match(hook, /websuli-vak-ellenor/);
});
