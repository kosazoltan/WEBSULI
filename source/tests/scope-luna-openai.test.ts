import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { providerForModel, resolveStudioModel, studioModelMap, STUDIO_STEPS } from "../server/ai/models";
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
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
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

test("E4: a besoroló gpt-6-lunával kezd, két különböző közvetlen OpenAI-modell + döntő", () => {
  assert.equal(CLASSIFIER_MODELS[0], "gpt-6-luna");
  assert.equal(new Set(CLASSIFIER_MODELS).size, CLASSIFIER_MODELS.length, "a konszenzushoz különböző modellek kellenek");
  assert.ok(CLASSIFIER_MODELS.length >= 3, "eltérő tantárgynál döntő kell (2 a 3-ból)");
  for (const m of CLASSIFIER_MODELS) assert.equal(providerForModel(m), "openai", `${m}: közvetlen OpenAI, nem OpenRouter`);
});
