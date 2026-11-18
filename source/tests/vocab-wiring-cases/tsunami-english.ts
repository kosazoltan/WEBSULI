import type { VocabWiringCase } from "../support/vocab-wiring-case";

/** Szökőár szökés (S9): angol (és vegyes) módban a központi szóbankból, a tananyag-kvíz után. */
export const CASE: VocabWiringCase = {
  page: "TsunamiEscapeEnglish.tsx",
  wired: true,
  manualBank: /QUIZ_BANK\b/,
};
