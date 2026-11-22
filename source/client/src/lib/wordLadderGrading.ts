/**
 * Szólétra — szintezés: determinisztikus nehézségi mérce, 15 fokozatú osztályozás, évfolyam-sáv és fokozatos emelés.
 * Terv: docs/specs/2026-11-22-szoletra-szintezes.md (4.1–4.4). Tiszta modul (csak relatív import), node-tesztből mérhető.
 *
 * Mérve 2026-11-22: a kérdés szintjét a pálya döntötte el (3. évfolyam 8. pályától B1–B2), és a szinten belül nem volt
 * sorrend — a szóbank 0. szintjének felső harmada a mérce szerint nehezebb volt a 4. szint mediánjánál. Itt minden tétel
 * pontot és fokozatot kap (szint × 3 + alfok), a futás az évfolyam sávjában indul és a helyes sorozatokkal emelkedik.
 */
import type { LadderCategory, WordLadderLanguage } from "../data/wordLadder/types";
import type { VocabEntry } from "../data/vocabBank/types";
import { HARDEN_AFTER, SOFTEN_AFTER } from "../game-engine/difficulty";
import { GRADE_LEVEL_COUNT } from "../game-engine/gradeLevels";
import { ladderBaseTier } from "../game-engine/no-repeat";

/** 5 szint × 3 alfok. */
export const LADDER_STEP_COUNT = 15;
const TIER_COUNT = 5;

/** Nyelvi betűszorzó: a szóbank 0. szintjének átlag-betűszáma (en 6,9 · de 9,4 · fr 8,5) az angolhoz mérve. */
export const LADDER_LETTER_FACTOR: Record<WordLadderLanguage, number> = { en: 1, de: 1.35, fr: 1.2 };

/** Kategória-súly: a kifejezés, a szabályos és főleg a rendhagyó alak nehezebb az egyes szónál. */
export const LADDER_CATEGORY_WEIGHT: Record<LadderCategory, number> = { word: 0, topic: 0, everyday: 3, phrase: 4, regular: 5, irregular: 7 };

/** Alsó korlát: ekkora ponttól a tétel legalább ennyiedik szintű (csak felfelé sorol). */
export const LADDER_TIER_FLOORS: readonly { minScore: number; tier: number }[] = [
  { minScore: 40, tier: 2 },
  { minScore: 20, tier: 1 },
];

/** Alfok-határok szintenként (≤ első → 0. alfok, ≤ második → 1., különben 2.): a három nyelv együttes p33 / p67-e. */
export const LADDER_SUB_CUTS: readonly (readonly [number, number])[] = [
  [5, 9],
  [9, 21],
  [9, 20],
  [11, 21],
  [13, 24],
];

/**
 * Kézi finomítás: kézi-bank azonosító → fokozat (0–14). Csak dokumentált, tételenkénti indoklással bővíthető (terv 4.1);
 * a validátor-teszt (`T/word-ladder-grading.test.ts` A12) a létező azonosítót és a tartományt őrzi.
 */
export const LADDER_STEP_OVERRIDES: Readonly<Record<string, number>> = {};

export type LadderDifficultyInput = { term: string; sentence: boolean; category?: LadderCategory };

type GradableItem = {
  id?: string | number;
  prompt: string;
  options: readonly string[];
  correctIndex: number;
  focus?: string;
  category?: LadderCategory;
};

const BLANK = /_{3,}/u;
const TO_FOREIGN = /angolul|németül|franciául/u;
const ARTICLE = /^(the|to|a|an|der|die|das|ein|eine|le|la|les|un|une|l'|l’)\s+/iu;
const SENTENCE_WORDS = 5;

const stripArticle = (s: string) => s.normalize("NFC").trim().replace(ARTICLE, "");
const wordCount = (s: string) => stripArticle(s).split(/\s+/u).filter(Boolean).length;

/** A tétel célnyelvi része (amit a gyereknek tudnia kell), terv 4.1. */
export function ladderDifficultyInput(item: GradableItem): LadderDifficultyInput {
  const correct = item.options[item.correctIndex] ?? "";
  const focus = item.focus?.trim() ? item.focus : undefined;
  let term: string;
  let sentence: boolean;
  if (focus && BLANK.test(focus)) {
    term = focus.replace(BLANK, correct);
    sentence = true;
  } else if (focus && !TO_FOREIGN.test(item.prompt)) {
    term = focus;
    sentence = wordCount(focus) >= SENTENCE_WORDS;
  } else {
    term = correct;
    sentence = wordCount(correct) >= SENTENCE_WORDS;
  }
  return item.category ? { term, sentence, category: item.category } : { term, sentence };
}

/** Nehézségi pont (terv 4.1): normált betűszám + plusz szótagok + plusz szavak + mondat + kategória. */
export function ladderDifficultyScore(input: LadderDifficultyInput, lang: WordLadderLanguage): number {
  const text = stripArticle(input.term).toLocaleLowerCase();
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const words = text.split(/[^\p{L}]+/u).filter(Boolean);
  const syllables = words.reduce((n, w) => n + Math.max(1, (w.match(/[aeiouyäöüéèêëàâîïôûùœæ]+/gu) ?? []).length), 0);
  const spaced = Math.max(1, wordCount(input.term));
  const raw = letters / (LADDER_LETTER_FACTOR[lang] ?? 1)
    + 2 * Math.max(0, syllables - words.length)
    + 3 * (spaced - 1)
    + (input.sentence ? 6 : 0)
    + (input.category ? LADDER_CATEGORY_WEIGHT[input.category] ?? 0 : 0);
  return Math.round(raw * 10) / 10;
}

const clampTier = (t: number) => Math.min(TIER_COUNT - 1, Math.max(0, Math.round(Number.isFinite(t) ? t : 0)));

/** Pont + bank-szint → fokozat (0–14): a szint legalább a bank szintje, a pont csak felfelé sorol. */
export function ladderStepForScore(score: number, declaredTier: number): number {
  let tier = clampTier(declaredTier);
  for (const floor of LADDER_TIER_FLOORS) if (score >= floor.minScore) tier = Math.max(tier, floor.tier);
  const [a, b] = LADDER_SUB_CUTS[tier]!;
  const sub = score <= a ? 0 : score <= b ? 1 : 2;
  return tier * 3 + sub;
}

/** Egy Szólétra-tétel fokozata (kézi felülírás elsőbbséggel). */
export function ladderItemStep(item: GradableItem, lang: WordLadderLanguage, declaredTier: number): number {
  const override = item.id !== undefined ? LADDER_STEP_OVERRIDES[String(item.id)] : undefined;
  if (override !== undefined) return override;
  return ladderStepForScore(ladderDifficultyScore(ladderDifficultyInput(item), lang), declaredTier);
}

const vocabLang = (entry: VocabEntry): WordLadderLanguage => (entry.id.slice(0, 2) as WordLadderLanguage);

/** Szóbank-bejegyzés pontja (a term, szóként vagy kifejezésként). */
export function vocabEntryScore(entry: VocabEntry): number {
  return ladderDifficultyScore({ term: entry.term, sentence: false, category: entry.kind === "phrase" ? "phrase" : "word" }, vocabLang(entry));
}

export function vocabEntryStep(entry: VocabEntry): number {
  return ladderStepForScore(vocabEntryScore(entry), entry.level);
}

/** Évfolyam-sávok (a `ladderBaseTier` határai). */
export const LADDER_GRADE_BANDS: readonly { label: string; grades: readonly number[] }[] = [
  { label: "3–4.", grades: [3, 4] },
  { label: "5–6.", grades: [5, 6] },
  { label: "7–8.", grades: [7, 8] },
  { label: "9–10.", grades: [9, 10] },
  { label: "11–12.", grades: [11, 12] },
];

const safeGrade = (grade: number) => (Number.isFinite(grade) ? Math.min(12, Math.max(3, Math.round(grade))) : 4);
const safeLevel = (level: number) => (Number.isFinite(level) ? Math.min(GRADE_LEVEL_COUNT, Math.max(1, Math.round(level))) : 1);

/** Az évfolyam sávja fokozatban: alapszint − 1 … alapszint + 1 (terv 4.2). Ismeretlen évfolyam → 4. */
export function ladderGradeWindow(grade: number): { minStep: number; baseStep: number; maxStep: number } {
  const base = ladderBaseTier(safeGrade(grade));
  return { minStep: Math.max(0, base - 1) * 3, baseStep: base * 3, maxStep: Math.min(TIER_COUNT - 1, base + 1) * 3 + 2 };
}

/** Belépő fokozat: az alapszint legkönnyebb alfoka + pálya-eltolás (legfeljebb 3 fokozat, a sáv tetején belül). */
export function ladderStartStep(grade: number, level: number): number {
  const win = ladderGradeWindow(grade);
  const span = Math.min(3, win.maxStep - win.baseStep);
  return win.baseStep + Math.round(((safeLevel(level) - 1) * span) / (GRADE_LEVEL_COUNT - 1));
}

/**
 * A futás fokozata (terv 4.3): 3 egymás utáni jó válasz → +1, 2 egymás utáni hiba → −1, lépés után a sorozat nullázódik;
 * a fokozat az évfolyam sávjában marad.
 */
export function createLadderStepSession(grade: number, level: number) {
  let win = ladderGradeWindow(grade);
  let step = ladderStartStep(grade, level);
  let streak = 0;
  return {
    get step() {
      return step;
    },
    get tier() {
      return Math.floor(step / 3);
    },
    answer(correct: boolean): number {
      if (correct) {
        streak = streak > 0 ? streak + 1 : 1;
        if (streak >= HARDEN_AFTER) {
          step = Math.min(win.maxStep, step + 1);
          streak = 0;
        }
      } else {
        streak = streak < 0 ? streak - 1 : -1;
        if (-streak >= SOFTEN_AFTER) {
          step = Math.max(win.minStep, step - 1);
          streak = 0;
        }
      }
      return step;
    },
    reset(nextGrade: number, nextLevel: number) {
      win = ladderGradeWindow(nextGrade);
      step = ladderStartStep(nextGrade, nextLevel);
      streak = 0;
    },
  };
}

/** Szintlista (index = bank-szint) → 15 fokozat-vödör; a sorrend a vödrön belül megmarad. */
export function ladderStepBuckets<T extends GradableItem>(tiers: readonly (readonly T[])[], lang: WordLadderLanguage): T[][] {
  const buckets: T[][] = Array.from({ length: LADDER_STEP_COUNT }, () => []);
  tiers.forEach((tier, declared) => {
    for (const item of tier) buckets[ladderItemStep(item, lang, declared)]!.push(item);
  });
  return buckets;
}

/** A sávon kívüli vödrök kiürítve (a `pickUnseen` így a sávon belül keres és merül ki). */
export function windowLadderSteps<T>(buckets: readonly (readonly T[])[], grade: number): T[][] {
  const win = ladderGradeWindow(grade);
  return buckets.map((b, step) => (step >= win.minStep && step <= win.maxStep ? [...b] : []));
}

/** Az osztályozott bank egy évfolyamra: a tételek fokozat-vödrökben, a sávra vágva (bank-szint = `tier` mező). */
export function gradedLadderBank<T extends GradableItem & { tier: number }>(items: readonly T[], lang: WordLadderLanguage, grade: number): T[][] {
  const tiers: T[][] = Array.from({ length: TIER_COUNT }, () => []);
  for (const item of items) tiers[clampTier(item.tier)]!.push(item);
  return windowLadderSteps(ladderStepBuckets(tiers, lang), grade);
}
