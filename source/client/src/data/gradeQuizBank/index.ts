import type { GradeQuizItem } from "./types";

export * from "./types";

/**
 * Az összes évfolyam tételei. A `grade-03.ts … grade-12.ts` fájlok (tartalmi szelet) ide kerülnek be;
 * az alap-commit üres listával indul, hogy a bekötés tőle függetlenül készülhessen.
 */
export const GRADE_QUIZ_ITEMS: readonly GradeQuizItem[] = [];
