import type { VOCAB_TOPICS } from "./topics";

/**
 * Központi nyelvi szóbank — adatmodell (terv: docs/specs/2026-11-15-jatekok-mobil-szobank.md 4.2;
 * szerződés: …-vegrehajtas.md K.7.1). Egy bejegyzés = egy sor az adatfájlban.
 */
export type VocabLang = "en" | "de" | "fr";
export const VOCAB_LANGS: readonly VocabLang[] = ["en", "de", "fr"];

/** 0=A1, 1=A1–A2, 2=A2, 3=B1, 4=B2 (= a Szólétra `LadderTier`-je). */
export type VocabLevel = 0 | 1 | 2 | 3 | 4;
export const VOCAB_LEVELS: readonly VocabLevel[] = [0, 1, 2, 3, 4];

export type VocabKind = "word" | "phrase";
export type VocabPos = "noun" | "verb" | "adj" | "adv" | "prep" | "pron" | "conj" | "num" | "interj" | "phrase";
export const VOCAB_POS: readonly VocabPos[] = ["noun", "verb", "adj", "adv", "prep", "pron", "conj", "num", "interj", "phrase"];

export type VocabTopic = (typeof VOCAB_TOPICS)[number];

export type VocabEntry = {
  /** "<nyelv><szint>-<téma>-<nnn>", pl. "en0-family-001"; végleges, soha nem írható át. */
  id: string;
  /** Az idegen nyelvű szó / kifejezés (német főnév névelővel: "der Hund"). */
  term: string;
  hu: string;
  kind: VocabKind;
  level: VocabLevel;
  topic: VocabTopic;
  pos: VocabPos;
  /** 3–14 szavas példamondat; a `term` vagy egy `alt` alak szó szerint (összefüggően) szerepel benne. */
  example: string;
  exampleHu: string;
  alt?: string[];
};

/** "sample": S1-es mintaállapot (szintenként 8); "full": a terv 4.2 minimumait a teszt követeli. */
export type VocabStage = "sample" | "full";

export type VocabMinimums = {
  total: number;
  perLevel: readonly [number, number, number, number, number];
  phraseRatio: number;
  perTopic: number;
};
