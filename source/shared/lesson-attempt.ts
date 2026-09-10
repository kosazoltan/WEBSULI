/** Server-owned choice practice. Oral self-check scores never enter this contract. */
export type AttemptQuestion = {
  id: string; questionId: string; questionVersion: string; prompt: string; options: string[];
  correctIndex: number; feedbackPerOption: string[]; coversConceptIds: string[];
};
export type AttemptAnswer = { pickedIndex: number; usedHint: boolean; correct: boolean; answeredAt: string };
export type AttemptResult = {
  score: number; correctCount: number; independentCorrect: number; total: number; weakConceptIds: string[];
  coupon: { id: string; minutes: number; expiresAt: string } | null; alreadyRewarded: boolean; minCorrectForCoupon: number;
};
export type PracticeView = {
  id: string; lessonId: string; bankVersion: string; startedAt: string; finishedAt: string | null;
  questions: Array<Omit<AttemptQuestion, "correctIndex" | "feedbackPerOption"> & { hintUsed: boolean; answer?: AttemptAnswer & { feedback: string } }>;
  result: AttemptResult | null;
};
export type QuestionReview = { at: number; correct: boolean; usedHint: boolean };
export const REVIEW_DAYS = [1, 3, 7, 14] as const;
const DAY = 86_400_000;
/** A transparent practice heuristic, not a validated memory model. New versions start fresh. */
export function reviewState(history: QuestionReview[]) {
  const ordered = [...history].sort((a, b) => a.at - b.at);
  let streak = 0;
  for (const item of ordered) streak = item.correct && !item.usedHint ? streak + 1 : 0;
  const latest = ordered.at(-1);
  const days = REVIEW_DAYS[Math.min(Math.max(streak - 1, 0), REVIEW_DAYS.length - 1)];
  return { latest, streak, dueAt: latest ? latest.at + days * DAY : 0 };
}
export function selectPracticeQuestions<T extends { id: string }>(bank: T[], count: number, history: Record<string, QuestionReview[]>, now: number): T[] {
  const ranked = bank.map((q, index) => {
    const { latest, dueAt } = reviewState(history[q.id] ?? []);
    const priority = !latest ? 0 : !latest.correct || latest.usedHint ? 1 : dueAt <= now ? 2 : 3;
    return { q, index, priority, at: latest?.at ?? 0 };
  });
  return ranked.sort((a, b) => a.priority - b.priority || a.at - b.at || a.index - b.index).slice(0, count).map(r => r.q);
}
