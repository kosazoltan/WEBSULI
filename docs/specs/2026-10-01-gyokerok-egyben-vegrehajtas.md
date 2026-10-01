# Végrehajtás — gyökérok-javítás egyben

1. `shared/lesson-experience.ts`: `bankPlan.limitRelaxed?: boolean`; a superRefine fejezet-csomag szabályai (módszer min/fajták,
   feladat darab/pár, fogalmanként feladat, fejezet kvíz-min) `limitRelaxed` mellett kimaradnak; fogalmankénti recall+apply kvíz,
   tartalmazás, egyediség, ismétlés-tilalom marad. `publicationBankProblems`: 45/75, ≥2 kapu, körök maradnak; a 10 módszerfajta
   `limitRelaxed` mellett kimarad. `lesson-skill-checks.ts` változatlan hívással (a zászló az experience-ben utazik).
2. `server/studio/limit-policy.ts`: `applyLimitRelaxation(lesson, sections?)` (limitRelaxed=true, trimmedSections megőrzése/bővítése);
   `step-runner.ts` `resolveChoiceGate` limit-eredetű kivételnél és a blokk-kivétel ágán determinisztikusan hívja; egyszer mér.
3. `server/studio/experience-builder.ts`: az autofix és a `validate` kivétele → bukott kísérlet (hibaüzenet, javító kör), nem lépéshalál;
   `deps.autofix` seam (teszt: kivételt dobó eszköz); `tools/bank-packet-autofix.ts`: típus-őr az `evaluateOpenAnswer` előtt.
4. `step-runner.ts`: vak megoldó cache csak `!partial`; tanári ellenőrzés cache csak `complete`; részlegesnél egy újrakérés.
5. `server/ai/studio-provider.ts`: `withQuotaFailover(connection, fn)`; `AIProvider.ts` `isQuotaExhausted` üzenet-minta;
   `run-extraction.ts`, `ocr.ts` (2 hívás), `one-step.ts` a segéden át.
6. `scripts/studio/replay-gate.mts` + `tests/fixtures/replay/*.json` + `tests/limit-replay.test.ts` (E1); `tests/bank-shape-first.test.ts`
   (E2); `tests/quota-failover-direct.test.ts` (E3); E4 futtató-teszt.
7. Ellenőrzés: tsc, eslint, teljes unit, replay 3/3; status-sor; PR; CI; merge; deploy; EGY fizetős futás.
