# Egyfutásos tananyaggyártás — végrehajtási utasítás (AI-olvasható)

Terv: `docs/specs/2026-10-16-egy-futas.md`. Szeletenként külön ág és PR; minden szelet zöld kapukkal (check, lint, test, build,
háromfázis-kapu) zárul.

## S1 — döntőbíró
- `server/arbiter/arbiter.ts`:
  - `ARBITER_MODEL = "claude-opus-5-5"`, `ARBITER_FALLBACK_MODEL = "gpt-6.1-sol"`.
- `server/arbiter/routes.ts`:
  - a `callModel` előbb az elsődleges modellt hívja, hiba esetén a tartalékot (`callStepModelWithFallback` vagy két egymás utáni `callStepModel`);
  - mindkettő `effort: medium` (az `arbiter` policy).
- `server/ai/studio-provider.ts` `arbiter` policy: effort medium; a Claude-ág a `output_config.effort`-ot kapja.
- Tesztek:
  - az elsődleges hiba → tartalék;
  - mindkét hiba → determinisztikus ítélet (változatlan);
  - a modellnevek rögzítve.

## S2 — beszélgetés-réteg (`server/studio/single-run/conversation.ts`)
- `type Turn = { role: "user" | "assistant"; blocks: Array<{ type: "text"; text: string } | SourceBlock> }`.
- `class LessonConversation`:
  - `constructor(system, opts: { primary: ModelClient; fallback: ModelClient })`;
  - `send(userBlocks): Promise<string>`: hozzáfűzi a felhasználói fordulót, a modell válaszát a beszélgetéshez adja, és visszaadja a szövegét;
  - `transcript()` / `restore(turns)`: mentés és visszatöltés.
- `ModelClient` interfész: `complete(system, turns): Promise<{ text; usage; model }>`.
- **Anthropic-implementáció:**
  - `messages.stream`, `thinking: { type: "adaptive" }`, `output_config: { effort: "medium" }`, `max_tokens` 64000;
  - `cache_control: { type: "ephemeral" }` a rendszerprompton és az utolsó előtti fordulón.
- **OpenAI Responses-implementáció:** `gpt-6.1-sol`, `reasoning: { effort: "medium" }`; a forrásblokkok `input_image` / `input_file` alakra
  konvertálva.
- **Tartalékváltás:**
  - az elsődleges kliens 2 próbája után elérhetetlenségi hibánál (hitelesítés, 429, 5xx, 529, hálózat) a beszélgetés VÉGLEG a tartalékra vált,
    és a teljes átiratot küldi;
  - a váltás `onFallback` eseménnyel naplózódik.
- Egységtesztek hamis kliensekkel: a többfordulós sorrend, a gyorsítótár-jelölés, a váltás teljes átirattal, valamint az átirat mentése és
  visszatöltése.

## S3 — motor és bekötés (`server/studio/single-run/engine.ts`)
- **`runSingleLesson({ jobId, files, instruction, owner, onPhase, store, conversation })`.** A rendszerprompt:
  - a szerep-skillek (`roleSkillBlock` a pedagogue / author / animator / bank / lektor szerepre);
  - a tantárgyi skill;
  - a pontozó szabálya (`OPEN_ANSWER_RULES_HU`);
  - a lecke- és bankszerződés.
- **Állomások** a terv B táblázata szerint. Állomásonként:
  - JSON-kérés;
  - `parse` és a meglévő determinisztikus ellenőrzők;
  - ha van hiba, a hibalista ugyanabban a beszélgetésben megy vissza; legfeljebb 3 javító forduló.
  - **1. állomás:** a térkép a `knowledge_maps` / `km_concepts` táblába kerül. Ugyanaz a tranzakciós beszúrás, mint a `run-extraction.ts:282-300`
    (közös függvénybe kiemelve).
  - **4. állomás:** fejezetenként a `planLessonBank` kvótája; a csomag a `normalizeBankPacket` → `autofixBankPacket` → `experiencePacketSchema` úton megy.
  - **5. állomás:**
    - a lektor-leletek javításként (teljes fejezet- vagy tételcsere) jönnek;
    - a válaszkulcs-próbák a `evaluateOpenAnswer`-en futnak; a bukó próba visszajelzés;
    - legfeljebb 3 kör.
  - **6. állomás:**
    - `experienceProblems`, `verifyLessonSkillBank`, `checkCoverageGate`, `checkLessonArc`;
    - ha zöld, `store.upsertLesson` + `store.publishLesson` + visszaolvasás.
- **Mentés:**
  - minden lezárt állomás után `studio_jobs.output = { singleRun: { phase, transcript, model }, lesson?, outline?, ... }`;
  - a `step` tükrözése: 1 → `pedagogue`, 2 → `pedagogue`, 3 → `author`, 4 → `animator`, 5 → `lektor`, 6 → `gate`, kész → `done`.
- **Folytatás:** a `singleRun.transcript` visszatöltése, majd az utolsó lezárt állomás utáni állomástól.
- **Bekötés** (`lesson-pipeline-routes.ts`):
  - a `runOneStepCore` és a `runOneStepInWorkflow` a fájlokkal a `runSingleLesson`-t hívja (térkép-előállítás + lépésgép helyett);
  - a `/lessons/from-map/:mapId` a térkép forrásszövegével indul;
  - a `remanufactureFromMap`, a `/drafts/:id/continue` és a `/jobs/:id/resume` a `singleRun` jobot folytatja, régi jobnál újragyárt;
  - a `sweepFailedStudioJobs` / `sweepStudioJobs` a `singleRun` jobot folytatja, régi jobot nem hajt.
- **Tesztek:**
  - teljes futás hamis beszélgetéssel (forrás → közzététel), egyetlen kliensen át, más modellhívás nélkül;
  - javító forduló hibás bankcsomagnál;
  - 3 sikertelen kör → megállás a piszkozat megtartásával;
  - folytatás mentett átiratból;
  - tartalékváltás menet közben.

## S4 — kivezetés
- **Törlés:**
  - a régi lépésgép (`step-runner.ts` lépésmodell-hívásai, `bank-call`, `answer-key-writer`, `quiz-blind-check`, `bank-verifier`, `blind-solver`,
    `instruction-check` / `instruction-points`, `source-reference` szövegjavító, `ocr` fúzió);
  - a hozzájuk tartozó modellkonstansok és tesztjeik.
- A `models.ts` csak az Opus 5.5-öt és a GPT-6.1 Solt tartja meg (a nem tananyaggyártó, régi útvonalak modelljeit külön listázni és dönteni).
- Ellenőrzés:
  - `grep` a régi modellnevekre: 0 találat a tananyaggyártásban;
  - teljes tesztkészlet zöld;
  - élő futás.

## S1 — review #258
- **Időkeret:** modellenként 30 s; a kliens 70 s-ig vár (a teljes elsődleges + tartalék lánc).
- **Séma:** a válasz modellenként a döntőbíró sémáján is ellenőrződik (`parseArbiterVerdict`); hibánál a tartalék jön.
- **Napi keret:** a tartalék második fizetett hívása előtt külön atomi napi keretfoglalás; elfogyott keretnél nincs hívás.
- **Gyorsítótár:** `ARBITER_VERSION` arbiter-1 → arbiter-2 (a modellváltás a régi ítéleteket érvényteleníti).

## S2 — review #259
- **Szöveges forrás:** a modell a kinyert szöveget (`extractedText`, pl. docx) kapja, nem a nyers base64 tartalmat.
- **Tartalékválasz:** a `failed` / `cancelled` állapotú tartalékválasz hiba (nem üres forduló).
- **Hibás forduló:** sikertelen forduló után az átirat a hívás előtti hosszra áll vissza; a használat-napló (`onUsage`) hibája nem rontja a sikeres fordulót.
- **Kulcsok:** az üres vagy csak szóközt tartalmazó kulcs hiányzó kulcsnak számít.
## S3 — végrehajtás közbeni pontosítások (dokumentált)
- **Kapcsoló:** `server/studio/single-run/switch.ts` (`STUDIO_SINGLE_RUN=0` = vészfék, alapból egyfutás).
- **Feltöltés és webes út:** a `runOneStepCore` elején `runSingleUpload` (`single-run/live.ts`).
  - A forrás modell nélkül készül elő: docx → szöveg, szöveges PDF → kinyert szöveg; a kép és a szkennelt PDF natív blokkként megy.
  - A térkép jóváhagyottként kerül mentésre, a szó szerint igazolt fogalmak „kept” állapotban; a bemeneti lenyomat gyártásonként egyedi.
- **Újragyártás, folytatás, kifejezett resume** (régi és új jobra egyaránt):
  - új egyfutásos gyártás a térkép mentett forrásátiratából (`remakeAsSingleRun` → `startOneStepRun`);
  - a régi job atomikusan „újragyártott” lesz; futó vagy kész jobot nem fog el.
  - A beszélgetés közepéről való folytatás (mentett átiratból) külön szelet: az S3 után következik.
- **Automatikus továbbvitel:** egyfutásos módban a hibás jobok automatikus, fizetős vezérlője (`sweepFailedStudioJobs`) nem fut.
  Az árvajob-söprés a régi lépésgép jobját nem folytatja, hanem lezárja; a piszkozat megmarad, a döntés a felhasználóé.
- **Hibakezelés:** a motor bármely állomásának megállásakor a job `error` állapotba kerül a pontos okkal, és a mentett beszélgetés (piszkozat)
  megmarad.

## S3 — élő próba (2026-10-16, eldobható helyi Postgres, valódi Opus 5.5)
- **Forrás:** rövid szöveges forrás („A víz körforgása”).
- **Eredmény:** **közzétett lecke**, 3 fejezet, 59 feladat, 98 kvízkérdés, `html_files` sor; idő: 705 s.
- **8 forduló, egyetlen beszélgetésben.** Javító forduló és sikertelen bankkísérlet nem kellett; a lektor első köre blokkoló nélkül zárt.
- **Token:**
  - bemenet 578 473, ebből **403 669 gyorsítótárból** (70%), friss bemenet 174 804;
  - kimenet 85 371.
- Más modell nem hívódott.

## S3 — review #260
- **Job-tulajdonos:** a `store.createJob` után `workflowResource(jobId)` (mint a régi útvonalon), így a hibás egyfutásos job
  a futás gazdájához kötött piszkozat marad (`manageableBy`), és a lízing a jobhoz kapcsolódik.
- **Utolsó kör utáni lektorálás:** ha az utolsó javító körben a bank megváltozott (kivétel vagy újraépítés), egy további,
  csak ellenőrző lektori kör fut; abban bármely blokkoló → megállás (`lektorálás`), publikálás nincs. Tanítási hiba az utolsó
  javító körben továbbra is megállás.
- **Önellentmondó lektori jelentés:** a `match: false` megoldáseltérés blokkoló jegyzet nélkül alaki hiba — a jelentés a
  beszélgetésben visszamegy (javító forduló), a lektornak jegyzettel kell jeleznie vagy a megoldást helyesbítenie.

## S3 — review #260, 2. kör (Copilot)
- **Jogosultság:** a `remakeAsSingleRun` atomi foglalása a `manageableBy(owner)` és a `notBeingDriven` feltétellel fut (másik admin
  jobja és élő lízing alatti job nem foglalható).
- **Piszkozat:** a bankcsomag-checkpoint mentése a közös `output`-ot is frissíti (a hibaág nem írja vissza a régit).
- **Nyitott aritmetikai leletek + választásos kapu:** az `onOpenFinding` leleteit a motor gyűjti (`output.bankOpenFindings`); a végkapu
  előtt MINDIG fut a `resolveChoiceGate(lesson, openBankFindingFlags(...))` a teljes leckén (tanítási check-blokkok is); hibánál megállás.
- **Vegyes lektori jelentés:** a bankleleteket a lektorált leckén oldjuk fel (`resolveBankReview`), és tanításjavításnál ezt adjuk át
  a bank-újraépítésnek; a régi indexeket nem alkalmazzuk az új bankra.
- **Vázlat-keret:** `autofixOutline(json, concepts, lessonLengthBudget(promptMap).maxSections)`.
- **Bankhívás:** a csonkolt / üres / nem JSON válasz `RetryableBankCallError` (a banképítő javító köre kezeli); szolgáltatói hiba változatlan.
- **Tanításon mérhető kapuk korábban:** a fedettségi kapu és a tananyagív a 3. állomás validátorában is fut (javító forduló jár rá).
- **Többfájlos forrás:** 2+ fájlnál az 1. állomás fájlonkénti átiratot (`fileTranscripts`) és fogalmonként `sourceFile`-t ad; az idézet a
  saját fájl átiratán mérődik, a mentés a valódi fájlt és a fájlonkénti átiratot tárolja. Egy fájlnál a mostani alak érvényes.
- **Belépési pontok és kliens:** a `/lessons/from-map/:mapId` egyfutásos módban a térkép mentett forrásából egyfutásos gyártást indít
  (`202 { runId }`); a kliensek (`LessonStudioPanel`, `SourceUploadForm`, `JobMonitor`) a visszaadott `runId`-t követik
  (a futás `jobId`-ja, amint megvan).

## S4a — élő útvonalak átállítása (terv: `2026-10-16-egy-futas.md`, „S4 — részletes terv”)
Ág: `feat/egy-futas-s4a-utvonalak` (a `main`-ből, az S3 merge után).

### Vázlat jóváhagyása
- **Szerver:** `POST /jobs/:id/approve-outline` egyfutásos módban `remakeAsSingleRun(jobId, owner)` → `202 { jobId, runId, remanufactured: true }`.
  - A tulajdonos- és lízingfeltétel a foglalásban már benne van.
  - A régi ág csak `STUDIO_SINGLE_RUN=0` mellett fut.
- **Kliens:** az `OutlineReview` `onFollowRun?(runId)` propot kap.
  - Ha a válasz `runId`-t ad, azt hívja, és a toast szövege: „A terv alapján új gyártás indult”.
  - A `LessonStudioPanel` a `JobMonitor`-ral azonos módon követi.

### Fogalomjavítás — `server/studio/single-run/concept-fix.ts`
- `fixConceptSingleRun(lessonId, conceptId, actorId, deps?)` → `FixConceptResult` (ugyanaz a szerződés).
- **Adatbetöltés:** ugyanaz, mint a `fixConceptOnLesson`-ban.
- **Beszélgetés:** `createLessonConversation(singleRunSystemPrompt())`.
  1. **Szerzői javítás:** a szerzői forduló a `buildConceptFixPrompt` szövegével megy, `station` mintára.
     - Validátor: `lessonSchema` + `checkConceptFixResult`.
     - Javító fordulóból legfeljebb `SINGLE_RUN_FIX_ROUNDS`.
  2. **Bank:** `buildLessonExperience` a beszélgetésbe kötött `call`-lal; a `RetryableBankCallError` szabály ugyanaz, mint a motorban.
  3. **Lektor:** `buildLektorPrompt` + `parseLektorResponse`; blokkolónál `{ ok: false }`, mentés nélkül.
  4. **Mentés:** `assertRepairCandidate` → `improvedHtmlFiles` → `applyStructuredImprovement`.
- **Megosztott kód:** a `station` és a bankhívó kötés a motorból exportálva (`runStation`, `conversationBankCall`), hogy ne legyen
  másolat.
- **Bekötés:** a route (`/lessons/:id/fix-concept`) egyfutásos módban ezt hívja.

### Leckejavítás
- A `generateStructuredImprovement` `call(step, system, user)`-ja egyfutásos módban egyetlen `LessonConversation`-be kötve (minden szerep).
  - A forduló szövege: `${step.toUpperCase()} — ${system}\n\n${user}`.
  - JSON: `parseModelJson`.
  - A bank `responseFormat` nélkül (a beszélgetés JSON-t kér).
- A régi lánc csak `STUDIO_SINGLE_RUN=0` mellett.

### Különálló tudástár-kinyerés
- **`single-run/live.ts`:** `extractMapSingleRun({ files, title, ownerId })`.
  - Lépések: `prepareFiles` → beszélgetés → `readSourceStation` (a motor 1. állomása, exportálva) → `saveSingleRunMap(..., { status: "draft" })`.
  - A `saveSingleRunMap` opciója: draft térkép, a fogalmak alapértelmezett (jóváhagyásra váró) állapotban, `approvedBy` nélkül.
  - Idempotencia: a lenyomat `sha256(single-run-map-1 + fájlnév/fajta/tartalom)`; ha van ilyen térkép, azt adja vissza.
- **Route** (`/maps/extract`): egyfutásos módban ezt hívja a `map` workflow-ban. A besorolás a modell `subject` / `classroom` mezőjéből jön;
  a 422-es ág megszűnik, mert a station validál.

### Régi AI-funkciók és katalógus
- **`models.ts` `LEGACY_MODELS`:** minden `claude-opus-5` → `claude-opus-5-5`. A `crossFamilyFallback` tartaléka így is GPT-6.1 Sol.
  - A `MAX_OUTPUT_BY_MODEL`-ben ellenőrizni kell az opus-5-5 keretét.
- **`catalog/classify.ts`:** `CLASSIFIER_MODELS = ["gpt-6.1-sol", "claude-opus-5-5"]`; a teszt elvárása a spec-változás szerint frissül.

### Tesztek
- concept-fix: siker hamis beszélgetéssel; túllépő javítás → javító forduló; lektor-blokkoló → nincs mentés.
- Leckejavítás: a `call` egy beszélgetésen megy át (fordulók száma > 1, egy kliens).
- A térkép-kinyerés: draft állapot, idempotens lenyomat (DB-teszt).
- approve-outline: e2e mock — a felület a futást követi.
- `grep`: a `LEGACY_MODELS`-ben nincs `claude-opus-5"`.

## S4a — review #261
- **Jóváhagyott terv (régi job):** az `approve-outline` a beküldött (átrendezett) vázlatot a tanári kérés részeként adja tovább az
  újragyártásnak (`remakeAsSingleRun(jobId, owner, { outline })`): a fejezetsorrend és a fogalmak kiosztása kötelező a terv-állomáson.
- **Fogalomjavítás:** a lektori jelentés önellentmondása (`match: false` blokkoló jegyzet nélkül) alaki hiba → javító forduló (mint a
  motorban). A tanítás kapui (`assertRepairTeaching`: fedettség, megalapozottság, ív) már a szerzői állomás validátorában futnak.
- **Forráshű idézet:** ahol a valódi forrásszöveg elérhető (szöveges fájl, kinyert PDF/DOCX), az 1. állomás az idézetet ezen méri, és
  ezt menti átiratként; a modell átirata csak képnél / szkennelt PDF-nél számít.
- **Lenyomat:** a különálló kinyerés lenyomata a fájlok egyértelmű (JSON) kódolásából készül (nincs fájlhatár-ütközés).
- **Runbook:** a beszélgetéses kérések a futás szerepre szűrt runbookját (`workflowSkillPrompt(szerep)`) a kérés végén kapják
  (állomásonként; a rendszerprompt — és így a gyorsítótár — változatlan).
- **Leckejavítás:** a nem bank jellegű válasz csonkolása / JSON-hibája javító fordulót kap ugyanabban a beszélgetésben
  (legfeljebb `SINGLE_RUN_FIX_ROUNDS`).
