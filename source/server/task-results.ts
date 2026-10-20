/**
 * Spec docs/specs/2026-10-20-s4-szigoritas-meres-lazitas.md (S4b + S4c): feladatszintű, NÉVTELEN tanulói eredmény és a gépi
 * rubrika-szigorítás (S3c) automatikus lazítása. Tulajdonosi döntés 2026-10-20: „Automatikus lazítás”; a jel a TÉVES ELUTASÍTÁS (a pontozó
 * csak a szigorított csoport hiánya miatt nem adott teljes pontot, a döntőbíró viszont teljes pontra emelte) — nem a részpont-arány, mert
 * a szigorítás épp a fordított irányú hibás választ hivatott elutasítani. Tanulói szöveget és felhasználót nem tárol.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { htmlFiles, knowledgeMaps, lessons, taskResults } from "../shared/schema";
import { runToolWorkflow } from "./workflows/tool-run";
import { workflowFence, workflowPhase } from "./workflows/engine";
import { lessonSchema } from "../shared/lesson-schema";
import type { OpenTask } from "../shared/lesson-experience";
import type { GradedTaskRow } from "../shared/lesson-result-email";
import { logger } from "./lib/logger";

/** A tulajdonos példája szerint: legalább 20 megválaszolt kör, és ezek legalább 40 %-a téves elutasítás. */
export const RELAX_MIN_ANSWERED = 20;
export const RELAX_FALSE_REJECT_RATE = 0.4;

export type TightenedStats = { answered: number; falseRejects: number };

/**
 * Tiszta döntés + átalakítás: a küszöb fölött a szigorított csoportok a `required`-ből a `bonus`-ba kerülnek (legalább 1 kötelező
 * csoport marad), a `tightened` törlődik, a `relaxedTightening` rögzíti a döntés alapját. `null`: nincs teendő.
 */
export function relaxTask(task: OpenTask, stats: TightenedStats, now: Date): OpenTask | null {
  if (!task.tightened?.length || task.relaxedTightening) return null;
  if (stats.answered < RELAX_MIN_ANSWERED || stats.falseRejects / stats.answered < RELAX_FALSE_REJECT_RATE) return null;
  const tightened = new Set(task.tightened.map((g) => JSON.stringify(g)));
  const moved = task.required.filter((g) => tightened.has(JSON.stringify(g)));
  let required = task.required.filter((g) => !tightened.has(JSON.stringify(g)));
  // Legalább 1 kötelező csoport marad (a séma is ezt kívánja): ha minden kötelező szigorított volt, az első marad.
  if (!required.length && moved.length) required = [moved.shift()!];
  const { tightened: _dropped, ...rest } = task;
  return { ...rest, required, bonus: [...task.bonus, ...moved], relaxedTightening: { at: now.toISOString(), answered: stats.answered, falseRejects: stats.falseRejects } };
}

/** S4b: a kör feladatonkénti sora (csak megválaszolt feladat); az azonos kör újraküldése nem duplikál. */
export async function recordTaskResults(lessonId: string, roundKey: string, rows: readonly GradedTaskRow[]): Promise<number> {
  const values = rows.filter((r) => r.answer).map((r) => ({
    lessonId, taskId: r.taskId.slice(0, 64), roundKey, detState: r.detState, finalState: r.state, arbiterRaised: r.arbiterRaised, tightenedOnlyMiss: r.tightenedOnlyMiss,
  }));
  if (!values.length) return 0;
  const inserted = await db.insert(taskResults).values(values).onConflictDoNothing().returning({ id: taskResults.id });
  return inserted.length;
}

/**
 * S4c: a lecke szigorított feladataira a küszöb ellenőrzése. Élő lecke gépi módosítása — S7 (`tests/s7-workflow-guard.test.ts`): csak
 * workflow alatt (`relax` mód: forrás → kapu → alkalmazás → visszaolvasás), sorzárral, a workflow-kerítéssel, az újraolvasott leckén.
 * A futás tulajdonosa a lecke gyártója (a tudástár-térkép `createdBy`-ja, különben az anyag tulajdonosa); ha nincs, nem lazít (napló).
 * A lazított feladatok azonosítója.
 */
export async function maybeRelaxTightening(lessonId: string, taskIds: readonly string[], now = new Date()): Promise<string[]> {
  if (!taskIds.length) return [];
  const counts = await db.select({
    taskId: taskResults.taskId,
    answered: sql<number>`count(*)::int`,
    falseRejects: sql<number>`(count(*) filter (where ${taskResults.tightenedOnlyMiss} and ${taskResults.arbiterRaised} and ${taskResults.finalState} = 'ok'))::int`,
  }).from(taskResults).where(and(eq(taskResults.lessonId, lessonId), inArray(taskResults.taskId, [...taskIds]))).groupBy(taskResults.taskId);
  const stats = new Map(counts.map((c) => [c.taskId, { answered: Number(c.answered), falseRejects: Number(c.falseRejects) }]));
  const due = [...stats].filter(([, s]) => s.answered >= RELAX_MIN_ANSWERED && s.falseRejects / s.answered >= RELAX_FALSE_REJECT_RATE).map(([id]) => id);
  if (!due.length) return [];
  const [owner] = await db.select({ mapOwner: knowledgeMaps.createdBy, fileOwner: htmlFiles.userId, htmlFileId: lessons.htmlFileId }).from(lessons)
    .leftJoin(knowledgeMaps, eq(lessons.mapId, knowledgeMaps.id)).leftJoin(htmlFiles, eq(lessons.htmlFileId, htmlFiles.id)).where(eq(lessons.id, lessonId));
  const ownerId = owner?.mapOwner ?? owner?.fileOwner;
  if (!ownerId) { logger.warn(`[S4c] a lazítás esedékes, de a leckének nincs gyártója (workflow-tulajdonos) — kihagyva (${lessonId}: ${due.join(", ")})`); return []; }
  const relax = (json: unknown) => {
    const parsed = lessonSchema.safeParse(json);
    if (!parsed.success || !parsed.data.experience) return null;
    const relaxed: string[] = [];
    const tasks = parsed.data.experience.tasks.map((t) => {
      if (!due.includes(t.id)) return t;
      const next = relaxTask(t, stats.get(t.id)!, now);
      if (next) relaxed.push(t.id);
      return next ?? t;
    });
    return { relaxed, json: { ...parsed.data, experience: { ...parsed.data.experience, tasks } } };
  };
  // Nincs teendő (már lazított / érvénytelen) → nincs workflow-futás sem (a motor minden futást visszaolvasással zár).
  const [current] = await db.select({ json: lessons.json }).from(lessons).where(eq(lessons.id, lessonId));
  const plan = current ? relax(current.json) : null;
  if (!plan?.relaxed.length) return [];
  const resultId = owner?.htmlFileId ?? lessonId;
  return runToolWorkflow({ mode: "relax", owner: ownerId, request: { lessonId, taskIds: plan.relaxed } }, async () => {
    await workflowPhase("source");
    await workflowPhase("gate");
    if (!lessonSchema.safeParse(plan.json).success) throw new Error(`[S4c] a lazított lecke nem érvényes (${lessonId}) — a futás megáll, a lecke változatlan.`);
    await workflowPhase("apply");
    const relaxed = await db.transaction(async (tx) => {
      await workflowFence(tx);
      // Párhuzamos beküldés: a zárolt, friss leckén újra eldöntve (a már lazított feladat nem változik másodszor).
      const [row] = await tx.select({ json: lessons.json, version: lessons.version }).from(lessons).where(eq(lessons.id, lessonId)).for("update");
      const fresh = row ? relax(row.json) : null;
      if (!row || !fresh?.relaxed.length || !lessonSchema.safeParse(fresh.json).success) return [];
      await tx.update(lessons).set({ json: fresh.json as never, version: row.version + 1, updatedAt: now }).where(eq(lessons.id, lessonId));
      return fresh.relaxed;
    });
    await workflowPhase("readback");
    if (relaxed.length) logger.info(`[S4c] gépi szigorítás automatikusan lazítva (${lessonId}): ${relaxed.map((id) => `${id} ${stats.get(id)!.falseRejects}/${stats.get(id)!.answered}`).join(", ")}`);
    return { value: relaxed, result: { kind: "material" as const, id: resultId } };
  });
}
