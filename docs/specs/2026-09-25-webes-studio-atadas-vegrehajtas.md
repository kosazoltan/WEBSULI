# Végrehajtás: Internetes tananyag a feltöltős Studio-gyártással (2. szelet)

> Spec: `docs/specs/2026-09-25-webes-studio-atadas.md`. Munkakönyvtár: `source/`. Sorrend kötelező.

## T1 — `outsideWorkflow`

Fájl: `server/workflows/engine.ts`. `export function outsideWorkflow<T>(work: () => T): T { return context.exit(work); }`.

## T2 — Egylépéses futás indítása és olvasása exportként

Fájl: `server/studio/lesson-pipeline-routes.ts`.
1. `export function startOneStepRun(data: OneStepRequest, userId: string): string`: `createRun()`, majd `void runOneStep(...).catch(...)`. Ugyanaz a hibakezelés, mint a POST-útvonalé.
2. `export async function oneStepRunView(runId)`: a GET-útvonal válaszobjektuma (`phase`, `detail`, `error`, `mapId`, `jobId`, `lessonId`, `htmlFileId`), vagy `null`.
3. A POST és a GET útvonal ezeket hívja.

## T3 — Forrásgyűjtés kiemelése

Fájl: `server/studio/web-research-runner.ts`.
1. `export async function gatherWebSources(input, { signal, onEvent, onCandidate }): Promise<{ sources: WebSource[]; downloaded: FetchedTeachingSource[] }>`.
   - A mostani gyűjtőciklus saját `AbortController`-rel és időzítőkkel (20 perc keret, 120 s tétlenség).
   - Hibaleképezés: `WebResearchFailure`; időtúllépés → „Időtúllépés…”; megszakítás → „A kérés megszakadt.”; egyéb → „AI hiba…”.
2. `generateWebResearchLesson` első lépése `gatherWebSources`. A további fázisok saját vezérlővel és időzítővel futnak, a viselkedés változatlan.

## T4 — Átadás és követés

Fájl: `server/studio/web-studio-handoff.ts` (új).
1. `webSourcesToOneStepFiles(downloaded)` → a spec 4.1–4.2 szerinti fájlok (`MAX_SOURCE_CHARS = 60_000`, `MAX_TOTAL_CHARS = 200_000`).
2. `generateWebStudioLesson(input, observer, deps)`.
   - `deps`: `gather`, `start(data, userId)`, `read(runId)`, `userId`, `sleep`, `pollMs`, `maxWaitMs`.
   - Lépések: gyűjtés; fájlok; `observer.studioRunId` követése, ha az nem hibás vagy parkolt, különben `start`.
   - Futás közben `observer.onStudioRun(runId)` és státuszok.
   - Visszatérés: `StudioResearchArtifact { kind: "studio", runId, lessonId, htmlFileId, sources }`.
Teszt: `tests/web-studio-handoff.test.ts`.

## T5 — Job-futtató

Fájl: `server/studio/web-research-jobs.ts`.
1. `ResearchArtifact | StudioResearchArtifact` unió.
2. `ResearchObserver` bővítése (a runnerben): `studioRunId?`, `onStudioRun?`.
3. `StoredResearchJob`: `studioRunId?`, `lessonId?`, `output?`.
4. `runWork`: Studio-eredménynél nincs `checkedResearchArtifact` és nincs `store.publish`. A job `done`, `materialId = htmlFileId`. Visszaolvasás: `store.verifyStudioLesson`.
5. `read()` folytatás-ellenőrzése: a mentett Studio-eredmény mindig folytatható. `hasSavedResearchTurn` vagy `studioRunId` esetén is folytatható.

Fájl: `server/studio/web-research-job-store.ts` — `verifyStudioLesson(htmlFileId, lessonId)`: `lessons ⨝ html_files`, `publishedAt IS NOT NULL`.
Fájl: `shared/web-research-job.ts` — `output?`.
Teszt: `tests/web-research-jobs.test.ts` új esetei.

## T6 — Útvonal és kliens

1. `server/studio/web-research-routes.ts`: `WEB_RESEARCH_PIPELINE === "html"` → a régi gyártó, különben a Studio-átadás a `startOneStepRun`/`oneStepRunView`/`gatherWebSources` függőségekkel.
2. `WebResearchAgentPanel.tsx`: `done` + `materialId` + nincs `html` → `savedId` beállítva, nincs hibajelzés és nincs iframe.
Teszt: Playwright `web-research-completion.spec.ts` új eset.

## T7 — Kapu és dokumentáció

1. `npm run check && npm run check:test && npm run lint && npm test && npm run build` → mind 0; Playwright webes spec zöld.
2. `docs/lesson-improvement.md`: az „Önálló HTML / internetes készítés” pont frissítése.
3. LEDGER bejegyzés.
4. Commit, push, draft PR.
