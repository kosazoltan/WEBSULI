import type { GradeQuizItem, GradeSubject } from "@/data/gradeQuizBank/types";
import { pickGradeSlotWithVocab, type GradeQuizSeen } from "../game-engine/gradeQuiz";

export type BlockCraftSubject = "english" | "english-math" | "math" | "nature" | "hungarian" | "science" | "history";

/** A3: material topic → BlockCraft subject pool. */
export function blockCraftSubjectFromTopic(topic: string | null | undefined): BlockCraftSubject {
  const t = (topic ?? "").toLowerCase();
  if (t === "math") return "math";
  if (t === "nature") return "nature";
  if (t === "hungarian") return "hungarian";
  if (t === "english") return "english";
  return "english";
}

/** Spec 2026-09-29: a közös évfolyam-bank tárgya → BlockCraft tárgy (3–12. évfolyam). */
export function blockCraftSubjectFromGradeSubject(subject: GradeSubject): BlockCraftSubject {
  if (subject === "science") return "science";
  if (subject === "history") return "history";
  return subject;
}

/**
 * S11 / A8 — a közös tárgy-körforgás EGY helye, szóbankos kiváltással (a Brain Rot #424-es review-leletének
 * megfelelője).
 *
 * `pick` a `pickGradeQuiz({ …, subjects: [subject], seen })` hívása. A választott évfolyam-banki tétel MINDIG a
 * `seen`-be kerül — akkor is, ha angol, és a szóbank váltja ki. Ha a kiváltott tétel nem fogyna, a választó az
 * angol tárgyon belül örökké ugyanazt a sávot és tételt kínálná, és az angol tételek sávjai nem kerülnének sorra.
 * Angol helyen a szóbank akkor is kérdez, ha az évfolyam-bank angol tételei már elfogytak (a szóbank nagy, a
 * tárgy-arány így sem torzul: a körforgás minden körében egy angol hely van). `vocabNext` → `null` (nincs szóbank,
 * még tölt, hibázott): a kézi tétel megy, változatlanul.
 */
export function pickBlockCraftGradeSlot<V>(args: {
  subject: GradeSubject;
  pick: () => GradeQuizItem | null;
  seen: GradeQuizSeen;
  vocabNext: () => V | null;
}): { kind: "vocab"; quiz: V; replaced: GradeQuizItem | null } | { kind: "grade"; item: GradeQuizItem } | null {
  // S13 / E23: a közös megvalósítás tárgy-helyes változata (game-engine/gradeQuiz.ts).
  return pickGradeSlotWithVocab(args);
}
