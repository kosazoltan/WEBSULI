import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { AIProviderIdleTimeoutError, type AIMessage } from "../server/ai/AIProvider";
import { ClaudeProvider } from "../server/ai/ClaudeProvider";

/*
 * Spec 2026-10-14-claude-stream-gondolkodas-eletjel. Mért hiba: a szerző (Opus 5.5) a „omitted” gondolkodás alatt 120 s-ig nem
 * adott deltát → tétlenségi hiba egy egészséges hívásra. A gondolkodás állapotjelei haladásnak számítanak, a ping nem.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const msgs: AIMessage[] = [{ role: "user", content: "x" }];
const ev = (type: string, data: object = {}) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
const start = ev("message_start", { message: { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 0 } } });
const thinkingStart = ev("content_block_start", { index: 0, content_block: { type: "thinking", thinking: "", signature: "" } });
const textTail = [
  ev("content_block_start", { index: 1, content_block: { type: "text", text: "" } }),
  ev("content_block_delta", { index: 1, delta: { type: "text_delta", text: "kész" } }),
  ev("content_block_stop", { index: 1 }),
  ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 9 } }),
  ev("message_stop"),
];

/** SSE fetch-mock: a keretek (szöveg) és szünetek (ms) sorrendben; `stall` → a végén nem zár (csak a megszakítás). */
function mockClaude(t: TestContext, frames: Array<string | number>, opts: { stall?: boolean } = {}) {
  const bodies: Array<Record<string, unknown>> = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        init?.signal?.addEventListener("abort", () => { closed = true; controller.error(new DOMException("aborted", "AbortError")); });
        const enc = new TextEncoder();
        for (const f of frames) {
          if (closed) return;
          if (typeof f === "number") await sleep(f); else controller.enqueue(enc.encode(f));
        }
        if (!opts.stall && !closed) controller.close();
      },
    });
    return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
  });
  return bodies;
}

test("A1+A3: összefoglaló gondolkodás-delták idleMs-en túl → nem tétlenség; a kérés summarized display-t kér", async (t) => {
  const deltas = Array.from({ length: 6 }, (_, i) => [30, ev("content_block_delta", { index: 0, delta: { type: "thinking_delta", thinking: `lépés ${i} ` } })]).flat();
  const bodies = mockClaude(t, [start, thinkingStart, ...deltas, ev("content_block_delta", { index: 0, delta: { type: "signature_delta", signature: "sig" } }), ev("content_block_stop", { index: 0 }), ...textTail]);
  const p = new ClaudeProvider({ apiKey: "test-placeholder", model: "claude-opus-5-5", maxTokens: 1000 });
  const res = await p.chat(msgs, undefined, { stream: { idleMs: 80 } });
  assert.equal(res.content, "kész", "a gondolkodás szövege nem kerül a tartalomba");
  assert.equal(res.finishReason, "end_turn");
  assert.deepEqual(bodies[0]?.thinking, { type: "adaptive", display: "summarized" });
});

test("A3: csak gondolkodás-állapotjelek (blokk-kezdet, aláírás, blokk-vég) szöveg nélkül, idleMs-en túl → siker", async (t) => {
  mockClaude(t, [start, 50, thinkingStart, 50, ev("content_block_delta", { index: 0, delta: { type: "signature_delta", signature: "sig" } }), 50,
    ev("content_block_stop", { index: 0 }), 50, ev("content_block_start", { index: 1, content_block: { type: "redacted_thinking", data: "x" } }), 50,
    ev("content_block_stop", { index: 1 }), 50, ...textTail]);
  const p = new ClaudeProvider({ apiKey: "test-placeholder", model: "claude-opus-5-5", maxTokens: 1000 });
  assert.equal((await p.chat(msgs, undefined, { stream: { idleMs: 80 } })).content, "kész");
});

test("A4: a valódi elakadás védett — gondolkodás-kezdet után csak ping (az SDK eldobja) → tétlenségi hiba", async (t) => {
  mockClaude(t, [start, thinkingStart, ...Array.from({ length: 6 }, () => [30, ev("ping")]).flat()], { stall: true });
  const p = new ClaudeProvider({ apiKey: "test-placeholder", model: "claude-opus-5-5", maxTokens: 1000 });
  await assert.rejects(p.chat(msgs, undefined, { stream: { idleMs: 80 } }), (e: unknown) => {
    assert.ok(e instanceof AIProviderIdleTimeoutError, String(e));
    assert.equal(e.partialContent, "");
    return true;
  });
});

test("A4: teljesen néma stream a kezdés után → tétlenségi hiba", async (t) => {
  mockClaude(t, [start], { stall: true });
  const p = new ClaudeProvider({ apiKey: "test-placeholder", model: "claude-opus-5-5", maxTokens: 1000 });
  await assert.rejects(p.chat(msgs, undefined, { stream: { idleMs: 80 } }), (e: unknown) => e instanceof AIProviderIdleTimeoutError);
});

test("A2: beállított effort mellett a display summarized, az effort változatlan", async (t) => {
  const bodies = mockClaude(t, [start, ...textTail]);
  const p = new ClaudeProvider({ apiKey: "test-placeholder", model: "claude-opus-5", maxTokens: 1000, reasoningEffort: "high" });
  await p.chat(msgs, undefined, { stream: { idleMs: 500 } });
  assert.deepEqual(bodies[0]?.thinking, { type: "adaptive", display: "summarized" });
  assert.deepEqual(bodies[0]?.output_config, { effort: "high" });
});

test("A6: régi modell effort nélkül → a streamelt kérés nem küld thinking mezőt", async (t) => {
  const bodies = mockClaude(t, [start, ...textTail]);
  const p = new ClaudeProvider({ apiKey: "test-placeholder", model: "claude-3-5-haiku-latest", maxTokens: 1000 });
  await p.chat(msgs, undefined, { stream: { idleMs: 500 } });
  assert.equal("thinking" in (bodies[0] ?? {}), false);
});
