import type { VocabLang, VocabTopic } from "./types";

type LevelRow = [number, number, number, number, number];

/**
 * Cellánkénti (téma × szint) minimum a tartalomgyártáshoz — a végrehajtási utasítás K.8.1 (angol) és K.8.2
 * (német, francia: azonos) táblája szó szerint. A riport (`scripts/vocab-bank.ts report`) ehhez méri a hiányt;
 * a teszt nem cellánként, hanem a terv minimumai (`PLAN_MINIMUMS`) szerint kapuz.
 */
const EN_QUOTAS: Record<VocabTopic, LevelRow> = {
  family: [31, 27, 22, 15, 9],
  school: [31, 27, 21, 20, 13],
  food: [31, 32, 27, 20, 13],
  home: [31, 32, 27, 20, 13],
  city: [21, 27, 27, 20, 13],
  time: [26, 27, 21, 20, 13],
  body: [26, 27, 21, 15, 9],
  clothes: [26, 27, 21, 15, 9],
  weather: [21, 21, 21, 15, 13],
  freetime: [21, 27, 27, 26, 18],
  animals: [31, 27, 21, 15, 9],
  nature: [16, 21, 27, 26, 22],
  travel: [16, 21, 27, 25, 22],
  shopping: [16, 21, 27, 20, 13],
  health: [10, 16, 21, 25, 22],
  feelings: [16, 21, 27, 25, 22],
  work: [5, 11, 21, 31, 31],
  technology: [5, 11, 21, 31, 31],
  sports: [16, 21, 21, 20, 18],
  culture: [5, 10, 16, 25, 31],
  numbers: [26, 21, 16, 10, 4],
  colors: [21, 16, 11, 5, 4],
  everyday: [31, 32, 32, 25, 17],
  communication: [21, 27, 27, 31, 31],
};

const DE_FR_QUOTAS: Record<VocabTopic, LevelRow> = {
  family: [25, 22, 18, 12, 7],
  school: [25, 22, 18, 16, 10],
  food: [25, 26, 22, 16, 10],
  home: [25, 26, 22, 16, 10],
  city: [17, 22, 22, 16, 10],
  time: [21, 22, 18, 16, 10],
  body: [21, 22, 18, 12, 7],
  clothes: [21, 22, 17, 12, 7],
  weather: [17, 18, 17, 12, 10],
  freetime: [17, 22, 22, 21, 13],
  animals: [25, 22, 17, 12, 7],
  nature: [13, 18, 22, 20, 17],
  travel: [12, 17, 22, 20, 16],
  shopping: [12, 17, 22, 16, 10],
  health: [8, 13, 17, 20, 16],
  feelings: [12, 17, 22, 20, 16],
  work: [4, 9, 17, 25, 23],
  technology: [4, 9, 17, 25, 23],
  sports: [12, 17, 17, 16, 13],
  culture: [4, 9, 13, 20, 23],
  numbers: [21, 17, 13, 8, 3],
  colors: [17, 13, 9, 4, 3],
  everyday: [25, 26, 26, 20, 13],
  communication: [17, 22, 22, 25, 23],
};

export const TOPIC_LEVEL_QUOTAS: Record<VocabLang, Record<VocabTopic, LevelRow>> = {
  en: EN_QUOTAS,
  de: DE_FR_QUOTAS,
  fr: DE_FR_QUOTAS,
};

/** K.8.3: cellánként legalább ennyi `phrase` bejegyzés (`ceil(0,32 × cella)`). */
export function phraseQuotaForCell(cell: number): number {
  return Math.ceil(0.32 * cell);
}
