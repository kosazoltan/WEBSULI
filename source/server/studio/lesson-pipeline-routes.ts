import express, { type Request, type Response } from "express";
import { and, asc, eq } from "drizzle-orm";
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
import { MAX_CHAIN_STEPS } from "./pipeline";
import { callScopeModel, decideOneStepAction, inferScope, parseOneStepRequest, type OneStepRequest } from "./one-step";
import {
  createRun as createRunBase,
  getRun as getRunBase,
  markOrphanedRuns,
  updateRun as updateRunBase,
  type OneStepPhase,
  type OneStepRun,
} from "./one-step-progress";
import { oneStepRuns } from "../../shared/schema";

/* ------------------------------------------------------------------ *
 * #168 — a futás-státusz DB-perzisztálása (Render-restart ellen).
 * ------------------------------------------------------------------ */

async function persistRun(run: OneStepRun): Promise<void> {
  await db
    .insert(oneStepRuns)
    .values({
      id: run.id,
      phase: run.phase,
      detail: run.detail,
      error: run.error,
      mapId: run.mapId,
      jobId: run.jobId,
      lessonId: run.lessonId,
      startedAt: new Date(run.startedAt),
      updatedAt: new Date(run.updatedAt),
    })
    .onConflictDoUpdate({
      target: oneStepRuns.id,
      set: {
        phase: run.phase,
        detail: run.detail,
        error: run.error,
        mapId: run.mapId,
        jobId: run.jobId,
        lessonId: run.lessonId,
        updatedAt: new Date(run.updatedAt),
      },
    });
}

async function loadRun(id: string): Promise<OneStepRun | null> {
  const [row] = await db.select().from(oneStepRuns).where(eq(oneStepRuns.id, id)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    phase: row.phase as OneStepPhase,
    detail: row.detail,
    error: row.error,
    mapId: row.mapId,
    jobId: row.jobId,
    lessonId: row.lessonId,
    startedAt: row.startedAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

const createRun = () => createRunBase(persistRun);
const updateRun = (id: string, patch: Parameters<typeof updateRunBase>[1]) =>
  updateRunBase(id, patch, persistRun);
const getRun = (id: string) => getRunBase(id, loadRun);

/**
 * #168 — boot-sweep: a folyamat halálakor árván maradt futások explicit hibára
 * záródnak, hogy a kliens jelzője ne ragadjon be. Induláskor egyszer fut.
 */
export async function closeOrphanedOneStepRuns(): Promise<number> {
  const open = await db
    .select({ id: oneStepRuns.id, phase: oneStepRuns.phase })
    .from(oneStepRuns);
  const orphans = markOrphanedRuns(open);
  for (const o of orphans) {
    await db
      .update(oneStepRuns)
      .set({ phase: "error", error: o.error, updatedAt: new Date() })
      .where(eq(oneStepRuns.id, o.id));
  }
  if (orphans.length > 0) {
    logger.warn(`[STUDIO/1STEP] ${orphans.length} árva futás hibára zárva (szerver-újraindulás).`);
  }
  return orphans.length;
}
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

// #177: derived from MAX_AUTHOR_ROUNDS in pipeline.ts — a hand-picked 8 cut a legal round 2 short.
const MAX_CHAIN = MAX_CHAIN_STEPS;

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
      // Audit 2026-09-05 (A): the gate is deterministic — no admin click needed to run it.
      next.step === "gate" ||
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
 * LS-6b (#165): answers 202 + runId IMMEDIATELY and does the work in the
 * background, updating an in-memory progress store at every phase boundary.
 * The client polls GET /lessons/one-step/:runId and shows a live phase list
 * (OCR i/n, extraction, outline, writing, animator, lektor) — the teacher must
 * see the machine working, not a dead spinner. Gates unchanged: outline
 * auto-approval goes through approveOutline() (coverage decides), lektor
 * untouched.
 */
lessonPipelineRouter.post("/lessons/one-step", async (req: Request, res: Response) => {
  const parsed = parseOneStepRequest(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ message: "Hibás kérés.", issues: parsed.issues });
  }

  const runId = createRun();
  const userId = (req.user as { id?: string } | undefined)?.id;
  // Fire-and-forget: the run loop reports through the progress store.
  void runOneStep(runId, parsed.data, userId).catch((error) => {
    logger.error(`[STUDIO/1STEP] Váratlan hiba: ${error instanceof Error ? error.message : String(error)}`);
    updateRun(runId, { phase: "error", error: "Váratlan hiba történt. Próbáld újra." });
  });
  res.status(202).json({ runId });
});

/** GET /api/studio/lessons/one-step/:runId — the progress poll. */
lessonPipelineRouter.get("/lessons/one-step/:runId", async (req: Request, res: Response) => {
  const run = await getRun(req.params.runId);
  if (!run) return res.status(404).json({ message: "Ismeretlen vagy lejárt futás." });
  // Audit 2026-09-05 (A): a finished run points at the published material so the teacher
  // (and the child) can open it — the html_files id lives on the lessons row.
  let htmlFileId: string | null = null;
  if (run.phase === "done" && run.lessonId) {
    const [lesson] = await db
      .select({ htmlFileId: lessons.htmlFileId })
      .from(lessons)
      .where(eq(lessons.id, run.lessonId))
      .limit(1);
    htmlFileId = lesson?.htmlFileId ?? null;
  }
  res.json({
    phase: run.phase,
    detail: run.detail,
    error: run.error,
    mapId: run.mapId,
    jobId: run.jobId,
    lessonId: run.lessonId,
    htmlFileId,
  });
});

/** The whole one-step chain, reporting each phase into the progress store. */
async function runOneStep(
  runId: string,
  data: OneStepRequest,
  userId: string | undefined,
): Promise<void> {
  const { files, title } = data;

  // 1) Scope: given, or inferred from the sources on the cheap model.
  let scope = data.scope;
  let inferredTitle: string | undefined;
  if (!scope) {
    updateRun(runId, { phase: "ocr", detail: "Tantárgy és osztály felismerése…" });
    const inferred = await inferScope(files as ExtractorFile[], (f) =>
      callScopeModel(f, resolveStudioModel("ocr")),
    );
    if (!inferred.ok) {
      updateRun(runId, {
        phase: "error",
        error: `Nem sikerült felismerni a tantárgyat/osztályt (${inferred.reason}) — add meg kézzel.`,
      });
      return;
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
    updateRun(runId, { phase: "extract", detail: "Ez a forrás már fel volt dolgozva — a meglévő tudástárat használjuk.", mapId });
    logger.info(`[STUDIO/1STEP] Térkép gyorsítótárból: ${mapId}`);
  } else {
    updateRun(runId, { phase: "ocr", detail: null });
    const { runExtraction } = await import("./run-extraction");
    try {
      mapId = await runExtraction({
        files: files as ExtractorFile[],
        scope,
        title: title ?? inferredTitle,
        inputHash,
        userId,
        onPhase: (phase, detail) => updateRun(runId, { phase, detail }),
      });
    } catch (error) {
      logger.error(
        `[STUDIO/1STEP] Kivonatolás hiba: ${error instanceof Error ? error.message : String(error)}`,
      );
      updateRun(runId, { phase: "error", error: "A kivonatolás nem sikerült. Próbáld újra." });
      return;
    }
    updateRun(runId, { mapId });
  }

  // 2b) #174 — gépi kurálás + jóváhagyás: az egylépeses útvonal nem hagyhat
  // "Piszkozat" zsákutcát. A D1 nem gyengül: az igazolt fogalom kept, a nem
  // igazolható KULCSfogalom rejected (nem tanítjuk), a kiegészítő kept marad.
  // A jóváhagyás a canApprove kapun MEGY ÁT, nem kerüli meg.
  {
    const [mapRow] = await db
      .select({ status: knowledgeMaps.status })
      .from(knowledgeMaps)
      .where(eq(knowledgeMaps.id, mapId))
      .limit(1);

    if (mapRow && mapRow.status !== "approved") {
      updateRun(runId, { phase: "extract", detail: "Tudástár gépi átnézése és jóváhagyása…" });
      const { kmConcepts } = await import("../../shared/schema");
      const { autoReviewDecision, summarizeAutoReview } = await import("./auto-approve");
      const { canApprove } = await import("./extractor");

      const concepts = await db
        .select({
          id: kmConcepts.id,
          examWeight: kmConcepts.examWeight,
          verbatimOk: kmConcepts.verbatimOk,
          reviewState: kmConcepts.reviewState,
        })
        .from(kmConcepts)
        .where(eq(kmConcepts.mapId, mapId));

      // Csak a még átnézetlen (pending) fogalmakról dönt a gép — a kézi
      // döntéseket (kept/edited/rejected) nem írja felül.
      for (const c of concepts) {
        if (c.reviewState !== "pending") continue;
        const decision = autoReviewDecision({
          examWeight: c.examWeight as "core" | "supporting",
          verbatimOk: c.verbatimOk,
        });
        await db
          .update(kmConcepts)
          .set({ reviewState: decision, updatedAt: new Date() })
          .where(eq(kmConcepts.id, c.id));
      }
      const summary = summarizeAutoReview(
        concepts
          .filter((c) => c.reviewState === "pending")
          .map((c) => ({ examWeight: c.examWeight as "core" | "supporting", verbatimOk: c.verbatimOk })),
      );

      const fresh = await db
        .select({
          id: kmConcepts.id,
          examWeight: kmConcepts.examWeight,
          verbatimOk: kmConcepts.verbatimOk,
          reviewState: kmConcepts.reviewState,
        })
        .from(kmConcepts)
        .where(eq(kmConcepts.mapId, mapId));

      const gate = canApprove(
        fresh.map((c) => ({
          id: c.id,
          examWeight: c.examWeight as "core" | "supporting",
          verbatimOk: c.verbatimOk,
          reviewState: c.reviewState as "pending" | "kept" | "edited" | "rejected",
        })),
      );
      if (!gate.ok) {
        updateRun(runId, {
          phase: "parked",
          detail: `A tudástár gépi jóváhagyása nem lehetséges (${gate.reason}) — nézd át kézzel a Tudás-térkép fülön.`,
        });
        return;
      }

      await db
        .update(knowledgeMaps)
        .set({ status: "approved", approvedBy: userId ?? null, approvedAt: new Date(), updatedAt: new Date() })
        .where(eq(knowledgeMaps.id, mapId));
      logger.info(
        `[STUDIO/1STEP] Térkép gépi kurálással jóváhagyva: ${mapId} (kept=${summary.kept}, rejected=${summary.rejected})`,
      );
    }
  }

  // 3) Lesson job on the freshly built map, driven with outline auto-approval.
  const started = await startJobFromMap(mapId, { subject: scope.subject, classroom: scope.classroom });
  if (!started.ok) {
    updateRun(runId, { phase: "error", error: started.reason, mapId });
    return;
  }
  updateRun(runId, { phase: "pedagogue", jobId: started.jobId });

  await driveOneStep(runId, started.jobId);
}

/** drive() plus outline auto-approval; approveOutline re-validates coverage. */
async function driveOneStep(runId: string, jobId: string): Promise<void> {
  for (let i = 0; i < MAX_CHAIN; i++) {
    await drive(jobId);

    const [job] = await db
      .select({
        step: studioJobs.step,
        status: studioJobs.status,
        output: studioJobs.output,
        error: studioJobs.error,
        lessonId: studioJobs.lessonId,
      })
      .from(studioJobs)
      .where(eq(studioJobs.id, jobId))
      .limit(1);
    if (!job) return;

    // LS-6b: mirror the pipeline's own step into the progress store.
    const phase = (
      ["pedagogue", "author", "animator", "lektor", "gate"].includes(job.step) ? job.step : null
    ) as OneStepPhase | null;
    if (phase) updateRun(runId, { phase });

    const action = decideOneStepAction({
      step: job.step,
      status: job.status,
      output: (job.output ?? null) as Record<string, unknown> | null,
    });
    if (action === "stop") {
      if (job.step === "error") {
        updateRun(runId, { phase: "error", error: job.error ?? "A gyártás hibára futott." });
      } else if (job.step === "done") {
        updateRun(runId, { phase: "done", detail: "A lecke elkészült.", lessonId: job.lessonId ?? null });
      } else {
        updateRun(runId, { phase: "parked", detail: "A futás kézi döntésre vár a Studio panelen." });
      }
      return;
    }
    if (action === "approve") {
      const outline = (job.output as { outline?: unknown } | null)?.outline;
      const approved = await approveOutline(jobId, outline);
      if (!approved.ok) {
        // Coverage failed: park exactly where the manual flow would — admin decides.
        logger.warn(`[STUDIO/1STEP] Automatikus vázlat-jóváhagyás elutasítva: ${approved.reason}`);
        updateRun(runId, {
          phase: "parked",
          detail: `A vázlat kézi jóváhagyásra vár (${approved.reason})`,
        });
        return;
      }
      updateRun(runId, { phase: "author" });
    }
    // action === "continue": loop back into drive()
  }
  updateRun(runId, { phase: "error", error: "A pipeline-lánc nem ért véget a lépés-határon belül." });
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

  const rows = exportQuizItemsFromChecks(lesson.json as never, body.data.gameId, body.data.topic, req.params.id);
  if (rows.length === 0) return res.status(400).json({ message: "A leckében nincs fogalommal köthető check-blokk." });

  // Audit 2026-09-05 (B): idempotent — a re-export of the same lesson→game replaces, not duplicates.
  await db.transaction(async (tx) => {
    await tx
      .delete(gameQuizItems)
      .where(and(eq(gameQuizItems.lessonId, req.params.id), eq(gameQuizItems.gameId, body.data.gameId)));
    await tx.insert(gameQuizItems).values(rows);
  });
  res.json({ exported: rows.length });
});
