/**
 * #174 — gépi kurálás az egylépeses gyártáshoz (tulajdonosi döntés).
 *
 * A kétlépcsős folyamat (térkép kézi átnézése → jóváhagyás → lecke) az
 * egylépeses útvonalon zsákutca volt: a térkép "Piszkozat"-ban ragadt, a
 * lecke-gyártás pedig csak jóváhagyott térképről indul. A tulajdonos EGY
 * gombot kér: feltöltés → kész tananyag.
 *
 * A D1-szabály NEM gyengül, csak a döntést hozza gép a tanár helyett,
 * konzervatívan:
 *   - igazolt idézetű fogalom → kept (tanítható)
 *   - nem igazolható KULCSfogalom → pending (látható forráshiány; nem lehet
 *     automatikus kihúzással teljesnek nyilvánítani a megmaradt részlistát)
 *   - nem igazolható KIEGÉSZÍTŐ → kept (a canApprove-kaput csak a core
 *     blokkolja; a kiegészítő megjelölve marad az admin listában)
 *
 * A kézi útvonal ("Csak tudás-térkép") változatlan: ott továbbra is a tanár
 * kurál.
 */

import type { ExamWeight, ReviewState } from "../../shared/knowledge-map-schema";

export type AutoReviewInput = { examWeight: ExamWeight; verbatimOk: boolean };

/** Egy fogalom gépi döntése. */
export function autoReviewDecision(c: AutoReviewInput): Extract<ReviewState, "kept" | "pending"> {
  if (c.verbatimOk) return "kept";
  return c.examWeight === "core" ? "pending" : "kept";
}

export type AutonomousApprovalInput = AutoReviewInput & { id: string; term?: string; reviewState: ReviewState };

export type AutonomousApprovalDecision =
  | { ok: true; excluded: Array<{ id: string; term?: string }>; verifiedCore: number; liveCount: number }
  | { ok: false; reason: string };

/** Spec 2026-09-19: az igazolt (kept|edited) fogalmak minimális aránya az élő fogalmak között. */
export const AUTONOMOUS_MIN_VERIFIED_RATIO = 0.6;

/**
 * Spec 2026-09-19 — az egylépéses futás forrásellenőrzése nem vár emberre.
 *
 * A kézi `canApprove` változatlan (pending fogalom ott továbbra is blokkol). Itt a
 * még pending (nem igazolható idézetű) kulcsfogalom LÁTHATÓ marad a térképen, de a
 * gyártásból kimarad; a térkép akkor hagyható jóvá gépileg, ha van legalább egy igazolt
 * kulcsfogalom és az igazolt fogalmak aránya eléri a küszöböt. Alatta a forrás átirata
 * használhatatlan — az valódi hiba, nem parkolás.
 */
export function autonomousApprovalDecision(concepts: AutonomousApprovalInput[]): AutonomousApprovalDecision {
  const live = concepts.filter((c) => c.reviewState !== "rejected");
  if (live.length === 0) return { ok: false, reason: "A térkép nem tartalmaz fogalmat — a forrás nem adott tanítható tartalmat." };
  const verified = live.filter((c) => c.reviewState === "kept" || c.reviewState === "edited");
  const verifiedCore = verified.filter((c) => c.examWeight === "core").length;
  const excluded = live.filter((c) => c.reviewState === "pending").map((c) => ({ id: c.id, term: c.term }));
  const ratio = verified.length / live.length;
  if (verifiedCore === 0 || ratio < AUTONOMOUS_MIN_VERIFIED_RATIO) {
    return {
      ok: false,
      reason:
        `A forrás átirata túl bizonytalan: ${live.length} fogalomból ${verified.length} idézete igazolható` +
        ` (igazolt kulcsfogalom: ${verifiedCore}). Olvashatóbb fotó vagy szöveges PDF/DOCX szükséges.`,
    };
  }
  return { ok: true, excluded, verifiedCore, liveCount: live.length };
}

/** A futás és a job mellé kerülő emberi jelzés a kimaradt kulcsfogalmakról. */
export function sourceGapNote(excluded: Array<{ id: string; term?: string }>): string | null {
  if (!excluded.length) return null;
  const names = excluded.map((c) => c.term?.trim() || c.id).join(", ");
  return `${excluded.length} fogalom idézete nem igazolható a forrásból, ezért nem került a tananyagba: ${names}. A forrásjegyzékben javítható, utána célzott fogalomjavítással pótolható.`;
}

/** Darabszámok a futás-jelző üzenetéhez. */
export function summarizeAutoReview(concepts: AutoReviewInput[]): { kept: number; pending: number } {
  let kept = 0;
  let pending = 0;
  for (const c of concepts) {
    if (autoReviewDecision(c) === "kept") kept++;
    else pending++;
  }
  return { kept, pending };
}
