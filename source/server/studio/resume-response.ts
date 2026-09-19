import type { Response } from "express";
import { redactWorkflowError } from "../workflows/engine";
import { logger } from "../lib/logger";
import type { PipelineStore } from "./step-runner";

/** Called inside the workflow lease; the real adapter fences every write. */
export async function guardResumedDrive(jobId: string, store: Pick<PipelineStore, "loadJob" | "saveStep">, work: () => Promise<void>): Promise<void> {
  try { await work(); }
  catch (error) {
    const job = await store.loadJob(jobId);
    if (job && job.step !== "done" && job.step !== "error" && job.status !== "error") {
      await store.saveStep(jobId, { step: "error", status: "error", error: redactWorkflowError(error), finishedAt: new Date() });
    }
    throw error;
  }
}

/** Acceptance is emitted by the owner/lease-checked runner, never before it. */
export async function respondToResume(res: Response, jobId: string, work: (accepted: () => void) => Promise<void>): Promise<void> {
  try {
    await work(() => { if (!res.headersSent) res.status(202).json({ jobId }); });
    if (!res.headersSent) res.json({ jobId }); // Already-completed idempotent request.
  } catch (error) {
    const message = redactWorkflowError(error);
    if (!res.headersSent) res.status(409).json({ message });
    else logger.error(`[STUDIO] Az elfogadott folytatás megállt: ${message}`);
  }
}