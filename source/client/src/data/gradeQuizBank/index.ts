import type { GradeQuizItem } from "./types";
import { GRADE_03 } from "./grade-03";
import { GRADE_04 } from "./grade-04";
import { GRADE_05 } from "./grade-05";
import { GRADE_06 } from "./grade-06";
import { GRADE_07 } from "./grade-07";
import { GRADE_08 } from "./grade-08";
import { GRADE_09 } from "./grade-09";
import { GRADE_10 } from "./grade-10";
import { GRADE_11 } from "./grade-11";
import { GRADE_12 } from "./grade-12";

export * from "./types";

/**
 * Az összes évfolyam tételei (spec 2026-09-29, 1. döntés): évfolyamonként × tárgyanként 18 tétel (6-6-6 szint).
 * A tartalmat a `tests/grade-quiz-bank.test.ts` szerkezetileg és a számolható matek-tételeknél értékre is ellenőrzi;
 * minden tételt független vak megoldó is átnézett (5. döntés).
 */
export const GRADE_QUIZ_ITEMS: readonly GradeQuizItem[] = [
  ...GRADE_03,
  ...GRADE_04,
  ...GRADE_05,
  ...GRADE_06,
  ...GRADE_07,
  ...GRADE_08,
  ...GRADE_09,
  ...GRADE_10,
  ...GRADE_11,
  ...GRADE_12,
];
