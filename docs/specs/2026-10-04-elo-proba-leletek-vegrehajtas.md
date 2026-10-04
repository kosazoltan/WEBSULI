# Végrehajtás — élő próba leletei

1. `shared/answer-value.ts` `parseReferenceExpression` `factor()`: `if (t === "+") { pos++; return factor(); }`.
   Teszt: `tests/signed-reference-value.test.ts`.
2. `server/studio/role-skills.ts` `skilledPromptLookup` és `server/studio/step-runner.ts` `PipelineDeps.promptLookup`: opcionális
   `callKey`; `resolveDeps` a lenyomatot `name#callKey` kulccsal rögzíti; `runPipelineStep` a lookupot `lépés:kör` kulccsal
   csomagolja, a fejezettervező `fejezet:változat` kiegészítéssel. Teszt: `tests/prompt-hash-key.test.ts`.
3. `server/studio/source-corrections.ts` `correctionAuditText`: hiányzó régi alak → „(már helyesbítve)”.
   Teszt: `tests/source-arithmetic-corrections.test.ts`.
4. Teljes unit, tsc main+test, lint; push csak az élő próba vége után (a deploy lezárná a futó jobot).
