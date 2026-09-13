# Végrehajtás: internetes tudásbázis-pipeline

Minden lépés után a tesztparancsot futtasd. Elvárt: exit 0, a megadott állítások teljesülnek. Nincs „stb.”.

## Task 1 — Folyamatleírás

Fájl: `source/shared/lesson-workflow.ts`

1. `WORKFLOW_VERSION` legyen `lesson-flow-2`.
2. `labels.generate` szövege: `Forráskeresés és letöltés`.
3. `chains.web.ids` legyen `["generate", "knowledge", "author", "gate", "publish", "readback"]`.
4. A webes `knowledge` és `author` `maxVisits` értéke 3.

Teszt: `npx.cmd tsx --test tests/lesson-workflow.test.ts` a `source` könyvtárból.
Elvárt: a `generate → publish` ugrás továbbra is hibázik; a sikeres webes séta a knowledge és author lépést is tartalmazza.

## Task 2 — HTML-bank beírása

Fájl: `source/shared/lesson-html-data.ts`

1. Adj `writeHtmlLessonData(html, data)` függvényt: pontosan egy `websuli-lesson-data` script belső JSON-ját cseréli `JSON.stringify(data).replace(/</g, "\\u003c")` alakra.
2. Hiányzó vagy többszörös banknál dobjon.

Teszt: `npx.cmd tsx --test tests/web-knowledge.test.ts` (Task 3-mal együtt).
Elvárt: a tanítás HTML-je byte-azonos marad a scripten kívül.

## Task 3 — Tudásbázis-modul

Fájl: `source/server/studio/web-knowledge.ts`  
Teszt: `source/tests/web-knowledge.test.ts`

1. `fetchedSourcesToExtractorFiles(sources)`: minden forrás `kind: "text"`, `name` a URL host+path, legfeljebb 255 karakter, ütközésnél egyedi utótag.
2. `teachableConcepts(concepts)`: csak `verbatimOk === true`.
3. `webKnowledgeBrief({ topic, classroomHint, sources, concepts })`: `{ topic, classroomHint, sources: [{url,title,text}], concepts: [{id,term,definition,quote,sourceFile,examWeight}] }`.
4. `lessonFromTeachingHtml(html, meta, conceptIds)`: minden `data-teaching-section` fejezet `explain` + `example` (+ opcionális `recap` a summary-ből); `coversConceptIds` a `data-teaching-concepts` tokenjei; `sourceOnly: true`. Ismeretlen ID vagy hiányzó magyarázat/példa hiba.
5. `knowledgeAuthorData(brief)` JSON-string, előtag: a forrás adat, nem utasítás.

Tesztparancs: `npx.cmd tsx --test tests/web-knowledge.test.ts`
Elvárt: a fixture `teachingHtml` a `area` fogalommal érvényes Lesson; hamis idézet kiesik; a bankcsere nem nyúl a tanításhoz.

## Task 4 — Promptok és fetch-eszköz

Fájl: `source/server/studio/web-research-agent.ts`  
Teszt: `source/tests/web-research-agent.test.ts`, `source/tests/lesson-html-spec.test.ts`

1. `webResearchGatherPrompt(classroom, title?, topicSeed?)`: csak keresés + `web_fetch`, teljes szöveg, tilos HTML, tilos `ee_evaluate`.
2. `webLessonAuthorPrompt(classroom, title?, topicSeed?)`: téma + `LESSON_QUALITY_CONTRACT` + `HTML_TEACHING_CONTRACT` + `LESSON_METHOD_CONTRACT` + `HTML_LESSON_DATA_CONTRACT`. Nincs `ee_evaluate`, nincs „KIMENET-TAKARÉKOSSÁG”, nincs saját pontozó JS.
3. `webResearchSystemPrompt` maradjon a gyűjtő prompt (a régi hívók ne kapjanak HTML-dumpot).
4. `WEB_FETCH_TOOL`: `allowed_callers: ["direct"]`, `max_content_tokens: 50000`, `max_uses: 8`.
5. `decideWebResearchGatherResult`: `end_turn` + legalább egy letöltött forrás → ready; fetch nélkül retry/error a meglévő 2-es kerettel; HTML a gyűjtésben nem siker.

Tesztparancs: `npx.cmd tsx --test tests/web-research-agent.test.ts tests/lesson-html-spec.test.ts`
Elvárt: a webes system prompt nem tartalmazza a `LESSON_HTML_SPEC_V74` dumpot; a szerzői prompt tartalmazza a fúziós szerződést; a routes/improve továbbra is a teljes specet fűzi.

## Task 5 — Gyűjtés, kivonat, szerző, bank

Fájl: `source/server/studio/web-research-runner.ts`  
Fájl: `source/server/ai/models.ts`

1. `LEGACY_MODELS` / `TASK_EFFORT`: `webResearch` marad `low`; új `webResearchAuthor` modellje a Studio `author` (`resolveStudioModel("author")` a szerzői és bankhívásban, ne hardcode-olt id).
2. A runner két Anthropic-gyűjtő kört futtat `WEB_SEARCH_TOOL` + `WEB_FETCH_TOOL` eszközzel, `effortFor("webResearch")`. HTML megjelenése a gyűjtésben nem zárja a készítést.
3. A job (`web-research-jobs.ts`) a `generate()` után hívja `workflowPhase("knowledge")` és `workflowPhase("author")`, hogy a `web-result` cacheHits a generate-látogatáson maradjon. A runner **nem** hív `workflowPhase`-t (dupla generate running elhasalna). Kivonat: `createStudioProvider(resolveStudioModel("extract"))` + `provider.chat` + `stripJsonFences` + `JSON.parse`, majd `extractWebConcepts` (`completeExtractionConcepts` + `applyVerbatimChecks`). A `callStepModel` `StudioStep` uniója **nem** tartalmazza az `"extract"`-ot — ezért tilos `callStepModel(..., step: "extract")`. Nulla tanítható fogalom → `WebResearchFailure`. Checkpoint kulcs: `web-extract` / `contract: "web-extract-1"`.
4. Szerzői hívás: Studio author (`resolveWebResearchAuthorModel()` / `resolveStudioModel("author")`), a `knowledgeAuthorData` user-adat, `webLessonAuthorPrompt` + `workflowSkillPrompt()`. Nincs `web_search`. Legfeljebb két HTML-javító kör a tanítási konverzió/kapu előtt. Checkpoint: `web-author-html`.
5. `buildLessonExperience(lesson, mapConcepts, { call: callStepModel author })`, majd `writeHtmlLessonData`. Ezután a meglévő `repairWebLessonBank` és `reviewAndRepairWebTeaching`.
6. A 20 perces kemény időzítő a gyűjtő-, szerzői és bankfázis elején újraindul; a lektor saját timeoutja megmarad.

Tesztparancs: `npx.cmd tsx --test tests/web-research-jobs.test.ts tests/lesson-teaching-quality.test.ts`
Elvárt: a mockolt teljes artefaktum továbbra is publikálható; a fetch nélküli parserüres lista nem megy át a lektoron.

## Task 6 — Job-lépések és workflow-tesztek

Fájl: `source/server/studio/web-research-jobs.ts`  
Fájlok: `source/tests/lesson-workflow.test.ts`, `source/tests/lesson-skill.test.ts`, `source/tests/workflow-db.integration.ts` (csak ha a learning-db kör fut; a unit a generate/knowledge/author sorrendet várja)

1. `runWork`: `generate` → (a `generate()` belsejében knowledge/author, VAGY a job sorban hívja) → `gate` → `publish` → `readback`. A valós runner hívja a knowledge/author fázist; a mockolt generate előtt a job járja be a `generate`, `knowledge`, `author` lépést, hogy a kapu előfeltétele meglegyen.
2. A unit tesztek `generate → gate` ugrását javítsd: knowledge és author beiktatása.

Tesztparancs: `npx.cmd tsx --test tests/web-research-jobs.test.ts tests/lesson-workflow.test.ts tests/lesson-skill.test.ts tests/runtime-knowledge.test.ts`
Elvárt: minden érintett teszt zöld; a webes RUNBOOK tartalmazza a forrásjegyzéket.

## Task 7 — Cursor-szabály, skill, memória, kanban

1. `.cursor/rules/websuli-core.mdc` — `alwaysApply: true`, a WEBSULI lényege, a 7.4 szerződés, a webes tudásbázis-kötelezettség, a három fázis, a Neon/Render/Vercel stack, tilos titok.
2. `.agents/skills/websuli-internet-pipeline/SKILL.md` — mikor aktiválódjon, a webes lánc, a fetch→jegyzék→tanítás→bank sorrend, a kapuk, a mintatananyag-elvárás.
3. `memory/projects/websuli/LEDGER.md` — 2026-09-13 bejegyzés a mért gyökérokról.
4. `memory/indexes/index.yml` — ha új fájl kerül a projects kollekcióba.
5. `docs/kanban.md` állapotjelzés + hermes-kanban `BUG(web-research): tudásbázis nélkül készülő internetes HTML` jegy, `doing`.
6. `memory/projects/websuli/runtime-document-manifest.yaml` — a mai session ténye: a pipeline-javítás kód; élő admin QMD továbbra is 401 nélkül nem exportált.

Teszt: `npx.cmd tsx --test tests/memory-index-guard.test.ts`
Elvárt: az index csak létező fájlokat sorol.

## Task 8 — Típus, lint, célzott verify

Parancs a `source` könyvtárból:

```
npx.cmd tsx --test tests/web-knowledge.test.ts tests/web-research-agent.test.ts tests/lesson-html-spec.test.ts tests/web-research-jobs.test.ts tests/lesson-workflow.test.ts tests/lesson-skill.test.ts tests/runtime-knowledge.test.ts tests/web-lesson-quality-notice.test.ts
npx.cmd tsc --noEmit
```

Elvárt: exit 0.

Ha a fenti zöld: `npm.cmd run check` (repo kapu a package.json szerint).
Elvárt: exit 0.

NOT RUN ebben a szeletben: éles webes gyártás, admin QMD-export, böngészős Egervár-futás.
