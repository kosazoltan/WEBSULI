import type { GradeSubject } from "@/data/gradeQuizBank/types";

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
