import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { isQuotaExhausted } from "../server/ai/AIProvider";
import { resetQuotaFailoverForTest, withQuotaFailover, type StudioConnection } from "../server/ai/studio-provider";

/* Spec 2026-10-01-gyokerok-egyben (2.3, E3): a nyers SDK-klienst használó hívások (kivonatoló, OCR, besoroló) is átállnak az
   OpenRouterre, ha az OpenAI kerete elfogyott; a mért „You have no credits remaining” üzenet is keret-kimerülés. */

const openai: StudioConnection = { vendor: "openai", apiKey: "k", model: "gpt-5.6-terra", baseURL: "https://api.openai.com/v1" };
const env = { OPENROUTER_API_KEY: "router-key" };
const noCredits = () => Object.assign(new Error("429 You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/."), { status: 429 });

beforeEach(() => resetQuotaFailoverForTest());

test("isQuotaExhausted: kód, típus ÉS a mért üzenet; a sima 429 nem", () => {
  assert.equal(isQuotaExhausted({ status: 429, code: "insufficient_quota" }), true);
  assert.equal(isQuotaExhausted({ status: 429, error: { type: "insufficient_quota" } }), true);
  assert.equal(isQuotaExhausted(noCredits()), true, "You have no credits remaining");
  assert.equal(isQuotaExhausted({ status: 429, message: "You exceeded your current quota, please check your plan and billing details." }), true);
  assert.equal(isQuotaExhausted({ status: 429, message: "Rate limit reached for requests" }), false);
  assert.equal(isQuotaExhausted({ status: 500, message: "no credits remaining" }), false);
  assert.equal(isQuotaExhausted({ status: 402 }), true);
});

test("withQuotaFailover: keret-kimerülés → ugyanaz a modell az OpenRouteren; a memória a következő hívást közvetlenül oda viszi", async () => {
  const seen: StudioConnection[] = [];
  let t = 1_000_000;
  const now = () => t;
  const run = async (c: StudioConnection) => { seen.push(c); if (c.vendor === "openai") throw noCredits(); return `ok:${c.model}`; };
  assert.equal(await withQuotaFailover(openai, run, env, now), "ok:openai/gpt-5.6-terra");
  assert.deepEqual(seen.map((c) => c.vendor), ["openai", "openrouter"]);
  assert.equal(seen[1].baseURL, "https://openrouter.ai/api/v1");
  assert.equal(seen[1].apiKey, "router-key");
  seen.length = 0;
  t += 60_000;
  assert.equal(await withQuotaFailover(openai, run, env, now), "ok:openai/gpt-5.6-terra");
  assert.deepEqual(seen.map((c) => c.vendor), ["openrouter"], "10 percig nem próbálkozik a közvetlen úton");
});

test("withQuotaFailover: nem keret-hiba továbbdobva; tartalék kulcs nélkül vagy nem-OpenAI szolgáltatónál nincs átállás", async () => {
  await assert.rejects(withQuotaFailover(openai, async () => { throw Object.assign(new Error("boom"), { status: 500 }); }, env), /boom/);
  await assert.rejects(withQuotaFailover(openai, async () => { throw noCredits(); }, {}), /no credits/);
  const seen: string[] = [];
  const xai: StudioConnection = { vendor: "xai", apiKey: "k", model: "grok", baseURL: "https://api.x.ai/v1" };
  await assert.rejects(withQuotaFailover(xai, async (c) => { seen.push(c.vendor); throw noCredits(); }, env), /no credits/);
  assert.deepEqual(seen, ["xai"]);
});
