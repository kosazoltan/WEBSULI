import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createStudioStepProvider, STUDIO_STEP_POLICY, studioConnection } from "../server/ai/studio-provider";
import { ClaudeProvider } from "../server/ai/ClaudeProvider";
import { OpenRouterProvider } from "../server/ai/OpenRouterProvider";
import { callStepModel, stepDeadlineMs } from "../server/studio/run-step";
import { AIProviderTimeoutError } from "../server/ai/AIProvider";

/*
 * Spec 2026-09-19 (modellmátrix + Opus 5 tervkészítő) — the request SHAPES the Studio
 * sends, captured at the HTTP boundary so a wrong field name is caught here, not as a
 * production 400.
 */

function withEnv(t: TestContext, values: Record<string, string>) {
  const before = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}

test("a pedagógus a közvetlen Anthropic API-n fut: claude-opus-5, adaptív gondolkodás, effort medium, 16000 max_tokens", async t => {
  withEnv(t, { AI_INTEGRATIONS_ANTHROPIC_API_KEY: "test-placeholder" });
  let captured: Record<string, unknown> | undefined;
  t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    assert.equal(String(url), "https://api.anthropic.com/v1/messages");
    captured = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5", stop_reason: "end_turn", stop_sequence: null,
      content: [{ type: "thinking", thinking: "…", signature: "sig" }, { type: "text", text: '{"sections":[]}' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }), { headers: { "Content-Type": "application/json" } });
  });
  const provider = createStudioStepProvider("claude-opus-5", "pedagogue");
  assert.ok(provider instanceof ClaudeProvider);
  const result = await callStepModel(provider, { step: "pedagogue", model: provider.model, system: "Terv", user: "Csak JSON" });
  assert.deepEqual(result.json, { sections: [] }, "a thinking blokk után a text blokk a válasz");
  assert.equal(captured?.model, "claude-opus-5");
  assert.deepEqual(captured?.thinking, { type: "adaptive" });
  assert.deepEqual(captured?.output_config, { effort: "medium" });
  assert.equal(captured?.max_tokens, STUDIO_STEP_POLICY.pedagogue.maxTokens);
  assert.equal(STUDIO_STEP_POLICY.pedagogue.maxTokens, 16_000);
  assert.equal(captured?.system, "Terv");
  assert.ok(!("budget_tokens" in ((captured?.thinking as object) ?? {})), "budget_tokens tilos Opus 5-ön");
});

test("a bank és az ábra lépés OpenRouteren fut, reasoning.effort=low", async t => {
  withEnv(t, { OPENROUTER_API_KEY: "test-placeholder" });
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    assert.equal(String(url), "https://openrouter.ai/api/v1/chat/completions");
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: '{"ok":true}' }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
      { headers: { "Content-Type": "application/json" } });
  });
  for (const step of ["bank", "animator"] as const) {
    const provider = createStudioStepProvider("z-ai/glm-5.3-flash", step);
    assert.ok(provider instanceof OpenRouterProvider);
    await callStepModel(provider, { step: "animator", model: provider.model, system: "S", user: "U" });
  }
  assert.equal(bodies.length, 2);
  for (const body of bodies) {
    assert.equal(body.model, "z-ai/glm-5.3-flash");
    assert.deepEqual(body.reasoning, { effort: "low" });
    assert.equal(body.max_completion_tokens, 24_000);
    // Spec §7o (mérve): a glm-válaszok ~1/8-a szintaktikailag törött JSON volt (nem csonka) — a
    // szolgáltatói JSON-mód ezt a hibaosztályt megszünteti, a tartalmat nem érinti.
    assert.deepEqual(body.response_format, { type: "json_object" }, "a bank/animátor kérés JSON-módban megy");
  }
});

// Spec §7o (mérve, 4. mérés): a bank-hívás időtúllépését az SDK kétszer csendben újrapróbálta (3 × 240 s).
test("a bank/animátor kérése egyszer megy el: az SDK nem próbálja újra csendben (maxRetries 0)", async t => {
  withEnv(t, { OPENROUTER_API_KEY: "test-placeholder" });
  let fetches = 0;
  t.mock.method(globalThis, "fetch", async () => { fetches++; return new Response("upstream error", { status: 500 }); });
  for (const step of ["bank", "animator"] as const) {
    fetches = 0;
    const provider = createStudioStepProvider("z-ai/glm-5.3-flash", step);
    await assert.rejects(callStepModel(provider, { step: "animator", model: provider.model, system: "S", user: "U" }));
    assert.equal(fetches, 1, `${step}: egyetlen kérés, rejtett újrapróbálás nélkül`);
  }
});

// Spec §7o (mérve, 5. mérés): az SDK kliens-timeoutja a fejlécekig él; a törzs olvasását csak a külső
// AbortSignal-határidő szakítja meg — ez minden szabályzatos lépésnek jár, nem csak a lektornak.
test("a bank/animátor kérés külső határidőt kap, amely a törzs olvasását is megszakítja (időtúllépés okkal)", async t => {
  withEnv(t, { OPENROUTER_API_KEY: "test-placeholder" });
  assert.equal(stepDeadlineMs("animator"), STUDIO_STEP_POLICY.animator.timeoutMs);
  assert.equal(stepDeadlineMs("bank"), STUDIO_STEP_POLICY.bank.timeoutMs);
  assert.equal(stepDeadlineMs("author"), undefined, "szabályzat nélküli lépésnek nincs külső határideje");
  const controller = new AbortController();
  let timeoutMs: number | undefined;
  t.mock.method(AbortSignal, "timeout", (ms: number) => { timeoutMs = ms; return controller.signal; });
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    controller.abort(new DOMException("A határidő lejárt", "TimeoutError"));
    assert.ok(init?.signal?.aborted, "a jelzés a kérésre van kötve");
    throw new DOMException("aborted", "AbortError");
  });
  const provider = createStudioStepProvider("z-ai/glm-5.3-flash", "animator");
  await assert.rejects(callStepModel(provider, { step: "animator", model: provider.model, system: "S", user: "U" }),
    (error: unknown) => error instanceof Error && error.cause instanceof AIProviderTimeoutError);
  assert.equal(timeoutMs, 240_000);
});

test("a lektor szabályzata változatlan; szabályzat nélküli lépés (author) nem kap effortot", async t => {
  withEnv(t, { OPENROUTER_API_KEY: "test-placeholder", AI_INTEGRATIONS_OPENAI_API_KEY: "test-placeholder" });
  assert.equal(STUDIO_STEP_POLICY.author, undefined);
  let body: Record<string, unknown> | undefined;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "{}" }, finish_reason: "stop" }] }), { headers: { "Content-Type": "application/json" } });
  });
  await createStudioStepProvider("gpt-5.6-terra", "author").chat([{ role: "user", content: "x" }]);
  assert.equal(body?.reasoning, undefined);
  assert.equal(body?.reasoning_effort, undefined);
  assert.equal(body?.response_format, undefined, "szabályzat nélküli lépés JSON-módot sem kap");
});

test("studioConnection: az anthropic vendor a saját kulcsát kéri", () => {
  assert.throws(() => studioConnection("claude-opus-5", {}), /AI_INTEGRATIONS_ANTHROPIC_API_KEY/);
  const c = studioConnection("claude-opus-5", { AI_INTEGRATIONS_ANTHROPIC_API_KEY: "k" });
  assert.equal(c.vendor, "anthropic");
  assert.equal(c.model, "claude-opus-5");
});
