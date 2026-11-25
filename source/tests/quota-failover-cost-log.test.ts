import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { AIProviderQuotaError, AIProviderRateLimitError, type AIMessage, type AIResponse, type IAIProvider } from "../server/ai/AIProvider";
import { QuotaFailoverProvider, resetQuotaFailoverForTest, withQuotaFailover, QUOTA_FAILOVER_MEMORY_MS, type StudioConnection } from "../server/ai/studio-provider";
import { quotaFailoverCounters, resetQuotaFailoverCountersForTest, setQuotaFailoverSinkForTest, type QuotaFailoverEvent } from "../server/ai/quota-failover-log";
import { executeWorkflow, workflowPhase } from "../server/workflows/engine";
import { memoryWorkflows } from "./helpers/workflow-store";

/* Tulajdonosi döntés 2026-11-23 (kanban #10): a kvóta-átállás (OpenAI → OpenRouter) MARAD, de minden váltás költségnaplóba kerül.
   Terv: docs/specs/2026-11-23-kvota-atallas-koltsegnaplo.md. */

const msgs: AIMessage[] = [{ role: "user", content: "x" }];
const ROUTER_KEY_MARKER = "router-kulcs-jelolo-ne-naplozd";
let events: QuotaFailoverEvent[] = [];
let lines: string[] = [];

beforeEach(() => {
  resetQuotaFailoverForTest();
  resetQuotaFailoverCountersForTest();
  events = []; lines = [];
  setQuotaFailoverSinkForTest((event, line) => { events.push(event); lines.push(line); });
});

function stub(name: string, model: string, behaviour: () => Promise<AIResponse>): IAIProvider & { calls: number } {
  return {
    name, model, calls: 0,
    async chat(this: { calls: number }) { this.calls++; return behaviour(); },
    async *streamChat() { yield { type: "done" as const }; },
    async isAvailable() { return true; },
  };
}
const quotaFail = () => stub("OpenAI", "gpt-5.6-terra", async () => { throw new AIProviderQuotaError("OpenAI", "insufficient_quota"); });
const routerOk = () => stub("OpenRouter", "openai/gpt-5.6-terra", async () => ({ content: "tartalék", usage: { promptTokens: 1200, completionTokens: 340, totalTokens: 1540, cachedTokens: 200 } }));

test("E1: kvótahiba → a tartalékhívás költségnaplóba kerül (OpenRouterhez rendelve, tokenekkel, átállásként jelölve)", async () => {
  let now = 1_700_000_000_000;
  const provider = new QuotaFailoverProvider(quotaFail(), routerOk, () => now);
  assert.equal((await provider.chat(msgs)).content, "tartalék");
  assert.equal(events.length, 1, "a váltás nem került költségnaplóba");
  const e = events[0];
  assert.equal(e.reason, "quota");
  assert.equal(e.trigger, "quota-error");
  assert.equal(e.path, "provider");
  assert.equal(e.failover, true);
  assert.deepEqual(e.from, { provider: "openai", model: "gpt-5.6-terra" });
  assert.deepEqual(e.to, { provider: "openrouter", model: "openai/gpt-5.6-terra" });
  assert.equal(e.ok, true);
  assert.equal(e.tokensIn, 1200);
  assert.equal(e.tokensOut, 340);
  assert.equal(e.cachedTokens, 200);
  assert.equal(e.at, new Date(now).toISOString());
  assert.match(lines[0], /^\[AI\]\[quota-failover\] \{/);
  assert.deepEqual(JSON.parse(lines[0].replace("[AI][quota-failover] ", "")), e, "a naplósor a teljes eseményt hordozza (JSON)");

  // E2: a memória alatt a közvetlenül tartalékra menő hívás is rögzül.
  now += 60_000;
  await provider.chat(msgs);
  assert.equal(events.length, 2);
  assert.equal(events[1].trigger, "memory");
  assert.equal(events[1].tokensIn, 1200);
  assert.deepEqual(quotaFailoverCounters(), { switches: 1, fallbackCalls: 2, failedFallbackCalls: 0, tokensIn: 2400, tokensOut: 680 });

  // Lejárat után a közvetlen út sikeres hívása nem esemény.
  now += QUOTA_FAILOVER_MEMORY_MS + 1;
  const ok = new QuotaFailoverProvider(stub("OpenAI", "gpt-5.6-terra", async () => ({ content: "közvetlen" })), routerOk, () => now);
  await ok.chat(msgs);
  assert.equal(events.length, 2);
});

test("E1: a bukott tartalékhívás is rögzül (ok: false, csak a hibaosztály neve), a hiba továbbmegy", async () => {
  const failingRouter = () => stub("OpenRouter", "openai/gpt-5.6-terra", async () => { throw new AIProviderRateLimitError("OpenRouter"); });
  await assert.rejects(new QuotaFailoverProvider(quotaFail(), failingRouter).chat(msgs), AIProviderRateLimitError);
  assert.equal(events.length, 1);
  assert.equal(events[0].ok, false);
  assert.equal(events[0].error, "AIProviderRateLimitError");
  assert.equal(quotaFailoverCounters().failedFallbackCalls, 1);
});

test("E5: nem-kvóta hiba nem vált útvonalat és nem esemény", async () => {
  const rate = stub("OpenAI", "gpt-5.6-terra", async () => { throw new AIProviderRateLimitError("OpenAI"); });
  await assert.rejects(new QuotaFailoverProvider(rate, routerOk).chat(msgs), AIProviderRateLimitError);
  assert.equal(events.length, 0);
  assert.equal(quotaFailoverCounters().fallbackCalls, 0);
});

test("E2: a streamelt memória-út is rögzül (tokenek nélkül)", async () => {
  const provider = new QuotaFailoverProvider(quotaFail(), routerOk);
  await provider.chat(msgs);
  for await (const _chunk of provider.streamChat(msgs)) { /* üres */ }
  assert.equal(events.length, 2);
  assert.equal(events[1].trigger, "memory");
  assert.equal(events[1].tokensIn, undefined);
});

test("withQuotaFailover (nyers kliens): a tartalékhívás az OpenAI SDK usage-alakjából könyvel; E4: kulcs nem kerül a naplóba", async () => {
  const openai: StudioConnection = { vendor: "openai", apiKey: "openai-kulcs-jelolo", model: "gpt-5.6-luna", baseURL: "https://api.openai.com/v1" };
  const run = async (c: StudioConnection) => {
    if (c.vendor === "openai") throw Object.assign(new Error("429 You have no credits remaining."), { status: 429 });
    return { choices: [], usage: { prompt_tokens: 50, completion_tokens: 7 } };
  };
  await withQuotaFailover(openai, run, { OPENROUTER_API_KEY: ROUTER_KEY_MARKER }, () => 1_000);
  assert.equal(events.length, 1);
  assert.equal(events[0].path, "direct");
  assert.equal(events[0].trigger, "quota-error");
  assert.deepEqual(events[0].to, { provider: "openrouter", model: "openai/gpt-5.6-luna" });
  assert.equal(events[0].tokensIn, 50);
  assert.equal(events[0].tokensOut, 7);
  for (const line of lines) {
    assert.ok(!line.includes(ROUTER_KEY_MARKER), "OpenRouter-kulcs a naplóban");
    assert.ok(!line.includes("openai-kulcs-jelolo"), "OpenAI-kulcs a naplóban");
  }
});

test("E3: munkafolyamat-futásban a meglévő tokenkönyvelés (futás nézete + látogatás) is megkapja az átállást", async () => {
  const m = memoryWorkflows();
  const provider = new QuotaFailoverProvider(quotaFail(), routerOk);
  await executeWorkflow(m.store, { id: "fo", owner: "a", mode: "web" }, async () => {
    await workflowPhase("generate");
    await provider.chat(msgs);
    return undefined;
  }).catch(() => undefined);
  const view = m.records.get("fo")!.view;
  assert.equal(view.quotaFailovers?.length, 1, "a futás nézetében nincs átállás-bejegyzés");
  assert.equal(view.quotaFailovers![0].to.provider, "openrouter");
  assert.equal(view.quotaFailovers![0].step, "generate");
  const visit = view.visits.find((v) => v.step === "generate")!;
  assert.deepEqual(visit.failover, { provider: "openrouter", calls: 1, tokensIn: 1200, tokensOut: 340 });
});

/* Review-szálak (PR #546, Codex/Vercel/Copilot): a tartalék stream megszakításkor `{ type: "error" }` darabot ad (nem dob),
   a fogyasztó pedig ilyenkor dob vagy kilép a ciklusból → a generátor `return()`-t kap. A könyvelésnek PONTOSAN EGYSZER
   kell futnia, és a `done` előtti hiba-darab vagy korai lezárás `ok: false`. */
function streamRouter(chunks: Array<{ type: "content_delta"; content: string } | { type: "error"; message: string } | { type: "done" }>) {
  return (): IAIProvider => ({
    name: "OpenRouter", model: "openai/gpt-5.6-terra",
    async chat() { return { content: "tartalék" }; },
    async *streamChat() { for (const c of chunks) yield c; },
    async isAvailable() { return true; },
  });
}
async function memoryProvider(router: () => IAIProvider) {
  const provider = new QuotaFailoverProvider(quotaFail(), router);
  await provider.chat(msgs); // kvótahiba → a memória bekapcsol; a stream ezután a tartalékra megy
  events = []; resetQuotaFailoverCountersForTest();
  return provider;
}

test("S1: a végigolvasott hiba-darab (done nélkül) → egyszer, ok: false", async () => {
  const provider = await memoryProvider(streamRouter([{ type: "content_delta", content: "a" }, { type: "error", message: "Request aborted" }]));
  const seen: string[] = [];
  for await (const chunk of provider.streamChat(msgs)) seen.push(chunk.type);
  assert.deepEqual(seen, ["content_delta", "error"]);
  assert.equal(events.length, 1);
  assert.equal(events[0].ok, false);
  assert.equal(events[0].trigger, "memory");
  assert.equal(quotaFailoverCounters().failedFallbackCalls, 1);
});

test("S2: a fogyasztó a hiba-darabnál dob (generátor return()) → egyszer, ok: false", async () => {
  const provider = await memoryProvider(streamRouter([{ type: "error", message: "Request aborted" }, { type: "done" }]));
  await assert.rejects((async () => {
    for await (const chunk of provider.streamChat(msgs)) if (chunk.type === "error") throw new Error(chunk.message);
  })(), /Request aborted/);
  assert.equal(events.length, 1);
  assert.equal(events[0].ok, false);
});

test("S3: korai kilépés (break a done előtt) → egyszer, ok: false", async () => {
  const provider = await memoryProvider(streamRouter([{ type: "content_delta", content: "a" }, { type: "content_delta", content: "b" }, { type: "done" }]));
  for await (const _chunk of provider.streamChat(msgs)) break;
  assert.equal(events.length, 1);
  assert.equal(events[0].ok, false);
});

test("S4: normál befejezés (done) → egyszer, ok: true", async () => {
  const provider = await memoryProvider(streamRouter([{ type: "content_delta", content: "a" }, { type: "done" }]));
  for await (const _chunk of provider.streamChat(msgs)) { /* végigolvas */ }
  assert.equal(events.length, 1);
  assert.equal(events[0].ok, true);
});
