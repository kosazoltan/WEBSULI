# Végrehajtás: S7 — Workflow-rendbetétel

> Spec: `docs/specs/2026-10-06-s7-workflow-rendbetetel.md`. Minden parancs a `source/` könyvtárból fut (Windows: `npm.cmd`, `npx.cmd`).
> Minden szelet külön commit. Fizetős modellhívás tilos; a tesztek memóriás workflow-tárolót (`tests/helpers/workflow-store.ts`) használnak.

## 1. szelet — módok, eredményfajták, segéd (motor)

1. `shared/lesson-workflow.ts`
   - `WorkflowMode` bővítése: `"htmlAssist" | "creator" | "quiz" | "map" | "mapCheck" | "webStudio"`.
   - `labels`: `save` mellett nincs új címke; a láncok (`chains`):
     `htmlAssist: source,author,gate,readback` („Régi HTML javítási javaslata”); `creator: source,author,gate,readback`
     („Anyagkészítő segéd”); `quiz: source,author,gate,save,readback` („Játék-kvízgenerálás”); `map: source,scope,knowledge,gate,readback`
     („Tudástár-kivonatolás”); `mapCheck: source,gate,save,readback` („Tudástár-ellenőrzés”); `webStudio: generate,source,scope,knowledge,
     sourceCheck,pedagogue,author,animator,lektor,gate,readback` („Internetes készítés (Studio)”).
   - A `workflowDefinition` körszabályainak `["upload", "studio"]` feltételei → `["upload", "studio", "webStudio"]` (gate-címke is).
   - `WorkflowView.result.kind`: `"candidate" | "material" | "proposal" | "map"`.
   - `export const WORKFLOW_RESULT_KIND: Record<WorkflowMode, …>` (repair/html → candidate; htmlAssist/creator → proposal; map/mapCheck → map; többi → material).
2. `server/workflows/engine.ts` `executeWorkflow`: `expectedKind = WORKFLOW_RESULT_KIND[input.mode]`.
3. `shared/lesson-skill.ts` `skillForMode`: javító = `repair, html, concept, apply, htmlAssist`.
4. `shared/runtime-knowledge.ts` `runtimeKnowledge`: a módszűrő listák a `skillForMode`-ból (nem kézi lista).
5. `server/workflows/tool-run.ts` (új): `runToolWorkflow<T>(input: { mode; owner; request; id?; store? }, work: () => Promise<{ value: T; result: { kind; id } }>): Promise<T>`;
   alapértelmezett tároló `workflowStore`, azonosító `${mode}:${randomUUID()}`.
6. `client/src/components/studio/WorkflowGraph.tsx`: `proposal` → „A javaslat a kérő felületen jelent meg; tárolt tananyag nem változott.”;
   `map` → „Tudástár: <id>”.
7. Teszt: `tests/s7-workflow-modes.test.ts` — láncok sorrendje, `WORKFLOW_RESULT_KIND`, `skillForMode`, a meglévő hét lánc bájtra
   változatlan (`JSON.stringify(workflowDefinition(m))` összevetése a régi definícióval rögzített mintán), `runToolWorkflow` kész és hibás futása.
   Parancs: `node --import tsx --test tests/s7-workflow-modes.test.ts tests/lesson-workflow.test.ts tests/runtime-knowledge.test.ts` → mind pass.

## 2. szelet — H és I (routes.ts)

Minden végpontnál: a bemenet-ellenőrzés és a fájl betöltése (400/404) a workflow előtt marad; utána
`await runToolWorkflow({ mode, owner: req.user!.id, request: {...} }, async () => { phase("source"); phase("author"); <modellhívás>;
phase("gate"); <parse/validálás>; phase("readback"); <válasz>; return { value: undefined, result: { kind: "proposal", id } } })`,
a meglévő `catch` a wrapper KÖRÜL.
- `/html-fix/errors`, `/html-fix/theme`, `/html-fix/chat` → `htmlAssist`, id = `fileId`.
- `/html-fix/apply` → `runToolWorkflow({ mode: "apply", id: \`html-fix-apply:${randomUUID()}\` … })`: `source` (fájl), `gate` (a `fixedHtml` nem üres, `</html>`-t
  vagy `<body` elemet tartalmaz — ha a régi viselkedés bármilyen nem üres szöveget elfogadott: csak nem-üresség), `apply` (írás), `readback`
  (újraolvasott `content === fixedHtml`), eredmény `material` = fileId.
- `/material-creator/chat`, `/enhanced-creator/analyze-files`, `/analyze-file`, `/chatgpt-chat`, `/claude-chat` → `creator`, id = futás-azonosító.
Ellenőrzés: `npx.cmd tsc --noEmit -p tsconfig.test.json` → 0 hiba; `node --import tsx --test tests/client-csrf-guard.test.ts tests/role-skills-everywhere.test.ts` → pass.

## 3. szelet — J, K, B, B′

- `server/gameQuizGeneratorService.ts` `generateMaterialQuiz(materialId, count, owner?)`: a törzs `runToolWorkflow({ mode: "quiz" })`-ban:
  `source` (anyag betöltése), `author` (modell), `gate` (`validateGeneratedQuizItems`), `save` (tranzakció, ha van érvényes tétel),
  `readback` (aktív tételszám = inserted); eredmény `material` = materialId. A route átadja `req.user!.id`-t.
- `server/studio/routes.ts` `/maps/extract`: `withPreparationSkill` helyett `runToolWorkflow({ mode: "map" })`: `source`, `scope` (besorolás;
  sikertelen → `workflowFinding("scope_classification")` + 422 a workflow-n belül a régi szöveggel, eredmény nélkül nem zárható → a
  422-ágat a futás `error`-ként rögzíti), `knowledge` (cache vagy `runExtraction`), `gate` (a térkép sora és ≥0 fogalom olvasható),
  `readback`; eredmény `map` = mapId.
- `/maps/:id/recheck`: `mapCheck`: `source` (térkép + fogalmak), `gate` (`applyVerbatimChecks`), `save` (írások), `readback` (a fogalmak
  `verbatimOk` értéke = a számolt); eredmény `map`.
- `server/studio/lesson-pipeline-routes.ts`:
  - `correctMapInWorkflow(mapId, owner)`: `mapCheck` futás; `source`, `gate`, `save` (`correctMapFromOwner(mapId, undefined, false)`),
    `readback` (a visszaadott helyesbítések `correctionApplied` a friss sorokon); a `/lessons/from-map/:mapId` ezt hívja.
  - `driveTracked`: `if (!start && !previous)` ág → `throw new WorkflowConflict("Ehhez a készítéshez nincs workflow-napló (kiadás előtti futás); folytatás helyett indíts új készítést a térképről.")`.
Ellenőrzés: `node --import tsx --test tests/studio-one-step.test.ts tests/studio-extractor.test.ts tests/game*.test.ts` → pass; tsc → 0.

## 4. szelet — C egy futásban

- `shared/lesson-workflow.ts` már tartalmazza a `webStudio` láncot (1. szelet).
- `server/studio/one-step-progress.ts` `createRun(persist?, id?)`: opcionális rögzített azonosító.
- `server/studio/lesson-pipeline-routes.ts`:
  - `export async function runOneStepInWorkflow(runId, data, userId)`: `createRun(runId)` (a haladásjelző a webes job azonosítójával),
    majd `runOneStepCore` a hívó workflow-jában, readback nélkül. Ha ugyanennek a futásnak egy korábbi végrehajtása már közzétette a
    leckét (haladásjelző `done` + publikált lecke), a lecke újrahasznosul: a lépések modellhívás nélkül látogatásként rögzülnek
    (a feltöltéses út kész-lecke ágával azonos módon), új lecke nem készül;
  - `driveTracked`: `webStudio` módban a haladásjelző frissítése az `upload`-dal azonos; kész jobnál `finishWebStudio(id, owner, lessonId)`
    (a `completeWebStudioJob`-ot hívja a `researchJobStore`-ral) — ez végzi a `readback`-et.
- `server/studio/web-studio-handoff.ts`: `WebStudioDeps` = `{ gather, manufacture(runId, data, userId), read, sleep?, pollMs? }`;
  nincs `outsideWorkflow`, nincs `start`. A `gather` `workflowCheckpoint("web-sources", { input, method })`-ban; a `runId` = `observer.jobId`;
  a gyártás alatt `read`-del követi a haladást (státusz-események), a végén `done` → artefaktum, `error`/`parked` → `WebResearchFailure`.
- `server/studio/web-research-runner.ts` `ResearchObserver`: `jobId?: string`.
- `server/studio/web-research-jobs.ts`:
  - `createResearchJobs(store, generate, workflows?, options?: { mode?: "web" | "webStudio" })`; a futás módja `options.mode ?? "web"`.
  - `runWork`: `webStudio` módban nincs `web-result` checkpoint és nincs utólagos `knowledge/author/gate`; a gyártás után
    `completeWebStudioJob(store, job, artifact)` (gate-látogatás alatt a kész jelzés, majd `readback`).
  - `export async function completeWebStudioJob(...)` a közös lezárás (webes worker és `driveTracked` is ezt hívja); ha a job nem
    `running`, előbb `running`-ra áll (`store.update(job, előző)`).
  - `read`: ha a nyomon követett workflow módja ≠ a beállított mód → `canResume = false`.
  - `publish`: nyomon követés nélküli jobnál, ha van workflow-tároló → `WebResearchFailure` (régi, napló nélküli futás).
- `server/studio/web-research-routes.ts`: Studio-út: `createResearchJobs(researchJobStore, generate, workflowStore, { mode: "webStudio" })`,
  a `generate` deps-e: `{ gather: gatherWebSources, manufacture: runOneStepInWorkflow, read: oneStepRunView }`;
  `WEB_RESEARCH_PIPELINE=html` esetén `mode: "web"` és a régi HTML-generátor.
- Tesztek (spec-változás, §4/7): `tests/web-studio-handoff.test.ts` és `tests/web-research-jobs.test.ts` Studio-átadás esetei az új
  deps-alakra; új elvárás: `workflowMode()` a gyártáson belül `"webStudio"`, a lépéssor a valódi sorrend, nincs második futás.
  A 120 perces követési határidő megszűnik (a gyártás ugyanabban a futásban megy, nem követett külön futás).
- `server/workflows/engine.ts`: az `outsideWorkflow` export törlése (nincs több hívója; a forrás-ellenőrző teszt tiltja).
Ellenőrzés: `node --import tsx --test tests/web-studio-handoff.test.ts tests/web-research-jobs.test.ts tests/web-research-completion.test.ts` → pass.

## 5. szelet — skill-szöveg és támogató lelet-kódok

- `server/studio/support-skills.ts`: `"topic-focus"` skill (Szerep/Bemenet/Kimenet/Lépések/Tilalmak/Önellenőrzés, ≤ 2800 karakter).
- `server/studio/topic-focus.ts` `decideTopicFocus`: `call(withSupportSkill("topic-focus", TOPIC_FOCUS_SYSTEM), user)`; hívás-hiba vagy
  használhatatlan válasz → `workflowFinding("topic_focus")`.
- `shared/lesson-skill.ts` `SKILL_RULES`: `scope_classification`, `source_correction`, `topic_focus`, `blind_solver`, `bank_verifier`,
  `instruction_points`, `instruction_check`, `ocr_uncertain` (cím + egy-két mondatos szabály).
- `shared/instruction-bundles/roles.ts` `RULE_ROLES`: a fenti kódok → `["scope"]`, `["corrector"]`, `["topic-focus"]`, `["blind-solver"]`,
  `["bank-verifier"]`, `["instruction-points"]`, `["instruction-checker"]`, `["ocr", "extract"]`.
- Rögzítési pontok (`workflowFinding`): `lesson-pipeline-routes.ts` besorolás-hiba (`scope_classification`) és a helyesbítő elvetett
  javaslata (`source_correction`); `step-runner.ts` vak megoldó hiba/részleges (`blind_solver`), bank-ellenőr elmaradt darab (`bank_verifier`),
  pontjegyzék hiba/csonka (`instruction_points`), tanári kérés részleges/elmaradt mérése (`instruction_check`); `run-extraction.ts` ⟦?⟧
  jel az átiratban (`ocr_uncertain`); `studio/routes.ts` extract besorolás-hiba (`scope_classification`).
Ellenőrzés: `node --import tsx --test tests/role-skills-everywhere.test.ts tests/instruction-bundles.test.ts tests/lesson-skill.test.ts tests/topic-focus.test.ts tests/s7-workflow-modes.test.ts` → pass.

## 6. szelet — forrás-ellenőrző teszt

- `tests/helpers/workflow-write-graph.ts` (szkenner) + `tests/s7-workflow-guard.test.ts`:
  1. az írási helyek száma > 0, minden védett tábla előfordul;
  2. `unguardedWrites(root).terminals` kulcshalmaza = az `ALLOWLIST` kulcshalmaza (hiányzó és elavult elem is hiba);
  3. minden engedély kategóriája ∈ {`manual-admin`, `backup-restore`, `cli-script`, `scheduled`, `dispatch`, `dead-code`}, indoka ≥ 20 karakter;
  4. minden `dispatch` elemhez `invokedInsideWorkflow(root, file, pattern)` igaz;
  5. negatív kontroll: a szkenner egy szintetikus, workflow nélküli írást (`tests/fixtures`-ben nem — memóriában épített mini-forrás)
     végpontként jelez, `executeWorkflow` argumentumán belülit nem.
Ellenőrzés: `node --import tsx --test tests/s7-workflow-guard.test.ts` → pass.

## 7. Záró ellenőrzés

`npm.cmd run check`; `npx.cmd tsc --noEmit -p tsconfig.test.json`; `npm.cmd run lint`; `npm.cmd test` — mind zöld; a kimenet
pass/fail száma a záró jelentésben.
