/**
 * Tételgyár T7.1: `POST /api/lessons/arbiter` — nyilvános, anonim; munkamenet-jogosultságot nem használ, ezért CSRF helyett origin-allowlist
 * és saját IP-korlát őrzi (server/routes.ts, server/index.ts). A feladatot (rubrikát) MINDIG a szerver tölti a publikált leckéből / a HTML-bankból;
 * a kliens csak a választ küldi.
 */
import express, { type Request, type Response } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { arbiterVerdicts, htmlFiles, lessons } from "../../shared/schema";
import { lessonSchema } from "../../shared/lesson-schema";
import { readHtmlLessonData } from "../../shared/lesson-html-data";
import type { OpenTask } from "../../shared/lesson-experience";
import { createStudioStepProvider, studioModelReady } from "../ai/studio-provider";
import { callStepModel } from "../studio/run-step";
import { teachingTextOf } from "../studio/experience-builder";
import { withSupportSkill } from "../studio/support-skills";
import { logger } from "../lib/logger";
import { ARBITER_ANSWER_MAX, ARBITER_DAILY_LIMIT, ARBITER_FALLBACK_MODEL, ARBITER_MODEL, parseArbiterVerdict } from "./arbiter";
import { judgeOpenAnswer, type ArbiterDeps } from "./service";

export const arbiterBodySchema = z.object({
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("lesson"), htmlFileId: z.string().min(1).max(64) }),
    z.object({ kind: z.literal("html"), materialId: z.string().min(1).max(64) }),
  ]),
  taskId: z.string().min(1).max(64),
  // A kliens oldali mező 4000/10000 karakteres; a szolgáltatóhoz a kitakarás után legfeljebb ARBITER_ANSWER_MAX megy.
  answer: z.string().max(10_000),
});
export type ArbiterBody = z.infer<typeof arbiterBodySchema>;

/** A feladat és a tanítás részlete a szerver saját adatából; `null` = nincs ilyen publikált lecke / feladat. */
export async function loadArbiterTask(source: ArbiterBody["source"], taskId: string): Promise<{ task: OpenTask; teaching: string } | null> {
  if (source.kind === "lesson") {
    const [row] = await db.select({ json: lessons.json, publishedAt: lessons.publishedAt }).from(lessons)
      .where(eq(lessons.htmlFileId, source.htmlFileId)).orderBy(desc(lessons.version)).limit(1);
    if (!row?.publishedAt) return null;
    const parsed = lessonSchema.safeParse(row.json);
    const task = parsed.success ? parsed.data.experience?.tasks.find((t) => t.id === taskId) : undefined;
    if (!parsed.success || !task) return null;
    return { task, teaching: teachingTextOf(parsed.data.sections[task.sectionIndex]) };
  }
  const [file] = await db.select({ content: htmlFiles.content, contentType: htmlFiles.contentType }).from(htmlFiles).where(eq(htmlFiles.id, source.materialId)).limit(1);
  if (!file || file.contentType !== "html" || !file.content) return null;
  try {
    const task = readHtmlLessonData(file.content).experience.tasks.find((t) => t.id === taskId);
    return task ? { task, teaching: "" } : null;
  } catch { return null; }
}

/** Az éles függőségek: DB-gyorsítótár, atomi napi keret, GPT-6.1 Sol. */
export const liveArbiterDeps: ArbiterDeps = {
  async cacheGet(key) {
    const [row] = await db.select({ state: arbiterVerdicts.state, reason: arbiterVerdicts.reason }).from(arbiterVerdicts).where(eq(arbiterVerdicts.cacheKey, key)).limit(1);
    return row && (row.state === "ok" || row.state === "partial" || row.state === "fail") ? { state: row.state, reason: row.reason } : null;
  },
  async cachePut(key, verdict) {
    await db.insert(arbiterVerdicts).values({ cacheKey: key, state: verdict.state, score: verdict.state === "ok" ? 1 : verdict.state === "partial" ? 0.5 : 0, reason: verdict.reason, model: verdict.model ?? ARBITER_MODEL })
      .onConflictDoNothing();
  },
  async reserveDailyCall() {
    const { rows } = await db.execute(sql`INSERT INTO arbiter_daily_usage (day, calls) VALUES (CURRENT_DATE, 1)
      ON CONFLICT (day) DO UPDATE SET calls = arbiter_daily_usage.calls + 1 WHERE arbiter_daily_usage.calls < ${ARBITER_DAILY_LIMIT} RETURNING calls`);
    return (rows as unknown[]).length > 0;
  },
  async callModel(system, user) {
    // docs/specs/2026-10-16-egy-futas.md (C): Opus 5.5 medium, akadályoztatásakor GPT-6.1 Sol medium.
    return callArbiterModels(system, user, (model) => studioModelReady(model),
      async (model) => (await callStepModel(createStudioStepProvider(model, "arbiter"), { step: "lektor", policy: "arbiter", role: "arbiter", model, system: withSupportSkill("arbiter", system), user })).json,
      // Review #258 (P1): a tartalék második fizetett hívás — külön napi keretfoglalás; elfogyott keretnél nincs új hívás.
      () => liveArbiterDeps.reserveDailyCall());
  },
};

/**
 * Az elsődleges, majd a tartalék döntőbíró-modell; a ténylegesen válaszoló modell nevével. Review #258:
 * - a válasz a döntőbíró sémáján is át kell menjen (`parseArbiterVerdict`), különben a tartalék jön;
 * - a második (tartalék) fizetett hívás előtt külön napi keretfoglalás (`reserveExtra`) — elfogyott keretnél nincs hívás.
 * Ha egyik sem ad érvényes ítéletet, a hiba továbbmegy (a hívó a determinisztikus ítéletet tartja meg).
 */
export async function callArbiterModels(system: string, user: string, ready: (model: string) => boolean, call: (model: string) => Promise<unknown>, reserveExtra?: () => Promise<boolean>): Promise<{ json: unknown; model: string }> {
  let last: unknown = new Error("A döntőbíró modellje nincs beállítva.");
  let attempted = 0;
  for (const model of [ARBITER_MODEL, ARBITER_FALLBACK_MODEL]) {
    if (!ready(model)) continue;
    if (attempted > 0 && reserveExtra && !(await reserveExtra())) { logger.warn("[DÖNTŐBÍRÓ] A napi keret elfogyott — a tartalék nem hívódik."); break; }
    attempted++;
    try {
      const json = await call(model);
      if (!parseArbiterVerdict(json)) throw new Error("a válasz nem felel meg a döntőbíró sémájának");
      return { json, model };
    } catch (error) { last = error; logger.warn(`[DÖNTŐBÍRÓ] ${model} nem adott érvényes ítéletet: ${error instanceof Error ? error.message.slice(0, 160) : "ismeretlen"}`); }
  }
  throw last;
}

export function createArbiterRouter(deps: { load: typeof loadArbiterTask; arbiter: ArbiterDeps } = { load: loadArbiterTask, arbiter: liveArbiterDeps }) {
  const router = express.Router();
  router.post("/arbiter", async (req: Request, res: Response) => {
    const body = arbiterBodySchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Hibás kérés." });
    try {
      const loaded = await deps.load(body.data.source, body.data.taskId);
      if (!loaded) return res.status(404).json({ message: "A feladat nem található." });
      const judged = await judgeOpenAnswer({ ...loaded, answer: body.data.answer.slice(0, ARBITER_ANSWER_MAX * 4) }, deps.arbiter);
      return res.json(judged);
    } catch (error) {
      logger.error(`[DÖNTŐBÍRÓ] A kérés feldolgozása nem sikerült: ${error instanceof Error ? error.message.slice(0, 160) : "ismeretlen"}`);
      return res.status(500).json({ message: "A döntőbíró most nem érhető el." });
    }
  });
  return router;
}
