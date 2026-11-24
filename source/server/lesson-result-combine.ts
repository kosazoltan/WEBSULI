/**
 * U4b — összevont eredménylevél: a kétrészes lecke (szöveges feladatok + kvíz) végleges részeredményeinek párosítása
 * (docs/specs/2026-11-24-osszevont-eredmenylevel.md, 6. pont; végrehajtás: U4b).
 *
 * Egy tranzakcióban, a (lecke, tulajdonos) párra vett tanácsadó zár alatt (`pg_advisory_xact_lock`) — a söprő (U4c) ugyanezt a
 * zárat veszi fel —, így két egyszerre, két példányon érkező első beküldésből sem maradhat mindkettő pár nélkül (sorzár nem elég:
 * üres várakozóállapotból nincs mit zárolni).
 *  - a kör már elküldött párban szerepelt → `alreadySent` (a kör felhasználásának tartós nyoma, review #583);
 *  - van nyitott másik rész → mindkét sor `sent_at` + `pair`, a hívó EGY összevont levelet küld;
 *  - különben a rész nyitott sora (az újabb kör felülírja) → `awaiting` (a másik rész).
 */
import { sql } from "drizzle-orm";
import { db } from "./db";
import type { GradedQuiz, GradedTasks } from "../shared/lesson-result-email";

/** Az U4b–U4d alatt alapból KI (élesben is); csak az explicit „on” kapcsol be. Az élesítés az U4e szelet. */
export const resultCombinedEmailEnabled = (env: NodeJS.ProcessEnv = process.env) => env.RESULT_COMBINED_EMAIL?.trim().toLowerCase() === "on";

/** Kétrészes lecke: van szöveges feladata ÉS kvíze is (egyrészes leckénél a régi út változatlan). */
export const isTwoPartExperience = (experience: { tasks: readonly unknown[]; quiz: readonly unknown[] } | undefined) =>
  !!experience && experience.tasks.length > 0 && experience.quiz.length > 0;

export type PendingLearner = { learner: string; learnerFirst?: string; learnerId?: string; guest: boolean };
export type PairOutcome =
  | { type: "alreadySent" }
  | { type: "parked"; awaiting: "tasks" | "quiz" }
  | { type: "paired"; tasks: GradedTasks; quiz: GradedQuiz; tasksRound: string; quizRound: string; learner: PendingLearner };

type Row = { id: string; round_id: string; graded: GradedTasks | GradedQuiz };

export async function pairOrPark(input: { lessonId: string; ownerKey: string; kind: "tasks" | "quiz"; roundId: string; graded: GradedTasks | GradedQuiz; learner: PendingLearner }): Promise<PairOutcome> {
  const { lessonId, ownerKey, kind, roundId } = input;
  const other = kind === "tasks" ? "quiz" : "tasks";
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${lessonId}|${ownerKey}`}))`);
    const used = await tx.execute(sql`SELECT 1 FROM lesson_result_pending WHERE lesson_id = ${lessonId} AND owner_key = ${ownerKey}
      AND kind = ${kind} AND round_id = ${roundId} AND sent_at IS NOT NULL LIMIT 1`);
    if (used.rows.length) return { type: "alreadySent" } as const;
    const mate = (await tx.execute(sql`SELECT id, round_id, graded FROM lesson_result_pending WHERE lesson_id = ${lessonId}
      AND owner_key = ${ownerKey} AND kind = ${other} AND sent_at IS NULL FOR UPDATE`)).rows as Row[];
    await tx.execute(sql`DELETE FROM lesson_result_pending WHERE lesson_id = ${lessonId} AND owner_key = ${ownerKey} AND kind = ${kind} AND sent_at IS NULL`);
    const graded = JSON.stringify(input.graded);
    const learner = JSON.stringify(input.learner);
    if (!mate.length) {
      await tx.execute(sql`INSERT INTO lesson_result_pending (lesson_id, owner_key, kind, round_id, graded, learner)
        VALUES (${lessonId}, ${ownerKey}, ${kind}, ${roundId}, ${graded}::jsonb, ${learner}::jsonb)`);
      return { type: "parked", awaiting: other } as const;
    }
    const [m] = mate;
    await tx.execute(sql`UPDATE lesson_result_pending SET sent_at = now(), sent_reason = 'pair' WHERE id = ${m.id}`);
    await tx.execute(sql`INSERT INTO lesson_result_pending (lesson_id, owner_key, kind, round_id, graded, learner, sent_at, sent_reason)
      VALUES (${lessonId}, ${ownerKey}, ${kind}, ${roundId}, ${graded}::jsonb, ${learner}::jsonb, now(), 'pair')`);
    const mine = input.graded;
    return kind === "tasks"
      ? { type: "paired", tasks: mine as GradedTasks, quiz: m.graded as GradedQuiz, tasksRound: roundId, quizRound: m.round_id, learner: input.learner } as const
      : { type: "paired", tasks: m.graded as GradedTasks, quiz: mine as GradedQuiz, tasksRound: m.round_id, quizRound: roundId, learner: input.learner } as const;
  });
}
