# Végrehajtás — témafókusz-késleltetés (spec: 2026-09-30-temafokusz-kesleltetes.md)

Munkakönyvtár: `source/`.

1. `server/studio/run-step.ts`, `callUncachedStepModel` catch-ága: `stepDeadlineMs(input.step)` →
   `stepDeadlineMs(input.policy ?? input.step)`.
2. `server/studio/topic-focus.ts`: import `FALLBACK_MODELS, resolveStudioModel` a `../ai/models`-ból; új export
   `topicFocusModels(env = process.env): string[]` → `[...new Set([FALLBACK_MODELS.gateHelper, resolveStudioModel("gateHelper", env)].filter(Boolean))]`.
3. `server/studio/lesson-pipeline-routes.ts` `focusForInstruction`: a helyi `models` tömb helyett `topicFocusModels()`;
   a nem használt `FALLBACK_MODELS` import törlése.
4. Új teszt `tests/studio-provider-policy.test.ts`: `createStudioStepProvider(model, "topicFocus")` +
   `callStepModel({ step: "pedagogue", policy: "topicFocus" })`, mockolt `AbortSignal.timeout` és `fetch` →
   elvárás: `timeoutMs === 60000`, 1 fetch, a cause `AIProviderTimeoutError` „60000ms” szöveggel.
5. Új teszt `tests/topic-focus.test.ts`: `topicFocusModels({})` = `["z-ai/glm-5.3-flash", "deepseek/deepseek-v4-flash"]`;
   `STUDIO_MODEL_GATE_HELPER=z-ai/glm-5.3-flash` → egy elem.
6. Régi kódon: `git diff -- source/server > patch; git checkout -- source/server;
   node --import tsx --test tests/topic-focus.test.ts tests/studio-provider-policy.test.ts` → bukás; `git apply patch`.
7. Kapuk: `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.test.json`, `npm run lint`,
   `node --import tsx --test tests/*.test.ts`, `npm run build` — mind 0-s kilépési kód.
8. Utána-mérés: `npx tsx focus-after.local.mts 5` (gitignore-olt) → 5 döntés, mind az első modellel.
