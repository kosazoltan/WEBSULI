// RUNBOOK 9.5 — adatbázis-higiénia JELENTÉS (csak olvasás, ellenőrzött TLS): árva/nem lezárt futások, beragadt workflow-k.
// Nem módosít semmit; a lezárást a szerver boot-sweepje (closeOrphanedStudioJobs / closeOrphanedOneStepRuns) végzi.
// Futtatás (source/ mappából): npx tsx scripts/measure/db-hygiene-report.mts
import { withReadOnlyDb } from "../lib/read-only-db";

await withReadOnlyDb(async (query) => {
  const show = async (label: string, sql: string) => console.log(label, JSON.stringify(await query(sql)));
  await show("studio_jobs nem lezárt (0 sor a jó):", "SELECT id, step, status, created_at FROM studio_jobs WHERE status NOT IN ('ok','error') ORDER BY created_at DESC LIMIT 20");
  await show("one_step_runs nem terminális:", "SELECT id, phase, updated_at FROM one_step_runs WHERE phase NOT IN ('done','error','parked') ORDER BY updated_at DESC LIMIT 20");
  await show("lesson_workflow_runs futó/várakozó, 1 óránál régebbi:", "SELECT id, state, updated_at, lease_until FROM lesson_workflow_runs WHERE state IN ('running','waiting') AND updated_at < now() - interval '1 hour' ORDER BY updated_at DESC LIMIT 20");
  await show("scheduled_jobs esedékes, nem lezárt:", "SELECT id, type, status, scheduled_for FROM scheduled_jobs WHERE status NOT IN ('done','completed','failed','cancelled') AND scheduled_for < now() LIMIT 20");
  await show("one_step_runs mai hibák (okonként):", "SELECT left(error, 90) AS ok, count(*)::int AS db FROM one_step_runs WHERE phase='error' AND updated_at > now() - interval '1 day' GROUP BY 1 ORDER BY 2 DESC");
});
