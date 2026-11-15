import type { VocabLang, VocabMinimums } from "./types";

/** A terv 4.2 minimumai: szintenként, ≥ 30% kifejezés, témánként ≥ 40 bejegyzés. */
export const PLAN_MINIMUMS: Record<VocabLang, VocabMinimums> = {
  en: { total: 2500, perLevel: [500, 550, 550, 500, 400], phraseRatio: 0.3, perTopic: 40 },
  de: { total: 2000, perLevel: [400, 450, 450, 400, 300], phraseRatio: 0.3, perTopic: 40 },
  fr: { total: 2000, perLevel: [400, 450, 450, 400, 300], phraseRatio: 0.3, perTopic: 40 },
};

/** Mintaállapot (`stage === "sample"`): szintenként 8 bejegyzés. */
export const SAMPLE_MINIMUMS: VocabMinimums = { total: 40, perLevel: [8, 8, 8, 8, 8], phraseRatio: 0, perTopic: 0 };
