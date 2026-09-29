/**
 * Spec 2026-09-29 (docs/specs/2026-09-29-jatekok-3-12-evfolyam.md): a közös, évfolyamokra bontott kérdésbank alakja.
 * Egy tétel = egy sor a bankfájlokban (a meglévő bank-szkennerek miatt), 4 különböző opció, pontosan egy helyes.
 */
export type GradeSubject = "math" | "english" | "hungarian" | "science" | "history";

export type GradeQuizItem = {
  /** `g{évfolyam}-{tárgy}-{nnn}`, pl. `g07-math-012`. */
  id: string;
  grade: number;
  subject: GradeSubject;
  /** 1 = könnyű, 2 = közepes, 3 = nehéz az adott évfolyamon belül. */
  tier: 1 | 2 | 3;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export const GRADE_SUBJECTS: readonly GradeSubject[] = ["math", "english", "hungarian", "science", "history"];
export const MIN_GRADE = 3;
export const MAX_GRADE = 12;
