/**
 * Spec docs/specs/2026-10-20-s4-szigoritas-meres-lazitas.md (S4b + S4c): feladatszintű, NÉVTELEN tanulói eredmény és a gépi
 * rubrika-szigorítás (S3c) automatikus lazítása. Tulajdonosi döntés 2026-10-20: „Automatikus lazítás”; a jel a TÉVES ELUTASÍTÁS (a pontozó
 * csak a szigorított csoport hiánya miatt nem adott teljes pontot, a döntőbíró viszont teljes pontra emelte) — nem a részpont-arány, mert
 * a szigorítás épp a fordított irányú hibás választ hivatott elutasítani. Tanulói szöveget és felhasználót nem tárol.
 */
import { createHmac } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { htmlFiles, knowledgeMaps, lessons, taskResults } from "../shared/schema";
import { runToolWorkflow } from "./workflows/tool-run";
import { workflowFence, workflowPhase } from "./workflows/engine";
import { lessonSchema } from "../shared/lesson-schema";
import type { OpenTask } from "../shared/lesson-experience";
import { rubricHash, type GradedTaskRow } from "../shared/lesson-result-email";
import { logger } from "./lib/logger";

/**
 * A tulajdonos példája szerint: legalább 20 megválaszolt kör, és ezek legalább 40 %-a téves elutasítás — review #340 óta KÜLÖNBÖZŐ
 * közreműködőkre számolva (a `TightenedStats` darabszámai közreműködők).
 */
export const RELAX_MIN_ANSWERED = 20;
export const RELAX_FALSE_REJECT_RATE = 0.4;

export type TightenedStats = { answered: number; falseRejects: number };

/**
 * Tiszta döntés + átalakítás. Review #340 (P1): a szigorított csoport NEM kerül ki (a pontozó részpont-küszöbe a kötelezők fele — a
 * csoportszám csökkenése páros esetben 0,5 → 0 pontot adhatna), hanem HATÁSTALANÍTJUK: a csoportot kibővítjük az összes többi kötelező
 * csoport tagjaival. Így minden válasz találatszáma legalább a régi (a csoportszám változatlan) → a pont sehol nem csökken, és aki a többi
 * kötelező fogalmat eltalálja, a szigorított szó nélkül is teljes pontot kap. A `relaxedTightening` a pontos előállapotot is őrzi.
 * `null`: nincs teendő (küszöb alatt, már lazított, vagy nincs nem szigorított kötelező csoport, amellyel teljesülhetne).
 */
export function relaxTask(task: OpenTask, stats: TightenedStats, now: Date): OpenTask | null {
  if (!(task.tightened?.length || task.tightenedPhrases?.length) || task.relaxedTightening) return null;
  if (stats.answered < RELAX_MIN_ANSWERED || stats.falseRejects / stats.answered < RELAX_FALSE_REJECT_RATE) return null;
  const tightened = new Set((task.tightened ?? []).map((g) => JSON.stringify(g)));
  const others = task.required.filter((g) => !tightened.has(JSON.stringify(g)));
  if (!others.length) return null;
  const otherMembers = others.flat();
  const groups = task.required.filter((g) => tightened.has(JSON.stringify(g)));
  const required = task.required.map((g) => (tightened.has(JSON.stringify(g)) ? [...new Set([...g, ...otherMembers])] : g));
  // S5b: a szigorított kifejezéscsoport ugyanígy hatástalanítva — a többi kötelező fogalom egy-egy szava is alternatívája (egyszavas
  // kifejezés = pontos tokenegyezés), így a csoport találata legalább a régi, a pont nem csökken.
  const tightenedPhrases = new Set((task.tightenedPhrases ?? []).map((g) => JSON.stringify(g)));
  const phraseGroups = (task.requiredPhrases ?? []).filter((g) => tightenedPhrases.has(JSON.stringify(g)));
  const requiredPhrases = task.requiredPhrases?.map((g) => (tightenedPhrases.has(JSON.stringify(g)) ? [...new Set([...g, ...otherMembers])] : g));
  const { tightened: _dropped, tightenedPhrases: _droppedPhrases, ...rest } = task;
  return { ...rest, required, ...(requiredPhrases ? { requiredPhrases } : {}), relaxedTightening: { at: now.toISOString(), answered: stats.answered, falseRejects: stats.falseRejects,
    previousRequired: task.required.map((g) => [...g]), ...(groups.length ? { groups: groups.map((g) => [...g]) } : {}),
    ...(phraseGroups.length ? { previousRequiredPhrases: task.requiredPhrases!.map((g) => [...g]), phraseGroups: phraseGroups.map((g) => [...g]) } : {}) } };
}

/**
 * Review #340 (P1): álnevesített közreműködő-kulcs — kulcsolt HMAC (SESSION_SECRET), így a táblában nincs visszafejthető azonosító. A hívó
 * adja a szerver által ismert identitást (felhasználó / párosított tanuló / vendégnél az IP), NEM a kliens által választott ujjlenyomatot.
 */
export function contributorKey(identity: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET || "websuli-task-results").update(`task-results|${identity}`).digest("hex");
}

/** S4b: a kör feladatonkénti sora (csak megválaszolt feladat); az azonos kör újraküldése nem duplikál. */
export async function recordTaskResults(lessonId: string, roundKey: string, contributor: string, rows: readonly GradedTaskRow[]): Promise<number> {
  const values = rows.filter((r) => r.answer).map((r) => ({
    lessonId, taskId: r.taskId.slice(0, 64), roundKey, contributor, rubricHash: r.rubricHash, detState: r.detState, finalState: r.state, arbiterRaised: r.arbiterRaised, tightenedOnlyMiss: r.tightenedOnlyMiss,
  }));
  if (!values.length) return 0;
  const inserted = await db.insert(taskResults).values(values).onConflictDoNothing().returning({ id: taskResults.id });
  return inserted.length;
}

/**
 * S4c: a lecke szigorított feladataira a küszöb ellenőrzése. Élő lecke gépi módosítása — S7 (`tests/s7-workflow-guard.test.ts`): csak
 * workflow alatt (`relax` mód: forrás → kapu → alkalmazás → visszaolvasás), sorzárral és a workflow-kerítéssel a tranzakció elején ÉS
 * végén, az újraolvasott leckén. A statisztika csak az AKTUÁLIS rubrikára (`rubric_hash`) és közreműködőnként számol (review #340). A futás
 * tulajdonosa a lecke gyártója (a tudástár-térkép `createdBy`-ja, különben az anyag tulajdonosa); ha nincs, nem lazít (napló).
 * A lazított feladatok azonosítója.
 */
export async function maybeRelaxTightening(lessonId: string, taskIds: readonly string[], now = new Date()): Promise<string[]> {
  if (!taskIds.length) return [];
  const [current] = await db.select({ json: lessons.json, htmlFileId: lessons.htmlFileId, mapOwner: knowledgeMaps.createdBy, fileOwner: htmlFiles.userId })
    .from(lessons).leftJoin(knowledgeMaps, eq(lessons.mapId, knowledgeMaps.id)).leftJoin(htmlFiles, eq(lessons.htmlFileId, htmlFiles.id)).where(eq(lessons.id, lessonId));
  const parsed = current ? lessonSchema.safeParse(current.json) : null;
  if (!current || !parsed?.success || !parsed.data.experience) return [];
  const candidates = parsed.data.experience.tasks.filter((t) => taskIds.includes(t.id) && (t.tightened?.length || t.tightenedPhrases?.length) && !t.relaxedTightening);
  if (!candidates.length) return [];
  const hashes = new Map(candidates.map((t) => [t.id, rubricHash(t)]));
  const stats = new Map<string, TightenedStats>();
  for (const t of candidates) {
    // Review #340: csak az AKTUÁLIS rubrikára adott eredmények, közreműködőnként egyszer (egy kliens tetszőleges kör-azonosítókkal sem
    // érheti el egyedül a küszöböt).
    const [c] = await db.select({
      answered: sql<number>`count(distinct ${taskResults.contributor})::int`,
      falseRejects: sql<number>`(count(distinct ${taskResults.contributor}) filter (where ${taskResults.tightenedOnlyMiss} and ${taskResults.arbiterRaised} and ${taskResults.finalState} = 'ok'))::int`,
    }).from(taskResults).where(and(eq(taskResults.lessonId, lessonId), eq(taskResults.taskId, t.id), eq(taskResults.rubricHash, hashes.get(t.id)!)));
    if (c) stats.set(t.id, { answered: Number(c.answered), falseRejects: Number(c.falseRejects) });
  }
  const relaxAll = (json: unknown) => {
    const fresh = lessonSchema.safeParse(json);
    if (!fresh.success || !fresh.data.experience) return null;
    const relaxed: string[] = [];
    const tasks = fresh.data.experience.tasks.map((t) => {
      const st = stats.get(t.id);
      // A zár alatt is: a statisztika ugyanahhoz a rubrikához tartozik-e, amelyet most olvastunk.
      if (!st || rubricHash(t) !== hashes.get(t.id)) return t;
      const next = relaxTask(t, st, now);
      if (next) relaxed.push(t.id);
      return next ?? t;
    });
    return { relaxed, json: { ...fresh.data, experience: { ...fresh.data.experience, tasks } } };
  };
  const plan = relaxAll(current.json);
  if (!plan?.relaxed.length) return [];
  const ownerId = current.mapOwner ?? current.fileOwner;
  if (!ownerId) { logger.warn(`[S4c] a lazítás esedékes, de a leckének nincs gyártója (workflow-tulajdonos) — kihagyva (${lessonId}: ${plan.relaxed.join(", ")})`); return []; }
  const resultId = current.htmlFileId ?? lessonId;
  return runToolWorkflow({ mode: "relax", owner: ownerId, request: { lessonId, taskIds: plan.relaxed } }, async () => {
    await workflowPhase("source");
    await workflowPhase("gate");
    if (!lessonSchema.safeParse(plan.json).success) throw new Error(`[S4c] a lazított lecke nem érvényes (${lessonId}) — a futás megáll, a lecke változatlan.`);
    await workflowPhase("apply");
    const applied = await db.transaction(async (tx) => {
      await workflowFence(tx);
      const [row] = await tx.select({ json: lessons.json, version: lessons.version }).from(lessons).where(eq(lessons.id, lessonId)).for("update");
      if (!row) throw new Error(`[S4c] a lecke már nem létezik (${lessonId}) — nincs lazítás.`);
      // Párhuzamos beküldés: a zárolt, friss leckén újra eldöntve (a már lazított feladat nem változik másodszor).
      const fresh = relaxAll(row.json);
      if (!fresh || !lessonSchema.safeParse(fresh.json).success) throw new Error(`[S4c] a friss lecke nem lazítható érvényesen (${lessonId}).`);
      if (fresh.relaxed.length) await tx.update(lessons).set({ json: fresh.json as never, version: row.version + 1, updatedAt: now }).where(eq(lessons.id, lessonId));
      // Review #340: a kerítés a tranzakcióból visszatérés előtt is (lejárt engedélynél a módosítás visszagördül).
      await workflowFence(tx);
      return { relaxed: fresh.relaxed, version: fresh.relaxed.length ? row.version + 1 : row.version };
    });
    await workflowPhase("readback");
    // Review #340: valódi visszaolvasás — a mentett verzió és a lazított feladatok nyoma (a párhuzamosan már lazított is igazolt).
    const [saved] = await db.select({ json: lessons.json, version: lessons.version }).from(lessons).where(eq(lessons.id, lessonId));
    const savedLesson = saved ? lessonSchema.safeParse(saved.json) : null;
    const isRelaxed = (id: string) => Boolean(savedLesson?.success && savedLesson.data.experience?.tasks.some((t) => t.id === id && t.relaxedTightening && !t.tightened && !t.tightenedPhrases));
    if (!saved || saved.version < applied.version || !plan.relaxed.every(isRelaxed)) throw new Error(`[S4c] a visszaolvasás nem igazolja a lazítást (${lessonId}).`);
    if (applied.relaxed.length) logger.info(`[S4c] gépi szigorítás automatikusan lazítva (${lessonId}): ${applied.relaxed.map((id) => `${id} ${stats.get(id)!.falseRejects}/${stats.get(id)!.answered}`).join(", ")}`);
    return { value: applied.relaxed, result: { kind: "material" as const, id: resultId } };
  });
}
