import express, { type Request, type Response } from "express";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db";
import { lektorNotes, studioJobs } from "../../shared/schema";
import { isAuthenticatedAdmin } from "../auth";
import { logger } from "../lib/logger";
import {
  advanceJob,
  approveOutline,
  runPipelineStep,
  startJobFromMap,
} from "./step-runner";

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
      next.step === "lektor" || (next.step === "author" && output?.approvedOutline !== undefined);

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
