# Végrehajtás — tanári témafókusz (2026-09-29)

Terv: `docs/specs/2026-09-29-tanari-temafokusz.md`. Ág: `fix/webes-tema-fokusz`. Parancsok a `source/`-ban.

## T1 — Tesztek először
1. `tests/topic-focus.test.ts` (új):
   - `validateTopicFocus`: ismeretlen id kiszűrve; core nélkül `null`; minden fogalom → `null`; érvényes → `localIds`.
   - `applyTopicFocus`: fókuszon kívüli `core`/`supporting` → `extra`, a fókuszon belüliek változatlanok, az eredeti
     objektum NEM módosul; `null`/`undefined` fókusz → azonos tartalom.
   - `decideTopicFocus`: a hívó `call` dob → `null`; a hívó érvényes választ ad → fókusz; üres kérés → hívás nélkül `null`.
2. `tests/lesson-pipeline-runner.test.ts` VÉGÉRE: fókuszált job (`output.topicFocus`), amelynek vázlata egy
   fókuszon kívüli `core` fogalmat NEM fed le → az `approveOutline` elfogadja; ugyanaz fókusz nélkül → elutasítja.
Futtatás a kód előtt: mindkét fájl bukik.

## T2 — `server/studio/topic-focus.ts` (új)
`export type TopicFocus = { localIds: string[]; demoted: number }`; a három függvény a terv 1. pontja szerint.
Prompt (magyar): a tanári kérés + fogalmak (`localId`, `term`, rövid `definition`, `examWeight`); feladat: a kért téma
tanításához SZÜKSÉGES fogalmak (a téma fogalmai + a megértésükhöz közvetlenül kellő előfeltételek); válasz:
`{ "focusIds": ["…"] }`.

## T3 — Bekötés
1. `step-runner.ts`: `startJobFromMap` `owner.topicFocus` → `output.topicFocus`; pedagógus-hash a fókuszált térképből;
   a `:427`, `:1042`, `:1214` betöltés `applyTopicFocus(map, job.output?.topicFocus)`.
2. `lesson-pipeline-routes.ts` `runOneStepCore`: kérés esetén `decideTopicFocus` a `gateHelper` modellel
   (`callStepModel(createStudioStepProvider(model, "gateHelper"), { step: "gateHelper", … })`), a térkép a
   `createDrizzlePipelineStore().loadMap(mapId)`-ből; `updateRun` részlet a fókusz méretéről.
Ellenőrzés: `node --import tsx --test tests/topic-focus.test.ts tests/lesson-pipeline-runner.test.ts` → pass.

## T4 — Kapuk és visszamérés
1. `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.test.json`, `npm run lint`, `node --import tsx --test tests/*.test.ts`, `npm run build`.
2. Az új tesztek a régi kódon buknak (a két kódfájl ideiglenes visszaállításával igazolva).
3. Élő próbagyártás a termelési kódúton (GPT-6 Luna szerzővel, #131 + e szelet együtt, helyben az éles DB-n) →
   vázlat-fejezetek vizsgálata, `done`, visszaolvasás, böngészős ellenőrzés; közben NINCS merge/deploy.

## T5 — 2. kör (élő mérés után)
1. Tesztek (saját, e PR-ban új fájl): `decideTopicFocus` hívólistával — az első dob → a második dönt; az első
   használhatatlan (core nélküli) választ ad → a második dönt; mindkettő hibás → `null`, a naplóban az ok.
2. `server/ai/studio-provider.ts`: `STUDIO_STEP_POLICY.topicFocus = { timeoutMs: 60_000, maxTokens: 8_000, reasoningEffort: "low", jsonMode: true }`.
3. `server/studio/topic-focus.ts`: hívólista, cause-naplózás, pontosított prompt.
4. `server/studio/lesson-pipeline-routes.ts` `focusForInstruction`: `[gateHelper, FALLBACK_MODELS.gateHelper]`, `policy: "topicFocus"`.
5. Mérés: 5 valódi döntés a `94842a1c` térképén (E7); utána élő újragyártás (E8).
