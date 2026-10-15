// Tételgyár T2.0 (docs/specs/2026-10-15-tetelgyar-t2-valaszkulcs-tesztek-vegrehajtas.md): a válaszkulcs-tesztek mérése mentett jobok bankján,
// DB-ÍRÁS NÉLKÜL. A T2.1 tesztírója (olcsó modell, a rubrikát nem látja) + a valódi pontozó; összevetés a lektor rubrika-blokkolóival.
// Futtatás (source/ mappából): npx tsx scripts/measure/answer-key-trial.mts <kimeneti mappa> <jobId,jobId,...>
import { mkdirSync, writeFileSync } from "node:fs";
import { withReadOnlyDb } from "../lib/read-only-db";
import { FALLBACK_MODELS, resolveStudioModel } from "../../server/ai/models";
import { createStudioStepProvider } from "../../server/ai/studio-provider";
import { callStepModel } from "../../server/studio/run-step";
import { writeAnswerKeys } from "../../server/studio/answer-key-writer";
import { answerKeyProblems, type AnswerKeyCases } from "../../shared/answer-key-tests";
import { isTypedTask } from "../../shared/lesson-experience-score";
import type { OpenTask } from "../../shared/lesson-experience";

const [outDir, jobArg] = process.argv.slice(2);
if (!outDir || !jobArg) throw new Error("Használat: answer-key-trial.mts <kimeneti mappa> <jobId,jobId,...>");
const jobIds = jobArg.split(",").map((s) => s.trim()).filter(Boolean);
if (jobIds.length > 4) throw new Error("Költségkorlát: legfeljebb 4 job.");

// A T8-mérés besorolása (lektor-trial.mts): a rubrika/nyelvi és a minta↔rubrika osztály a T2 célja.
const RUBRIC = /required|szinonim|ragoz|írásmód|alak|rubrik|elfogad|ékezet|kötőjel|toldalék|megfogalmaz|szóhasznál|minta|sample|minWords|szószám/i;

type Note = { message: string; blockPath: string | null; itemId: string | null };
type Input = { id: string; classroom: number; tasks: OpenTask[]; concepts: Array<{ id: string; term: string; definition: string }>; notes: Note[] };
const inputs: Input[] = await withReadOnlyDb(async (q) => {
  const out: Input[] = [];
  for (const id of jobIds) {
    const [job] = await q<{ map_id: string; output: { lesson?: { experience?: { tasks?: OpenTask[] } } } }>("SELECT map_id, output FROM studio_jobs WHERE id=$1", [id]);
    const tasks = job?.output?.lesson?.experience?.tasks ?? [];
    if (!tasks.length) throw new Error(`Nincs mentett bank: ${id}`);
    const [m] = await q<{ classroom: number }>("SELECT classroom FROM knowledge_maps WHERE id=$1", [job.map_id]);
    // A feladatok `coversConceptIds`-e a fogalom térképen belüli azonosítójára (`local_id`) hivatkozik.
    const concepts = (await q<{ id: string; term: string; definition: string }>("SELECT local_id AS id, term, definition FROM km_concepts WHERE map_id=$1 AND review_state IN ('kept','edited')", [job.map_id]));
    const notes = (await q<{ message: string; block_path: string | null; item_id: string | null }>("SELECT message, block_path, item_id FROM lektor_notes WHERE job_id=$1 AND severity='blocker' ORDER BY created_at, id", [id]))
      .map((n) => ({ message: n.message, blockPath: n.block_path, itemId: n.item_id }));
    out.push({ id, classroom: m?.classroom ?? 0, tasks, concepts, notes });
  }
  return out;
});

const models = [...new Set([FALLBACK_MODELS.gateHelper, resolveStudioModel("gateHelper")].filter((m): m is string => !!m))];
const call = async (system: string, user: string) => {
  let last: unknown;
  for (const model of models) {
    try { return (await callStepModel(createStudioStepProvider(model, "gateHelper"), { step: "animator", policy: "gateHelper", role: "blind-solver", model, system, user })).json; }
    catch (error) { last = error; console.warn(`[mérés] ${model} hibázott: ${(error instanceof Error ? error.message : String(error)).slice(0, 160)}`); }
  }
  throw last;
};

const rows: Array<Record<string, unknown>> = [];
const summary: Record<string, Record<string, number>> = {};
mkdirSync(outDir, { recursive: true });
for (const input of inputs) {
  const cache = new Map<string, AnswerKeyCases>();
  const warnings: string[] = [];
  const open = input.tasks.filter((t) => !isTypedTask(t));
  const keys = new Map<string, AnswerKeyCases>();
  // Csomagonként (fejezet) egy hívás, legfeljebb 8 feladattal (korlátos kimenet).
  const bySection = new Map<number, OpenTask[]>();
  for (const t of open) bySection.set(t.sectionIndex, [...(bySection.get(t.sectionIndex) ?? []), t]);
  for (const group of bySection.values()) {
    for (let i = 0; i < group.length; i += 8) {
      const got = await writeAnswerKeys(group.slice(i, i + 8), { classroom: input.classroom, concepts: input.concepts }, call, cache, (w) => warnings.push(w));
      for (const [id, c] of got) keys.set(id, c);
    }
  }
  const s = { tasks: open.length, tested: 0, t2Fail: 0, correctFail: 0, wrongPass: 0, lektorRubric: 0, both: 0, onlyT2: 0, onlyLektor: 0 };
  input.tasks.forEach((task, index) => {
    if (isTypedTask(task)) return;
    const lektor = input.notes.filter((n) => (n.itemId ? n.itemId === task.id : n.blockPath?.startsWith(`experience.tasks[${index}]`)) && RUBRIC.test(n.message));
    const cases = keys.get(task.id) ?? null;
    const problems = answerKeyProblems(task, cases);
    if (cases) s.tested++;
    const t2 = problems.length > 0;
    if (t2) s.t2Fail++;
    s.correctFail += problems.filter((p) => /helyes válasz/.test(p)).length;
    s.wrongPass += problems.filter((p) => /hibás \(/.test(p)).length;
    if (lektor.length) s.lektorRubric++;
    if (t2 && lektor.length) s.both++; else if (t2) s.onlyT2++; else if (lektor.length && cases) s.onlyLektor++;
    if (t2 || lektor.length) rows.push({ jobId: input.id, taskId: task.id, q: task.q.slice(0, 200), required: task.required, problems, lektor: lektor.map((n) => n.message.slice(0, 300)), cases });
  });
  summary[input.id] = s;
  console.log(JSON.stringify({ jobId: input.id, ...s, warnings: warnings.slice(0, 3) }));
}
writeFileSync(`${outDir}/answer-key-trial.json`, JSON.stringify({ models, summary, rows }, null, 2));
console.log(`Kész: ${outDir}/answer-key-trial.json`);
