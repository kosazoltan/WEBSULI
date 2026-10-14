import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crossFamilyComplete, isCompleteFinish, legacyFallbackFor } from "../server/ai/legacy-fallback";

/*
 * Spec 2026-10-14-tartalek-b-szelet (B3b, tulajdonosi döntés): az adminisztrációs útvonalak ellentétes családú tartaléka
 * (Claude → GPT-6.1 Sol, GPT → Opus 5.5, medium); streamnél a váltás csak az első kiküldött darab előtt.
 */

function withEnv(t: TestContext, values: Record<string, string | undefined>) {
  const before = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  for (const [k, v] of Object.entries(values)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  t.after(() => { for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}

test("legacyFallbackFor / isCompleteFinish", t => {
  withEnv(t, { AI_INTEGRATIONS_OPENAI_API_KEY: "test-placeholder", AI_INTEGRATIONS_ANTHROPIC_API_KEY: "test-placeholder" });
  assert.equal(legacyFallbackFor("claude-opus-5"), "gpt-6.1-sol");
  assert.equal(legacyFallbackFor("gpt-6.1-sol"), "claude-opus-5-5");
  assert.equal(legacyFallbackFor("z-ai/glm-5.3-flash"), undefined);
  assert.equal(isCompleteFinish("stop"), true);
  assert.equal(isCompleteFinish("end_turn"), true);
  assert.equal(isCompleteFinish("length"), false);
  assert.equal(isCompleteFinish(undefined), false);
});

test("crossFamilyComplete: a Claude-hiba után GPT-6.1 Sol, medium efforttal és JSON-móddal; a lezárás oka visszajön", async t => {
  withEnv(t, { AI_INTEGRATIONS_OPENAI_API_KEY: "test-placeholder", OPENROUTER_API_KEY: undefined });
  let body: Record<string, unknown> | undefined;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    const chunk = (o: object) => `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 1, model: "gpt-6.1-sol", ...o })}\n\n`;
    return new Response(chunk({ choices: [{ index: 0, delta: { content: '{"fixedHtml":"<p>x</p>"}' }, finish_reason: "stop" }] }) + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
  });
  const result = await crossFamilyComplete("claude-opus-5", new Error("[Claude] 529 overloaded"), {
    system: "Rendszer", messages: [{ role: "user", content: "Javítsd" }], maxTokens: 4096, timeoutMs: 60_000, json: true, label: "TEST",
  });
  assert.equal(result.model, "gpt-6.1-sol");
  assert.equal(result.text, '{"fixedHtml":"<p>x</p>"}');
  assert.equal(isCompleteFinish(result.finishReason), true);
  assert.equal(body?.reasoning_effort, "medium");
  assert.deepEqual(body?.response_format, { type: "json_object" });
  assert.deepEqual((body?.messages as Array<{ role: string }>).map((m) => m.role), ["system", "user"]);
});

test("crossFamilyComplete: megszakításnál és kulcs nélkül az eredeti hiba marad (nincs tartalékhívás)", async t => {
  withEnv(t, { AI_INTEGRATIONS_OPENAI_API_KEY: undefined, OPENAI_API_KEY: undefined, OPENROUTER_API_KEY: undefined });
  let fetches = 0;
  t.mock.method(globalThis, "fetch", async () => { fetches++; return new Response("{}"); });
  const cause = new Error("eredeti");
  await assert.rejects(crossFamilyComplete("claude-opus-5", cause, { system: "", messages: [], maxTokens: 1, timeoutMs: 1, label: "T" }), (e) => e === cause);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(crossFamilyComplete("claude-opus-5", cause, { system: "", messages: [], maxTokens: 1, timeoutMs: 1, signal: controller.signal, label: "T" }), (e) => e === cause);
  assert.equal(fetches, 0);
});

test("routes.ts: mind a 9 adminisztrációs hívás tartalékkal; streamnél csak az első darab előtt vált", () => {
  const src = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  for (const task of ["htmlFix", "htmlTheme", "htmlFixStream", "claudeChat", "chatgptChat", "claudeHtml"]) {
    assert.match(src, new RegExp(`crossFamilyComplete\\(resolveLegacyModel\\("${task}"\\)`), task);
  }
  assert.equal((src.match(/crossFamilyComplete\(resolveLegacyModel\("htmlFixStream"\)/g) ?? []).length, 2, "a magyarázó és a JSON-fázis is");
  assert.equal((src.match(/legacyFallbackFor\(resolveLegacyModel\("analyzeFiles"\)\)/g) ?? []).length, 2, "mindkét elemző hívás");
  // Stream: félkész válasz nem cserélhető.
  assert.match(src, /if \(explanationText\) throw error;/);
  assert.match(src, /if \(streamedText\) throw error;/);
  assert.match(src, /if \(totalEvents > 0 \|\| controller\.signal\.aborted\) throw error;/);
  assert.match(src, /if \(totalChunks > 0 \|\| controller\.signal\.aborted\) throw error;/);
  // A HTML-teljesség a tartalékon is ellenőrzött.
  assert.equal((src.match(/if \(!finished \|\| !verification\.ok\)/g) ?? []).length, 2);
});
