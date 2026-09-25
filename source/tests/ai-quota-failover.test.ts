import assert from "node:assert/strict";
import test from "node:test";
import OpenAI from "openai";

import { AIProviderQuotaError, AIProviderRateLimitError, isQuotaExhausted, type AIMessage, type IAIProvider } from "../server/ai/AIProvider";
import { OpenAIProvider } from "../server/ai/OpenAIProvider";
import { OpenRouterProvider } from "../server/ai/OpenRouterProvider";
import { createStudioProvider, QuotaFailoverProvider, QUOTA_FAILOVER_MEMORY_MS, resetQuotaFailoverForTest } from "../server/ai/studio-provider";

/** Spec 2026-09-25 (docs/specs/2026-09-25-openai-keret-atallas.md). */

const quota429 = () => new OpenAI.APIError(429, { type: "insufficient_quota", code: "credit_balance_exhausted", message: "You have no credits remaining." }, "You have no credits remaining.", new Headers());
const rate429 = () => new OpenAI.APIError(429, { type: "requests", code: "rate_limit_exceeded", message: "Rate limit reached" }, "Rate limit reached", new Headers());

test("kimerült keret: a mért OpenAI-válasz (429 + insufficient_quota) kvótahiba, a sima 429 sebességkorlát marad", () => {
  assert.equal(isQuotaExhausted(quota429()), true);
  assert.equal(isQuotaExhausted(rate429()), false);
  assert.equal(isQuotaExhausted({ status: 402 }), true, "OpenRouter: nincs elég kredit");
  assert.equal(isQuotaExhausted({ status: 500 }), false);
  const provider = new OpenAIProvider({ apiKey: "sk-test", model: "gpt-5.6-terra" });
  const mapped = (provider as unknown as { handleError(e: unknown): Error }).handleError(quota429());
  assert.ok(mapped instanceof AIProviderQuotaError, mapped.message);
  assert.equal((mapped as AIProviderQuotaError).isRetriable, false);
  assert.match(mapped.message, /kerete \(kreditje\) elfogyott/);
  assert.ok((provider as unknown as { handleError(e: unknown): Error }).handleError(rate429()) instanceof AIProviderRateLimitError);
});

function stub(name: string, behaviour: () => Promise<string>): IAIProvider & { calls: number } {
  return {
    name, model: name, calls: 0,
    async chat(this: { calls: number }) { this.calls++; return { content: await behaviour() }; },
    async *streamChat() { yield { type: "done" as const }; },
    async isAvailable() { return true; },
  };
}
const msgs: AIMessage[] = [{ role: "user", content: "x" }];

test("átállás: kvótahibánál ugyanaz a kérés a tartalékon fut, 10 percig a közvetlen hívás kimarad; más hiba nem vált útvonalat", async () => {
  resetQuotaFailoverForTest();
  let now = 1_000_000;
  const primary = stub("OpenAI", async () => { throw new AIProviderQuotaError("OpenAI", "credit_balance_exhausted"); });
  const fallback = stub("OpenRouter", async () => "tartalék válasz");
  const provider = new QuotaFailoverProvider(primary, () => fallback, () => now);
  assert.equal((await provider.chat(msgs)).content, "tartalék válasz");
  assert.equal((await provider.chat(msgs)).content, "tartalék válasz");
  assert.equal(primary.calls, 1, "a megjegyzett kimerülés alatt a közvetlen hívás kimarad");
  assert.equal(fallback.calls, 2);
  now += QUOTA_FAILOVER_MEMORY_MS + 1;
  await provider.chat(msgs);
  assert.equal(primary.calls, 2, "a lejárat után újra a közvetlen fiók próbálkozik");

  resetQuotaFailoverForTest();
  const failing = stub("OpenAI", async () => { throw new AIProviderRateLimitError("OpenAI"); });
  const unused = stub("OpenRouter", async () => "nem hívható");
  await assert.rejects(new QuotaFailoverProvider(failing, () => unused).chat(msgs), AIProviderRateLimitError);
  assert.equal(unused.calls, 0, "sebességkorlátnál nincs útvonalváltás");
  resetQuotaFailoverForTest();
});

test("gyár: közvetlen OpenAI-modellnél OpenRouter-kulccsal átállásra képes provider, ugyanazzal a modellel; kulcs nélkül a régi viselkedés", () => {
  const env = { AI_INTEGRATIONS_OPENAI_API_KEY: "sk-openai", OPENROUTER_API_KEY: "sk-or" };
  const withRouter = createStudioProvider("gpt-5.6-terra", 1000, 100, {}, env);
  assert.ok(withRouter instanceof QuotaFailoverProvider);
  const fallback = (withRouter as unknown as { route(): IAIProvider }).route();
  assert.ok(fallback instanceof OpenRouterProvider);
  assert.equal(fallback.model, "openai/gpt-5.6-terra", "ugyanaz a modell, nem modellcsere");
  assert.ok(createStudioProvider("gpt-5.6-terra", 1000, 100, {}, { AI_INTEGRATIONS_OPENAI_API_KEY: "sk-openai" }) instanceof OpenAIProvider);
  assert.ok(createStudioProvider("z-ai/glm-5.3-flash", 1000, 100, {}, env) instanceof OpenRouterProvider, "OpenRouter-modell változatlan");
});
