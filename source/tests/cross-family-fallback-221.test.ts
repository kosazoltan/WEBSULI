import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { AIResponse } from "../server/ai/AIProvider";
import { chatJsonWithFallback } from "../server/studio/fallback-attempt";

/*
 * Review #221 (spec 2026-10-14-tartalek-b-szelet): a kivonatolók tartalék-határa — a szolgáltatói ÉS a kimeneti hiba vált,
 * a felhasználás könyvelésének (persist) hibája NEM indít fizetős tartalékot.
 */

function withEnv(t: TestContext, values: Record<string, string>) {
  const before = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}
const ok = (content: string, finishReason = "stop"): AIResponse => ({ content, finishReason, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } });
const check = (r: AIResponse) => { const p = JSON.parse(r.content); if (!Array.isArray(p.concepts)) throw new Error("nincs fogalomlista"); return p; };

test("chatJsonWithFallback: hibás elsődleges kimenet → tartalék; mindkét válasz könyvelve; tartalék-jelzés", async () => {
  const calls: Array<[string, boolean]> = [];
  let booked = 0;
  const result = await chatJsonWithFallback({
    primary: "gpt-5.6-terra", ready: () => true, check, book: async () => { booked++; },
    call: async (m, fallback) => { calls.push([m, fallback]); return m === "gpt-5.6-terra" ? ok('{"title":"x"}') : ok('{"title":"T","concepts":[]}'); },
  });
  assert.deepEqual(result, { title: "T", concepts: [] });
  assert.deepEqual(calls, [["gpt-5.6-terra", false], ["claude-opus-5-5", true]]);
  assert.equal(booked, 2, "az elutasított elsődleges válasz is kifizetett — könyvelve");
});

test("chatJsonWithFallback: a könyvelés (persist) hibája továbbmegy, NEM indít tartalékhívást", async () => {
  let calls = 0;
  const lost = new Error("A futást már másik végrehajtó kezeli.");
  await assert.rejects(chatJsonWithFallback({
    primary: "gpt-5.6-terra", ready: () => true, check, book: async () => { throw lost; },
    call: async () => { calls++; return ok('{"title":"T","concepts":[]}'); },
  }), (e) => e === lost);
  assert.equal(calls, 1);
});

test("chatJsonWithFallback: szolgáltatói hiba → tartalék; megszakításnál és kulcs nélkül az eredeti hiba", async () => {
  const boom = new Error("[OpenAI] 500");
  const calls: string[] = [];
  const result = await chatJsonWithFallback({
    primary: "gpt-5.6-terra", ready: () => true, check, book: async () => undefined,
    call: async (m) => { calls.push(m); if (m === "gpt-5.6-terra") throw boom; return ok('{"title":"T","concepts":[1]}'); },
  });
  assert.deepEqual(result, { title: "T", concepts: [1] });
  assert.deepEqual(calls, ["gpt-5.6-terra", "claude-opus-5-5"]);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(chatJsonWithFallback({ primary: "gpt-5.6-terra", ready: () => true, check, book: async () => undefined, signal: controller.signal, call: async () => { throw boom; } }), (e) => e === boom);
  await assert.rejects(chatJsonWithFallback({ primary: "gpt-5.6-terra", ready: () => false, check, book: async () => undefined, call: async () => { throw boom; } }), (e) => e === boom);
});

test("checkWebExtractionResponse: hosszkorlát, nem JSON, cím/fogalomlista nélkül → hiba; ép válasz → objektum", async () => {
  const { checkWebExtractionResponse } = await import("../server/studio/web-research-runner");
  assert.deepEqual(checkWebExtractionResponse({ content: '```json\n{"title":"T","concepts":[]}\n```', finishReason: "stop" }), { title: "T", concepts: [] });
  assert.throws(() => checkWebExtractionResponse({ content: '{"title":"T","concepts":[]}', finishReason: "length" }), /hosszkorlát/);
  assert.throws(() => checkWebExtractionResponse({ content: '{"title":"T",', finishReason: "stop" }), /nem érvényes JSON/);
  assert.throws(() => checkWebExtractionResponse({ content: '{"concepts":[]}', finishReason: "stop" }), /cím vagy a fogalomlista/);
});

test("callExtractorModel (feltöltés): 200-as, de nem JSON GPT-válasz után az Opus 5.5 jegyzéke nyer (HTTP-határon)", async t => {
  withEnv(t, { AI_INTEGRATIONS_OPENAI_API_KEY: "test-placeholder", AI_INTEGRATIONS_ANTHROPIC_API_KEY: "test-placeholder" });
  const { callExtractorModel } = await import("../server/studio/run-extraction");
  const hosts: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    const host = new URL(String(url)).host;
    hosts.push(host);
    if (host === "api.openai.com") {
      return new Response(JSON.stringify({ id: "x", object: "chat.completion", created: 1, model: "gpt-5.6-terra", choices: [{ index: 0, message: { role: "assistant", content: "Ez nem JSON." }, finish_reason: "stop" }] }), { headers: { "Content-Type": "application/json" } });
    }
    const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
    return new Response([
      ev("message_start", { message: { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }),
      ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
      ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: '{"title":"Törtek","concepts":[{"term":"számláló"}]}' } }),
      ev("content_block_stop", { index: 0 }),
      ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 5 } }),
      ev("message_stop", {}),
    ].join(""), { headers: { "Content-Type": "text/event-stream" } });
  });
  const result = await callExtractorModel([{ name: "forras.txt", kind: "text", content: "A tört számlálója." }], { subject: "Matematika", classroom: 5 }, "Rendszer", "gpt-5.6-terra");
  assert.deepEqual(result, { title: "Törtek", concepts: [{ term: "számláló" }] });
  assert.deepEqual([...new Set(hosts)], ["api.openai.com", "api.anthropic.com"]);
});
