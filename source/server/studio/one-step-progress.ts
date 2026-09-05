/**
 * LS-6b (#165) — in-memory progress store for one-step lesson runs.
 *
 * Why in-memory: the run lives exactly as long as one server process handles
 * it (the drive loop is a single request-scoped async chain), a page reload
 * mid-run only needs the CURRENT phase, and losing progress rows on a deploy
 * costs nothing (the run itself is persisted in knowledge_maps/studio_jobs).
 * So no schema migration for a UI aid.
 *
 * The one-step endpoint answers 202 + runId immediately, updates this store at
 * every phase boundary, and the client polls GET /lessons/one-step/:runId.
 */

import { randomUUID } from "node:crypto";

export type OneStepPhase =
  | "indul"
  | "ocr"
  | "extract"
  | "pedagogue"
  | "author"
  | "animator"
  | "lektor"
  | "done"
  | "parked"
  | "error";

export type OneStepRun = {
  id: string;
  phase: OneStepPhase;
  /** Human detail, Hungarian, e.g. "Kép átírása: 3/10". */
  detail: string | null;
  error: string | null;
  mapId: string | null;
  jobId: string | null;
  lessonId: string | null;
  startedAt: number;
  updatedAt: number;
};

const TTL_FINISHED_MS = 15 * 60 * 1000; // finished runs linger 15 min for late polls
const TTL_STALE_MS = 60 * 60 * 1000; // a run silent for an hour is dead either way

const runs = new Map<string, OneStepRun>();

export function createRun(): string {
  pruneRuns();
  const id = randomUUID();
  const now = Date.now();
  runs.set(id, {
    id,
    phase: "indul",
    detail: null,
    error: null,
    mapId: null,
    jobId: null,
    lessonId: null,
    startedAt: now,
    updatedAt: now,
  });
  return id;
}

export function updateRun(
  id: string,
  patch: Partial<Pick<OneStepRun, "phase" | "detail" | "error" | "mapId" | "jobId" | "lessonId">>,
): void {
  const run = runs.get(id);
  if (!run) return;
  Object.assign(run, patch, { updatedAt: Date.now() });
}

export function getRun(id: string): OneStepRun | null {
  return runs.get(id) ?? null;
}

const FINISHED: ReadonlySet<OneStepPhase> = new Set(["done", "parked", "error"]);

/** Drop finished runs past their linger TTL and anything silently stale. */
export function pruneRuns(now: number = Date.now()): void {
  for (const [id, run] of runs) {
    const age = now - run.updatedAt;
    if ((FINISHED.has(run.phase) && age > TTL_FINISHED_MS) || age > TTL_STALE_MS) runs.delete(id);
  }
}

/** Test seam: the store is module-global by design. */
export function __resetRunsForTest(): void {
  runs.clear();
}
