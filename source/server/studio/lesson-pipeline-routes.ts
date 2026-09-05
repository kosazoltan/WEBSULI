import express, { type Request, type Response } from "express";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db";
import {
  conceptResults,
  gameQuizItems,
  gamesCatalog,
  lektorNotes,
  lessons,
  studioJobs,
} from "../../shared/schema";
import { isAuthenticatedAdmin } from "../auth";
import { logger } from "../lib/logger";
import { aggregateConceptResults } from "../rewards/aggregate";
import {
  advanceJob,
  approveOutline,
  fixConceptOnLesson,
  runPipelineStep,
  startJobFromMap,
} from "./step-runner";
import { exportQuizItemsFromChecks } from "./quiz-export";
import { callScopeModel, decideOneStepAction, inferScope, parseOneStepRequest } from "./one-step";
import { computeInputHash, type ExtractorFile } from "./extractor";
import { knowledgeMaps } from "../../shared/schema";
import { resolveStudioModel } from "../ai/models";

/**
 * LS-2c — the admin endpoints that drive the lesson pipeline.
 *
 * Mounted under /api/studio (admin-only, same guard as the KnowledgeMap routes).
 * Thin by design: the paid orchestration lives in step-runner.ts; these handlers
 * parse, drive the state machine one step at a time and report.
 *
 * Drive rule: after a successful step the job advances. A transition to `author`
 * without an admin-approved outline parks the job (`ok`, waiting); `lektor` and an
 * approved-outline `author` are automatic and keep running; the `gate` parks it
 * (the deterministic gate is a later slice). The loop is bounded — `nextStep`
 * hard-stops at the round limit regardless.
 */

export const lessonPipelineRouter = express.Router();

lessonPipelineRouter.use(isAuthenticatedAdmin);

const MAX_CHAIN = 8;

/** Run the current step and keep going while the transition is automatic. */
async function drive(jobId: string): Promise<void> {
  for (let i = 0; i < MAX_CHAIN; i++) {
    const outcome = await runPipelineStep(jobId);
    if (!outcome.ok) return; // failure/park already persisted by the runner

    const [job] = await db
      .select({ output: studioJobs.output })
      .from(studioJobs)
      .where(eq(studioJobs.id, jobId))
      .limit(1);
    const output = (job?.output ?? null) as Record<string, unknown> | null;

    const next = outcome.next;
    const auto =
      next.step === "animator" ||
      next.step === "lektor" ||
      (next.step === "author" && output?.approvedOutline !== undefined);

    await advanceJob(jobId, next, { status: auto ? "running" : "ok" });
    if (!auto) return;
  }

  // Bounded by construction (round limit), but never loop silently if that changes.
  logger.error(`[STUDIO] A pipeline-lánc túllépte a ${MAX_CHAIN} lépéses határt: ${jobId}`);
  await advanceJob(
    jobId,
    { step: "error", round: 0, reason: "A pipeline-lánc nem ért véget a lépés-határon belül." },
    { status: "ok" },
  );
}

const fromMapBody = z.object({
  subject: z.string().trim().min(1).max(120),
  classroom: z.number().int().min(0).max(12),
});

/**
 * POST /api/studio/lessons/one-step — LS-6 (#164): upload → map → lesson in one call.
 *
 * Reuses the exact same machinery as the two-step flow: runExtraction (hash-
 * idempotent, OCR included), startJobFromMap, drive(). The only new behaviour is
 * (a) scope inference on the cheap OCR model when subject/classroom is omitted,
 * and (b) outline auto-approval — which goes through approveOutline(), so the
 * mechanical coverage check still decides. The lektor gate is untouched.
 */
lessonPipelineRouter.post("/lessons/one-step", async (req: Request, res: Response) => {
  const parsed = parseOneStepRequest(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ message: "Hibás kérés.", issues: parsed.issues });
  }
  const { files, title } = parsed.data;

  // 1) Scope: given, or inferred from the sources on the cheap model.
  let scope = parsed.data.scope;
  let inferredTitle: string | undefined;
  if (!scope) {
    const inferred = await inferScope(files as ExtractorFile[], (f) =>
      callScopeModel(f, resolveStudioModel("ocr")),
    );
    if (!inferred.ok) {
      return res.status(422).json({
        message: `Nem sikerült felismerni a tantárgyat/osztályt (${inferred.reason}) — add meg kézzel.`,
      });
    }
    scope = inferred.scope;
    inferredTitle = inferred.title;
  }

  // 2) Map: reuse by content hash or extract now (same as /maps/extract).
  const inputHash = computeInputHash(files as ExtractorFile[], scope);
  const [existing] = await db
    .select({ id: knowledgeMaps.id })
    .from(knowledgeMaps)
    .where(eq(knowledgeMaps.inputHash, inputHash))
    .limit(1);

  let mapId: string;
  if (existing) {
    mapId = existing.id;
    logger.info(`[STUDIO/1STEP] Térkép gyorsítótárból: ${mapId}`);
  } else {
    const { runExtraction } = await import("./run-extraction");
    try {
      mapId = await runExtraction({
        files: files as ExtractorFile[],
        scope,
        title: title ?? inferredTitle,
        inputHash,
        userId: (req.user as { id?: string } | undefined)?.id,
      });
    } catch (error) {
      logger.error(
        `[STUDIO/1STEP] Kivonatolás hiba: ${error instanceof Error ? error.message : String(error)}`,
      );
      return res.status(502).json({ message: "A kivonatolás nem sikerült. Próbáld újra." });
    }
  }

  // 3) Lesson job on the freshly built map, driven with outline auto-approval.
  const started = await startJobFromMap(mapId, { subject: scope.subject, classroom: scope.classroom });
  if (!started.ok) return res.status(409).json({ message: started.reason, mapId });

  await driveOneStep(started.jobId);
  res.status(201).json({ jobId: started.jobId, mapId, scope });
});

/** drive() plus outline auto-approval; approveOutline re-validates coverage. */
async function driveOneStep(jobId: string): Promise<void> {
  for (let i = 0; i < MAX_CHAIN; i++) {
    await drive(jobId);

    const [job] = await db
      .select({ step: studioJobs.step, status: studioJobs.status, output: studioJobs.output })
      .from(studioJobs)
      .where(eq(studioJobs.id, jobId))
      .limit(1);
    if (!job) return;

    const action = decideOneStepAction({
      step: job.step,
      status: job.status,
      output: (job.output ?? null) as Record<string, unknown> | null,
    });
    if (action === "stop") return;
    if (action === "approve") {
      const outline = (job.output as { outline?: unknown } | null)?.outline;
      const approved = await approveOutline(jobId, outline);
      if (!approved.ok) {
        // Coverage failed: park exactly where the manual flow would — admin decides.
        logger.warn(`[STUDIO/1STEP] Automatikus vázlat-jóváhagyás elutasítva: ${approved.reason}`);
        return;
      }
    }
    // action === "continue": loop back into drive()
  }
}

/** POST /api/studio/lessons/from-map/:mapId — start a new lesson pipeline. */
lessonPipelineRouter.post("/lessons/from-map/:mapId", async (req: Request, res: Response) => {
  const parsed = fromMapBody.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: "Hibás kérés.", issues: parsed.error.issues.map((i) => i.message) });
  }

  const started = await startJobFromMap(req.params.mapId, parsed.data);
  if (!started.ok) return res.status(409).json({ message: started.reason });

  await drive(started.jobId);
  res.status(201).json({ jobId: started.jobId });
});

/** GET /api/studio/jobs/:id — pollable job state plus what the pipeline produced. */
lessonPipelineRouter.get("/jobs/:id", async (req: Request, res: Response) => {
  const [row] = await db
    .select()
    .from(studioJobs)
    .where(eq(studioJobs.id, req.params.id))
    .limit(1);

  if (!row) return res.status(404).json({ message: "A job nem található." });

  const output = (row.output ?? null) as Record<string, unknown> | null;
  res.json({
    job: {
      id: row.id,
      step: row.step,
      status: row.status,
      round: row.round,
      error: row.error,
      model: row.model,
      createdAt: row.createdAt,
      finishedAt: row.finishedAt,
    },
    // LS-2c (kliens): amit a vázlat-jóváhagyó képernyő megmutat. A `coverage` a
    // pedagógus-lépéskor szerveroldalon számolt mérés — a kliens csak megjeleníti.
    produced: {
      outline: output?.outline ?? null,
      coverage: output?.coverage ?? null,
      approvedOutline: output?.approvedOutline !== undefined,
      lessonId: row.lessonId,
    },
  });
});

/** GET /api/studio/jobs/:id/notes — the lektor's notes of a job (LektorNotes panel). */
lessonPipelineRouter.get("/jobs/:id/notes", async (req: Request, res: Response) => {
  const [exists] = await db
    .select({ id: studioJobs.id })
    .from(studioJobs)
    .where(eq(studioJobs.id, req.params.id))
    .limit(1);
  if (!exists) return res.status(404).json({ message: "A job nem található." });

  const rows = await db
    .select({
      id: lektorNotes.id,
      kind: lektorNotes.kind,
      subkind: lektorNotes.subkind,
      severity: lektorNotes.severity,
      message: lektorNotes.message,
      blockPath: lektorNotes.blockPath,
      resolvedBy: lektorNotes.resolvedBy,
    })
    .from(lektorNotes)
    .where(eq(lektorNotes.jobId, req.params.id))
    .orderBy(asc(lektorNotes.createdAt));

  res.json({ notes: rows });
});

/** POST /api/studio/jobs/:id/approve-outline — the admin gate between pedagogue and author. */
lessonPipelineRouter.post("/jobs/:id/approve-outline", async (req: Request, res: Response) => {
  const approved = await approveOutline(req.params.id, req.body?.outline);
  if (!approved.ok) return res.status(409).json({ message: approved.reason });

  await drive(req.params.id);
  res.json({ jobId: req.params.id });
});

/** POST /api/studio/jobs/:id/resume — re-run the current step (input-hash idempotent). */
lessonPipelineRouter.post("/jobs/:id/resume", async (req: Request, res: Response) => {
  const [exists] = await db
    .select({ id: studioJobs.id })
    .from(studioJobs)
    .where(eq(studioJobs.id, req.params.id))
    .limit(1);
  if (!exists) return res.status(404).json({ message: "A job nem található." });

  await drive(req.params.id);
  res.json({ jobId: req.params.id });
});

/* ------------------------------------------------------------------ *
 * LS-5 — feedback loop: concept stats, fix-concept, quiz export
 * ------------------------------------------------------------------ */

/** GET /api/studio/lessons/:id/concept-stats — fogalmankénti összesítés (szülői összegző adata). */
lessonPipelineRouter.get("/lessons/:id/concept-stats", async (req: Request, res: Response) => {
  const rows = await db
    .select({ conceptId: conceptResults.conceptId, correct: conceptResults.correct })
    .from(conceptResults)
    .where(eq(conceptResults.lessonId, req.params.id));

  res.json({ stats: aggregateConceptResults(rows) });
});

/** POST /api/studio/lessons/:id/fix-concept — egy gyenge fogalom célzott újraírása. */
lessonPipelineRouter.post("/lessons/:id/fix-concept", async (req: Request, res: Response) => {
  const body = z.object({ conceptId: z.string().trim().min(1).max(64) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "conceptId kötelező (1-64 karakter)." });

  const result = await fixConceptOnLesson(req.params.id, body.data.conceptId);
  if (!result.ok) return res.status(409).json({ message: result.error });
  res.json({ lessonId: req.params.id, message: result.message });
});

const exportQuizBody = z.object({
  gameId: z.string().trim().min(1).max(64),
  topic: z.string().trim().max(128).optional(),
});

/** POST /api/studio/lessons/:id/export-quiz — a check-blokkok a játék-kvíz bankba, fogalom-kötéssel. */
lessonPipelineRouter.post("/lessons/:id/export-quiz", async (req: Request, res: Response) => {
  const body = exportQuizBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "gameId kötelező, topic legfeljebb 128 karakter." });

  const [game] = await db
    .select({ id: gamesCatalog.id })
    .from(gamesCatalog)
    .where(eq(gamesCatalog.id, body.data.gameId))
    .limit(1);
  if (!game) return res.status(400).json({ message: "Ismeretlen játék-azonosító." });

  const [lesson] = await db
    .select({ json: lessons.json })
    .from(lessons)
    .where(eq(lessons.id, req.params.id))
    .limit(1);
  if (!lesson) return res.status(404).json({ message: "A lecke nem található." });

  const rows = exportQuizItemsFromChecks(lesson.json as never, body.data.gameId, body.data.topic);
  if (rows.length === 0) return res.status(400).json({ message: "A leckében nincs fogalommal köthető check-blokk." });

  await db.insert(gameQuizItems).values(rows);
  res.json({ exported: rows.length });
});
