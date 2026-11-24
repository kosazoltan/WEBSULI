/**
 * U4c — az összevont eredménylevél söprője (docs/specs/2026-11-24-osszevont-eredmenylevel-vegrehajtas.md, 3. pont; spec E4).
 * Induláskor és óránként, a RESULT_COMBINED_EMAIL kapcsolótól FÜGGETLENÜL (KI állásban is kiüríti a maradékot), E2E-ben nem.
 *  1. Lejárt rész: a 7 napnál régebbi nyitott sor → `sent (timeout)` a közös (lecke, tulajdonos) tanácsadó zár alatt, majd jelölt
 *     részleges levél. Két egyidejű söprésből csak az egyik foglalja le a sort (`WHERE sent_at IS NULL`).
 *  2. Kézbesítetlen pár / rész (10 percnél régebben elküldve, `delivered_at IS NULL`) → újrakézbesítés; a levélnapló és az
 *     idempotencia-kulcs miatt nincs dupla levél.
 *  3. Tartalom-törlés: a kézbesített sorok tanulói tartalma (graded / learner) NULL.
 */
import { sql } from "drizzle-orm";
import { db } from "./db";
import { logger } from "./lib/logger";
import { PAIR_WINDOW_DAYS, type PairedParts, type PendingLearner } from "./lesson-result-combine";
import { deliverCombined, deliverStoredPart, errorClass } from "./lesson-result-email";
import type { GradedQuiz, GradedTasks } from "../shared/lesson-result-email";

export const LESSON_RESULT_SWEEP_INTERVAL_MS = 60 * 60_000;
const REDELIVER_AFTER_MS = 10 * 60_000;
const DAY_MS = 86_400_000;

type Row = { id: string; lesson_id: string; owner_key: string; kind: "tasks" | "quiz"; round_id: string; graded: GradedTasks | GradedQuiz | null;
  learner: PendingLearner | null; pair_key: string | null; sent_reason: "pair" | "timeout" | null };
const COLS = sql`id, lesson_id, owner_key, kind, round_id, graded, learner, pair_key, sent_reason`;

export async function sweepPendingResults(opts: { now?: Date; limit?: number } = {}): Promise<{ expired: number; redelivered: number; scrubbed: number }> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 100;
  let expired = 0; let redelivered = 0;
  const cutoff = new Date(now.getTime() - PAIR_WINDOW_DAYS * DAY_MS);
  const due = (await db.execute(sql`SELECT id, lesson_id, owner_key FROM lesson_result_pending WHERE sent_at IS NULL AND created_at <= ${cutoff}
    ORDER BY created_at LIMIT ${limit}`)).rows as Array<{ id: string; lesson_id: string; owner_key: string }>;
  for (const d of due) {
    try {
      const claimed = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${d.lesson_id}|${d.owner_key}`}))`);
        return (await tx.execute(sql`UPDATE lesson_result_pending SET sent_at = now(), sent_reason = 'timeout',
          pair_key = encode(sha256(convert_to('timeout|' || owner_key || '|' || kind || '|' || round_id, 'UTF8')), 'hex')
          WHERE id = ${d.id} AND sent_at IS NULL RETURNING ${COLS}`)).rows as Row[];
      });
      if (claimed.length) { expired++; await deliverStoredPart(d.lesson_id, claimed[0]); }
    } catch (error) { logger.error(`[LESSON-RESULT] söprő: lejárt rész hiba: ${errorClass(error)}`); }
  }
  const stale = new Date(now.getTime() - REDELIVER_AFTER_MS);
  const undelivered = (await db.execute(sql`SELECT ${COLS} FROM lesson_result_pending WHERE sent_at IS NOT NULL AND delivered_at IS NULL
    AND sent_at <= ${stale} ORDER BY sent_at LIMIT ${limit}`)).rows as Row[];
  const seenPairs = new Set<string>();
  for (const row of undelivered) {
    try {
      if (row.sent_reason === "pair" && row.pair_key) {
        if (seenPairs.has(row.pair_key)) continue;
        seenPairs.add(row.pair_key);
        const pair = (await db.execute(sql`SELECT ${COLS} FROM lesson_result_pending WHERE pair_key = ${row.pair_key}`)).rows as Row[];
        const t = pair.find(r => r.kind === "tasks"); const q = pair.find(r => r.kind === "quiz");
        if (!t?.graded || !q?.graded || !t.learner || !q.learner) continue;
        const parts: PairedParts = { tasks: t.graded as GradedTasks, quiz: q.graded as GradedQuiz, tasksRound: t.round_id, quizRound: q.round_id,
          pairKey: row.pair_key, tasksLearner: t.learner, quizLearner: q.learner };
        await deliverCombined(row.lesson_id, parts, false);
        redelivered++;
      } else if (row.sent_reason === "timeout") {
        if (await deliverStoredPart(row.lesson_id, row)) redelivered++;
      }
    } catch (error) { logger.error(`[LESSON-RESULT] söprő: újrakézbesítés hiba: ${errorClass(error)}`); }
  }
  // Adatkímélés: a kézbesített sorok tanulói tartalma nem kell tovább (a kör felhasználtsága a kulcsokból látszik).
  const scrubbed = (await db.execute(sql`UPDATE lesson_result_pending SET graded = NULL, learner = NULL
    WHERE delivered_at IS NOT NULL AND (graded IS NOT NULL OR learner IS NOT NULL) RETURNING id`)).rows.length;
  return { expired, redelivered, scrubbed };
}

type Timers = { setInterval: (fn: () => void, ms: number) => { unref?: () => void }; setTimeout: (fn: () => void, ms: number) => { unref?: () => void } };

/** Induláskor (rövid késleltetéssel) és óránként; a hiba csak naplóz, a következő kör újrapróbál. */
export function startLessonResultSweeper(timers: Timers = globalThis): () => Promise<void> {
  const run = async () => {
    try {
      const r = await sweepPendingResults();
      if (r.expired || r.redelivered) logger.info(`[LESSON-RESULT] söprő: ${r.expired} lejárt rész, ${r.redelivered} pótlás`);
    } catch (error) { logger.error(`[LESSON-RESULT] söprő hiba: ${errorClass(error)}`); }
  };
  timers.setTimeout(() => { void run(); }, 30_000).unref?.();
  timers.setInterval(() => { void run(); }, LESSON_RESULT_SWEEP_INTERVAL_MS).unref?.();
  return run;
}
