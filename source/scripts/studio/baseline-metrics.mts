// Spec 2026-10-05-s0-meresi-alap: a tudásbank-program mércéje az éles DB-ből — CSAK OLVAS, ellenőrzött TLS-sel.
// Futtatás (bármely könyvtárból): npx tsx source/scripts/studio/baseline-metrics.mts [kimenet.json]
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { jobMetrics, subjectSummary, type JobRow, type NoteCounts } from "../../server/studio/run-metrics";
import { withReadOnlyDb } from "../lib/read-only-db";

// Review #187: az alapértelmezett kimenet a repó docs/measurements könyvtára, a munkakönyvtártól függetlenül.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const out = process.argv[2] ?? resolve(repoRoot, "docs/measurements", `${new Date().toISOString().slice(0, 10)}-baseline.json`);

const { metrics, summary } = await withReadOnlyDb(async (query) => {
  // Review #187: a nevező csak a LEZÁRT futás (step done/error) — a még futó job nem rontja a sikerarányt.
  const jobs = await query<JobRow>(`
    select j.id, m.subject, j.step, j.status, j.error, j.output
    from studio_jobs j join knowledge_maps m on m.id = j.map_id
    where j.step in ('done', 'error')
    order by j.created_at`);
  const noteRows = await query<{ job_id: string } & NoteCounts>(`
    select job_id,
           count(*)::int total,
           count(*) filter (where block_path like 'experience%')::int bank,
           count(*) filter (where block_path is null or block_path not like 'experience%')::int teach
    from lektor_notes group by job_id`);
  const notes = new Map(noteRows.map((r) => [r.job_id, { total: r.total, bank: r.bank, teach: r.teach }]));
  const metrics = jobs.map((j) => jobMetrics(j, notes.get(j.id)));
  return { metrics, summary: subjectSummary(metrics) };
});

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString(), jobs: metrics.length, summary, metrics }, null, 2) + "\n");
console.table(summary.map((s) => ({ tantárgy: s.subject, futás: s.runs, siker: s.success, "siker%": Math.round(s.successRate * 100), "bank-jegyzet/futás": s.avgBankNotes, "tanítás-jegyzet/futás": s.avgTeachNotes, "csak-bank kör/futás": s.avgBankOnlyRounds })));
console.log("bukás-osztályok (összesen):", JSON.stringify(summary[0].failures));
console.log("kiírva:", out);
