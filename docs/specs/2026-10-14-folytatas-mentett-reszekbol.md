# Elakadt gyártás folytatása a mentett részekből (2026-10-14)

Végrehajtás: `docs/specs/2026-10-14-folytatas-mentett-reszekbol-vegrehajtas.md`.

## Kérés és döntés
Tulajdonos (2026-10-14, élő hiba): az egylépéses gyártás a 7. lépésen („Ábrák és gyakorlóbankok”) megállt —
`[OpenAI] 500 The server had an error processing your request` (job 416ad01d, run be5ac4d5, 154,9 s után). Kérés: ha a
gyártás idáig eljut és hibával kilép, ne kelljen elölről kezdeni; az addig elkészült részek maradjanak meg, és
újrafuttatáskor ezeket olvassa be. Tulajdonosi választás (mindhárom): **folytatható hiba**, **Újra gomb**, **auto-újrapróba 5xx-re**.

## Tények (forrásból és az élő DB-ből, csak olvasás)
- A részeredmények MÁR mentődnek:
  - a szerző kész leckéje a jobban (`studio_jobs.output.lesson`);
  - a kész bankcsomagok csomagonként, a tanítás-hash kulcsán (`output.experienceCheckpoint`, `experience-builder.ts:553-555`;
    folytatáskor a változatlan tanítású csomag modellhívás nélkül visszatöltődik, `experience-builder.ts:425-428`);
  - minden modellhívás a futás naplójában (`workflowCheckpoint`, `workflows/engine.ts:217`), a folytatás ugyanazt a naplót
    használja (`driveTracked` → `workflowStore.related`, `lesson-pipeline-routes.ts:868`).
- **Hiány 1 — a folytatás elutasítja ezt a hibát.** A `POST /api/studio/jobs/:id/resume` az ábra/bank lépésnél a
  `retryFailedBankBuild`-et hívja, amely csak a „bankcsomag a javító kör után sem megfelelő” és a „"author" lépés
  modellhívása” hibát engedi (`step-runner.ts:299-304`). Az `"animator" lépés modellhívása hibára futott` (szolgáltatói hiba)
  → „Csak naplóval igazolt … bankgyártási hiba folytatható.”
- **Hiány 2 — nincs gomb.** Az egylépéses képernyő hiba esetén csak „Forrásellenőrzés megnyitása” / „Bezárás” gombot ad
  (`SourceUploadForm.tsx:360-374`); az „Újra” gomb csak a Studio jobfigyelőben van (`JobMonitor.tsx:134`).
- **Hiány 3 — egy 5xx azonnal megállítja a futást.** A `callBankPacketModel` csak a modellkimeneti hibát és az időtúllépést
  teszi következő kísérletté; minden más szolgáltatói hiba (5xx is) leállítja a futást (`bank-call.ts:28-44`). A streamelt
  lépések SDK-szintű újrapróbája ki van kapcsolva (`studio-provider.ts`: `maxRetries: 0`).
- Gyakoriság: az utolsó 30 nap 44 hibás jobjából 1 volt OpenAI 5xx.

## Cél
- **C1** A `retryFailedBankBuild` az ábra/bank lépés modellhívás-hibáját (`A(z) "animator" lépés modellhívása hibára futott:`)
  is folytathatónak fogadja el — ugyanazokkal az őrökkel: naplóval igazolt hibás `animator` látogatás, mentett lecke,
  nem publikált. A folytatás a mentett leckéből, a kész bankcsomagokból és a modellhívás-naplóból dolgozik.
- **C2** A bankcsomag-hívás szolgáltatói **5xx** hibája bukott kísérlet (`RetryableBankCallError`) → a következő kísérlet
  fut (a csomag-ciklus: elsődleges → elsődleges → tartalék más családból → mentőkör). A 429, a kimerült keret, a
  hitelesítési hiba és a státusz nélküli hiba viselkedése VÁLTOZATLAN (futás leáll, folytatható).
- **C3** Az egylépéses képernyő hibás állapotában, ha van `jobId`, „Folytatás a mentett részekből” gomb: a meglévő
  `POST /api/studio/jobs/:jobId/resume` végpontot hívja, sikerre újraindítja az állapotkövetést, elutasításra a szerver
  üzenetét mutatja.

- **C4** (tulajdonosi pontosítás: „tényleg legyen draft állapot”) A megállt futás állapotválasza (`GET
  /api/studio/lessons/one-step/:runId`) a mentett, nem publikált tananyag piszkozatát is jelzi: `draft: { teachingSections,
  savedBankPackets }` (csak darabszám). A képernyő ezt kiírja („Mentett piszkozat: N fejezetnyi tananyag, M kész
  gyakorlócsomag”), és a folytatás innen halad. A piszkozat tárolása a meglévő: nem publikált `lessons` sor + job-output
  (`lesson`, `experienceCheckpoint`) + workflow-napló (`lesson_workflow_runs.checkpoints`).
- **C5** A megszakadt éles futás (job 416ad01d / run be5ac4d5) a telepítés után a felületről folytatható. Ellenőrizve (csak
  olvasás): nem publikált piszkozat-lecke (12 fejezet), utolsó látogatás `animator`/`error`, a hibaszöveg egyezik, 1/4
  folytatás elhasználva; kész bankcsomag 0 (az 500 előtt egy sem fejeződött be), napló-bejegyzés 17.

## Nem cél
- Új mentési réteg vagy adatmodell (a meglévő job-output + workflow-napló a mentés).
- A szerző/lektor/terv lépés folytatási szabályai; az SDK-szintű újrapróba bekapcsolása; a 429 automatikus újrapróbája.
- Az éles 416ad01d job folytatása kóddal (a tulajdonos indítja a felületről a telepítés után).

## Edge case-ek
- Publikált lecke (`htmlFileId`) vagy mentett lecke nélküli job → továbbra is elutasítva.
- A folytatási keret (`executions` ≥ 4) elfogyott → a szerver 409-et ad, a gomb a hibaüzenetet mutatja.
- A gomb dupla kattintása → egy kérés (a gomb a kérés alatt tiltott).
- Az 5xx a tartalék vagy a mentő modellen → az is csak bukott kísérlet; ha minden kísérlet elfogy, a csomag a meglévő
  „javító kör után sem megfelelő” hibával áll le — ez folytatható (változatlan).
- Az 5xx felismerése: a hiba `status` mezője vagy az `AIProviderError.originalError.status` 500–599.

## Érintett fájlok
`server/studio/step-runner.ts`, `server/studio/bank-call.ts`, `server/studio/lesson-pipeline-routes.ts`,
`client/src/components/studio/SourceUploadForm.tsx`;
tesztek: `tests/lesson-pipeline-runner.test.ts` (új tesztek), `tests/studio-generation-recovery.spec.ts` (új böngészős teszt).

## Elfogadás (EARS)
- **E1** WHEN az ábra/bank lépés szolgáltatói hibával állt le mentett, nem publikált leckével, THE folytatás SHALL a jobot
  `animator`/`pending` állapotba tenni a mentett output (lecke, `experienceCheckpoint`) megtartásával.
- **E2** WHEN egy bankcsomag-hívás 5xx-et kap, THE rendszer SHALL a következő kísérletet futtatni, és a futás SHALL NOT
  megállni, ha egy későbbi kísérlet sikeres.
- **E3** WHEN a hiba 429 vagy státusz nélküli szolgáltatói hiba, THE viselkedés SHALL változatlan maradni (a meglévő
  „bank provider failure preserves its cause” teszt zöld, módosítás nélkül).
- **E4** WHEN az egylépéses futás hibás és van `jobId`, THE képernyő SHALL „Folytatás a mentett részekből” gombot mutatni,
  amely a resume végpontot hívja; 360 / 844 / 1280 px szélességen vízszintes túlcsordulás és levágott felirat nélkül.
- **E6** WHEN a futás `error` fázisú és a job mentett, nem publikált tananyagot tart, THE állapotválasz SHALL `draft`
  darabszámokat adni, a képernyő SHALL kiírni; publikált vagy tananyag nélküli jobnál SHALL NOT.
- **E5** `check`, `check:test`, `lint`, `test`, `build` zöld; a böngészős teszt zöld.
