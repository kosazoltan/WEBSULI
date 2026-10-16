# Végrehajtási utasítás — kapu részleges javítás, kapuhiba-folytatás, gyártáskövetés

Terv: `docs/specs/2026-10-15-kapu-reszleges-javitas-folytatas.md`. Ág: `fix/kapu-reszleges-javitas-folytatas`. Minden parancs a `source/` mappából.

## T1 — részleges mód a kapujavításban

Fájl: `server/studio/gate-item-repair.ts`, `repairFlaggedBankItems`.

1. Az argumentum kap egy `partial?: boolean` mezőt; a visszatérési típus `{ lesson; repaired: string[]; unrepaired: string[]; batches: number } | null`.
2. `partial` nélkül a viselkedés bájtra azonos (minden bukás → `null`); az `unrepaired` ilyenkor `[]`.
3. `partial: true`:
   - a ciklus előtt `initial = new Set(bankProblems(args.lesson))`;
   - adagonként `before = lesson`, `batchRepaired: string[] = []`; ha `repairOneTarget` `null`, a cél `path`-ja az `unrepaired`-be kerül, a ciklus folytatódik;
   - adag utáni ellenőrzés: `fresh = bankProblems(lesson).filter(p => !batchBaseline.has(p) || batchRepairedRefs.some(r => mentionsItem(p, r, itemOf(lesson, r)?.id)))`;
     ha `fresh.length` → `lesson = before`, az adag javított útvonalai átkerülnek a `repaired`-ből az `unrepaired`-be, naplózva;
   - a végén: ha `repaired.length === 0` → napló + `null`;
   - végső ellenőrzés: `bankProblems(lesson).filter(p => !initial.has(p) || repairedRefs.some(r => mentionsItem(p, r, itemOf(lesson, r)?.id)))` nem üres → napló + `null`.
4. A `repairOneTarget` a sikeres célt maga teszi a `repaired`-be — a részleges ágban ezt adagonként kell nyilvántartani (a `repaired.length` az adag előtt).

Teszt (új esetek, `tests/gate-item-repair.test.ts`, a meglévő esetek változatlanok):
- „partial: 2 cél, az egyik javíthatatlan → a másik javítva, `unrepaired` a javíthatatlan” (a `review #192/8` törött fixtúrával).
- „partial: minden cél javíthatatlan → null”.
- „partial nélkül ugyanaz a bemenet → null” (a régi szerződés).

## T2 — a kapu a részleges módot használja

Fájl: `server/studio/step-runner.ts`.

1. `repairGateItems` a `repairFlaggedBankItems` hívásnak `partial: true`-t ad.
2. A `runGate` ága változatlan logikával (`remaining = gateFlags − repaired`, `resolveChoiceGate(repaired.lesson, remaining)`); a `qualityNotes` jegyzet szövegébe
   kerüljön be: `; javíthatatlan, a kapu kivette: ${repaired.unrepaired.join(", ")}` (ha nem üres). A napló sor is említse.

## T3 — folytathatóság közös szabálya és a kapu-folytatás

Fájl: `server/studio/step-runner.ts`.

1. Új export `GATE_RESUMABLE_ERRORS = [/^Hibás banktétel maradt a limiten/, /^Egyválasztós hiba maradt a bankban/]`.
2. Új export `resumeKindOf(input: { step: string; status: string; error: string | null; hasLesson: boolean; htmlFileId: unknown; published: boolean;
   visit?: { step: string; state: string; error?: string } }): "bank" | "lektor" | "gate" | null`:
   - közös: `step === "error"`, `status === "error"`, `hasLesson`, `!htmlFileId`, `!published`, különben `null`;
   - `"bank"`: a `retryFailedBankBuild` meglévő feltételei (animator látogatás, egyező redaktált hiba, a három hibaminta);
   - `"lektor"`: a `retryTimedOutLektor` feltétele (lektor-modellhívás + timeout), látogatás nem `animator`;
   - `"gate"`: `visit.step === "gate"`, `visit.state === "error"`, `visit.error === redactWorkflowError(new Error(error))`, és valamelyik `GATE_RESUMABLE_ERRORS`.
3. Új export `retryFailedGate(jobId, visit, deps = {})`: betölti a jobot; ha `job.step !== "error"` → return; ha `resumeKindOf(...) !== "gate"` → `throw new Error("Csak naplóval igazolt, mentett és még nem publikált kapuhiba folytatható.")`;
   `gateRecoveryAttempt` ellenőrzés a `bankRecoveryAttempt` mintájára; `store.saveStep(jobId, { step: "gate", status: "pending", error: null, finishedAt: null,
   output: { ...job.output, previousGateError: job.error, gateRecoveryAttempt: n + 1 } })`.
   (A közzétett állapot itt a `published` nélkül: `htmlFileId` a jobban; a route ellenőrzi a `lessons.publishedAt`-ot, mint eddig.)

Fájl: `server/studio/lesson-pipeline-routes.ts`, `POST /jobs/:id/resume`:
4. A `beforeDrive` ág: `visit?.step === "gate"` → a publikáltság-ellenőrzés (mint a bank-ágon) után `retryFailedGate(id, visit)`; `animator` → a meglévő bank-ág; egyéb → `retryTimedOutLektor` (változatlan).

Teszt: új `tests/gate-resume.test.ts`:
- `resumeKindOf` mátrix: kapuhiba → "gate"; publikált / htmlFileId / eltérő hiba / nem kapu-látogatás → null; bank- és lektor-esetek a meglévő szerint.

Teszt: `tests/lesson-pipeline-runner.test.ts` (a `makeDeps` memória-store e fájlban él; a bank-folytatás tesztje mellé):
- `retryFailedGate`: a job `gate`/`pending`, `gateRecoveryAttempt: 1`, `previousGateError` = régi hiba; másodszor 2; érvénytelen látogatás / publikált / más hiba / hibás sorszám → elutasítás.

## T4 — futásnézet: `resumable` és `stoppedAt`

Fájl: `server/studio/lesson-pipeline-routes.ts`, `oneStepRunView`.
1. `phase === "error"` és `jobId` esetén a job sorából (`step, status, error, output, lessonId, publishedAt`) és a workflow pillanatképéből
   (`SELECT snapshot->'visits' FROM lesson_workflow_runs WHERE id = runId`) számol:
   - `resumable = resumeKindOf({...}) !== null`;
   - `stoppedAt` = az utolsó `state === "error"` látogatás `step`-je (ha van).
2. A `OneStepRunView` típus: `resumable?: boolean; stoppedAt?: string`. Csak hibánál kerülnek a válaszba.

Fájl: `shared/studio-ui.ts`:
3. `OneStepRunView` kap `stoppedAt?: string`. A `LESSON_CREATION_STAGES` mellé `STAGE_OF_STEP` leképezés (D5). `lessonCreationStages`: ha `phase` error/parked és
   `stoppedAt` leképezhető → az előtte lévő szakaszok `done`, a megállás szakasza `error`, utána `pending`. Típus: `"done" | "active" | "pending" | "error"`.

Teszt (`tests/studio-one-step-progress.test.ts`, új eset; a régi „mind pending” eset `stoppedAt` nélkül változatlan):
- `{ phase: "error", stoppedAt: "gate" }` → `["done","done","error"]`; `stoppedAt: "animator"` → `["done","error","pending"]`; ismeretlen → mind pending.

## T5 — folytatás közbeni fázisfrissítés

Fájl: `server/studio/lesson-pipeline-routes.ts`.
1. `guardedDrive(jobId, onStep?)` → `() => drive(jobId, onStep)`.
2. `driveTracked`: ha `tracksProgress(mode)`, `guardedDrive(jobId, (step, round) => { if (["pedagogue","author","animator","lektor","gate"].includes(step)) { void getRun(id); updateRun(id, { phase: step as OneStepPhase, detail: round > 0 ? \`${round + 1}. kör\` : "Folytatás a mentett részeredményekből." }); } })`.

## T6 — felület

Fájl: `client/src/components/studio/CreationProgress.tsx`: az `error` állapotú szakasz piros keret + `TriangleAlert` ikon, `aria-label="Megállt"`.
Fájl: `client/src/components/studio/SourceUploadForm.tsx`:
1. A run-típus kap `resumable?: boolean; stoppedAt?: string`.
2. A Folytatás gomb feltétele: `phase === "error" && jobId && resumable`. A piszkozat-szöveg „A folytatás innen halad tovább…” mondata csak `resumable` esetén;
   különben: „Ez a megállás a mentett részekből nem folytatható; a forrásellenőrzésből új készítés indítható.”
3. `resume.onSuccess`: `await queryClient.invalidateQueries({ queryKey: ["/api/studio/workflows", runId] })` a `run.refetch()` mellett.

## T7 — ellenőrzés

```
npx.cmd tsx --test tests/gate-item-repair.test.ts tests/gate-resume.test.ts tests/studio-one-step-progress.test.ts tests/lesson-pipeline-runner.test.ts
npm.cmd run check
npm.cmd run lint
```
Elvárt: minden teszt zöld, typecheck és lint hibátlan. Utána: teljes tesztsor (PR-kész állapot), commit, PR, CI, merge, deploy, élő E5 a `416ad01d` jobon a belső böngészőből, és a
gomb-feltétel böngészős ellenőrzése.
