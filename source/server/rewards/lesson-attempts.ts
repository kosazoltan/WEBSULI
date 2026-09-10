import { createHash } from "node:crypto";
import { and, desc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { conceptResults, coupons, lessonAttempts, lessons } from "../../shared/schema";
import { lessonSchema } from "../../shared/lesson-schema";
import { experienceRoundSizes } from "../../shared/lesson-experience";
import { selectPracticeQuestions, reviewState, type PracticeView, type AttemptResult, type QuestionReview } from "../../shared/lesson-attempt";
import { canonicalLessonQuiz } from "../studio/canonical-quiz-bank";
import { computeCoupon } from "../../shared/reward-policy";
import { loadRewardPolicy } from "./store";
import { expiryFor, SECTION_REWARD_COOLDOWN_MS } from "./coupons";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Attempt = typeof lessonAttempts.$inferSelect;
const DAY = 86_400_000;
export class PracticeError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function bankOf(tx: Tx, lessonId: string) {
  const [row] = await tx.select().from(lessons).where(and(eq(lessons.id, lessonId), isNotNull(lessons.publishedAt))).for("share");
  if (!row) throw new PracticeError(404, "Ez a lecke nem érhető el.");
  const parsed = lessonSchema.safeParse(row.json);
  const bank = canonicalLessonQuiz(row);
  if (!parsed.success || !parsed.data.experience || !bank?.length) throw new PracticeError(422, "A kérdésbank javítást igényel.");
  const version = createHash("sha256").update(JSON.stringify(bank.map(q => q.id).sort())).digest("hex");
  const earlyReader = parsed.data.classroom >= 1 && parsed.data.classroom <= 2;
  // Existing 75-item banks remain readable, but new server-owned rounds use the
  // current age-appropriate cap too; a legacy format is not a reason for 25 questions.
  return { bank, version, count: Math.min(bank.length, experienceRoundSizes(parsed.data.experience).quizRound, earlyReader ? 5 : 10) };
}
async function lockLearner(tx: Tx, userId: string, lessonId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["practice", userId, lessonId])}, 0))`);
}
function viewOf(row: Attempt): PracticeView {
  return {
    id: row.id, lessonId: row.lessonId, bankVersion: row.bankVersion, startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null, result: row.result,
    questions: row.questions.map(({ correctIndex: _correctIndex, feedbackPerOption, ...q }) => {
      const answer = row.answers[q.id];
      return { ...q, hintUsed: row.hints.includes(q.id), ...(answer ? { answer: { ...answer, feedback: feedbackPerOption[answer.pickedIndex] } } : {}) };
    }),
  };
}
function historyOf(rows: Attempt[]): Record<string, QuestionReview[]> {
  const history: Record<string, QuestionReview[]> = {};
  for (const row of rows) for (const q of row.questions) {
    const answer = row.answers[q.id];
    (history[q.id] ??= []).push({ at: row.finishedAt!.getTime(), correct: answer?.correct ?? false, usedHint: row.hints.includes(q.id) || (answer?.usedHint ?? false) });
  }
  return history;
}
export async function beginPractice(userId: string, lessonId: string, now = new Date()): Promise<PracticeView> {
  return db.transaction(async tx => {
    await lockLearner(tx, userId, lessonId);
    const { bank, version, count } = await bankOf(tx, lessonId);
    const [active] = await tx.select().from(lessonAttempts).where(and(eq(lessonAttempts.userId, userId), eq(lessonAttempts.lessonId, lessonId), eq(lessonAttempts.status, "active")));
    if (active && active.bankVersion === version && now.getTime() - active.startedAt.getTime() < DAY) return viewOf(active);
    if (active) await tx.update(lessonAttempts).set({ status: "superseded", finishedAt: now }).where(eq(lessonAttempts.id, active.id));
    const previous = await tx.select().from(lessonAttempts).where(and(eq(lessonAttempts.userId, userId), eq(lessonAttempts.lessonId, lessonId), eq(lessonAttempts.status, "completed"))).orderBy(desc(lessonAttempts.finishedAt)).limit(200);
    const questions = selectPracticeQuestions(bank, count, historyOf(previous), now.getTime()).map(q => ({
      id: q.id, questionId: q.questionId, questionVersion: q.questionVersion, prompt: q.prompt, options: q.options,
      correctIndex: q.correctIndex, feedbackPerOption: q.feedbackPerOption, coversConceptIds: q.coversConceptIds,
    }));
    const [row] = await tx.insert(lessonAttempts).values({ userId, lessonId, bankVersion: version, questions, startedAt: now }).returning();
    return viewOf(row);
  });
}
async function withAttempt<T>(userId: string, id: string, action: (tx: Tx, row: Attempt) => Promise<T>): Promise<T> {
  // Ownership is checked before revealing the lesson identity and checked again under lock.
  const [owner] = await db.select({ lessonId: lessonAttempts.lessonId }).from(lessonAttempts).where(and(eq(lessonAttempts.id, id), eq(lessonAttempts.userId, userId)));
  if (!owner) throw new PracticeError(404, "Ez a gyakorlókör nem érhető el.");
  return db.transaction(async tx => {
    await lockLearner(tx, userId, owner.lessonId);
    const [row] = await tx.select().from(lessonAttempts).where(and(eq(lessonAttempts.id, id), eq(lessonAttempts.userId, userId))).for("update");
    if (!row) throw new PracticeError(404, "Ez a gyakorlókör nem érhető el.");
    return action(tx, row);
  });
}
async function checkCurrent(tx: Tx, row: Attempt, now: Date) {
  if (row.status === "superseded" || (row.status === "active" && now.getTime() - row.startedAt.getTime() >= DAY)
    || (await bankOf(tx, row.lessonId)).version !== row.bankVersion) throw new PracticeError(409, "A lecke változott vagy a kör lejárt. Indíts új kört!");
}
export async function readPractice(userId: string, id: string, now = new Date()) {
  return withAttempt(userId, id, async (tx, row) => { await checkCurrent(tx, row, now); return viewOf(row); });
}
export async function answerPractice(userId: string, id: string, questionId: string, pickedIndex: number, usedHint: boolean, now = new Date()) {
  return withAttempt(userId, id, async (tx, row) => {
    await checkCurrent(tx, row, now);
    const q = row.questions.find(q => q.id === questionId);
    if (!q || !Number.isInteger(pickedIndex) || pickedIndex < 0 || pickedIndex >= q.options.length) throw new PracticeError(400, "Hibás kérdés vagy válasz.");
    const previous = row.answers[q.id];
    usedHint = usedHint || row.hints.includes(q.id);
    if (previous) {
      if (previous.pickedIndex !== pickedIndex || previous.usedHint !== usedHint) throw new PracticeError(409, "Az első válasz már mentve van.");
      return viewOf(row);
    }
    if (row.status !== "active") throw new PracticeError(409, "Ez a kör már lezárult.");
    const answers = { ...row.answers, [q.id]: { pickedIndex, usedHint, correct: pickedIndex === q.correctIndex, answeredAt: now.toISOString() } };
    const [saved] = await tx.update(lessonAttempts).set({ answers }).where(eq(lessonAttempts.id, row.id)).returning();
    return viewOf(saved);
  });
}
export async function markPracticeHint(userId: string, id: string, questionId: string, now = new Date()) {
  return withAttempt(userId, id, async (tx, row) => {
    await checkCurrent(tx, row, now);
    if (!row.questions.some(q => q.id === questionId)) throw new PracticeError(400, "Ismeretlen kérdés.");
    if (row.status !== "active" || row.answers[questionId] || row.hints.includes(questionId)) return viewOf(row);
    const [saved] = await tx.update(lessonAttempts).set({ hints: [...row.hints, questionId] }).where(eq(lessonAttempts.id, id)).returning();
    return viewOf(saved);
  });
}
export async function finishPractice(userId: string, id: string, now = new Date()) {
  const policy = await loadRewardPolicy();
  return withAttempt(userId, id, async (tx, row) => {
    await checkCurrent(tx, row, now);
    if (row.result) return viewOf(row);
    const correctCount = row.questions.filter(q => row.answers[q.id]?.correct).length;
    const independentCorrect = row.questions.filter(q => row.answers[q.id]?.correct && !row.answers[q.id].usedHint).length;
    const weakConceptIds = [...new Set(row.questions.filter(q => !row.answers[q.id]?.correct || row.answers[q.id].usedHint).flatMap(q => q.coversConceptIds))];
    const [recent] = await tx.select({ id: coupons.id }).from(coupons).where(and(eq(coupons.userId, userId), eq(coupons.lessonId, row.lessonId), eq(coupons.sectionIdx, -1), gt(coupons.issuedAt, new Date(now.getTime() - SECTION_REWARD_COOLDOWN_MS)))).limit(1);
    const score = Math.round(correctCount / row.questions.length * 100);
    const independentScore = independentCorrect / row.questions.length * 100;
    const earlierRewards = await tx.select({ reason: coupons.reason }).from(coupons).where(and(eq(coupons.userId, userId), eq(coupons.lessonId, row.lessonId), eq(coupons.sectionIdx, -1))).orderBy(desc(coupons.issuedAt)).limit(50);
    const firstGood = earlierRewards.findIndex(r => r.reason === "section_good");
    const streak = firstGood < 0 ? earlierRewards.length : firstGood;
    // A round is not the lesson-final exam. Existing policy thresholds/minimum remain authoritative.
    const grant = computeCoupon(policy, { streak }, { score: independentScore, correctCount: independentCorrect, isLessonFinal: false });
    const result: AttemptResult = { score, correctCount, independentCorrect, total: row.questions.length, weakConceptIds, coupon: null, alreadyRewarded: !!recent, minCorrectForCoupon: policy.minCorrectForCoupon };
    if (grant.minutes !== null && !recent) {
      const expiresAt = expiryFor(now, policy.couponTtlHours);
      const [coupon] = await tx.insert(coupons).values({ userId, lessonId: row.lessonId, sectionIdx: -1, minutes: grant.minutes, reason: independentScore >= policy.thresholds.perfect ? "section_perfect" : "section_good", issuedAt: now, expiresAt }).returning();
      result.coupon = { id: coupon.id, minutes: coupon.minutes, expiresAt: expiresAt.toISOString() };
    }
    const concepts = [...new Set(row.questions.flatMap(q => q.coversConceptIds))];
    if (concepts.length) await tx.insert(conceptResults).values(concepts.map(conceptId => ({ userId, lessonId: row.lessonId, conceptId, sectionIdx: -1, correct: !weakConceptIds.includes(conceptId), createdAt: now })));
    const [saved] = await tx.update(lessonAttempts).set({ status: "completed", result, finishedAt: now }).where(eq(lessonAttempts.id, id)).returning();
    return viewOf(saved);
  });
}
export async function practiceReport(lessonId: string, now = new Date()) {
  const rows = await db.select().from(lessonAttempts).where(and(eq(lessonAttempts.lessonId, lessonId), eq(lessonAttempts.status, "completed"))).orderBy(desc(lessonAttempts.finishedAt)).limit(1000);
  const questions = new Map<string, { id: string; prompt: string; concepts: string[]; attempts: number; wrong: number; hints: number }>();
  for (const row of rows) for (const q of row.questions) {
    const item = questions.get(q.id) ?? { id: q.id, prompt: q.prompt, concepts: q.coversConceptIds, attempts: 0, wrong: 0, hints: 0 };
    item.attempts++; if (!row.answers[q.id]?.correct) item.wrong++; if (row.hints.includes(q.id) || row.answers[q.id]?.usedHint) item.hints++;
    questions.set(q.id, item);
  }
  return { completedRounds: rows.length, limit: 1000, asOf: now.toISOString(), questions: [...questions.values()].sort((a, b) => b.wrong / b.attempts - a.wrong / a.attempts) };
}
export async function practiceReview(userId: string, lessonId: string, now = new Date()) {
  const rows = await db.select().from(lessonAttempts).where(and(eq(lessonAttempts.userId, userId), eq(lessonAttempts.lessonId, lessonId), eq(lessonAttempts.status, "completed"))).orderBy(desc(lessonAttempts.finishedAt)).limit(200);
  const history = historyOf(rows);
  return Object.entries(history).map(([id, events]) => { const state = reviewState(events); return { id, dueAt: new Date(state.dueAt).toISOString(), due: state.dueAt <= now.getTime(), streak: state.streak }; });
}
