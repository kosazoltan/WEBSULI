# Végrehajtás: ellentétes családú tartalék — A1 szelet (2026-10-14)

Spec: `docs/specs/2026-10-14-ellentetes-csalad-tartalek.md`. Parancsok a `source/` mappából. Sorrend: RED teszt → kód → zöld.

## V1 — modelltábla (`server/ai/models.ts`)
- `CROSS_FAMILY_FALLBACK = { openai: "claude-opus-5-5", anthropic: "gpt-6.1-sol" }`; `crossFamilyFallback(model)` a
  `modelFamily` alapján (más család → `undefined`). `CROSS_FAMILY_FALLBACK_EFFORT = "medium"`.
- `FALLBACK_MODELS`: pedagogue/author/animator = `crossFamilyFallback(DEFAULT)` (`gpt-6.1-sol`), bank = `claude-opus-5-5`,
  lektor = `claude-opus-5-5` (csak a lánc alapja; a futás a `lektorChainFor`-t használja).
- `LEKTOR_THIRD_FAMILY_MODEL = "qwen/qwen3.8-max-0902"`; `MODEL_REASONING_EFFORT["qwen/qwen3.8-max-0902"] = "high"`.
- `lektorChainFor(authorModels, env)` a spec sorrendjével; `assertDistinctFamilies` átdolgozva (spec „Indítási őr”).

## V2 — effort a tartalékhíváson (`server/ai/AIProvider.ts`, `OpenAIProvider.ts`, `studio-provider.ts`)
- `AIProviderConfig.chatReasoningEffort?: boolean` → `OpenAIProvider` chat és streamelt chat: `reasoning_effort` küldése.
- `createStudioStepProvider(model, step?, opts?: { fallback?: boolean })`: `fallback && crossFamily` → `reasoningEffort:
  "medium"`, OpenAI-nál `chatReasoningEffort: true` (a lektor Responses-ágán a meglévő medium). Lektor-ág: Anthropic →
  medium, OpenRouter → `MODEL_REASONING_EFFORT[model]`.

## V3 — lépésfuttató (`server/studio/step-runner.ts`)
- `PipelineDeps.providerFactory` típusa: `(model, step?, opts?: { fallback?: boolean })`.
- A tartalék-ágak (`attempt(fallbackModel)`, ábratervező tartalék, bank `attempt === PACKET_ATTEMPTS - 1`) `{ fallback: true }`.
- A szerző sikeres mentése: `authorModels = unique([...prev, model])`.
- A lektor lépés lánca: `lektorChainFor(authorModelsOf(job))` → elsődleges / tartalék / második tartalék a láncból.

## V3b — webes gyártás (A2, ugyanebben a PR-ban)
- `web-research-runner.ts`: `webAuthorCall` + `crossFamilyFallbackOptions`; a `web-author-html` checkpoint `-2` szerződéssel
  `{ html, authorModel }`-ot ad; `webAuthorModels = [authorModel, szerző-elsődleges]` → `reviewAndRepairWebTeaching({ authorModels })`;
  a bank első tartaléka `{ fallback: true }`.
- `web-teaching-repair.ts`: az `authorModels` opció a lektorhívásba kerül. `web-teaching-review.ts`: `callTeachingReviewer(…, authorModels)`
  a láncon végigmegy (csak `StepModelError`-ra, megszakítás nélkül), minden tag hibáját összegyűjti.
- Teszt: webes lánc (Sol 500 → Qwen; vegyes szerzőség → csak Qwen); `author-fallback-review.test.ts` forrás-mintája `let model`
  (dokumentált változás) + a szerző rögzítése.

## V4 — tesztek
- Új: `tests/cross-family-fallback.test.ts` — tábla, `crossFamilyFallback`, `lektorChainFor` (3 eset + régi job), őr,
  szolgáltató-konfiguráció (medium; OpenAI chat `reasoning_effort` a kérésben; Qwen lektor high), lépésfuttató: szerző-tartalék
  → `authorModels` → a lektor első modellje Qwen.
- Dokumentált spec-változás miatt frissül (a régi tartalék-értékeket rögzítik): `models-routing.test.ts` (tartalék-értékek,
  lektor-tartalék, az őr fallback-argumentumos dobása → láncalapú), `direct-studio-api.test.ts` (author/lektor tartalék),
  `lesson-pipeline-runner.test.ts` (szerző-tartalék Qwen → GPT-6.1 Sol; szerző-tartalék ≠ lektor család → lánc-alapú).

## V5 — kapuk és élő próba
- `npm.cmd run check`, `check:test`, `lint`, `test`, `build`.
- Élő próba (spec E5) egy scratchpad-szkripttel, kulcs a környezetből, csak állapotkód és token-szám kerül ki.
