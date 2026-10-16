// Spec 2026-10-15-tartalek-b4-webgyujtes (C4): a webes forrásgyűjtés GPT-6.1 Sol tartalékának élő mérése 3 témán.
// Valódi keresés (OpenAI Responses web_search) + védett letöltés. Oldalszöveg NEM kerül a kimenetbe, csak statisztika.
// Futtatás (source/ mappából): npx tsx scripts/measure/web-gpt-gather.mts [kimenet.json]
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { fetchPublicPage } from "../../server/studio/safe-fetch";
import { gatherWebSourcesGpt, openAiWebSearch } from "../../server/studio/web-gather-gpt";

const TOPICS = [
  { message: "Törtek összeadása és kivonása", classroom: 5 },
  { message: "A honfoglalás és a kalandozások kora", classroom: 6 },
  { message: "A növények fotoszintézise", classroom: 7 },
];
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const results = [];
for (const topic of TOPICS) {
  const t0 = Date.now();
  let candidates = 0, downloadFailures = 0, inputTokens = 0, outputTokens = 0;
  const failureKinds: Record<string, number> = {};
  try {
    const sources = await gatherWebSourcesGpt(topic as never, {
      model: "gpt-6.1-sol",
      search: async (req) => {
        const r = await openAiWebSearch(req);
        inputTokens = r.usage?.input_tokens ?? 0; outputTokens = r.usage?.output_tokens ?? 0;
        const { candidateUrls } = await import("../../server/studio/web-gather-gpt");
        candidates = candidateUrls(r.output).length;
        return r;
      },
      download: async (url, signal) => {
        try { return await fetchPublicPage(url, { signal }); }
        catch (e) { downloadFailures++; const kind = String((e as Error).message).split(":")[0].slice(0, 40); failureKinds[kind] = (failureKinds[kind] ?? 0) + 1; throw e; }
      },
    });
    const lengths = sources.map((s) => s.text.length);
    results.push({ topic: topic.message, classroom: topic.classroom, ok: true, seconds: Math.round((Date.now() - t0) / 100) / 10, candidates, downloadFailures, failureKinds,
      sources: sources.length, medianChars: median(lengths), minChars: Math.min(...lengths), hosts: sources.map((s) => new URL(s.url).hostname), inputTokens, outputTokens });
  } catch (e) {
    results.push({ topic: topic.message, classroom: topic.classroom, ok: false, seconds: Math.round((Date.now() - t0) / 100) / 10, candidates, downloadFailures, failureKinds, error: String((e as Error).message).slice(0, 200) });
  }
  console.log(JSON.stringify(results.at(-1)));
}
const out = process.argv[2];
if (out) writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString(), model: "gpt-6.1-sol", reasoningEffort: "medium", tool: "web_search (high, HU)", results }, null, 2) + "\n");
