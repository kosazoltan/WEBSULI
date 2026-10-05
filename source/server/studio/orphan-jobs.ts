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

/**
 * Spec 2026-10-05-s10-adatvesztes-mentesseg (2. szelet, a független terv-ellenőrzés javításaival): szerver-újraindulás után a
 * félbemaradt futás NEM hibára zárul, hanem a mentett részeredményekből magától folytatódik — kézi „Újra” nélkül.
 *  - Aktív lízing: egy élő folyamat hajtja (pl. deploykor a régi példány, vagy helyi próba ugyanazon a DB-n) → érintetlen.
 *  - Lejárt lízing + futó workflow + kevesebb mint AUTO_RESUME_MAX_EXECUTIONS végrehajtás → folytatás (a `executions` a claim alatt
 *    nő és mentődik — összeomló futás nem pöröghet végtelenül; a 4-es kemény korlát alatt egy kézi próba marad).
 *  - Workflow-futás nélküli árva job → a régi lezárás, de CSAK induláskor (futás közben az ilyen jobot élő folyamat hajthatja).
 */
export const AUTO_RESUME_MAX_EXECUTIONS = 3;

export type SweepRow = {
  id: string;
  status: string;
  runId: string | null;
  owner: string | null;
  runState: string | null;
  leaseUntil: Date | null;
  executions: number;
};

export type SweepDecision = "leave" | "resume" | "close";

export function sweepDecision(row: SweepRow, now: number, boot: boolean): SweepDecision {
  if (TERMINAL_STATUSES.has(row.status)) return "leave";
  if (row.leaseUntil && row.leaseUntil.getTime() > now) return "leave";
  if (row.runId && row.owner && row.runState === "running" && row.executions < AUTO_RESUME_MAX_EXECUTIONS) return "resume";
  // Nem folytatható (nincs futás, megállt, elfogyott a keret): induláskor a régi lezárás (különben a #183-as örök poll
  // visszatérne); futás közben nem nyúlunk hozzá — élő folyamat hajthatja.
  return boot ? "close" : "leave";
}
