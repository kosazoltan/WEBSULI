import type { VocabWiringCase } from "../support/vocab-wiring-case";

/** Kockavadász kvíz (S11): a tárgy-körforgás angol helyén és a saját bank angol helyén a központi szóbank kérdez. */
export const CASE: VocabWiringCase = {
  page: "BlockCraftQuiz.tsx",
  wired: true,
  manualBank: /QUIZ_FALLBACK\b/,
};
