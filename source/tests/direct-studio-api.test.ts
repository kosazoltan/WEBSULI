import test from "node:test";
import assert from "node:assert/strict";
import { studioConnection } from "../server/ai/studio-provider";
import { callOcrModel } from "../server/studio/ocr";
import { callScopeModel } from "../server/studio/one-step";
import { aiKeyStatus, studioModelMap, FALLBACK_MODELS, LEGACY_MODELS, assertDistinctFamilies } from "../server/ai/models";

test("OCR and scope use the selected vendor even when router credentials exist", async (t) => {
  const names = ["AI_INTEGRATIONS_OPENAI_API_KEY", "OPENAI_API_KEY", "XAI_API_KEY", "OPENROUTER_API_KEY"];
  const before = names.map(name => process.env[name]);
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "ok" } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  try {
    for (const name of names) process.env[name] = "test-placeholder";
    const file = { kind: "image" as const, name: "test.png", content: "data:image/png;base64,AA==" };
    assert.equal(await callOcrModel(file, "openai/gpt-5.6-terra"), "ok");
    assert.equal(await callScopeModel([file], "x-ai/grok-4.6"), "ok");
    assert.equal(new URL(calls[0].url).hostname, "api.openai.com");
    assert.equal(new URL(calls[1].url).hostname, "api.x.ai");
    assert.equal(calls[0].body.model, "gpt-5.6-terra");
    assert.equal(calls[1].body.model, "grok-4.6");
    assert.ok(calls.every(call => !("reasoning" in call.body)));
    delete process.env.OPENROUTER_API_KEY;
    await assert.rejects(callOcrModel(file, "qwen/qwen3-vl-32b-instruct"), /OPENROUTER_API_KEY/);
    await assert.rejects(callScopeModel([file], "qwen/qwen3-vl-32b-instruct"), /OPENROUTER_API_KEY/);
    assert.equal(calls.length, 2, "missing router key must not send to OpenAI");
  } finally {
    names.forEach((name, index) => { if (before[index] === undefined) delete process.env[name]; else process.env[name] = before[index]; });
  }
});

test("own keys route native and historical model ids to direct hosts", () => {
  const env = { OPENAI_API_KEY: "test-openai", XAI_API_KEY: "test-xai", OPENROUTER_API_KEY: "test-router" };
  for (const id of ["gpt-5.6-terra", "openai/gpt-5.6-terra"]) {
    const c = studioConnection(id, env);
    assert.equal(c.baseURL, "https://api.openai.com/v1");
    assert.equal(c.model, "gpt-5.6-terra");
    assert.equal(c.apiKey, env.OPENAI_API_KEY);
  }
  for (const id of ["grok-4.6", "x-ai/grok-4.6"]) {
    const c = studioConnection(id, env);
    assert.equal(c.baseURL, "https://api.x.ai/v1");
    assert.equal(c.model, "grok-4.6");
    assert.equal(c.apiKey, env.XAI_API_KEY);
  }
  assert.equal(studioConnection("qwen/qwen3-vl-32b-instruct", env).apiKey, env.OPENROUTER_API_KEY);
});

test("router credentials never substitute for missing own credentials", () => {
  const env = { OPENROUTER_API_KEY: "test-router" };
  assert.throws(() => studioConnection("grok-4.6", env), /XAI_API_KEY/);
  assert.throws(() => studioConnection("gpt-5.6-terra", env), /AI_INTEGRATIONS_OPENAI_API_KEY/);
  assert.equal(aiKeyStatus(env).xai.configured, false);
  assert.equal(aiKeyStatus({ OPENAI_API_KEY: "test" }).openai.configured, true);
});

test("no GLM defaults or fallbacks; Terra helpers and independent Grok review", () => {
  const map = studioModelMap({});
  assert.equal(map.gateHelper, "gpt-5.6-terra");
  assert.equal(map.quizPolish, "gpt-5.6-terra");
  assert.doesNotMatch(JSON.stringify([map, FALLBACK_MODELS, LEGACY_MODELS]), /glm/i);
  assert.equal(FALLBACK_MODELS.author, undefined);
  assert.equal(FALLBACK_MODELS.lektor, undefined);
  assert.doesNotThrow(() => assertDistinctFamilies({}));
});
