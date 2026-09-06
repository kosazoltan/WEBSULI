/**
 * #183 — boot-sweep for studio_jobs, the twin of the #168 one-step run sweep.
 *
 * Measured in prod (2026-09-06, incognito /admin?tab=lesson-studio): job
 * f4462d63 sat at step=gate / status=running for 10 hours with finished_at=null.
 * The process that drove it died (Render restart / deploy); nothing ever closed
 * the row, so `jobMonitorView` kept reporting `polling: true` and the JobMonitor
 * re-fetched GET /api/studio/jobs/:id every 2 seconds forever — an endless poll
 * against a job no worker owns.
 *
 * #168 fixed exactly this class for `one_step_runs` but the sweep only covered
 * that table; `studio_jobs` (the manual "Lecke készítése" path) was left out.
 * Same rule, same honest message: a job in a non-terminal status at boot belonged
 * to a dead process, so it is closed as an error the teacher can act on.
 *
 * Pure by design (no db import) so it is unit-testable; the caller does the I/O.
 */

/** Statuses the pipeline settles a job into; anything else is still in flight. */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(["ok", "error"]);

/** The message the admin sees on a swept job — it names the cause and the way out. */
export const ORPHAN_JOB_ERROR =
  "A szerver újraindult a lecke-készítés közben — indítsd újra a lépést az „Újra” gombbal.";

export type OrphanJobRow = { id: string; status: string };

/**
 * Pick the jobs a dead process left behind. A row is orphaned when its status is
 * NOT terminal — `pending` and `running` both mean "a worker is on it", and after
 * a boot there is no such worker.
 */
export function markOrphanedJobs(rows: OrphanJobRow[]): Array<{ id: string; error: string }> {
  return rows
    .filter((r) => !TERMINAL_STATUSES.has(r.status))
    .map((r) => ({ id: r.id, error: ORPHAN_JOB_ERROR }));
}
