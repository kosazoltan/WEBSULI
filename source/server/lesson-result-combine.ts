/**
 * U4b — összevont eredménylevél: a kétrészes lecke (szöveges feladatok + kvíz) végleges részeredményeinek párosítása
 * (docs/specs/2026-11-24-osszevont-eredmenylevel.md, 6. pont; végrehajtás: U4b).
 *
 * Egy tranzakcióban, a (lecke, tulajdonos) párra vett tanácsadó zár alatt (`pg_advisory_xact_lock`) — a söprő (U4c) ugyanezt a
 * zárat veszi fel —, így két egyszerre, két példányon érkező első beküldésből sem maradhat mindkettő pár nélkül (sorzár nem elég:
 * üres várakozóállapotból nincs mit zárolni).
 *  - a kör (bármely tulajdonosnál) már párban szerepelt → `alreadySent`; ha a pár még nincs kézbesítve, a hívó újra kézbesíti
 *    (review #586: a párosítás a kézbesítés ELŐTT zár, a `delivered_at` csak a sikeres küldés után íródik);
 *  - van nyitott, 7 napnál fiatalabb másik rész → mindkét sor `pair` + közös `pair_key`, a hívó EGY összevont levelet küld;
 *  - különben a rész nyitott sora → `awaiting`. Az újabb kör felülírja a régit, a régebbi (kezdési idő szerint) ismétlés nem.
 */
import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "./db";
import type { GradedQuiz, GradedTasks } from "../shared/lesson-result-email";

/** Az U4b–U4d alatt alapból KI (élesben is); csak az explicit „on” kapcsol be. Az élesítés az U4e szelet. */
export const resultCombinedEmailEnabled = (env: NodeJS.ProcessEnv = process.env) => env.RESULT_COMBINED_EMAIL?.trim().toLowerCase() === "on";

/** Kétrészes lecke: van szöveges feladata ÉS kvíze is (egyrészes leckénél a régi út változatlan). */
export const isTwoPartExperience = (experience: { tasks: readonly unknown[]; quiz: readonly unknown[] } | undefined) =>
  !!experience && experience.tasks.length > 0 && experience.quiz.length > 0;

/** A pár félretételi határa (a spec 7 napja): ennél régebbi nyitott rész nem párosul, azt a söprő jelölt részleges levélként küldi. */
export const PAIR_WINDOW_DAYS = 7;

/** A pár kulcsa a tulajdonossal együtt (review #586: két tanuló azonos kör-azonosítói sem ütközhetnek a levélnaplóban). */
export const pairKeyOf = (ownerKey: string, tasksRound: string, quizRound: string) =>
  createHash("sha256").update(["combined", ownerKey, tasksRound, quizRound].join("|")).digest("hex");

export type PendingLearner = { learner: string; learnerFirst?: string; learnerId?: string; guest: boolean };
export type PairedParts = { tasks: GradedTasks; quiz: GradedQuiz; tasksRound: string; quizRound: string; pairKey: string;
  /** Részenként a saját tanulói metaadat (review #586: a profilazonosító egyik részről sem vész el). */
  tasksLearner: PendingLearner; quizLearner: PendingLearner };
export type PairOutcome =
  | { type: "alreadySent"; redeliver: PairedParts | null }
  | { type: "parked"; awaiting: "tasks" | "quiz" }
  | ({ type: "paired" } & PairedParts);

type Row = { id: string; kind: "tasks" | "quiz"; round_id: string; graded: GradedTasks | GradedQuiz | null; learner: PendingLearner | null; pair_key: string | null; delivered_at: Date | null };

const startedOf = (g: GradedTasks | GradedQuiz | null | undefined) => (typeof g?.meta?.startedAt === "number" ? g.meta.startedAt : null);

function partsOf(rows: Row[]): PairedParts | null {
  const t = rows.find(r => r.kind === "tasks");
  const q = rows.find(r => r.kind === "quiz");
  if (!t?.graded || !q?.graded || !t.learner || !q.learner || !t.pair_key) return null;
  return { tasks: t.graded as GradedTasks, quiz: q.graded as GradedQuiz, tasksRound: t.round_id, quizRound: q.round_id, pairKey: t.pair_key, tasksLearner: t.learner, quizLearner: q.learner };
}

export async function pairOrPark(input: { lessonId: string; ownerKey: string; kind: "tasks" | "quiz"; roundId: string; graded: GradedTasks | GradedQuiz; learner: PendingLearner }): Promise<PairOutcome> {
  const { lessonId, ownerKey, kind, roundId } = input;
  const other = kind === "tasks" ? "quiz" : "tasks";
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${lessonId}|${ownerKey}`}))`);
    // Review #586: a felhasznált kör TULAJDONOSTÓL FÜGGETLENÜL felhasznált (a fiókos gyakorlókör vendégként újraküldve sem képez új párt).
    const used = (await tx.execute(sql`SELECT pair_key FROM lesson_result_pending WHERE lesson_id = ${lessonId} AND kind = ${kind}
      AND round_id = ${roundId} AND sent_at IS NOT NULL LIMIT 1`)).rows as Array<{ pair_key: string | null }>;
    if (used.length) {
      const key = used[0].pair_key;
      const pair = key ? (await tx.execute(sql`SELECT id, kind, round_id, graded, learner, pair_key, delivered_at FROM lesson_result_pending
        WHERE pair_key = ${key}`)).rows as Row[] : [];
      const undelivered = pair.length === 2 && pair.every(r => r.delivered_at === null);
      return { type: "alreadySent", redeliver: undelivered ? partsOf(pair) : null } as const;
    }
    const mine = (await tx.execute(sql`SELECT id, graded FROM lesson_result_pending WHERE lesson_id = ${lessonId} AND owner_key = ${ownerKey}
      AND kind = ${kind} AND sent_at IS NULL FOR UPDATE`)).rows as Array<{ id: string; graded: GradedTasks | GradedQuiz | null }>;
    // Review #586: a régebbi kör (kezdési idő szerint) ismétlése nem írja felül az újabb félretett kört.
    const newStart = startedOf(input.graded);
    const heldStart = startedOf(mine[0]?.graded);
    if (mine.length && newStart !== null && heldStart !== null && newStart < heldStart) return { type: "parked", awaiting: other } as const;
    const mate = (await tx.execute(sql`SELECT id, kind, round_id, graded, learner, pair_key, delivered_at FROM lesson_result_pending
      WHERE lesson_id = ${lessonId} AND owner_key = ${ownerKey} AND kind = ${other} AND sent_at IS NULL
      AND created_at > now() - make_interval(days => ${PAIR_WINDOW_DAYS}) FOR UPDATE`)).rows as Row[];
    await tx.execute(sql`DELETE FROM lesson_result_pending WHERE lesson_id = ${lessonId} AND owner_key = ${ownerKey} AND kind = ${kind} AND sent_at IS NULL`);
    const graded = JSON.stringify(input.graded);
    const learner = JSON.stringify(input.learner);
    if (!mate.length) {
      await tx.execute(sql`INSERT INTO lesson_result_pending (lesson_id, owner_key, kind, round_id, graded, learner)
        VALUES (${lessonId}, ${ownerKey}, ${kind}, ${roundId}, ${graded}::jsonb, ${learner}::jsonb)`);
      return { type: "parked", awaiting: other } as const;
    }
    const [m] = mate;
    const tasksRound = kind === "tasks" ? roundId : m.round_id;
    const quizRound = kind === "quiz" ? roundId : m.round_id;
    const pairKey = pairKeyOf(ownerKey, tasksRound, quizRound);
    await tx.execute(sql`UPDATE lesson_result_pending SET sent_at = now(), sent_reason = 'pair', pair_key = ${pairKey} WHERE id = ${m.id}`);
    await tx.execute(sql`INSERT INTO lesson_result_pending (lesson_id, owner_key, kind, round_id, graded, learner, sent_at, sent_reason, pair_key)
      VALUES (${lessonId}, ${ownerKey}, ${kind}, ${roundId}, ${graded}::jsonb, ${learner}::jsonb, now(), 'pair', ${pairKey})`);
    const mateLearner = m.learner ?? input.learner;
    return kind === "tasks"
      ? { type: "paired", tasks: input.graded as GradedTasks, quiz: m.graded as GradedQuiz, tasksRound, quizRound, pairKey, tasksLearner: input.learner, quizLearner: mateLearner } as const
      : { type: "paired", tasks: m.graded as GradedTasks, quiz: input.graded as GradedQuiz, tasksRound, quizRound, pairKey, tasksLearner: mateLearner, quizLearner: input.learner } as const;
  });
}

/** A sikeres kézbesítés tartós nyoma (review #586): csak ezután számít a pár lezártnak. */
export async function markPairDelivered(pairKey: string): Promise<void> {
  await db.execute(sql`UPDATE lesson_result_pending SET delivered_at = now() WHERE pair_key = ${pairKey} AND delivered_at IS NULL`);
}

/**
 * Review #586 (kapcsoló-időszakok): ha a kapcsoló KI, a (lecke, tulajdonos) korábban — BE állásban — félretett nyitott részei nem
 * maradhatnak bent (egy későbbi BE állás alatt elavult párt képeznének): a régi út egyrészes levélként küldi őket. A hívó küld; ez
 * a függvény csak kiveszi és `timeout` jelöléssel lezárja őket.
 */
export async function takeParkedForLegacy(lessonId: string, ownerKey: string): Promise<Array<{ graded: GradedTasks | GradedQuiz; learner: PendingLearner; roundId: string }>> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${lessonId}|${ownerKey}`}))`);
    const rows = (await tx.execute(sql`UPDATE lesson_result_pending SET sent_at = now(), sent_reason = 'timeout', delivered_at = now()
      WHERE lesson_id = ${lessonId} AND owner_key = ${ownerKey} AND sent_at IS NULL RETURNING round_id, graded, learner`)).rows as Array<{ round_id: string; graded: GradedTasks | GradedQuiz; learner: PendingLearner }>;
    return rows.map(r => ({ graded: r.graded, learner: r.learner, roundId: r.round_id }));
  });
}
