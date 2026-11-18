import type { VocabWiringCase } from "../support/vocab-wiring-case";

/** Szólétra (S6): a választott nyelv bankja bővül; `buildPool` + `markAsked` kötelező (A7). */
export const CASE: VocabWiringCase = {
  page: "WordLadderHuEn.tsx",
  wired: true,
  manualBank: /WORD_LADDER_BANKS/,
  materialFirst: /useMaterialQuizzes\(/,
};
