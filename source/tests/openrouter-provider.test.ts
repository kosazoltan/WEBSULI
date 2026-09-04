import assert from "node:assert/strict";
import test from "node:test";

import {
  OpenRouterProvider,
  isOpenRouterConfigured,
  openRouterHeaders,
  stripJsonFences,
} from "../server/ai/OpenRouterProvider";

/**
 * LS-0d — OpenRouter provider.
 *
 * The Studio pipeline routes each step to a different vendor through OpenRouter. Two
 * things must hold before any of that is wired up:
 *   1. without a key the provider reports itself unconfigured (the factory then falls
 *      back to the existing OpenAI/Claude providers instead of throwing at startup);
 *   2. models that wrap JSON in ```json fences do not break the pipeline's Zod parsing.
 */

// ---------------------------------------------------------------- configuration

test("without an API key the provider is not configured", () => {
  assert.equal(isOpenRouterConfigured({}), false);
  assert.equal(isOpenRouterConfigured({ OPENROUTER_API_KEY: "" }), false);
  assert.equal(isOpenRouterConfigured({ OPENROUTER_API_KEY: "   " }), false);
});

test("with an API key the provider is configured", () => {
  assert.equal(isOpenRouterConfigured({ OPENROUTER_API_KEY: "sk-or-test" }), true);
});

test("constructing without a key does not throw", () => {
  // Startup must survive a missing key; the factory decides what to use.
  assert.doesNotThrow(() => new OpenRouterProvider({ apiKey: "", model: "qwen/qwen3.8-flash" }));
});

test("the provider exposes its model and a stable name", () => {
  const p = new OpenRouterProvider({ apiKey: "sk-or-test", model: "x-ai/grok-4.6" });
  assert.equal(p.model, "x-ai/grok-4.6");
  assert.equal(p.name, "OpenRouter");
});

// ---------------------------------------------------------------- headers

test("attribution headers are sent", () => {
  const headers = openRouterHeaders();
  assert.equal(headers["HTTP-Referer"], "https://websuli.vip");
  assert.equal(headers["X-Title"], "WebSuli Studio");
});

test("headers never contain the API key", () => {
  // The key belongs in the Authorization header handled by the SDK, not in attribution.
  const serialized = JSON.stringify(openRouterHeaders());
  assert.ok(!/sk-or/i.test(serialized));
});

// ---------------------------------------------------------------- JSON fences

test("stripJsonFences unwraps a ```json block", () => {
  assert.equal(stripJsonFences('```json\n{"a":1}\n```'), '{"a":1}');
});

test("stripJsonFences unwraps a bare ``` block", () => {
  assert.equal(stripJsonFences('```\n{"a":1}\n```'), '{"a":1}');
});

test("stripJsonFences leaves clean JSON untouched", () => {
  assert.equal(stripJsonFences('{"a":1}'), '{"a":1}');
});

test("stripJsonFences trims surrounding prose whitespace", () => {
  assert.equal(stripJsonFences('  \n```json\n{"a": 1}\n```  \n'), '{"a": 1}');
});

test("stripJsonFences does not corrupt JSON containing backticks in a string", () => {
  const payload = '{"code":"a ``` b"}';
  assert.equal(stripJsonFences(payload), payload);
});
