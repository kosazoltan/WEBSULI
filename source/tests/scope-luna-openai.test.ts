import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { providerForModel } from "../server/ai/models";
import { STUDIO_STEP_POLICY } from "../server/ai/studio-provider";
import { CLASSIFIER_MODELS } from "../server/catalog/classify";

/**
 * Spec 2026-10-14-forras-besorolo-openai-luna. Kiváltó hiba (élő DB, 4 futás): a tantárgy/évfolyam-felismerés az `ocr` lépés
 * modelljén (`qwen/qwen3-vl-32b-instruct`, OpenRouter) futott, amelyet a szolgáltató 2026-10-09-én kivezetett → 404.
 */

// S4b (docs/specs/2026-10-16-egy-futas.md): a különálló tantárgy-felismerő lépés (STUDIO_STEPS "scope", resolveStudioModel, studioModelMap, callScopeModel) kivezetve — két esete törölve.

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
