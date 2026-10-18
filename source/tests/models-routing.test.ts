import assert from "node:assert/strict";
import test from "node:test";

import {
  modelFamily,
  providerForModel,
  LEGACY_MODELS,
} from "../server/ai/models";

/**
 * LS-0d — central model routing.
 *
 * Before this slice model ids were string literals scattered through routes.ts
 * ("claude-3-5-sonnet-20241022", "gpt-5"). The Studio pipeline needs one place that
 * (a) can be overridden per environment and (b) can enforce the D1 safety rule:
 * the Author and the Lektor must never be the same model family, otherwise the
 * "second opinion" that guards source-fidelity is the first opinion again.
 */

// ------------------------------------------------------------------ defaults

// S4b (docs/specs/2026-10-16-egy-futas.md): a lépésenkénti Studio-modelltábla (STUDIO_STEPS, resolveStudioModel) kivezetve — az alapértelmezett-modell esete törölve.

test("spec 2026-09-24: bank gpt-5.6-luna-n (mért bankmodell-választás), ábrák Opus 5.5-ön; a bank tartaléka a mentőmodell (spec §7o, mérve 2026-09-20); a tervkészítő Opus 5 közvetlen Anthropicon", () => {
  // S4b (docs/specs/2026-10-16-egy-futas.md): a lépésenkénti modell- és tartaléktábla (resolveStudioModel, FALLBACK_MODELS) kivezetve — a lépés-modell értékek ellenőrzése törölve.
  assert.equal(providerForModel("claude-opus-5-5"), "anthropic");
  assert.equal(providerForModel("gpt-5.6-luna"), "openai");
  assert.equal(providerForModel("claude-opus-5"), "anthropic");
});

// S4b (docs/specs/2026-10-16-egy-futas.md): a lépésenkénti Studio-modelltábla és környezeti felülírása (STUDIO_STEPS, resolveStudioModel, STUDIO_MODEL_*) kivezetve — négy esete törölve.

// ------------------------------------------------------------------ families

test("modelFamily reads the vendor prefix", () => {
  assert.equal(modelFamily("openai/gpt-5.6-terra"), "openai");
  assert.equal(modelFamily("x-ai/grok-4.6"), "x-ai");
  assert.equal(modelFamily("qwen/qwen3.8-max"), "qwen");
  assert.equal(modelFamily("z-ai/glm-5.3"), "z-ai");
  assert.equal(modelFamily("anthropic/claude-opus-5"), "anthropic");
});

test("modelFamily recognizes native OpenAI ids", () => {
  assert.equal(modelFamily("gpt-5"), "openai");
});

// S4b (docs/specs/2026-10-16-egy-futas.md): a szerző/lektor családellenőrzés (assertDistinctFamilies) kivezetve — két esete törölve.

// ------------------------------------------------------------------ legacy ids

test("the legacy route models are declared centrally", () => {
  // Originally this pinned the exact pre-LS-0d ids to prove the move out of routes.ts
  // changed no behaviour. That job is done, and on 2026-09-04 the owner refreshed the
  // whole generation (Opus 5 / GPT-5.6 Sol / GLM 5.3 Flash), which made a literal id
  // assertion a maintenance tax that says nothing.
  //
  // What actually matters is pinned instead: every task resolves to a non-empty id, and
  // each one is routed to the right vendor. `tests/ai-model-routing-complete.test.ts`
  // owns the "no retired generation, no hard-coded literal" guard.
  for (const [task, value] of Object.entries(LEGACY_MODELS)) {
    const ids = Array.isArray(value) ? value : [value];
    assert.ok(ids.length > 0, `${task}: nincs modell`);
    for (const id of ids) {
      assert.ok(typeof id === "string" && id.trim().length > 0, `${task}: üres modell-azonosító`);
    }
  }

  // Spec 2026-10-18-legacy-maradvanyok: a régi admin-útvonalak kulcsai kivezetve; a megmaradtak.
  assert.equal(providerForModel(LEGACY_MODELS.quizGenerator), "anthropic");
  assert.equal(providerForModel(LEGACY_MODELS.improve[1]), "openai");
});

// S4b (docs/specs/2026-10-16-egy-futas.md): a lektor-lánc és a családellenőrzés (lektorChainFor, LEKTOR_THIRD_FAMILY_MODEL, assertDistinctFamilies) kivezetve — három esete törölve.
