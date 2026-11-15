/** Szóbank-motor (szerződés: docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md K.7.2). */
export { VOCAB_SEEN_KEY, createSeenHistory, externalKey, type SeenHistory, type StorageLike } from "./seenHistory";
export {
  findTermInExample,
  generateVocabQuestion,
  langOfEntry,
  pickQuestionType,
  type VocabQuestionType,
  type VocabQuiz,
} from "./questionGenerator";
export { createVocabSource, type VocabSource } from "./vocabSource";
export { safeLocalStorage, useVocabQuizSource } from "./useVocabQuizSource";
export { vocabLevelForGrade } from "./level";
export type { VocabEntry, VocabKind, VocabLang, VocabLevel, VocabPos, VocabTopic } from "../../data/vocabBank/types";
