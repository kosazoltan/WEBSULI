#!/usr/bin/env node
// A független fejlesztési ellenőr ítéletének rögzítése (docs/minosegkapuk.md; terv D9; skill: websuli-fejlesztesi-ellenor).
// A `pre-pr-gate` és a `pre-merge-gate` ezt olvassa (`<git-common-dir>/websuli-qa-evidence/review-<fej>.json`).
//
// Használat: node scripts/qa/gates/record-review.mjs --head <hash> --verdict IGEN|"IGEN, FELTÉTELLEL"|NEM --report <jelentés.md>
// Kiírja a PR-leírásba / kommentbe illeszthető sort is (a nyilvános repóra CSAK ez a sor kerül: ítélet + fej-hash).

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BLIND_REVIEWER, VERDICTS, argValue, blindRequired, isMain, makeContext, readEvidence, verdictLine, writeEvidence } from './lib.mjs';
import { checkBlindEvidence, evidenceName } from './blind-review/evidence.mjs';

/** Az ítélet normalizálása (ASCII-alak is elfogadott: IGEN-FELTETELLEL). */
export function normalizeVerdict(v) {
  const s = String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (s === 'IGEN') return 'IGEN';
  if (s === 'NEM') return 'NEM';
  if (/^IGEN[ ,_-]+FELT[EÉ]TELLEL$/.test(s)) return 'IGEN, FELTÉTELLEL';
  return null;
}

/** A jelentés utolsó `Ítélet:` sorának első ítélet-szava (`ÖSSZEVONHATÓ — NEM (… IGEN …)` → NEM). */
export function reportVerdict(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => /Ítélet\s*:/i.test(l));
  if (!lines.length) return null;
  const m = /Ítélet\s*:(.*)$/i.exec(lines[lines.length - 1]);
  const w = /(IGEN,\s*FELTÉTELLEL|IGEN|NEM)(?![A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű])/i.exec(m[1].replace(/\*/g, ''));
  return w ? normalizeVerdict(w[1]) : null;
}

/** A jelentés kötelező szakasz-fejlécei (vak, hibakereső ellenőr — docs/specs/2026-11-18-vak-hibakereso-ellenor.md, V4). */
export const REQUIRED_SECTIONS = ['Mit próbáltam megtörni, és nem sikerült', 'Mit NEM vizsgáltam'];

/** A jelentés utolsó `Fej:` sorának hash-e (7–40 jegy), vagy null. */
export function reportHead(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => /Fej\s*:/i.test(l));
  if (!lines.length) return null;
  const m = /Fej\s*:[\s*`]*([0-9a-f]{7,40})/i.exec(lines[lines.length - 1]);
  return m ? m[1].toLowerCase() : null;
}

/** A hiányzó kötelező fejlécek (`#`–`######` szintű sor, pontos szöveggel kezdődik). */
export function missingSections(text) {
  const heads = String(text).split(/\r?\n/).filter((l) => /^\s*#{1,6}\s/.test(l)).map((l) => l.replace(/^\s*#{1,6}\s*/, '').trim());
  return REQUIRED_SECTIONS.filter((s) => !heads.some((h) => h.startsWith(s)));
}

/**
 * A jelentés tartalmi ellenőrzése (V4): a rögzítendő fejre szóló `Fej:` sor és a kötelező szakaszok. Hibaüzenetet ad, vagy null-t.
 * Önálló, kicsi függvény — bővíthető (pl. bizonyíték-műtermék ellenőrzése) a `buildRecord` érintése nélkül.
 * @param {string} text a jelentés szövege
 * @param {string} full a rögzítendő teljes fej-hash
 * @returns {string|null}
 */
export function checkReport(text, full) {
  const rh = reportHead(text);
  if (!rh) return 'a jelentésben nincs „Fej: <hash>” sor (a websuli-fejlesztesi-ellenor skill sablonjának kötelező része)';
  if (!full.toLowerCase().startsWith(rh)) return `a jelentés utolsó „Fej:” sora (${rh}) nem a rögzítendő fejre (${full.slice(0, 12)}) szól`;
  const miss = missingSections(text);
  if (miss.length) return `a jelentésből hiányzik a kötelező szakasz: ${miss.map((m) => `„${m}”`).join(', ')} (vak, hibakereső ellenőr — websuli-fejlesztesi-ellenor skill)`;
  return null;
}

/** A futtató teljes bizonyítéka a fejre, kiegészítőként (nem kizárólagos módban): modell, ítélet, leletszám, költség, jelentés-hash. */
export function blindSupplement(evidence, full) {
  if (!evidence || evidence.kind !== 'blind-review' || evidence.head !== full || evidence.complete !== true) return null;
  const counts = evidence.findings?.counts ?? null;
  return {
    model: evidence.modelReported, verdict: evidence.verdict, reportSha256: evidence.reportSha256, costUsd: evidence.costUsd, endedAt: evidence.endedAt,
    findings: counts ? Object.fromEntries(Object.entries(counts).map(([k, c]) => [k, c.total])) : null,
  };
}

/**
 * @returns {{ ok: true, record: object, line: string } | { ok: false, error: string }}
 */
export function buildRecord({ head, verdict, report, resolveHead, readReport, now = () => new Date(), blind = null }) {
  const v = normalizeVerdict(verdict);
  if (!v) return { ok: false, error: `ismeretlen ítélet: „${verdict}” — elfogadott: ${VERDICTS.join(' | ')}` };
  if (!head || !/^[0-9a-f]{7,40}$/i.test(head)) return { ok: false, error: 'a --head 7–40 jegyű commit-hash legyen' };
  const full = resolveHead(head);
  if (!full) return { ok: false, error: `a ${head} nem létező commit ebben a repóban` };
  if (!report) return { ok: false, error: 'a --report <jelentés.md> kötelező (a független ellenőr jelentése, a scratchpadban — NEM a repóban)' };
  const text = readReport(report);
  if (text == null) return { ok: false, error: `a jelentés nem olvasható: ${report}` };
  if (!text.trim()) return { ok: false, error: 'a jelentés üres' };
  // Review J6: a --verdict a jelentés UTOLSÓ „Ítélet:” sorával (visszaellenőrzésnél az a friss) egyezzen.
  const inReport = reportVerdict(text);
  if (!inReport) return { ok: false, error: 'a jelentésben nincs „Ítélet: IGEN | IGEN, FELTÉTELLEL | NEM” sor (a megbízás-sablon kötelező része)' };
  if (inReport !== v) return { ok: false, error: `a --verdict (${v}) eltér a jelentés utolsó ítéletétől (${inReport})` };
  // V4: vak, hibakereső ellenőr — a jelentés tartalmi ellenőrzése.
  const bad = checkReport(text, full);
  if (bad) return { ok: false, error: bad };
  const record = { kind: 'review', head: full, verdict: v, ok: v !== 'NEM', report: resolve(report), reportSha256: createHash('sha256').update(text).digest('hex'), at: now().toISOString() };
  // docs/specs/2026-11-18-vak-ellenor-deepseek.md — K1 / E1. Kizárólagos módban (`blindReview.exclusive`) az ítélet CSAK a vak ellenőr
  // futtatójának bizonyítékával rögzíthető. Alapból (KI) a mai szabály: a vak, hibakereső alügynök teljes jelentése rögzül, és ha a
  // fejre van teljes futtató-bizonyíték, az kiegészítő bizonyítékként csatolódik. Felmentő kapcsoló nincs.
  if (blind?.cfg) {
    const evidence = blind.readEvidence(full);
    const b = checkBlindEvidence({ evidence, head: full, reportSha256: record.reportSha256, verdict: v, cfg: blind.cfg });
    if (blindRequired(blind.cfg)) {
      if (!b.ok) return { ok: false, error: b.error };
      record.reviewer = BLIND_REVIEWER;
      record.blind = b.summary;
    } else if (b.ok) {
      record.reviewer = BLIND_REVIEWER;
      record.blind = b.summary;
    } else {
      record.reviewer = 'subagent';
      const supplement = blindSupplement(evidence, full);
      if (supplement) record.blindSupplement = supplement;
    }
  }
  return { ok: true, record, line: verdictLine(v, full) };
}

function main() {
  const args = process.argv.slice(2);
  const ctx = makeContext({});
  const res = buildRecord({
    head: argValue(args, '--head'),
    verdict: argValue(args, '--verdict'),
    report: argValue(args, '--report'),
    resolveHead: (h) => {
      const r = ctx.git.run(['rev-parse', '--verify', '--quiet', `${h}^{commit}`]);
      return r.code === 0 ? r.stdout.trim() : null;
    },
    readReport: (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null),
    blind: { cfg: ctx.cfg.blindReview, readEvidence: (full) => readEvidence(ctx.evDir, evidenceName(full)) },
  });
  if (!res.ok) { process.stderr.write(`[record-review] HIBA: ${res.error}\n`); process.exit(1); }
  writeEvidence(ctx.evDir, `review-${res.record.head}`, res.record);
  process.stdout.write(`[record-review] rögzítve: review-${res.record.head.slice(0, 12)} — ${res.record.verdict}\n`);
  process.stdout.write(`[record-review] a PR-leírásba / kommentbe ezt a sort tedd (más részletet a nyilvános repóra ne):\n${res.line}\n`);
  process.exit(0);
}

if (isMain(import.meta.url)) main();
