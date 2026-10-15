// Tételgyár T6.0 (docs/specs/2026-10-15-tetelgyar-t6-kviz-vak-megoldas-vegrehajtas.md): a kvíz vak, opciónkénti ítélete jelölt modellekkel,
// DB-ÍRÁS NÉLKÜL, összevetve az Opus bank-ellenőr meglévő egyválasztós leleteivel. A kód döntése a meglévő `choiceVerdictProblem`.
// Futtatás (source/ mappából): npx tsx scripts/measure/quiz-blind-trial.mts <kimeneti mappa> <jobId,…> [modell,modell]
import { mkdirSync, writeFileSync } from "node:fs";
import { withReadOnlyDb } from "../lib/read-only-db";
import { createStudioStepProvider } from "../../server/ai/studio-provider";
import { callStepModel } from "../../server/studio/run-step";
import { choiceVerdictProblem } from "../../server/studio/bank-verifier";
import type { Lesson } from "../../shared/lesson-schema";

const [outDir, jobArg, modelArg] = process.argv.slice(2);
if (!outDir || !jobArg) throw new Error("Használat: quiz-blind-trial.mts <kimeneti mappa> <jobId,…> [modell,modell]");
const jobIds = jobArg.split(",").map((s) => s.trim()).filter(Boolean);
if (jobIds.length > 4) throw new Error("Költségkorlát: legfeljebb 4 job.");
// Tulajdonosi döntés 2026-10-15: az olcsó jelölt a MiniMax M3 max (xhigh) efforttal, OpenRouteren (a GLM 5.3 Flash helyett).
const models = (modelArg ?? "minimax/minimax-m3,gpt-6.1-sol").split(",").map((s) => s.trim());

/**
 * A MiniMax M3 közvetlen OpenRouter-hívása az élő próbán igazolt beállítással (2026-10-15): `reasoning: { effort: "xhigh", enabled: true }`,
 * a MiniMax saját szolgáltatója elöl (a Together-útvonalon a gondolkodás 0 tokenes volt), JSON-mód. Kulcs: OPENROUTER_API_KEY (csak env).
 */
async function callOpenRouter(model: string, system: string, user: string): Promise<{ json: unknown; reasoningTokens: number }> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY hiányzik");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", signal: AbortSignal.timeout(240_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, reasoning: { effort: "xhigh", enabled: true }, include_reasoning: true, response_format: { type: "json_object" }, max_tokens: 32_000,
      provider: { order: ["Minimax"], allow_fallbacks: true }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  const body = await res.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { completion_tokens_details?: { reasoning_tokens?: number } }; error?: { message?: string } };
  if (!res.ok || body.error) throw new Error(`OpenRouter ${res.status}: ${body.error?.message ?? ""}`.slice(0, 200));
  const text = (body.choices?.[0]?.message?.content ?? "").replace(/^```(?:json)?\s*|```\s*$/g, "");
  return { json: JSON.parse(text), reasoningTokens: body.usage?.completion_tokens_details?.reasoning_tokens ?? 0 };
}
const CHUNK = 12;

type Quiz = { id: string; sectionIndex: number; question: string; options: string[]; correctIndex: number };
type Input = { id: string; lesson: Lesson; opus: Map<string, string> };
const inputs: Input[] = await withReadOnlyDb(async (q) => {
  const out: Input[] = [];
  for (const id of jobIds) {
    const [job] = await q<{ output: { lesson?: Lesson } }>("SELECT output FROM studio_jobs WHERE id=$1", [id]);
    if (!job?.output?.lesson?.experience) throw new Error(`Nincs mentett lecke: ${id}`);
    const notes = await q<{ message: string; block_path: string | null; item_id: string | null }>(
      "SELECT message, block_path, item_id FROM lektor_notes WHERE job_id=$1 AND message LIKE 'Bank-ellenőr: Egyválasztós tétel%' ORDER BY created_at", [id]);
    const quiz = job.output.lesson.experience.quiz as Quiz[];
    const opus = new Map<string, string>();
    for (const n of notes) {
      const byPath = /^experience\.quiz\[(\d+)\]/.exec(n.block_path ?? "")?.[1];
      const itemId = n.item_id ?? (byPath !== undefined ? quiz[Number(byPath)]?.id : undefined);
      if (itemId) opus.set(itemId, n.message.slice(0, 300));
    }
    out.push({ id, lesson: job.output.lesson, opus });
  }
  return out;
});

function teaching(section: Lesson["sections"][number] | undefined): string {
  if (!section) return "";
  return section.blocks.flatMap((b) => b.kind === "explain" ? [b.text] : b.kind === "example" ? [`Példa: ${b.problem} | ${b.steps.join(" → ")} | ${b.answer}`] : b.kind === "recap" ? b.bullets : []).join("\n").slice(0, 8000);
}

const SYSTEM = [
  "Független ellenőr vagy egy magyar iskolai gyakorlókvízhez. A helyes választ szándékosan NEM kapod meg.",
  "Minden kérdés MINDEN opciójáról külön döntsd el, hogy igaz/helyes válasz-e a kérdésre (true) vagy hamis (false), a fejezet tanítása és a",
  "kérdés szövege alapján. Ha egy opció is védhetően helyes, true. Ne találgass a kérdező szándékára: a szöveg dönt.",
  'Kizárólag JSON: { "choices": [ { "id": "<kérdés id>", "truths": [true, false, false, false] } ] } — minden kérdéshez pontosan egy elem, opciónként sorrendben.',
].join("\n");

const rows: Array<Record<string, unknown>> = [];
const summary: Record<string, Record<string, number>> = {};
mkdirSync(outDir, { recursive: true });
for (const model of models) {
  const s = { items: 0, judged: 0, flagged: 0, opusFlagged: 0, bothFlagged: 0, onlyModel: 0, onlyOpus: 0, seconds: 0, calls: 0, failedCalls: 0, reasoningTokens: 0 };
  for (const input of inputs) {
    const quiz = input.lesson.experience!.quiz as Quiz[];
    const bySection = new Map<number, Quiz[]>();
    for (const item of quiz) bySection.set(item.sectionIndex, [...(bySection.get(item.sectionIndex) ?? []), item]);
    for (const [sectionIndex, items] of bySection) {
      for (let i = 0; i < items.length; i += CHUNK) {
        const chunk = items.slice(i, i + CHUNK);
        const user = `A FEJEZET TANÍTÁSA (adat):\n${teaching(input.lesson.sections[sectionIndex])}\n\nKÉRDÉSEK (adat):\n${JSON.stringify(chunk.map((c) => ({ id: c.id, question: c.question, options: c.options })))}`;
        const started = Date.now();
        let truthsById = new Map<string, boolean[]>();
        try {
          const r = model.includes("/")
            ? await callOpenRouter(model, SYSTEM, user)
            : await callStepModel(createStudioStepProvider(model, "arbiter"), { step: "lektor", policy: "arbiter", role: "blind-solver", model, system: SYSTEM, user });
          if ("reasoningTokens" in r) s.reasoningTokens += r.reasoningTokens as number;
          const choices = (r.json as { choices?: Array<{ id?: unknown; truths?: unknown }> } | null)?.choices ?? [];
          truthsById = new Map(choices.filter((c) => typeof c.id === "string" && Array.isArray(c.truths)).map((c) => [c.id as string, (c.truths as unknown[]).map(Boolean)]));
        } catch (error) {
          s.failedCalls++;
          console.warn(`[mérés] ${model} hibázott: ${(error instanceof Error ? error.message : String(error)).slice(0, 160)}`);
        }
        s.calls++; s.seconds += (Date.now() - started) / 1000;
        for (const item of chunk) {
          s.items++;
          const truths = truthsById.get(item.id);
          const verdict = truths ? choiceVerdictProblem({ options: item.options, correctIndex: item.correctIndex }, truths) : null;
          const judged = !!truths && verdict?.kind !== "undecidable";
          const flagged = judged && verdict?.kind === "error";
          const opus = input.opus.get(item.id);
          if (judged) s.judged++;
          if (flagged) s.flagged++;
          if (opus) s.opusFlagged++;
          if (flagged && opus) s.bothFlagged++; else if (flagged) s.onlyModel++; else if (opus && judged) s.onlyOpus++;
          if (flagged || opus) rows.push({ model, jobId: input.id, itemId: item.id, question: item.question.slice(0, 200), options: item.options, key: item.correctIndex, truths, modelVerdict: verdict && verdict.kind === "error" ? verdict.message.slice(0, 240) : null, opus: opus ?? null });
        }
      }
    }
  }
  summary[model] = { ...s, seconds: Math.round(s.seconds) };
  console.log(JSON.stringify({ model, ...summary[model] }));
}
writeFileSync(`${outDir}/quiz-blind-trial.json`, JSON.stringify({ models, jobs: jobIds, summary, rows }, null, 2));
console.log(`Kész: ${outDir}/quiz-blind-trial.json`);
