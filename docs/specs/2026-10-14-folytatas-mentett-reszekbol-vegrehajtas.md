# Végrehajtás: elakadt gyártás folytatása a mentett részekből (2026-10-14)

Spec: `docs/specs/2026-10-14-folytatas-mentett-reszekbol.md`. Parancsok a `source/` mappából. Sorrend: RED teszt → kód → zöld.

## V1 — folytatható ábra/bank modellhívás-hiba (C1, E1)
- Fájl: `server/studio/step-runner.ts`, `retryFailedBankBuild` feltétele.
- Változás: az elfogadott hibaszövegek közé: `job.error?.startsWith('A(z) "animator" lépés modellhívása hibára futott:')`.
  A többi őr (látogatás-egyezés, mentett lecke, `htmlFileId` hiánya, sorszám-ellenőrzés) változatlan.
- Teszt (`tests/lesson-pipeline-runner.test.ts`, új): a mentett, nem publikált, `"animator"` szolgáltatói hibájú job
  folytatása → `step: animator`, `status: pending`, az output (lecke, `experienceCheckpoint`) megmarad, modellhívás nincs.
  Publikált változat → elutasítva.

## V2 — 5xx = bukott bankkísérlet (C2, E2, E3)
- Fájl: `server/studio/bank-call.ts`, `callBankPacketModel`.
- Változás: segédfüggvény `isServerError(cause)` — `status` vagy `originalError.status` 500–599. Ilyen ok esetén
  `RetryableBankCallError` („(szolgáltatói 5xx)” jelöléssel), mint az időtúllépésnél. Minden más ág változatlan.
- Teszt (új): az első bankhívás `AIProviderError` + `originalError.status = 500`, a második érvényes csomag → a lépés
  sikeres, 2 hívás. A meglévő „bank provider failure preserves its cause” teszt módosítás nélkül zöld.

## V3 — „Folytatás a mentett részekből” gomb (C3, E4)
- Fájl: `client/src/components/studio/SourceUploadForm.tsx`.
- Változás: a válasz típusa `jobId`-t is olvas (a szerver már küldi: `lesson-pipeline-routes.ts:318`). `phase === "error"`
  és `jobId` esetén gomb (`data-testid="one-step-resume"`, `min-h-11`): `POST /api/studio/jobs/:jobId/resume`, a kérés
  alatt tiltva; siker → `run.refetch()` (az állapotkövetés a nem terminális fázissal újraindul); hiba → destruktív toast a
  szerver üzenetével.
- Teszt (`tests/studio-generation-recovery.spec.ts`, új): hibás futás `jobId`-vel → a gomb látszik, kattintásra pontosan
  egy POST megy a resume végpontra, utána a haladás „Tananyag készül…”; 360/844/1280 px: nincs vízszintes túlcsordulás,
  a gomb felirata nem vágódik.

## V3b — piszkozat kijelzése (C4, E6)
- Fájl: `server/studio/lesson-pipeline-routes.ts` — `draftSummaryOf(output)` (tiszta függvény) és az `oneStepRunView`
  `error` fázisban a job outputjából `draft`-ot ad. `SourceUploadForm.tsx`: `data-testid="one-step-draft"` sor.
- Tesztek: `draftSummaryOf` egységteszt (mentett / csomagok / publikált / tananyag nélküli); a böngészős teszt a sort
  ellenőrzi, és hogy folytatás után eltűnik.
- A gomb: a dupla kattintás elleni szinkron zár (`useRef`) — az e2e mérte, hogy az `isPending` egymagában
  két POST-ot engedett.

## V4 — kapuk
- `npm.cmd run check`, `check:test`, `lint`, `test`, `build`; a böngészős teszt egy ideiglenes, a `studio-flow` mintájára
  készült vite-konfiggal (127.0.0.1, külön port).
