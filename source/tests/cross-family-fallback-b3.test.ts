import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createStudioProvider, crossFamilyFallbackOptions } from "../server/ai/studio-provider";
import { LEGACY_MODELS } from "../server/ai/models";

/*
 * Spec 2026-10-14-tartalek-b-szelet (B3a, tulajdonosi döntés): HTML-modernizálás és kvízgenerátor ellentétes családú tartaléka
 * (Claude → GPT-6.1 Sol, medium) — a régi stream-úton is ténylegesen kimegy az effort.
 */

function withEnv(t: TestContext, values: Record<string, string>) {
  const before = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}

test("a HTML-modernizálás láncának tartaléka GPT-6.1 Sol, és a régi streamChat-út medium effortot küld", async t => {
  assert.deepEqual([...LEGACY_MODELS.improve], ["claude-opus-5", "gpt-6.1-sol"]);
  withEnv(t, { AI_INTEGRATIONS_OPENAI_API_KEY: "test-placeholder" });
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const chunk = (o: object) => `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 1, model: "gpt-6.1-sol", ...o })}\n\n`;
    return new Response(chunk({ choices: [{ index: 0, delta: { content: "<html>" }, finish_reason: "stop" }] }) + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
  });
  for (const fallback of [true, false]) {
    const provider = createStudioProvider("gpt-6.1-sol", 900000, 64000, crossFamilyFallbackOptions("gpt-6.1-sol", fallback));
    for await (const _chunk of provider.streamChat([{ role: "user", content: "x" }])) { /* drain */ }
  }
  assert.equal(bodies[0].reasoning_effort, "medium", "tartalékként medium");
  assert.equal(bodies[1].reasoning_effort, undefined, "tartalék-jelzés nélkül a kérés bájtra a régi");
  const improve = readFileSync(new URL("../server/improveAsync.ts", import.meta.url), "utf8");
  assert.match(improve, /createStudioProvider\(model, 900000, 64000, crossFamilyFallbackOptions\(model, modelIndex > 0\)\)/);
});

test("a kvízgenerátor a Claude-hiba után a GPT-6.1 Sol tartalékon, ugyanazzal a prompttal fut", () => {
  // A szolgáltatás adatbázist ér el — a meglévő R1-minta szerint forrás-szinten rögzítve.
  const src = readFileSync(new URL("../server/gameQuizGeneratorService.ts", import.meta.url), "utf8");
  assert.match(src, /const fallback = crossFamilyFallback\(ANTHROPIC_MODEL\);/);
  assert.match(src, /createStudioProvider\(fallback, 90_000, maxTokens, crossFamilyFallbackOptions\(fallback, true\)\)\.chat\(\[\s*\{ role: "system", content: withSupportSkill\("quiz-generator", SYSTEM_PROMPT\) \},\s*\{ role: "user", content: userPrompt \},/);
});
