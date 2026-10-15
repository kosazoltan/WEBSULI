// Tételgyár T2.0 (docs/specs/2026-10-15-tetelgyar-t2-valaszkulcs-tesztek-vegrehajtas.md): lektor-próbaharness — mentett jobok leckéjén az ÉLŐ
// lektor-promptot (szerep-skill + buildLektorPrompt) futtatja a valódi lektormodellen, DB-ÍRÁS NÉLKÜL; a blokkolókat osztályonként számolja.
// Szeletenként előtte/utána futtatva méri a hatást (a T8 lektor-lélek mérése ezzel készült, docs/measurements/2026-10-15-t8-lektor-lelek.json).
// Eltérés az éles úttól (a kimenetben is jelölve): nincs vak megoldás, igazolt útvonal, katalógus és DB-ben tárolt prompt-felülírás.
// Futtatás (source/ mappából): npx tsx scripts/measure/lektor-trial.mts <kimeneti mappa> <jobId,jobId,...>
import { mkdirSync, writeFileSync } from "node:fs";
import { withReadOnlyDb } from "../lib/read-only-db";
import { lektorChainFor } from "../../server/ai/models";
import { createStudioStepProvider } from "../../server/ai/studio-provider";
import { classifyNotes } from "../../server/studio/lektor";
import { STUDIO_PROMPT_NAMES } from "../../server/studio/prompt";
import { skilledPromptLookup } from "../../server/studio/role-skills";
import { callStepModel } from "../../server/studio/run-step";
import { buildLektorPrompt, parseLektorResponse } from "../../server/studio/step-io";
import type { Lesson } from "../../shared/lesson-schema";

const [outDir, jobArg] = process.argv.slice(2);
if (!outDir || !jobArg) throw new Error("Használat: lektor-trial.mts <kimeneti mappa> <jobId,jobId,...>");
const jobIds = jobArg.split(",").map((s) => s.trim()).filter(Boolean);
if (jobIds.length > 4) throw new Error("Költségkorlát: legfeljebb 4 job (4 lektorhívás) futásonként.");

type Input = { id: string; lesson: Lesson; authorModels: string[]; previousBlockers: Array<{ kind: string; subkind?: string; message: string; blockPath?: string }>;
  map: { title: string; subject: string; classroom: number; concepts: Array<Record<string, unknown>> } };
const inputs: Input[] = await withReadOnlyDb(async (q) => {
  const out: Input[] = [];
  for (const id of jobIds) {
    const [job] = await q<{ map_id: string; round: number; output: Record<string, unknown> }>("SELECT map_id, round, output FROM studio_jobs WHERE id=$1", [id]);
    if (!job?.output?.lesson) throw new Error(`Nincs mentett lecke: ${id}`);
    const [m] = await q<{ title: string; subject: string; classroom: number }>("SELECT title, subject, classroom FROM knowledge_maps WHERE id=$1", [job.map_id]);
    const concepts = (await q<Record<string, unknown>>("SELECT id, local_id, term, definition, quote, exam_weight FROM km_concepts WHERE map_id=$1 AND review_state IN ('kept','edited') ORDER BY order_index, id", [job.map_id]))
      .map((c) => ({ id: c.id, localId: c.local_id, term: c.term, definition: c.definition, quote: c.quote, examWeight: c.exam_weight }));
    const previousBlockers = job.round > 0 ? (await q<Record<string, string | null>>("SELECT kind, subkind, message, block_path FROM lektor_notes WHERE job_id=$1 AND severity='blocker' AND round=$2 ORDER BY created_at, id", [id, job.round - 1]))
      .map((n) => ({ kind: String(n.kind), ...(n.subkind ? { subkind: n.subkind } : {}), message: String(n.message), ...(n.block_path ? { blockPath: n.block_path } : {}) })) : [];
    const authorModels = Array.isArray(job.output.authorModels) ? (job.output.authorModels as string[]) : [];
    out.push({ id, lesson: job.output.lesson as Lesson, authorModels, previousBlockers, map: { ...m, concepts } });
  }
  return out;
});

// A 911-es besorolás kulcsszavai (docs/specs/2026-10-15-tetelgyar-bank-lektor-uj-modszertan.md, 1. fejezet).
const CLASSES: Array<[string, RegExp]> = [
  ["rubrika/nyelvi", /required|szinonim|ragoz|írásmód|alak|rubrik|elfogad|ékezet|kötőjel|toldalék|megfogalmaz|szóhasznál/i],
  ["minta↔rubrika", /minta|sample|minWords|szószám/i],
  ["kvíz-egyértelműség", /helyes opció|két helyes|is helyes|egyértelm|disztraktor/i],
  ["tényhiba/forrás", /forrás|tény|hamis állítás|ok-okozat|nem állít|ellentmond/i],
  ["számolás", /\d+\s*[-+×x*/:]\s*\d+|számol|osztható|eredmény/i],
];
const classOf = (message: string) => CLASSES.find(([, re]) => re.test(message))?.[0] ?? "egyéb";

const lookup = skilledPromptLookup(async (_name: string, fallback: string) => fallback);
const rows: Array<Record<string, unknown>> = [];
mkdirSync(outDir, { recursive: true });
{
  const variant = "élő lektor-prompt";
  for (const input of inputs) {
    const started = Date.now();
    const model = lektorChainFor(input.authorModels)[0];
    const system = await lookup(STUDIO_PROMPT_NAMES.lektor, buildLektorPrompt(input.lesson, { title: input.map.title, subject: input.map.subject, classroom: input.map.classroom, concepts: input.map.concepts as never }, input.previousBlockers));
    const row: Record<string, unknown> = { variant, jobId: input.id, model, eltérés: "vak megoldás, igazolt útvonal, katalógus és DB-prompt nélkül" };
    try {
      const r = await callStepModel(createStudioStepProvider(model, "lektor"), { step: "lektor", role: "lektor", model, system, user: "Válaszolj kizárólag a kért JSON-nal." });
      const parsed = parseLektorResponse(r.json);
      if (!parsed.ok) throw new Error(`a lektori jelentés alakilag hibás: ${parsed.reason}`);
      const notes = classifyNotes(parsed.report.notes as never);
      const blockers = notes.filter((n) => n.blocking);
      const byClass: Record<string, number> = {};
      for (const n of blockers) byClass[classOf(n.message)] = (byClass[classOf(n.message)] ?? 0) + 1;
      Object.assign(row, { blockers: blockers.length, warnings: notes.length - blockers.length, byClass, seconds: Math.round((Date.now() - started) / 1000),
        tokensIn: r.usage?.promptTokens, tokensOut: r.usage?.completionTokens, blockerMessages: blockers.map((n) => `${n.blockPath ?? "—"}: ${n.message}`.slice(0, 300)) });
    } catch (error) {
      row.error = (error instanceof Error ? error.message : String(error)).replace(/(sk-[\w-]+|Bearer\s+\S+)/g, "[titok]").slice(0, 300);
    }
    rows.push(row);
    console.log(JSON.stringify({ variant: row.variant, jobId: row.jobId, blockers: row.blockers, byClass: row.byClass, error: row.error }));
  }
}
writeFileSync(`${outDir}/lektor-trial.json`, JSON.stringify(rows, null, 2));
console.log(`Kész: ${outDir}/lektor-trial.json`);
