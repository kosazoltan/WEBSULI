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
