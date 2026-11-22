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
  category?: LadderCategory;
};

const BLANK = /_{3,}/u;
const TO_FOREIGN = /angolul|németül|franciául/u;
/** Jelentést kérdező magyar utasítás: ilyenkor a kiemelt rész a célnyelvi (a válasz magyar). */
const ASKS_MEANING = /[Mm]it jelent|jelentése|[Mm]it kérdez|[Mm]ire\s|magyarul|[Mm]it kér|[Mm]it kell|[Mm]i a „|[Mm]ik az/u;
/** Csak a magyarban előforduló betűk (az angol / német / francia írás nem használja őket). */
const HUNGARIAN_ONLY = /[íóúőűÍÓÚŐŰ]/gu;
/** Gyakori magyar funkciószavak (önálló szóként; az idegen nyelvben is élő „a”, „is”, „ne” nincs köztük). */
const HUNGARIAN_WORDS = /(?:^|[\s„(])(?:az|egy|és|nem|van|vagy|hogy|ez|meg|vagyok)(?=$|[\s,.!?”)])/gu;
const SENTENCE_WORDS = 5;

/**
 * Nyelvenkénti névelő (O1, vak kör 1 L3): a francia elidált `l'` / `l’` szóköz nélkül áll. Kisbetűsített szövegen fut.
 * Nyelvenként külön, hogy egy másik nyelv névelőjének látszó szó (az angol „to die” → „die”) ne vágódjon tovább.
 */
const ARTICLES: Record<WordLadderLanguage, RegExp> = {
  en: /^(?:the|a|an|to)\s+/u,
  de: /^(?:der|die|das|den|dem|des|ein|eine|einen|einem|einer)\s+/u,
  fr: /^(?:l['’]\s*|(?:le|la|les|un|une|des|du)\s+)/u,
};

/**
 * A célnyelvi alak egyetlen normalizálása (O1): NFC, nyelvi környezettől FÜGGETLEN kisbetűsítés (`toLowerCase`, nem
 * `toLocaleLowerCase` — vak kör 1 L2: török alapértelmezésnél az „I” → „ı”), szélső írásjel és nyelvenkénti névelő le.
 * A pont, a szószám és a bankközi kulcs (`ladderTermKey`) is ebből számol.
 */
function normalizeTarget(term: string, lang: WordLadderLanguage): string {
  const lower = term.normalize("NFC").toLowerCase().replace(/\s+/gu, " ").trim();
  // Széli írásjel és szimbólum (vak kör 2 L5): ellipszis „…” / „...”, tipográfiai idézőjel, vessző, pont — a névelő előtt és után is.
  // A zárójel kivétel: a célnyelvi pontosítás („achieve (a goal)”) záró zárójele marad.
  const edge = (s: string) => s.replace(/^(?:(?![()])[\s\p{P}\p{S}])+|(?:(?![()])[\s\p{P}\p{S}])+$/gu, "");
  return edge(edge(lower).replace(ARTICLES[lang] ?? ARTICLES.en, ""));
}

/** Magyar súgó zárójelben („Sie (ő, lány) hat …”): csak-magyar betű vagy magyar funkciószó a zárójelen belül. */
const isHungarianGloss = (inner: string) => /[íóúőűÍÓÚŐŰ]/u.test(inner) || new RegExp(HUNGARIAN_WORDS.source, "u").test(` ${inner} `);

/**
 * A célrész-kinyerés közös szerződése (terv 14., O5) — a mérce bemenete MINDEN forrásfajtára:
 *  - hiányos mondat (kiemelésben, vagy kiemelés nélkül a promptban — szerverbank): a hiányt tartalmazó mondatrész a helyes
 *    válasszal kitöltve; a magyar utasítás (a hiány előtti utolsó „: ” / „? ” -ig) és a záró „(Magyarul: …)” fordítás nem része;
 *  - a magyar zárójeles súgó (`isHungarianGloss`) kimarad; a célnyelvi zárójeles pontosítás („(a goal)”) marad.
 * A megjelenített kiemelés ettől nem változik — ez csak a mérce bemenete.
 */
function fillBlank(text: string, correct: string): string {
  const at = text.search(BLANK);
  // A magyar utasítás a hiány előtti utolsó „: ” vagy „? ” végéig tart („Melyik illik: …”, „Melyik illik a mondatba? …”).
  const cut = Math.max(text.lastIndexOf(": ", at), text.lastIndexOf("? ", at));
  const segment = (cut >= 0 ? text.slice(cut + 2) : text).replace(/\s*\((?:Magyarul|magyarul):[^)]*\)\s*$/u, "");
  return segment.replace(BLANK, correct).trim();
}

const stripHungarianGlosses = (s: string) => {
  let removed = false;
  const out = s.replace(/\s*\(([^)]*)\)/gu, (whole, inner: string) => (isHungarianGloss(inner) ? ((removed = true), "") : whole));
  return removed ? out.replace(/\s+/gu, " ").trim() : s;
};

/** Bankközi kulcs: azonos célnyelvi alak (névelő, kis- / nagybetű, szélső írásjel nélkül). */
export function ladderTermKey(term: string, lang: WordLadderLanguage): string {
  return normalizeTarget(term, lang);
}

/** Közös mondatfelismerő (O2, vak kör 1 L4): 5+ szóközzel elválasztott szó — a névelő-kezeléstől független. */
export function isLadderSentence(term: string): boolean {
  return term.trim().split(/\s+/u).filter(Boolean).length >= SENTENCE_WORDS;
}

/** Magyarság-pont: csak-magyar betű a kisbetűs szavakban (a zárójeles magyar magyarázat és a mondat belsejében álló tulajdonnév — „Győr” — nem számít) + funkciószavak. */
const hungarianness = (s: string) => {
  const plain = s.replace(/\([^)]*\)/gu, " ");
  const lowerWords = plain.split(/\s+/u).filter((w, i) => w && (i === 0 || w[0] === w[0]!.toLowerCase()));
  return (lowerWords.join(" ").match(HUNGARIAN_ONLY) ?? []).length + (plain.match(HUNGARIAN_WORDS) ?? []).length;
};

/**
 * A tétel célnyelvi része (amit a gyereknek tudnia kell), terv 4.1 / 13. (O2, vak kör 1 L5): hiányos mondatnál a kitöltött
 * mondat; „… angolul / németül / franciául” kérdésnél a helyes opció; egyébként a kiemelt rész és a helyes opció közül a
 * célnyelvi — a kevésbé magyar (csak-magyar betűk + magyar funkciószavak); egyenlőségnél a kiemelés, ha az utasítás
 * jelentést kérdez, különben a helyes opció. A kiemelés (megjelenítés) ettől nem változik.
 */
export function ladderDifficultyInput(item: GradableItem): LadderDifficultyInput {
  const correct = item.options[item.correctIndex] ?? "";
  const focus = item.focus?.trim() ? item.focus : undefined;
  let term: string;
  let sentence: boolean;
  if (focus && BLANK.test(focus)) {
    term = fillBlank(focus, correct);
    sentence = true;
  } else if (!focus && BLANK.test(item.prompt)) {
    // Kiemelés nélküli mondatkiegészítés (szerverbank, vak kör 2 L1): a mondat a promptból.
    term = fillBlank(item.prompt, correct);
    sentence = true;
  } else {
    let useFocus = false;
    if (focus && !TO_FOREIGN.test(item.prompt)) {
      const hf = hungarianness(focus);
      const hc = hungarianness(correct);
      useFocus = hf === hc ? ASKS_MEANING.test(item.prompt.replace(focus, "")) : hf < hc;
    }
    term = useFocus && focus ? focus : correct;
    sentence = isLadderSentence(stripHungarianGlosses(term));
  }
  term = stripHungarianGlosses(term);
  return item.category ? { term, sentence, category: item.category } : { term, sentence };
}

/** Nehézségi pont (terv 4.1): normált betűszám + plusz szótagok + plusz szavak + mondat + kategória. */
export function ladderDifficultyScore(input: LadderDifficultyInput, lang: WordLadderLanguage): number {
  const text = normalizeTarget(input.term, lang);
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const words = text.split(/[^\p{L}]+/u).filter(Boolean);
  const syllables = words.reduce((n, w) => n + Math.max(1, (w.match(/[aeiouyäöüéèêëàâîïôûùœæ]+/gu) ?? []).length), 0);
  const spaced = Math.max(1, text.split(/\s+/u).filter(Boolean).length);
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

/** Bankközi szintkorlát: célnyelvi kulcs → a legmagasabb bank-szint, amelyen az alak bármelyik bankban szerepel. */
export type LadderTermFloors = ReadonlyMap<string, number>;

/**
 * O2 / vak kör 1 L1: azonos célnyelvi alak a kézi és a szóbankban azonos szintről induljon — a kisebb besorolás emelkedik,
 * lefelé soha. Csak egyes szó / kifejezés számít (mondat nem: a mondat a saját feladata).
 */
export function ladderTermFloors(sources: readonly { term: string; tier: number }[], lang: WordLadderLanguage): Map<string, number> {
  const floors = new Map<string, number>();
  for (const { term, tier } of sources) {
    if (isLadderSentence(term) || BLANK.test(term)) continue;
    const key = normalizeTarget(term, lang);
    if (!key) continue;
    floors.set(key, Math.max(floors.get(key) ?? 0, clampTier(tier)));
  }
  return floors;
}

/** Kézi (vagy kérdés-alakú) tételek forrásai a bankközi korláthoz: a célrész és a bank-szint. */
export function ladderFloorSources<T extends GradableItem & { tier: number }>(items: readonly T[]): { term: string; tier: number }[] {
  return items.map((q) => ({ term: ladderDifficultyInput(q).term, tier: q.tier }));
}

/** Szóbank-bejegyzések forrásai (a szint az azonosítóból: `<nyelv><szint>-…`, így a lap a `{ id, term }` párból is építheti). */
export function vocabFloorSources(entries: readonly { id: string; term: string }[]): { term: string; tier: number }[] {
  return entries.flatMap((e) => (/^[a-z]{2}[0-4]-/u.test(e.id) ? [{ term: e.term, tier: Number(e.id[2]) }] : []));
}

const floorFor = (floors: LadderTermFloors | undefined, term: string, lang: WordLadderLanguage) =>
  floors?.get(normalizeTarget(term, lang)) ?? 0;

/** Egy Szólétra-tétel fokozata (kézi felülírás elsőbbséggel; bankközi korláttal, ha meg van adva). */
export function ladderItemStep(item: GradableItem, lang: WordLadderLanguage, declaredTier: number, floors?: LadderTermFloors): number {
  const override = item.id !== undefined ? LADDER_STEP_OVERRIDES[String(item.id)] : undefined;
  if (override !== undefined) return override;
  const input = ladderDifficultyInput(item);
  return ladderStepForScore(ladderDifficultyScore(input, lang), Math.max(declaredTier, floorFor(floors, input.term, lang)));
}

const vocabLang = (entry: VocabEntry): WordLadderLanguage => (entry.id.slice(0, 2) as WordLadderLanguage);

/** Szóbank-bejegyzés pontja (a term, szóként vagy kifejezésként; a mondatfelismerő a kérdés-útéval közös). */
export function vocabEntryScore(entry: VocabEntry): number {
  return ladderDifficultyScore({ term: entry.term, sentence: isLadderSentence(entry.term), category: entry.kind === "phrase" ? "phrase" : "word" }, vocabLang(entry));
}

export function vocabEntryStep(entry: VocabEntry, floors?: LadderTermFloors): number {
  return ladderStepForScore(vocabEntryScore(entry), Math.max(entry.level, floorFor(floors, entry.term, vocabLang(entry))));
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
 * Szintlista (index = bank-szint) → 15 fokozat-vödör; a sorrend a vödrön belül megmarad. Bankközi korlát: a megadott
 * `floors`, különben a szintlista saját tételeiből épített (azonos alak a listán belül azonos szintről indul).
 */
export function ladderStepBuckets<T extends GradableItem & { tier?: unknown }>(tiers: readonly (readonly T[])[], lang: WordLadderLanguage, floors?: LadderTermFloors): T[][] {
  const own = floors ?? ladderTermFloors(tiers.flatMap((tier, index) => tier.map((q) => ({ term: ladderDifficultyInput(q).term, tier: declaredTierOf(q, index) }))), lang);
  const buckets: T[][] = Array.from({ length: LADDER_STEP_COUNT }, () => []);
  tiers.forEach((tier, index) => {
    for (const item of tier) buckets[ladderItemStep(item, lang, declaredTierOf(item, index), own)]!.push(item);
  });
  return buckets;
}

/** A sávon kívüli vödrök kiürítve (a `pickUnseen` így a sávon belül keres és merül ki). */
export function windowLadderSteps<T>(buckets: readonly (readonly T[])[], grade: number): T[][] {
  const win = ladderGradeWindow(grade);
  return buckets.map((b, step) => (step >= win.minStep && step <= win.maxStep ? [...b] : []));
}

/** Az osztályozott bank egy évfolyamra: a tételek fokozat-vödrökben, a sávra vágva (bank-szint = `tier` mező). */
export function gradedLadderBank<T extends GradableItem & { tier: number }>(items: readonly T[], lang: WordLadderLanguage, grade: number, floors?: LadderTermFloors): T[][] {
  const tiers: T[][] = Array.from({ length: TIER_COUNT }, () => []);
  for (const item of items) tiers[clampTier(item.tier)]!.push(item);
  return windowLadderSteps(ladderStepBuckets(tiers, lang, floors), grade);
}
