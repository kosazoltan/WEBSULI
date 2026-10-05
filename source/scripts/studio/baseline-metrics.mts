// Spec 2026-10-05-s0-meresi-alap: a tudásbank-program mércéje az éles DB-ből — CSAK OLVAS.
// Futtatás: npx tsx scripts/studio/baseline-metrics.mts [kimenet.json]
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import pg from "pg";
import { jobMetrics, subjectSummary, type JobRow, type NoteCounts } from "../../server/studio/run-metrics";

const out = process.argv[2] ?? `../docs/measurements/${new Date().toISOString().slice(0, 10)}-baseline.json`;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  const jobs = (await client.query(`
    select j.id, m.subject, j.step, j.status, j.error, j.output
    from studio_jobs j join knowledge_maps m on m.id = j.map_id
    order by j.created_at`)).rows as JobRow[];
  const noteRows = (await client.query(`
    select job_id,
           count(*)::int total,
           count(*) filter (where block_path like 'experience%')::int bank,
           count(*) filter (where block_path is null or block_path not like 'experience%')::int teach
    from lektor_notes group by job_id`)).rows as Array<{ job_id: string } & NoteCounts>;
  const notes = new Map(noteRows.map((r) => [r.job_id, { total: r.total, bank: r.bank, teach: r.teach }]));
  const metrics = jobs.map((j) => jobMetrics(j, notes.get(j.id)));
  const summary = subjectSummary(metrics);
  await client.query("ROLLBACK");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString(), jobs: metrics.length, summary, metrics }, null, 2) + "\n");
  console.table(summary.map((s) => ({ tantárgy: s.subject, futás: s.runs, siker: s.success, "siker%": Math.round(s.successRate * 100), "bank-jegyzet/futás": s.avgBankNotes, "tanítás-jegyzet/futás": s.avgTeachNotes, "csak-bank kör/futás": s.avgBankOnlyRounds })));
  console.log("bukás-osztályok (összesen):", JSON.stringify(summary[0].failures));
  console.log("kiírva:", out);
} finally {
  await client.end();
}
