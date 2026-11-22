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

/** Alfok-határok szintenként (≤ első → 0. alfok, ≤ második → 1., különben 2.): a három nyelv együttes p33 / p67-e; oszloponként
 * nem csökkenő (vak kör 2 O6: a 2. szint felső határa 20 → 21, hogy az alfok-sáv a szintek között ne csússzon lefelé). */
export const LADDER_SUB_CUTS: readonly (readonly [number, number])[] = [
  [5, 9],
  [9, 21],
  [9, 21],
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
  /** A szóbanki tétel célnyelvi alakja (`VocabQuiz.answerTerm`): ha megvan, a mérce ezt méri (terv 16., vak kör 4 L2). */
  term?: string;
  category?: LadderCategory;
};

/** A hiány jele a `focus` mezőben (a bank-validátor szerződése: hiányos mondatnál a célrész tartalmazza a hiányt). */
const BLANK = /_{3,}/u;
const SENTENCE_WORDS = 5;

/**
 * Nyelvenkénti névelő (vak kör 1 L3): a francia elidált `l'` / `l’` szóköz nélkül áll. Kisbetűsített szövegen fut.
 * Nyelvenként külön, hogy egy másik nyelv névelőjének látszó szó (az angol „to die” → „die”) ne vágódjon tovább.
 */
const ARTICLES: Record<WordLadderLanguage, RegExp> = {
  en: /^(?:the|a|an|to)\s+/u,
  de: /^(?:der|die|das|den|dem|des|ein|eine|einen|einem|einer)\s+/u,
  fr: /^(?:l['’]\s*|(?:le|la|les|un|une|des|du)\s+)/u,
};

/**
 * A mérce egyetlen normalizálása (terv 15.): NFC, nyelvi környezettől FÜGGETLEN kisbetűsítés (`toLowerCase`), minden
 * szóköz (a nem törő is) egy szóközzé, a széli Unicode-írásjel és -szimbólum le (a zárójel kivételével), nyelvenkénti névelő le.
 */
function normalizeTarget(term: string, lang: WordLadderLanguage): string {
  const lower = term.normalize("NFC").toLowerCase().replace(/\s+/gu, " ").trim();
  const edge = (s: string) => s.replace(/^(?:(?![()])[\s\p{P}\p{S}])+|(?:(?![()])[\s\p{P}\p{S}])+$/gu, "");
  return edge(edge(lower).replace(ARTICLES[lang] ?? ARTICLES.en, ""));
}

/** Szavak: a normalizált szöveg szóközzel elválasztott tagjai, amelyekben van betű vagy szám (az önálló írásjel nem szó — L3). */
const wordsOf = (term: string, lang: WordLadderLanguage) =>
  normalizeTarget(term, lang).split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w));

/** Bankközi kulcs: a normalizált alak. */
export function ladderTermKey(term: string, lang: WordLadderLanguage): string {
  return normalizeTarget(term, lang);
}

/** Közös mondatfelismerő: legalább 5 szó (önálló írásjel és névelő nélkül számolva). */
export function isLadderSentence(term: string, lang: WordLadderLanguage): boolean {
  return wordsOf(term, lang).length >= SENTENCE_WORDS;
}

/**
 * A mérce bemenete — CSAK STRUKTÚRÁLT MEZŐKBŐL (tulajdonosi döntés 2026-11-22, terv 15–16.): szóbanki tételnél a `term`
 * (célnyelvi alak, a kérdés irányától függetlenül); egyébként ha a tételnek van `focus` mezője, az (hiányos mondatnál a hiány a
 * helyes válasszal kitöltve); különben a helyes válasz. A kérdés / utasítás szabad szövegét
 * (`prompt`) a mérce NEM elemzi. Dokumentált korlát: ha a `focus` magyar (pl. „Hogy mondjuk angolul: olló?”), a magyar alakot
 * méri; a `focus` zárójeles magyar súgója a pont része.
 */
export function ladderDifficultyInput(item: GradableItem, lang: WordLadderLanguage): LadderDifficultyInput {
  const correct = item.options[item.correctIndex] ?? "";
  const focus = item.focus?.trim() ? item.focus : undefined;
  const blank = focus !== undefined && BLANK.test(focus);
  const term = item.term?.trim() ? item.term : focus === undefined ? correct : blank ? focus.replace(BLANK, correct) : focus;
  const sentence = (!item.term?.trim() && blank) || isLadderSentence(term, lang);
  return item.category ? { term, sentence, category: item.category } : { term, sentence };
}

/**
 * Magánhangzó-csoport (szótag) a kisbetűsített szövegen: angol, magyar (á é í ó ö ő ú ü ű — a magyar `focus` is a mérce
 * bemenete), német (ä ö ü) és francia (à â æ è é ê ë î ï ô œ ù û ÿ) magánhangzók; PR #528 Copilot-észrevétel.
 */
const VOWEL_GROUP = /[aeiouyáéíóöőúüűäàâæèêëìîïòôœùûÿ]+/gu;

/** Nehézségi pont (terv 4.1): normált betűszám + plusz szótagok + plusz szavak + mondat + kategória. */
export function ladderDifficultyScore(input: LadderDifficultyInput, lang: WordLadderLanguage): number {
  const words = wordsOf(input.term, lang);
  const letters = (words.join(" ").match(/\p{L}/gu) ?? []).length;
  // Szótag és levonás ugyanazokon a szavakon (vak kör 4 L4): a kötőjeles / aposztrófos alak („arc-en-ciel”) egy szó.
  const syllables = words.reduce((n, w) => n + Math.max(1, (w.match(VOWEL_GROUP) ?? []).length), 0);
  const raw = letters / (LADDER_LETTER_FACTOR[lang] ?? 1)
    + 2 * Math.max(0, syllables - words.length)
    + 3 * (Math.max(1, words.length) - 1)
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
  // Csak saját, szám értékű kulcs (PR #528 Copilot-észrevétel): a „constructor” / „__proto__” azonosító nem örökölt találat.
  const key = item.id !== undefined ? String(item.id) : undefined;
  const override = key !== undefined && Object.hasOwn(LADDER_STEP_OVERRIDES, key) ? LADDER_STEP_OVERRIDES[key] : undefined;
  if (typeof override === "number" && Number.isInteger(override) && override >= 0 && override < LADDER_STEP_COUNT) return override;
  return ladderStepForScore(ladderDifficultyScore(ladderDifficultyInput(item, lang), lang), declaredTier);
}

const vocabLang = (entry: VocabEntry): WordLadderLanguage => (entry.id.slice(0, 2) as WordLadderLanguage);

/** Szóbank-bejegyzés pontja (a `term`, szóként vagy kifejezésként; ugyanaz a mondatfelismerő). */
export function vocabEntryScore(entry: VocabEntry): number {
  const lang = vocabLang(entry);
  return ladderDifficultyScore({ term: entry.term, sentence: isLadderSentence(entry.term, lang), category: entry.kind === "phrase" ? "phrase" : "word" }, lang);
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

/**
 * A tétel bank-szintje (vak kör 2 L2, O6): a tétel saját `tier` mezője (0–4), ha van — a készlet-index (pl. a `mergeVocabTiers`
 * egy kimerült szint pótlására másik szint készletébe teheti) csak pótlás, szint nélküli tételnél (szerverbank). Így a
 * vödrözés soha nem sorol vissza.
 */
export function declaredTierOf(item: object, index: number): number {
  const t = (item as { tier?: unknown }).tier;
  return typeof t === "number" && Number.isInteger(t) && t >= 0 && t < TIER_COUNT ? t : clampTier(index);
}

/**
 * Szintlista (index = bank-szint pótlásként) → 15 fokozat-vödör; a sorrend a vödrön belül megmarad.
 */
export function ladderStepBuckets<T extends GradableItem & { tier?: unknown }>(tiers: readonly (readonly T[])[], lang: WordLadderLanguage): T[][] {
  const buckets: T[][] = Array.from({ length: LADDER_STEP_COUNT }, () => []);
  tiers.forEach((tier, index) => {
    for (const item of tier) buckets[ladderItemStep(item, lang, declaredTierOf(item, index))]!.push(item);
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
