import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { providerForModel, resolveStudioModel, studioModelMap, STUDIO_STEPS } from "../server/ai/models";
import { STUDIO_STEP_POLICY } from "../server/ai/studio-provider";
import { CLASSIFIER_MODELS } from "../server/catalog/classify";
import { callScopeModel } from "../server/studio/one-step";

/**
 * Spec 2026-10-14-forras-besorolo-openai-luna. Kiváltó hiba (élő DB, 4 futás): a tantárgy/évfolyam-felismerés az `ocr` lépés
 * modelljén (`qwen/qwen3-vl-32b-instruct`, OpenRouter) futott, amelyet a szolgáltató 2026-10-09-én kivezetett → 404.
 */

test("E1/E3: a scope külön lépés, gpt-6-luna közvetlen OpenAI-n; env-ből felülírható", () => {
  assert.ok((STUDIO_STEPS as readonly string[]).includes("scope"));
  assert.equal(resolveStudioModel("scope", {}), "gpt-6-luna");
  assert.equal(providerForModel(resolveStudioModel("scope", {})), "openai");
  assert.equal(studioModelMap({}).scope, "gpt-6-luna");
  assert.equal(resolveStudioModel("scope", { STUDIO_MODEL_SCOPE: "x/custom-scope" }), "x/custom-scope");
});

test("E1/E2: a scope-kérés közvetlen OpenAI, high effort, ≥ 8000 keret, OpenRouter-kulcs nélkül is", async (t) => {
  const names = ["AI_INTEGRATIONS_OPENAI_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "AI_INTEGRATIONS_OPENAI_BASE_URL"];
  const before = names.map((name) => process.env[name]);
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    // Spec-változás 2026-10-14 (review #218): a scope-válasz használhatósága a tartalék-határon belül ellenőrzött — a stub valódi
    // alakú választ ad (a teszt mércéje, a kérés alakja, változatlan).
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"subject":"Matematika","classroom":6}' } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  try {
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "test-placeholder";
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const file = { kind: "image" as const, name: "lap.png", content: "data:image/png;base64,AA==" };
    await callScopeModel([file], resolveStudioModel("scope", {}));
    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0].url).hostname, "api.openai.com");
    assert.equal(calls[0].body.model, "gpt-6-luna");
    assert.equal(calls[0].body.reasoning_effort, "high");
    assert.ok(Number(calls[0].body.max_completion_tokens) >= 8000, `keret: ${calls[0].body.max_completion_tokens} (mért max 2448)`);
    assert.ok(!("reasoning" in calls[0].body), "az OpenRouter-féle reasoning mező nem mehet az OpenAI-ra");
  } finally {
    names.forEach((name, i) => { if (before[i] === undefined) delete process.env[name]; else process.env[name] = before[i]; });
  }
});

test("E1: mindkét scope-hívóhely a `scope` lépés modelljét használja (kommentek nélkül, valódi hívás)", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const file of ["../server/studio/lesson-pipeline-routes.ts", "../server/studio/routes.ts"]) {
    const code = strip(readFileSync(new URL(file, import.meta.url), "utf8"));
    assert.match(code, /callScopeModel\(\s*\w+\s*,\s*resolveStudioModel\("scope"\)\s*\)/, `${file}: a scope-hívás a scope lépés modelljén`);
    assert.doesNotMatch(code, /callScopeModel\(\s*\w+\s*,\s*resolveStudioModel\("ocr"\)\s*\)/, `${file}: nem az ocr lépés modelljén`);
  }
});

test("E4: a besoroló két különböző modell egyezése (GPT-6.1 Sol + Opus 5.5), közvetlen szolgáltatókon", () => {
  // Spec-változás 2026-10-16 (docs/specs/2026-10-16-egy-futas.md, S4a, tulajdonosi döntés): csak Opus 5.5 és GPT-6.1 Sol marad. A harmadik döntő megszűnt: eltérő tantárgynál a lecke emberi átnézésre megy.
  assert.deepEqual([...CLASSIFIER_MODELS], ["gpt-6.1-sol", "claude-opus-5-5"]);
  assert.equal(new Set(CLASSIFIER_MODELS).size, CLASSIFIER_MODELS.length, "a konszenzushoz különböző modellek kellenek");
  assert.deepEqual(CLASSIFIER_MODELS.map((m) => providerForModel(m)), ["openai", "anthropic"], "közvetlen szolgáltatók, nem OpenRouter");
});

test("review #209: a katalógus-besoroló a MÉRT high effort szabályzaton fut, nem a topicFocus (low) szabályzaton", () => {
  assert.equal(STUDIO_STEP_POLICY.catalogClassify?.reasoningEffort, "high");
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const script = strip(readFileSync(new URL("../scripts/catalog/classify.mts", import.meta.url), "utf8"));
  assert.match(script, /createStudioStepProvider\(model,\s*"catalogClassify"\)/);
  assert.match(script, /policy:\s*"catalogClassify"/);
  assert.doesNotMatch(script, /"topicFocus"/);
});
