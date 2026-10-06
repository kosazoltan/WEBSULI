// Spec 2026-10-06-s5-tantargyi-memoria — a tantárgyi memória VISSZAMENŐLEGES feltöltése (modellhívás nélkül).
// Alapból DRY-RUN: csak olvas az éles DB-ből (READ ONLY tranzakció), és a várható kártyákat JSON-ba írja.
// Írás CSAK kifejezett `--write` kapcsolóval (egy tranzakció, ugyanaz az `applyEvidence`, mint az élő hook; idempotens).
//   npx tsx scripts/memory/backfill.mts [--write] [--out <kimenet.json>]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withReadOnlyDb, withWriteTransaction } from "../lib/read-only-db";
import { subjectKeyOf } from "../../shared/subject-key";
import type { WorkflowView } from "../../shared/lesson-workflow";
import { codeEntry, evidenceFromLektorNotes, evidenceFromRun, foldEvidence, type MemoryEvidence } from "../../server/memory/subject-memory";
import { applyEvidence } from "../../server/memory/store";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const args = process.argv.slice(2);
const write = args.includes("--write");
const outIndex = args.indexOf("--out");
const out = outIndex >= 0 && args[outIndex + 1] ? resolve(args[outIndex + 1]) : resolve(repoRoot, "docs/measurements/2026-10-06-s5-backfill-dryrun.json");

type RunRow = { id: string; snapshot: WorkflowView; subject: string | null };
type NoteRow = { job_id: string; kind: string; subkind: string | null; severity: string; block_path: string | null; created_at: Date; subject: string };

const { evidence, skipped, sources } = await withReadOnlyDb(async (q) => {
  const runs = await q<RunRow>(`SELECT r.id, r.snapshot, m.subject FROM lesson_workflow_runs r
    LEFT JOIN studio_jobs j ON j.id = COALESCE(r.snapshot->>'resourceId', r.id) LEFT JOIN knowledge_maps m ON m.id = j.map_id ORDER BY r.created_at`);
  const notes = await q<NoteRow>(`SELECT n.job_id, n.kind, n.subkind, n.severity, n.block_path, n.created_at, m.subject FROM lektor_notes n
    JOIN studio_jobs j ON j.id = n.job_id JOIN knowledge_maps m ON m.id = j.map_id WHERE n.severity = 'blocker' ORDER BY n.job_id, n.created_at`);
  const skipped = { runsWithoutStudioJob: 0, runsUnknownSubject: 0, noteJobsUnknownSubject: 0 };
  const evidence: MemoryEvidence[] = [];
  for (const run of runs) {
    if (!run.subject) { skipped.runsWithoutStudioJob++; continue; }
    const subject = subjectKeyOf(run.subject);
    if (!subject) { skipped.runsUnknownSubject++; continue; }
    evidence.push(...evidenceFromRun({ ...run.snapshot, id: run.snapshot?.id ?? run.id }, subject));
  }
  const byJob = new Map<string, NoteRow[]>();
  for (const n of notes) byJob.set(n.job_id, [...(byJob.get(n.job_id) ?? []), n]);
  for (const [jobId, list] of byJob) {
    const subject = subjectKeyOf(list[0].subject);
    if (!subject) { skipped.noteJobsUnknownSubject++; continue; }
    evidence.push(...evidenceFromLektorNotes(jobId, list.map((n) => ({ kind: n.kind, subkind: n.subkind, severity: n.severity, blockPath: n.block_path, createdAt: new Date(n.created_at).getTime() })), subject));
  }
  return { evidence, skipped, sources: { runs: runs.length, blockerNotes: notes.length, lektoredJobs: byJob.size } };
});

const now = Date.now();
const { cards, events } = foldEvidence([], new Set(), evidence, now);
const bySubject: Record<string, { cards: number; open: number; watch: number; closed: number; injectable: number; withCorrective: number; top: Array<{ code: string; step: string; occurrences: number; status: string; promptRoles: string[] }> }> = {};
for (const c of cards) {
  const s = (bySubject[c.subject] ??= { cards: 0, open: 0, watch: 0, closed: 0, injectable: 0, withCorrective: 0, top: [] });
  s.cards++;
  s[c.status]++;
  const roles = codeEntry(c.code, c.step)?.roles ?? [];
  if (roles.length) s.injectable++;
  if (c.correctiveSummary) s.withCorrective++;
  s.top.push({ code: c.code, step: c.step, occurrences: c.occurrences, status: c.status, promptRoles: roles });
}
for (const s of Object.values(bySubject)) s.top = s.top.sort((a, b) => b.occurrences - a.occurrences || a.code.localeCompare(b.code)).slice(0, 10);

let written: { newEvents: number; cards: number } | null = null;
if (write) written = await withWriteTransaction((q) => applyEvidence(q, evidence, now));

const report = {
  spec: "docs/specs/2026-10-06-s5-tantargyi-memoria.md",
  generatedAt: new Date(now).toISOString(),
  mode: write ? "write" : "dry-run",
  sources, skipped,
  totals: { evidence: evidence.length, events: events.length, cards: cards.length, open: cards.filter((c) => c.status === "open").length,
    watch: cards.filter((c) => c.status === "watch").length, closed: cards.filter((c) => c.status === "closed").length },
  bySubject: Object.fromEntries(Object.entries(bySubject).sort(([a], [b]) => a.localeCompare(b))),
  ...(written ? { written } : {}),
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ out, mode: report.mode, sources, skipped, totals: report.totals }, null, 2));
