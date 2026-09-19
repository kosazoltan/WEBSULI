import test from "node:test";
import assert from "node:assert/strict";
import { OpenAIProvider } from "../server/ai/OpenAIProvider";
import { createStudioStepProvider } from "../server/ai/studio-provider";
import { callStepModel } from "../server/studio/run-step";
import { OpenRouterProvider } from "../server/ai/OpenRouterProvider";
import { AIProviderTimeoutError } from "../server/ai/AIProvider";

test("a valódi Studio lektorkérés Responses low, teljes bemenet, nincs szerveres tárolás", async t => {
  const previous = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = "test-placeholder";
  t.after(() => { if (previous === undefined) delete process.env.XAI_API_KEY; else process.env.XAI_API_KEY = previous; });
  t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    assert.equal(String(url), "https://api.x.ai/v1/responses");
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.reasoning, { effort: "low" });
    assert.equal(body.max_output_tokens, 12000);
    assert.equal(body.store, false);
    assert.deepEqual(body.input, [{ role: "system", content: "Teljes lecke és forrás" }, { role: "user", content: "Csak hibajegyek" }]);
    assert.ok(init?.signal);
    return new Response(JSON.stringify({ object: "response", status: "completed", output: [
      { type: "message", content: [{ type: "output_text", text: '{"notes":[]}', annotations: [] }] },
    ] }), { headers: { "Content-Type": "application/json" } });
  });
  const provider = createStudioStepProvider("grok-4.6", "lektor");
  const result = await callStepModel(provider, { step: "lektor", model: provider.model, system: "Teljes lecke és forrás", user: "Csak hibajegyek" });
  assert.deepEqual(result.json, { notes: [] });
});

test("a lektor SDK nem ismétli meg rejtetten a hibás HTTP-kérést", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response('{"error":{"message":"upstream unavailable"}}', { status: 503, headers: { "Content-Type": "application/json" } }); });
  const provider = new OpenAIProvider({ apiKey: "test-placeholder", model: "grok-4.6", maxRetries: 0 }, "xai");
  await assert.rejects(provider.chat([{ role: "user", content: "Teszt" }]), /upstream unavailable/);
  assert.equal(calls, 1);
});

test("megszakított lektor nem adhat vissza érvényes JSON-t sem", async t => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async () => { controller.abort(); return new Response('{}', { headers: { "Content-Type": "application/json" } }); });
  const provider = new OpenAIProvider({ apiKey: "test-placeholder", model: "grok-4.6", maxRetries: 0 }, "xai");
  await assert.rejects(callStepModel(provider, { step: "lektor", model: provider.model, system: "Forrás", user: "Teszt" }, controller.signal));
});

test("OpenRouter lektornál is egyetlen HTTP-próba van", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response('{"error":{"message":"unavailable"}}', { status: 503, headers: { "Content-Type": "application/json" } }); });
  const provider = new OpenRouterProvider({ apiKey: "test-placeholder", model: "x-ai/grok-4.6", maxRetries: 0 });
  await assert.rejects(provider.chat([{ role: "user", content: "Teszt" }]));
  assert.equal(calls, 1);
});

test("a lektor saját határideje folytatható timeoutként marad meg", async t => {
  const controller = new AbortController();
  t.mock.method(AbortSignal, "timeout", () => controller.signal);
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    controller.abort(new DOMException("A határidő lejárt", "TimeoutError"));
    assert.ok(init?.signal?.aborted);
    throw new DOMException("aborted", "AbortError");
  });
  const provider = new OpenAIProvider({ apiKey: "test-placeholder", model: "grok-4.6", maxRetries: 0 }, "xai");
  await assert.rejects(callStepModel(provider, { step: "lektor", model: provider.model, system: "Forrás", user: "Teszt" }),
    (error: unknown) => error instanceof Error && error.cause instanceof AIProviderTimeoutError);
});