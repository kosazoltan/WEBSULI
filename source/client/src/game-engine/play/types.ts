/**
 * J0b — a tanulási mag közös típusai (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md J0b „Szerződés”; terv 6.1).
 *
 * A hét játék, a közös UI (J0c) és a párbaj-motor (JM1) ugyanezt a kérdés-életciklust beszéli: a játék a
 * `QuestionDirector`-tól `QuestionPresentation`-t kap, a válaszcélokat a saját világában rajzolja, és a választást
 * `QuestionOutcome`-ként kapja vissza. Futásidejű kód csak a `PLAY_GAME_IDS` lista és a `toRandom` átalakító (tiszta).
 */
import type { FourChoiceQuiz } from "@/types/gameQuiz";
import type { VocabLang } from "@/data/vocabBank/types";

export type PlayGameId =
  | "tsunami-english" | "word-ladder-hu-en" | "block-craft-quiz" | "speed-quiz-math"
  | "brain-rot-steal" | "space-asteroid-quiz" | "tornado-hunter-200";

/** A hét játék azonosítója futásidőben is (a `P/Games.tsx` katalógusa és a score-őr ezzel vet össze). */
export const PLAY_GAME_IDS: readonly PlayGameId[] = [
  "tsunami-english", "word-ladder-hu-en", "block-craft-quiz", "speed-quiz-math",
  "brain-rot-steal", "space-asteroid-quiz", "tornado-hunter-200",
];

export type QuestionSourceKind = "material" | "review" | "vocab" | "grade" | "bank" | "coupon";

export type PlayQuestion = {
  /** Stabil tétel-kulcs: "vocab:<lang>:<vocabId>" | "grade:<id>" | "mat:<id vagy normalizePrompt>" | "bank:<gameId>:<id>". */
  key: string;
  quiz: FourChoiceQuiz;
  source: QuestionSourceKind;
  subject?: string;
  lang?: VocabLang;
  /**
   * A kérdés MEGJELENÉSEKOR felolvasható célnyelvi szöveg — SOHA nem árulhatja el a helyes választ (közös utójavítás,
   * #454 / #455 review): cél→magyar: a célnyelvi szó; hiányos mondat: a mondat a hiány helyén szünettel; magyar→cél: nincs.
   */
  speakText?: string;
  /** A KIMENETEL UTÁN felolvasható helyes célnyelvi szó (megerősítés jó válasznál, a megoldás hibánál). */
  speakAfter?: string;
  /**
   * J4b (additív): a tétel NEM kerül az ismétlési sorba (pl. a Matek „Becslő-bomba” gyors, kétválaszos becslése — játékbeli
   * bónusz, nem tananyag-tétel). A menet-statisztikában és a „Gyakorold még” listában szerepel.
   */
  noReview?: boolean;
  /** Kupon-bónuszhoz: a szerver által kiadott tétel azonosítója (`GE/claimCouponBonus.ts`). */
  couponItemId?: string;
  /**
   * J4a (additív, review #451): az évfolyam, amelyhez a tétel tartozik. Az ismétlési sor eltárolja, és a director csak az
   * aktuális évfolyamú menetben hozza vissza (`reviewFitsGrade`). Hiányában a kulcsból próbálja visszafejteni.
   */
  grade?: number;
};

export type PresentedOption = { label: string; originalIndex: number; correct: boolean };

export type QuestionPresentation = {
  id: number;                 // menetenként növekvő
  question: PlayQuestion;
  isReview: boolean;
  options: PresentedOption[]; // 3 vagy 4, seedelten keverve; pontosan egy correct
  windowMs: number;           // windowMsFor() szerint
  slowMo: number;             // 0.35..1 — a szimuláció szorzója a kérdés alatt
  startedAtSimMs: number;
  reason: "scheduled" | "trigger" | "boss" | "rescue";
};

export type QuestionResult = "correct" | "wrong" | "timeout" | "aborted";

export type QuestionOutcome = {
  id: number;
  key: string;
  result: QuestionResult;
  pickedOriginalIndex: number | null;
  correctOriginalIndex: number;
  responseMs: number;
};

/**
 * A `rng` paraméterek két alakja (J0b „Függ”): sima `() => number` vagy a J0a `Rng` objektuma (`createRng(seed)`), amelynek
 * a `next` metódusa a függvény. A közös modulok mindkettőt elfogadják.
 */
export type RandomSource = (() => number) | { next(): number };

/** `RandomSource` → `() => number` (a `Rng.next` leválasztva is működik, J0a). */
export function toRandom(rng: RandomSource): () => number {
  return typeof rng === "function" ? rng : () => rng.next();
}
