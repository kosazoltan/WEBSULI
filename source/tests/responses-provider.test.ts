import test from "node:test";
import assert from "node:assert/strict";
import { OpenAIProvider } from "../server/ai/OpenAIProvider";
import { callStepModel } from "../server/studio/run-step";

test("long reviewer uses the native Responses endpoint with bounded output and no storage", async (t) => {
  const messages = [{ role: "user" as const, content: "Ellenőrizd a teljes tananyagot." }];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), "https://api.x.ai/v1/responses");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      model: "grok-4.6", input: messages, store: false,
      max_output_tokens: 8000, reasoning: { effort: "medium" },
    });
    assert.ok(init?.signal, "the request must be abortable");
    return new Response(JSON.stringify({ object: "response", status: "completed", output: [
      { type: "message", content: [{ type: "output_text", text: '{"checks":[]}', annotations: [] }] },
    ], usage: { input_tokens: 200, output_tokens: 40, total_tokens: 240 } }),
    { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const provider = new OpenAIProvider({ apiKey: "test-placeholder", model: "grok-4.6", apiMode: "responses", reasoningEffort: "medium", maxTokens: 8000 }, "xai");
  const result = await provider.chat(messages, new AbortController().signal);
  assert.equal(result.content, '{"checks":[]}');
  assert.equal(result.finishReason, "stop");
  assert.deepEqual(result.usage, { promptTokens: 200, completionTokens: 40, totalTokens: 240 });
});

test("incomplete Responses output is rejected even when its text is valid JSON", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ object: "response", status: "incomplete", output: [
    { type: "message", content: [{ type: "output_text", text: '{"checks":[]}', annotations: [] }] },
  ] }), { status: 200, headers: { "Content-Type": "application/json" } }));
  const provider = new OpenAIProvider({ apiKey: "test-placeholder", model: "grok-4.6", apiMode: "responses" }, "xai");
  await assert.rejects(callStepModel(provider, { step: "lektor", model: provider.model, system: "Lektor", user: "Forrás" }), /csonka eredmény/);
});
