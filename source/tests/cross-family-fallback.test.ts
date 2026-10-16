import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createStudioStepProvider, crossFamilyFallbackOptions } from "../server/ai/studio-provider";
import { ClaudeProvider } from "../server/ai/ClaudeProvider";
import { CROSS_FAMILY_FALLBACK, crossFamilyFallback } from "../server/ai/models";
import { callStepModel } from "../server/studio/run-step";

/*
 * Tulajdonosi döntés 2026-10-14 (docs/specs/2026-10-14-ellentetes-csalad-tartalek.md): OpenAI GPT elsődleges → Opus 5.5 medium,
 * Anthropic elsődleges → GPT-6.1 Sol medium; GPT-szerzőnél a lektor Qwen 3.8 Max 0902 high. A kérés ALAKJA a HTTP-határon
 * rögzítve — az effort ténylegesen kimegy (az OpenAI chat-úton ma nem ment ki).
 */

function withEnv(t: TestContext, values: Record<string, string>) {
  const before = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}
const KEYS = { AI_INTEGRATIONS_OPENAI_API_KEY: "test-placeholder", AI_INTEGRATIONS_ANTHROPIC_API_KEY: "test-placeholder", OPENROUTER_API_KEY: "test-placeholder" };
const openAiJson = () => new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "{}" }, finish_reason: "stop" }] }), { headers: { "Content-Type": "application/json" } });
const anthropicJson = () => new Response(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [{ type: "text", text: "{}" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }), { headers: { "Content-Type": "application/json" } });

test("a tábla: OpenAI → claude-opus-5-5, Anthropic → gpt-6.1-sol, más család → nincs; a szállított első tartalékok ezt követik", () => {
  assert.deepEqual(CROSS_FAMILY_FALLBACK, { openai: "claude-opus-5-5", anthropic: "gpt-6.1-sol" });
  assert.equal(crossFamilyFallback("gpt-5.6-luna"), "claude-opus-5-5");
  assert.equal(crossFamilyFallback("claude-opus-5"), "gpt-6.1-sol");
  assert.equal(crossFamilyFallback("qwen/qwen3.8-max-0902"), undefined);
  assert.equal(crossFamilyFallback("z-ai/glm-5.3-flash"), undefined);
  // S4b (docs/specs/2026-10-16-egy-futas.md): a lépésenkénti tartaléktábla (FALLBACK_MODELS), a harmadik családú lektor (Qwen 0902) effortja és kimeneti plafonja kivezetve — két modell maradt.
});

test("crossFamilyFallbackOptions: csak tartalékhívásra és csak az ellentétes családú modellre", () => {
  assert.deepEqual(crossFamilyFallbackOptions("gpt-6.1-sol", true), { reasoningEffort: "medium", chatReasoningEffort: true });
  assert.deepEqual(crossFamilyFallbackOptions("claude-opus-5-5", true), { reasoningEffort: "medium" });
  assert.deepEqual(crossFamilyFallbackOptions("gpt-6.1-sol", false), {});
  assert.deepEqual(crossFamilyFallbackOptions("gpt-5.6-terra", true), {}, "a második tartalék (terra) nem ellentétes-családú tartalék");
});

test("GPT-6.1 Sol tartalék a chat-úton reasoning_effort=medium-ot küld; ugyanez elsődlegesként változatlan (nincs effort)", async t => {
  withEnv(t, KEYS);
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body))); return openAiJson(); });
  await createStudioStepProvider("gpt-6.1-sol", "pedagogue", { fallback: true }).chat([{ role: "user", content: "x" }]);
  await createStudioStepProvider("gpt-6.1-sol", "author", { fallback: true }).chat([{ role: "user", content: "x" }]);
  await createStudioStepProvider("gpt-6.1-sol", "pedagogue").chat([{ role: "user", content: "x" }]);
  assert.equal(bodies[0].reasoning_effort, "medium");
  assert.equal(bodies[1].reasoning_effort, "medium");
  assert.equal(bodies[1].max_completion_tokens, 48_000, "a szerző-tartalék a szerző 48k keretét kapja");
  assert.equal(bodies[2].reasoning_effort, undefined, "tartalék-jelzés nélkül a kérés bájtra a régi");
});

test("GPT-6.1 Sol tartalék a streamelt chat-úton is reasoning_effort=medium-ot küld (ábratervező: high helyett medium)", async t => {
  withEnv(t, KEYS);
  let body: Record<string, unknown> | undefined;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    const chunk = (o: object) => `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 1, model: "gpt-6.1-sol", ...o })}\n\n`;
    return new Response(chunk({ choices: [{ index: 0, delta: { content: '{"ok":true}' }, finish_reason: "stop" }] }) + chunk({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) + "data: [DONE]\n\n",
      { headers: { "Content-Type": "text/event-stream" } });
  });
  const provider = createStudioStepProvider("gpt-6.1-sol", "visualDesigner", { fallback: true });
  await callStepModel(provider, { step: "animator", policy: "visualDesigner", role: "animator", model: provider.model, system: "S", user: "U" });
  assert.equal(body?.stream, true);
  assert.equal(body?.reasoning_effort, "medium");
});

test("Opus 5.5 bank-tartalék medium efforttal (a bank szabályzata low); elsődlegesként a szabályzat szerinti", async t => {
  withEnv(t, KEYS);
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body))); return anthropicJson(); });
  const fallback = createStudioStepProvider("claude-opus-5-5", "bank", { fallback: true });
  assert.ok(fallback instanceof ClaudeProvider);
  await fallback.chat([{ role: "user", content: "x" }]);
  await createStudioStepProvider("claude-opus-5-5", "bank").chat([{ role: "user", content: "x" }]);
  assert.deepEqual(bodies[0].output_config, { effort: "medium" });
  assert.deepEqual(bodies[1].output_config, { effort: "low" });
});

test("lektor-lánc tagjai: Opus 5.5 medium (Anthropic), Qwen 3.8 Max 0902 high (OpenRouter), GPT-6.1 Sol változatlanul medium (Responses)", async t => {
  withEnv(t, KEYS);
  const seen: Array<{ url: string; body: Record<string, unknown> }> = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    seen.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return String(url).includes("anthropic") ? anthropicJson() : openAiJson();
  });
  await createStudioStepProvider("claude-opus-5-5", "lektor").chat([{ role: "user", content: "x" }]);
  // S4b (docs/specs/2026-10-16-egy-futas.md): a harmadik családú Qwen lektor (LEKTOR_THIRD_FAMILY_MODEL, high effort) kivezetve — csak az Opus/GPT pár marad.
  assert.deepEqual(seen[0].body.output_config, { effort: "medium" });
});

// S4b (docs/specs/2026-10-16-egy-futas.md): a webes lektor-lánc (callTeachingReviewer) és a lépésenkénti tartalékválasztás (fallbackModelFor, lektorChainFor) kivezetve — az esetei törölve.
