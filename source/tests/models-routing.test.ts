import assert from "node:assert/strict";
import test from "node:test";

import {
  STUDIO_STEPS,
  resolveStudioModel,
  modelFamily,
  assertDistinctFamilies,
  providerForModel,
  LEGACY_MODELS,
  FALLBACK_MODELS,
  lektorChainFor,
  LEKTOR_THIRD_FAMILY_MODEL,
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

test("every studio step has a default model", () => {
  for (const step of STUDIO_STEPS) {
    const model = resolveStudioModel(step, {});
    assert.ok(model && model.length > 0, `no default for step ${step}`);
    // Spec 2026-09-19 (modellmátrix): vendor per step.
    const expected: Record<string, string> = {
      // Spec-változás 2026-10-05 (docs/specs/2026-10-05-lektor-szerzo-modellcsere.md, tulajdonosi döntés): szerző Claude Opus 5.5
      // (anthropic), lektor GPT-6.1 Sol (openai).
      extract: "openai", ocr: "openrouter", pedagogue: "anthropic", author: "anthropic",
      // Spec-változás 2026-09-24 (tulajdonosi döntés, docs/specs/2026-09-24-magyarazo-abrak.md): ábrák Claude Opus 5.5-ön.
      // Spec-változás 2026-09-24 (docs/specs/2026-09-24-bankmodell-valasztas.md): a bank gpt-5.6-luna → openai.
      animator: "anthropic", bank: "openai", lektor: "openai", gateHelper: "openrouter", quizPolish: "openrouter",
      // Spec 2026-10-14-forras-besorolo-openai-luna (új lépés, tulajdonosi döntés): tantárgy/évfolyam-felismerés gpt-6-luna, közvetlen OpenAI.
      scope: "openai",
    };
    assert.equal(providerForModel(model), expected[step], step);
  }
});

test("spec 2026-09-24: bank gpt-5.6-luna-n (mért bankmodell-választás), ábrák Opus 5.5-ön; a bank tartaléka a mentőmodell (spec §7o, mérve 2026-09-20); a tervkészítő Opus 5 közvetlen Anthropicon", () => {
  // Spec-változás 2026-09-24 (tulajdonosi döntés): az ábrákat Claude Opus 5.5 tervezi, tartaléka a gpt-5.6-terra.
  // Spec-változás 2026-09-24 (docs/specs/2026-09-24-bankmodell-valasztas.md, tulajdonosi utasítás): a bank
  // gpt-5.6-luna — mérve 9/144 bank-ellenőr hiba két futásban (glm-5.3-flash: 22/146, a javító kör nem konvergált).
  assert.equal(resolveStudioModel("animator", {}), "claude-opus-5-5");
  assert.equal(providerForModel("claude-opus-5-5"), "anthropic");
  assert.equal(resolveStudioModel("bank", {}), "gpt-5.6-luna");
  assert.equal(providerForModel("gpt-5.6-luna"), "openai");
  // Spec-változás 2026-10-14 (docs/specs/2026-10-14-ellentetes-csalad-tartalek.md, tulajdonosi döntés): minden OpenAI/Anthropic
  // elsődleges első tartaléka az ellentétes család — Anthropic → gpt-6.1-sol, OpenAI → claude-opus-5-5 (a mentőkör marad).
  assert.equal(FALLBACK_MODELS.animator, "gpt-6.1-sol");
  assert.equal(FALLBACK_MODELS.bank, "claude-opus-5-5");
  assert.equal(resolveStudioModel("pedagogue", {}), "claude-opus-5");
  assert.equal(providerForModel("claude-opus-5"), "anthropic");
  assert.equal(FALLBACK_MODELS.pedagogue, "gpt-6.1-sol");
  assert.equal(resolveStudioModel("gateHelper", {}), "deepseek/deepseek-v4-flash");
  assert.equal(resolveStudioModel("quizPolish", {}), "deepseek/deepseek-v4-flash");
});

test("no default model is a local Ollama tag", () => {
  for (const step of STUDIO_STEPS) {
    const model = resolveStudioModel(step, {});
    assert.ok(!model.includes(":"), `${step} looks like a local tag: ${model}`);
  }
});

// ------------------------------------------------------------------ env override

test("an environment variable overrides the default for that step", () => {
  const model = resolveStudioModel("author", { STUDIO_MODEL_AUTHOR: "x-ai/grok-4.6" });
  assert.equal(model, "x-ai/grok-4.6");
});

test("an unrelated environment variable does not change other steps", () => {
  const env = { STUDIO_MODEL_AUTHOR: "x-ai/grok-4.6" };
  assert.equal(resolveStudioModel("lektor", env), resolveStudioModel("lektor", {}));
});

test("a blank environment override falls back to the default", () => {
  assert.equal(
    resolveStudioModel("author", { STUDIO_MODEL_AUTHOR: "   " }),
    resolveStudioModel("author", {}),
  );
});

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

test("assertDistinctFamilies passes with the shipped defaults", () => {
  assert.doesNotThrow(() => assertDistinctFamilies({}));
});

test("assertDistinctFamilies throws when author and lektor share a family", () => {
  assert.throws(
    () =>
      assertDistinctFamilies({
        STUDIO_MODEL_AUTHOR: "qwen/qwen3.8-max",
        STUDIO_MODEL_LEKTOR: "qwen/qwen3.8-flash",
      }),
    /same model family/i,
  );
});

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

  assert.equal(providerForModel(LEGACY_MODELS.htmlFix), "anthropic");
  assert.equal(providerForModel(LEGACY_MODELS.analyzeFiles), "openai");
});

/* Audit 2026-09-05 (szelet D): a D1-garancia a tartalékokra is áll — ugyanaz a modellcsalád nem lektorálhatja a saját leckéjét.
 * Spec-változás 2026-10-14 (docs/specs/2026-10-14-ellentetes-csalad-tartalek.md, tulajdonosi döntés): a szerző és a lektor is
 * ellentétes családú tartalékot kap, ezért a garancia a TÉNYLEGES szerzőség szerinti lektor-láncon áll (`lektorChainFor`):
 * a szerző-jelöltek minden részhalmazára (csak elsődleges, csak tartalék, mindkettő) a lánc egyik tagja sem szerzőcsalád. */
test("assertDistinctFamilies: a shipped modellekkel minden lehetséges szerzőség mellett független a lektor-lánc", () => {
  assert.doesNotThrow(() => assertDistinctFamilies({}));
  const author = resolveStudioModel("author", {}), fallback = FALLBACK_MODELS.author!;
  for (const authors of [[author], [fallback], [author, fallback]]) {
    const chain = lektorChainFor(authors, {});
    assert.ok(chain.length > 0, `${authors.join("+")}: van lektor`);
    for (const l of chain) for (const a of authors) assert.notEqual(modelFamily(a), modelFamily(l), `${a} × ${l} azonos család`);
  }
});

test("assertDistinctFamilies dob, ha nem marad lektor a szerzőcsaládokon kívül", () => {
  // Spec-változás 2026-10-14: a szerző-tartalék a lektor-elsődleges családjában már NEM hiba (a lektor-lánc kikerüli);
  // hiba az, ha a szerző-jelöltek mellett egyetlen lektor sem marad.
  assert.throws(
    // Szerző-jelöltek: qwen (elsődleges) + z-ai (tartalék); lektor-jelöltek: z-ai, qwen, és a harmadik család is qwen → üres lánc.
    () => assertDistinctFamilies({ STUDIO_MODEL_AUTHOR: "qwen/qwen3.8-max", STUDIO_MODEL_LEKTOR: "z-ai/glm-5.3" }, { author: "z-ai/glm-5.3-flash", lektor: "qwen/qwen3.8-flash" }),
    /no lektor model outside the author families/i,
  );
});

test("spec 2026-10-14: a lektor-lánc a tényleges szerzőség szerint — Claude → Sol, majd Qwen; GPT → Qwen, majd Opus; vegyes → Qwen", () => {
  assert.equal(FALLBACK_MODELS.lektor, "claude-opus-5-5");
  assert.equal(LEKTOR_THIRD_FAMILY_MODEL, "qwen/qwen3.8-max-0902");
  assert.deepEqual(lektorChainFor(["claude-opus-5-5"], {}), ["gpt-6.1-sol", "qwen/qwen3.8-max-0902"]);
  assert.deepEqual(lektorChainFor(["gpt-6.1-sol"], {}), ["qwen/qwen3.8-max-0902", "claude-opus-5-5"]);
  assert.deepEqual(lektorChainFor(["claude-opus-5-5", "gpt-6.1-sol"], {}), ["qwen/qwen3.8-max-0902"]);
  // A telepítés előtt írt job (nincs authorModels): a konfigurált szerző-elsődleges számít szerzőnek.
  assert.deepEqual(lektorChainFor(undefined, {}), ["gpt-6.1-sol", "qwen/qwen3.8-max-0902"]);
  assert.doesNotThrow(() => assertDistinctFamilies({}));
});
