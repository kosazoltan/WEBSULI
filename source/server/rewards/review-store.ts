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

export async function rateCard(userId: string, lessonId: string, cardId: string, rating: ReviewRating, requestId: string, now = new Date()): Promise<{ cardId: string; state: ReviewState }> {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["review", userId, lessonId])}, 0))`);
    // Review #268: ha a mentés sikerült, de a válasz elveszett, az újrapróbálás az eredeti eredményt kapja, újabb léptetés nélkül.
    const [done] = await tx.select().from(reviewEvents).where(and(eq(reviewEvents.userId, userId), eq(reviewEvents.requestId, requestId)));
    if (done) {
      if (done.lessonId !== lessonId || done.cardId !== cardId || done.rating !== rating) throw new ReviewError(409, "Ez az értékelés már egy másik kártyához tartozik.");
      return { cardId, state: done.result };
    }
    // A kártya-azonosító a tartalomhoz kötött: a lecke javítása után a régi oldalról érkező értékelés elavult.
    if (!(await cardIdsOf(tx, lessonId)).has(cardId)) throw new ReviewError(409, "A lecke időközben frissült. Töltsd újra az oldalt!");
    const [prev] = await tx.select().from(reviewStates).where(and(eq(reviewStates.userId, userId), eq(reviewStates.lessonId, lessonId), eq(reviewStates.cardId, cardId)));
    const state = nextReview(prev ? stateOf(prev) : null, rating, now);
    await tx.insert(reviewEvents).values({ userId, lessonId, cardId, rating, requestId, result: state, createdAt: now });
    const values = { intervalDays: state.intervalDays, repetitions: state.repetitions, dueAt: new Date(state.dueAt), updatedAt: now };
    await tx.insert(reviewStates).values({ userId, lessonId, cardId, ...values })
      .onConflictDoUpdate({ target: [reviewStates.userId, reviewStates.lessonId, reviewStates.cardId], set: values });
    return { cardId, state };
  });
}
