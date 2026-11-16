/**
 * Spec 2026-09-29 (docs/specs/2026-09-29-jatekok-3-12-evfolyam.md), 2. döntés:
 * a közös évfolyam-bank választója.
 *
 * Pure: no React, no storage, injectable RNG and item list. The games own the state
 * (the `seen` set per run, the adaptive band) and call in here for the choice itself,
 * so the same rules — grade first, tier by band, never repeat by id or by prompt —
 * hold in all five games and can be proven in one test file.
 *
 * Every game keeps its old picker as the fallback: when this returns `null` (grade 1–2,
 * no grade chosen, an empty or exhausted bank) the game behaves exactly as before.
 */
import { GRADE_QUIZ_ITEMS, MAX_GRADE, MIN_GRADE, type GradeQuizItem, type GradeSubject } from "../data/gradeQuizBank";

export type GradeQuizSeen = { ids: Set<string>; prompts: Set<string> };

type Identified = { id?: string | null; prompt: string };

/** Prompt identity for the no-repeat rule: case, spacing and Unicode form do not make a new question. */
export function normalizePrompt(prompt: string): string {
  return prompt.normalize("NFC").toLocaleLowerCase("hu").replace(/\s+/g, " ").trim();
}

export function createGradeQuizSeen(): GradeQuizSeen {
  return { ids: new Set(), prompts: new Set() };
}

/** Record a question as asked. Works for any source (shared bank, own bank, lesson material). */
export function markGradeQuizSeen(seen: GradeQuizSeen, q: Identified): void {
  if (q.id) seen.ids.add(q.id);
  seen.prompts.add(normalizePrompt(q.prompt));
}

export function isGradeQuizSeen(seen: GradeQuizSeen, q: Identified): boolean {
  return (!!q.id && seen.ids.has(q.id)) || seen.prompts.has(normalizePrompt(q.prompt));
}

/** Band → tier within the grade: `< 0.4` easy, `< 0.7` medium, otherwise hard. */
export function tierForBand(band: number): 1 | 2 | 3 {
  if (!Number.isFinite(band) || band < 0.4) return 1;
  return band < 0.7 ? 2 : 3;
}

/** The preferred tier first, then its neighbours (the nearer one first for the middle tier). */
function tierOrder(band: number): (1 | 2 | 3)[] {
  const tier = tierForBand(band);
  if (tier === 1) return [1, 2, 3];
  if (tier === 3) return [3, 2, 1];
  return band < 0.55 ? [2, 1, 3] : [2, 3, 1];
}

function isSharedGrade(grade: unknown): grade is number {
  return typeof grade === "number" && Number.isInteger(grade) && grade >= MIN_GRADE && grade <= MAX_GRADE;
}

export type PickGradeQuizArgs = {
  /** The player's grade (3..12). Anything else yields `null`. */
  grade: number;
  /** The adaptive band of the running session, [0, 1]. */
  band: number;
  /** Restrict to these subjects; missing or empty = every subject. */
  subjects?: readonly GradeSubject[];
  /** Questions already asked in this run (ids and normalized prompts). Not mutated. */
  seen: GradeQuizSeen;
  rng?: () => number;
  /** Injectable for tests; defaults to the shared bank. */
  items?: readonly GradeQuizItem[];
};

/**
 * Next unseen question: the player's grade first (tier by band, neighbour tiers when the
 * wanted tier is empty or used up), then grade−1, then grade+1. `null` when nothing is
 * left — the caller falls back to its own bank. The caller marks the returned item seen.
 */
export function pickGradeQuiz(args: PickGradeQuizArgs): GradeQuizItem | null {
  const { grade, band, seen } = args;
  if (!isSharedGrade(grade)) return null;
  const rng = args.rng ?? Math.random;
  const items = args.items ?? GRADE_QUIZ_ITEMS;
  const subjects = args.subjects && args.subjects.length > 0 ? new Set(args.subjects) : null;

  const unseen = items.filter((q) => (!subjects || subjects.has(q.subject)) && !isGradeQuizSeen(seen, q));
  if (unseen.length === 0) return null;

  for (const g of [grade, grade - 1, grade + 1]) {
    if (g < MIN_GRADE || g > MAX_GRADE) continue;
    const inGrade = unseen.filter((q) => q.grade === g);
    if (inGrade.length === 0) continue;
    for (const tier of tierOrder(band)) {
      const candidates = inGrade.filter((q) => q.tier === tier);
      if (candidates.length > 0) {
        return candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))]!;
      }
    }
  }
  return null;
}

/**
 * Which bank a game asks from: the grade (3..12) → the shared bank; `null` → the game's
 * own (lower-primary) bank, also when the player has not chosen a grade yet.
 */
export function gradeForGame(grade: number | null | undefined): number | null {
  return isSharedGrade(grade) ? grade : null;
}

/** Lesson-material priority: the first material question not asked yet in this run. */
export function pickUnseenMaterial<T extends Identified>(material: readonly T[], seen: GradeQuizSeen): T | null {
  return material.find((q) => !isGradeQuizSeen(seen, q)) ?? null;
}

export type GradeGameDifficulty = "easy" | "normal" | "hard";

/** Tsunami: default difficulty button from the grade (3–5 easy, 6–8 normal, 9–12 hard). */
export function difficultyForGrade(grade: number | null | undefined): GradeGameDifficulty | null {
  if (!isSharedGrade(grade)) return null;
  if (grade <= 5) return "easy";
  return grade <= 8 ? "normal" : "hard";
}

/** Tsunami: the chosen difficulty shifts the adaptive band before the tier is chosen. */
export function bandShiftForDifficulty(difficulty: GradeGameDifficulty): number {
  if (difficulty === "easy") return -0.15;
  return difficulty === "hard" ? 0.15 : 0;
}

export function clampBand(band: number): number {
  return Number.isFinite(band) ? Math.min(1, Math.max(0, band)) : 0;
}

type GradeSlotArgs<V> = {
  /** `pickGradeQuiz` hívása ugyanazzal a `seen`-nel. */
  pick: () => GradeQuizItem | null;
  seen: GradeQuizSeen;
  /** A szóbank-forrás hívása; `null`, ha nincs szóbank / még tölt / nem ad kérdést — ilyenkor a kézi tétel megy. */
  vocabNext: () => V | null;
};

/**
 * S13 / E23 — az évfolyam-bank kérdés-helye szóbankos kiváltással, EGY közös helyen (a Brain Rot, az Aszteroida, a
 * Kockavadász és a Tornado ezt hívja; korábban három külön változat élt: `lib/brainRotTuning.ts`,
 * `lib/blockCraftSubjects.ts`, `lib/tornado/questions.ts`).
 *
 * A választott tétel MINDIG a `seen`-be kerül (fogy) — akkor is, ha angol, és a szóbank váltja ki (review #424):
 * különben a választó az első nem üres sávban ragadna, és ugyanazt a tételt kínálná újra (egy szóbank-kiesés után is).
 *
 * Két változat:
 *  - `subject` nélkül (Brain Rot, Aszteroida, Tornado): a tétel tárgya dönt; ha nincs tétel, nincs hely (`null`);
 *  - `subject`-tel (Kockavadász tárgy-körforgása): az angol HELY akkor is a szóbankból kérdez, ha az évfolyam-bank
 *    angol tételei elfogytak (`replaced: null`) — a körforgás minden körében egy angol hely marad, az arány nem torzul.
 */
export function pickGradeSlotWithVocab<V>(
  args: GradeSlotArgs<V> & { subject: GradeSubject },
): { kind: "vocab"; quiz: V; replaced: GradeQuizItem | null } | { kind: "grade"; item: GradeQuizItem } | null;
export function pickGradeSlotWithVocab<V>(
  args: GradeSlotArgs<V>,
): { kind: "vocab"; quiz: V; replaced: GradeQuizItem } | { kind: "grade"; item: GradeQuizItem } | null;
export function pickGradeSlotWithVocab<V>(
  args: GradeSlotArgs<V> & { subject?: GradeSubject },
): { kind: "vocab"; quiz: V; replaced: GradeQuizItem | null } | { kind: "grade"; item: GradeQuizItem } | null {
  const item = args.pick();
  if (item) markGradeQuizSeen(args.seen, item);
  const englishSlot = args.subject !== undefined ? args.subject === "english" : item?.subject === "english";
  if (englishSlot) {
    const quiz = args.vocabNext();
    if (quiz != null) return { kind: "vocab", quiz, replaced: item };
  }
  return item ? { kind: "grade", item } : null;
}
