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
 *   - nem igazolható KULCSfogalom → rejected (kihúzva — igazolatlan állítást
 *     nem tanítunk; az admin utólag kézzel visszaveheti, ha a kép alapján jó)
 *   - nem igazolható KIEGÉSZÍTŐ → kept (a canApprove-kaput csak a core
 *     blokkolja; a kiegészítő megjelölve marad az admin listában)
 *
 * A kézi útvonal ("Csak tudás-térkép") változatlan: ott továbbra is a tanár
 * kurál.
 */

import type { ExamWeight, ReviewState } from "../../shared/knowledge-map-schema";

export type AutoReviewInput = { examWeight: ExamWeight; verbatimOk: boolean };

/** Egy fogalom gépi döntése. */
export function autoReviewDecision(c: AutoReviewInput): Extract<ReviewState, "kept" | "rejected"> {
  if (c.verbatimOk) return "kept";
  return c.examWeight === "core" ? "rejected" : "kept";
}

/** Darabszámok a futás-jelző üzenetéhez. */
export function summarizeAutoReview(concepts: AutoReviewInput[]): { kept: number; rejected: number } {
  let kept = 0;
  let rejected = 0;
  for (const c of concepts) {
    if (autoReviewDecision(c) === "kept") kept++;
    else rejected++;
  }
  return { kept, rejected };
}
