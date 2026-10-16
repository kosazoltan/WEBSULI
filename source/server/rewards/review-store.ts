import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { lessons, reviewEvents, reviewStates } from "../../shared/schema";
import { lessonSchema } from "../../shared/lesson-schema";
import { lessonFlashcards } from "../../shared/lesson-flashcards";
import { nextReview, type ReviewRating, type ReviewState } from "../../shared/review-schedule";

/**
 * Websuli Design §3/§7 — a memóriakártya-értékelés valódi mentése (docs/specs/2026-10-16-websuli-ismetles.md).
 * Az új állapotot a szerver számolja a saját órájával; a kliens csak az értékelést küldi. Minden lekérdezés a tanulóra szűr.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export class ReviewError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type ReviewView = { states: Record<string, ReviewState> };

const stateOf = (row: typeof reviewStates.$inferSelect): ReviewState =>
  ({ intervalDays: row.intervalDays, repetitions: row.repetitions, dueAt: row.dueAt.toISOString() });

async function cardIdsOf(tx: Tx | typeof db, lessonId: string): Promise<Set<string>> {
  const [row] = await tx.select({ json: lessons.json }).from(lessons).where(and(eq(lessons.id, lessonId), isNotNull(lessons.publishedAt)));
  if (!row) throw new ReviewError(404, "Ez a lecke nem érhető el.");
  const parsed = lessonSchema.safeParse(row.json);
  if (!parsed.success) throw new ReviewError(404, "Ez a lecke nem érhető el.");
  return new Set(lessonFlashcards(parsed.data).map(c => c.id));
}

export async function readReview(userId: string, lessonId: string): Promise<ReviewView> {
  const ids = await cardIdsOf(db, lessonId);
  const rows = await db.select().from(reviewStates).where(and(eq(reviewStates.userId, userId), eq(reviewStates.lessonId, lessonId)));
  return { states: Object.fromEntries(rows.filter(r => ids.has(r.cardId)).map(r => [r.cardId, stateOf(r)])) };
}

export async function rateCard(userId: string, lessonId: string, cardId: string, rating: ReviewRating, now = new Date()): Promise<{ cardId: string; state: ReviewState }> {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["review", userId, lessonId])}, 0))`);
    if (!(await cardIdsOf(tx, lessonId)).has(cardId)) throw new ReviewError(400, "Ismeretlen kártya.");
    const [prev] = await tx.select().from(reviewStates).where(and(eq(reviewStates.userId, userId), eq(reviewStates.lessonId, lessonId), eq(reviewStates.cardId, cardId)));
    const state = nextReview(prev ? stateOf(prev) : null, rating, now);
    await tx.insert(reviewEvents).values({ userId, lessonId, cardId, rating, createdAt: now });
    const values = { intervalDays: state.intervalDays, repetitions: state.repetitions, dueAt: new Date(state.dueAt), updatedAt: now };
    await tx.insert(reviewStates).values({ userId, lessonId, cardId, ...values })
      .onConflictDoUpdate({ target: [reviewStates.userId, reviewStates.lessonId, reviewStates.cardId], set: values });
    return { cardId, state };
  });
}
