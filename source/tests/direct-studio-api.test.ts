import test from "node:test";
import assert from "node:assert/strict";
import { studioConnection } from "../server/ai/studio-provider";
import { aiKeyStatus, studioModelMap, FALLBACK_MODELS, LEGACY_MODELS, assertDistinctFamilies } from "../server/ai/models";

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
