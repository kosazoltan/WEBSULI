// A vak ellenőr gép által előállított bizonyítéka és annak ellenőrzése (docs/specs/2026-11-18-vak-ellenor-deepseek.md, D5, K1).
// Az ügynök állítása nem bizonyíték: az ítélet csak akkor rögzíthető és fogadható el, ha a futtató műterméke igazolja, hogy a
// KONFIGURÁLT modell készítette, a jelentés nem változott, és az ellenőr valóban vizsgált (eszközhívások).

import { createHash } from 'node:crypto';
import { BLIND_NOT_RUN, BLIND_REVIEW_CMD } from '../lib.mjs';
import { INVESTIGATIVE, READING } from './tools.mjs';
import { checkCompleteness } from './completeness.mjs';

export const EVIDENCE_KIND = 'blind-review';
export const evidenceName = (head) => `blind-review-${head}`;
export const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const sum = (counts, names) => names.reduce((n, k) => n + (counts?.[k] ?? 0), 0);

/**
 * A futtató bizonyítékának ellenőrzése egy rögzítendő ítélethez.
 * @returns {{ ok: true, summary: object } | { ok: false, error: string }}
 */
export function checkBlindEvidence({ evidence, head, reportSha256, verdict, cfg, reportText = null }) {
  const run = BLIND_REVIEW_CMD.replace('<teljes fej-hash>', head);
  const fail = (why) => ({ ok: false, error: `${why} A vak ellenőr KIZÁRÓLAG a futtatóval (${cfg.model}) készülhet: ${run}. Ha a futtató nem tud lefutni: ${BLIND_NOT_RUN} (websuli-vak-ellenor skill).` });
  if (!evidence || evidence.kind !== EVIDENCE_KIND) return fail(`Nincs futtató-bizonyíték (${evidenceName(head.slice(0, 12))}….json) ehhez a fejhez.`);
  if (evidence.head !== head) return fail('A futtató-bizonyíték más fejre szól.');
  if (evidence.complete !== true) return fail(`A vak ellenőr futása NEM TELJES (${evidence.stopReason ?? 'ismeretlen ok'}) — ez nem érvényes ítélet.`);
  if (evidence.reportSha256 !== reportSha256) return fail('A jelentés megváltozott a futtató óta (a sha256 nem egyezik) — kézzel szerkesztett jelentés nem rögzíthető.');
  const reported = Array.isArray(evidence.modelReported) ? evidence.modelReported : [evidence.modelReported];
  if (evidence.modelRequested !== cfg.model || !reported.length || reported.some((m) => m !== cfg.model)) {
    return fail(`A jelentést nem a konfigurált modell készítette (válasz szerint: ${reported.join(', ') || '—'}).`);
  }
  const min = cfg.minToolCalls ?? 5;
  const inv = sum(evidence.toolCalls, INVESTIGATIVE);
  if (inv < min) return fail(`Az ellenőr csak ${inv} vizsgáló eszközhívást végzett (legalább ${min} kell) — üres ítélet nem rögzíthető.`);
  if (sum(evidence.toolCalls, READING) < 1) return fail('Az ellenőr egyetlen olvasó / kereső / diff-hívást sem végzett.');
  // GPT teljesítési őr (docs/specs/2026-11-20-gpt-teljesitesi-or.md, T7): teljesség-bizonyíték nélkül nincs rögzítés, és a jelentés
  // szövegét a bizonyítékban rögzített pontlistával újra ellenőrizzük.
  if (cfg.requireCompleteness) {
    if (evidence.completeness?.ok !== true || !Array.isArray(evidence.completeness.points)) return fail('Nincs érvényes teljesség-bizonyíték (a futtató teljesítési őre nem fogadta el a jelentést).');
    if (reportText != null) {
      const c = checkCompleteness(reportText, { points: evidence.completeness.points });
      if (!c.ok) return fail(`A jelentés a teljesség-ellenőrzésen nem megy át: ${c.problems.slice(0, 4).join(' | ')}.`);
    }
  }
  if (evidence.verdict !== verdict) return fail(`A --verdict (${verdict}) eltér a futtató által rögzített ítélettől (${evidence.verdict}).`);
  return {
    ok: true,
    summary: { model: cfg.model, calls: evidence.calls, toolCalls: inv, costUsd: evidence.costUsd, generationIds: (evidence.generationIds ?? []).slice(-3), endedAt: evidence.endedAt },
  };
}
