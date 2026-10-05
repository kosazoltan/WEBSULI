import test from "node:test";
import assert from "node:assert/strict";
import { collectStream, type StreamEvent } from "../server/ai/stream-collect";
import { AIProviderIdleTimeoutError, type IAIProvider, type ChatCallOptions, type AIMessage } from "../server/ai/AIProvider";
import { OpenRouterProvider } from "../server/ai/OpenRouterProvider";
import { OpenAIProvider } from "../server/ai/OpenAIProvider";
import { callStepModel } from "../server/studio/run-step";
import { STREAM_IDLE_MS, stepStreamIdleMs } from "../server/ai/studio-provider";

/* Spec 2026-10-05-s10-adatvesztes-mentesseg — streamelt hívás tétlenségi őrrel; a részleges szöveg nem vész el. */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function* gen(events: Array<StreamEvent | number | Error>): AsyncGenerator<StreamEvent> {
  for (const e of events) {
    if (typeof e === "number") { await sleep(e); continue; }
    if (e instanceof Error) throw e;
    yield e;
  }
}

test("gyűjtés: szöveg-darabok, záró használat és befejezési ok", async () => {
  const res = await collectStream(gen([{ text: '{"a":' }, { activity: true }, { text: "1}" , finishReason: "stop" }, { usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 } }]), { idleMs: 200, abort: () => undefined, provider: "t" });
  assert.deepEqual(res, { content: '{"a":1}', finishReason: "stop", usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 } });
});

test("tétlenség: megszakít, és a hiba a már beérkezett szöveget hordozza", async () => {
  let aborted = false;
  await assert.rejects(collectStream(gen([{ text: "részleges " }, { text: "válasz" }, 500, { text: "soha" }]), { idleMs: 60, abort: () => { aborted = true; }, provider: "t" }), (e: unknown) => {
    assert.ok(e instanceof AIProviderIdleTimeoutError);
    assert.equal(e.partialContent, "részleges válasz");
    return true;
  });
  assert.ok(aborted, "a kérés megszakítva");
});

test("a csak-gondolkodás (aktivitás) darab újraindítja az őrt — a lassú, de élő modell nem bukik", async () => {
  const res = await collectStream(gen([{ activity: true }, 40, { activity: true }, 40, { activity: true }, 40, { text: "kész" }]), { idleMs: 70, abort: () => undefined, provider: "t" });
  assert.equal(res.content, "kész");
});

test("stream közbeni hiba: a hiba részleges szöveggel jön vissza", async () => {
  await assert.rejects(collectStream(gen([{ text: "eleje" }, new Error("szolgáltatói hiba")]), { idleMs: 200, abort: () => undefined, provider: "t" }), (e: unknown) => {
    assert.equal((e as { partialContent?: string }).partialContent, "eleje");
    return true;
  });
});

/** SSE-válasz fetch-mockhoz: a darabok között szünet; `stallAfter` után nem jön több adat (csak a megszakítás zárja). */
function sseResponse(frames: string[], init?: RequestInit, opts: { gapMs?: number; stallAfter?: number } = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      init?.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
      for (let i = 0; i < frames.length; i++) {
        if (opts.stallAfter !== undefined && i >= opts.stallAfter) return;
        controller.enqueue(enc.encode(frames[i]));
        if (opts.gapMs) await sleep(opts.gapMs);
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}
const chunk = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
const msgs: AIMessage[] = [{ role: "user", content: "x" }];

test("OpenRouter: streamelt kérés (stream + include_usage, JSON-mód), a válasz és a használat összeáll", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.stream, true);
    assert.deepEqual(body.stream_options, { include_usage: true });
    assert.deepEqual(body.response_format, { type: "json_object" });
    return sseResponse([
      chunk({ id: "1", object: "chat.completion.chunk", model: "m", created: 1, choices: [{ index: 0, delta: { reasoning: "gondolkodom" }, finish_reason: null }] }),
      chunk({ id: "1", object: "chat.completion.chunk", model: "m", created: 1, choices: [{ index: 0, delta: { content: '{"ok":' }, finish_reason: null }] }),
      chunk({ id: "1", object: "chat.completion.chunk", model: "m", created: 1, choices: [{ index: 0, delta: { content: "true}" }, finish_reason: "stop" }] }),
      chunk({ id: "1", object: "chat.completion.chunk", model: "m", created: 1, choices: [{ index: 0, delta: { content: "" }, finish_reason: "stop" }], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } }),
      "data: [DONE]\n\n",
    ], init);
  });
  const p = new OpenRouterProvider({ apiKey: "sk-or-test", model: "z-ai/glm-5.3-flash", jsonMode: true, maxRetries: 0 });
  const res = await p.chat(msgs, undefined, { stream: { idleMs: 500 } });
  assert.equal(res.content, '{"ok":true}');
  assert.equal(res.finishReason, "stop");
  assert.deepEqual(res.usage, { promptTokens: 7, completionTokens: 3, totalTokens: 10 });
});

test("OpenRouter: megakadó stream → tétlenségi hiba a részleges szöveggel (nem vész el)", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => sseResponse([
    chunk({ id: "1", object: "chat.completion.chunk", model: "m", created: 1, choices: [{ index: 0, delta: { content: '{"items":[1,2' }, finish_reason: null }] }),
    chunk({ id: "1", object: "chat.completion.chunk", model: "m", created: 1, choices: [{ index: 0, delta: { content: ",3]}" }, finish_reason: "stop" }] }),
  ], init, { stallAfter: 1 }));
  const p = new OpenRouterProvider({ apiKey: "sk-or-test", model: "m", maxRetries: 0 });
  await assert.rejects(p.chat(msgs, undefined, { stream: { idleMs: 80 } }), (e: unknown) => {
    assert.ok(e instanceof AIProviderIdleTimeoutError);
    assert.equal(e.partialContent, '{"items":[1,2');
    return true;
  });
});

test("xAI Responses (a lektor útja): streamelt kérés, szöveg-delták és záró használat", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), "https://api.x.ai/v1/responses");
    assert.equal(JSON.parse(String(init?.body)).stream, true);
    const ev = (type: string, extra: object) => `event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: 1, ...extra })}\n\n`;
    return sseResponse([
      ev("response.reasoning_summary_text.delta", { delta: "…", item_id: "r", output_index: 0, summary_index: 0 }),
      ev("response.output_text.delta", { delta: '{"checks":', item_id: "m", output_index: 1, content_index: 0, logprobs: [] }),
      ev("response.output_text.delta", { delta: "[]}", item_id: "m", output_index: 1, content_index: 0, logprobs: [] }),
      ev("response.completed", { response: { id: "x", object: "response", status: "completed", output: [], usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 } } }),
    ], init);
  });
  const p = new OpenAIProvider({ apiKey: "test-placeholder", model: "grok-4.6", apiMode: "responses", maxRetries: 0 }, "xai");
  const res = await p.chat(msgs, undefined, { stream: { idleMs: 500 } });
  assert.deepEqual(res, { content: '{"checks":[]}', finishReason: "stop", usage: { promptTokens: 20, completionTokens: 5, totalTokens: 25 } });
});

test("run-step: hosszú lépés + streamelni tudó szolgáltató → stream opció; rövid lépés vagy nem képes szolgáltató → a régi kérés", async () => {
  assert.equal(stepStreamIdleMs("lektor"), STREAM_IDLE_MS);
  assert.equal(stepStreamIdleMs("bank"), STREAM_IDLE_MS);
  assert.equal(stepStreamIdleMs("topicFocus"), undefined);
  const seen: Array<ChatCallOptions | undefined> = [];
  const fake = (supports: boolean): IAIProvider => ({ name: "fake", model: "m", supportsStreamingChat: supports,
    chat: async (_m, _s, o) => { seen.push(o); return { content: '{"ok":true}', finishReason: "stop" }; },
    streamChat: async function* () { /* nem használt */ }, isAvailable: async () => true });
  await callStepModel(fake(true), { step: "lektor", role: "lektor", model: "m", system: "S", user: "U" });
  await callStepModel(fake(false), { step: "lektor", role: "lektor", model: "m", system: "S", user: "U" });
  await callStepModel(fake(true), { step: "pedagogue", policy: "topicFocus", role: "pedagogue", model: "m", system: "S", user: "U" });
  assert.deepEqual(seen[0]?.stream, { idleMs: STREAM_IDLE_MS });
  assert.equal(seen[1]?.stream, undefined);
  assert.equal(seen[2]?.stream, undefined);
});
