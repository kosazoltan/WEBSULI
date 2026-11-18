import type { VocabWiringCase } from "../support/vocab-wiring-case";

/** Brain Rot Lopás (S8): az angol kérdés-hely a központi szóbankból, a tananyag-kvíz elsőbbsége mellett. */
export const CASE: VocabWiringCase = {
  page: "BrainRotSteal.tsx",
  wired: true,
  manualBank: /ENGLISH_QUIZZES\b/,
};
