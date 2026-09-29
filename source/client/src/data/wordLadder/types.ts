import type { FourChoiceQuiz } from "@/types/gameQuiz";

/**
 * Szólétra — nyelvfüggetlen tételtípus (spec 2026-09-29-palyak-szoletra-nyelvek, 4–5. döntés).
 * A magyarázat mindig magyar; a tétel egy sorban áll a bankfájlban (a meglévő szkennerek miatt).
 */
export type WordLadderLanguage = "en" | "de" | "fr";

export const WORD_LADDER_LANGUAGES: readonly WordLadderLanguage[] = ["en", "de", "fr"];

export const WORD_LADDER_LANGUAGE_LABELS: Record<WordLadderLanguage, { name: string; suffix: string }> = {
  en: { name: "Angol", suffix: "angolul" },
  de: { name: "Német", suffix: "németül" },
  fr: { name: "Francia", suffix: "franciául" },
};

/**
 * word: szó · topic: témakör-szószedet (család, iskola, étel, otthon, város, idő, test, ruha, időjárás, szabadidő) ·
 * phrase: kifejezés · irregular: rendhagyó alak (ige, többes szám, fokozás) · regular: szabályos alak (ragozás,
 * képzés, többes szám) · everyday: hétköznapi helyzet.
 */
export type LadderCategory = "word" | "topic" | "phrase" | "irregular" | "regular" | "everyday";

export const LADDER_CATEGORIES: readonly LadderCategory[] = ["word", "topic", "phrase", "irregular", "regular", "everyday"];

/** 0 = A1 könnyű … 4 = B2 (a `LADDER_TIER_LABELS` sorrendje). */
export type LadderTier = 0 | 1 | 2 | 3 | 4;

export type LadderItem = FourChoiceQuiz & { tier: LadderTier; category: LadderCategory };

/** Nyelvenként kötelező minimumok (5. döntés). */
export const LADDER_TIER_MINIMUMS: Record<LadderTier, number> = { 0: 124, 1: 122, 2: 94, 3: 64, 4: 64 };
export const LADDER_CATEGORY_MINIMUMS: Record<LadderCategory, number> = {
  word: 110, topic: 90, phrase: 60, irregular: 50, regular: 50, everyday: 60,
};
