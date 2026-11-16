import type { VocabWiringCase } from "../support/vocab-wiring-case";

/** Galaktikus Aszteroida (S10): bekötve — tananyag → évfolyam-bank angol helye / régi bank angol helye → szóbank. */
export const CASE: VocabWiringCase = {
  page: "SpaceAsteroidQuiz.tsx",
  wired: true,
  manualBank: /FALLBACK_QUIZZES\b/,
};
