import { createHash } from "node:crypto";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db";
import { coupons, gameQuizItems, lessons } from "../../shared/schema";
import { isPlayableQuestion } from "../../shared/game-quiz-contract";
import type { CouponQuizQuestion } from "../../shared/coupon-quiz";
import { canonicalLessonQuiz } from "../studio/canonical-quiz-bank";
import { remainingSeconds } from "./coupons";
import type { Learner } from "./store";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export class CouponQuizError extends Error {
  constructor(public status: number, public reason: string) { super("A játékbónusz most nem használható."); }
}
async function owned(tx: Tx, learner: Learner, id: string) {
  if (!learner.userId && !learner.fingerprint) throw new CouponQuizError(404, "not_found");
  const [row] = await tx.select().from(coupons).where(and(eq(coupons.id, id), learner.userId
    ? eq(coupons.userId, learner.userId) : and(isNull(coupons.userId), eq(coupons.fingerprint, learner.fingerprint!)))).for("update");
  if (!row) throw new CouponQuizError(404, "not_found");
  return row;
}
async function currentBank(tx: Tx, lessonId: string): Promise<CouponQuizQuestion[]> {
  const [lesson] = await tx.select().from(lessons).where(and(eq(lessons.id, lessonId), isNotNull(lessons.publishedAt))).for("share");
  if (!lesson) return [];
  const canonical = canonicalLessonQuiz(lesson);
  if (canonical !== null) return canonical;
  const rows = await tx.select().from(gameQuizItems).where(and(eq(gameQuizItems.lessonId, lessonId), eq(gameQuizItems.isActive, true))).for("share");
  return rows.filter(isPlayableQuestion).map(q => ({
    id: q.id, prompt: q.prompt, options: q.options, correctIndex: q.correctIndex, topic: q.topic,
    explanation: q.explanation, sourceMaterialId: q.sourceMaterialId, tier: q.tier,
    feedbackPerOption: q.options.map(() => q.explanation ?? ""),
    questionVersion: createHash("sha256").update(JSON.stringify([q.prompt, q.options, q.correctIndex, q.explanation, q.topic])).digest("hex"),
  }));
}
export async function startCouponQuiz(learner: Learner, id: string, now = new Date()) {
  return db.transaction(async tx => {
    const row = await owned(tx, learner, id);
    if (row.expiresAt <= now || remainingSeconds(row, now) <= 0) throw new CouponQuizError(400, "expired");
    // Existing active coupons get a snapshot once, without resetting their clock.
    const bank = row.quizSnapshot.length ? row.quizSnapshot : await currentBank(tx, row.lessonId);
    const [saved] = await tx.update(coupons).set({ serverStartedAt: row.serverStartedAt ?? now, quizSnapshot: bank, servedItems: bank.map(q => q.id) }).where(eq(coupons.id, id)).returning();
    return { couponId: id, remainingSeconds: remainingSeconds(saved, now) };
  });
}
export async function answerCouponQuiz(learner: Learner, id: string, questionId: string, pickedIndex: number, bonusSeconds: number, now = new Date()) {
  return db.transaction(async tx => {
    const row = await owned(tx, learner, id);
    if (!row.serverStartedAt || row.expiresAt <= now || remainingSeconds(row, now) <= 0) throw new CouponQuizError(400, "expired");
    const q = row.quizSnapshot.find(q => q.id === questionId);
    if (!q || !row.servedItems.includes(questionId)) throw new CouponQuizError(400, "not_served");
    if (!Number.isInteger(pickedIndex) || pickedIndex < -1 || pickedIndex >= q.options.length) throw new CouponQuizError(400, "invalid_answer");
    const previous = row.quizAnswers[questionId];
    if (previous) {
      if (previous.pickedIndex !== pickedIndex) throw new CouponQuizError(409, "first_answer_saved");
      return { ...previous, remainingSeconds: remainingSeconds(row, now) };
    }
    if (row.claimedItems.includes(questionId)) throw new CouponQuizError(409, "already_claimed");
    const current = (await currentBank(tx, row.lessonId)).find(item => item.id === questionId);
    if (!current || current.questionVersion !== q.questionVersion) throw new CouponQuizError(409, "bank_changed");
    const correct = pickedIndex === q.correctIndex;
    const answer = { pickedIndex, correct, bonusSeconds: correct ? bonusSeconds : 0, answeredAt: now.toISOString() };
    const [saved] = await tx.update(coupons).set({ quizAnswers: { ...row.quizAnswers, [questionId]: answer },
      claimedItems: [...row.claimedItems, questionId], bonusSeconds: row.bonusSeconds + answer.bonusSeconds }).where(eq(coupons.id, id)).returning();
    return { ...answer, remainingSeconds: remainingSeconds(saved, now) };
  });
}
