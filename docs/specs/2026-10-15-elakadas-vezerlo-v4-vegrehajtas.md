# Végrehajtási utasítás — Elakadás-vezérlő V4: szerzői javítás és teljes újragyártás, automatikusan

Terv: `docs/specs/2026-10-15-elakadas-vezerlo.md` (V4; tulajdonosi döntés 2026-10-15: „Mindkettő, automatikusan”). Ág: `feat/elakadas-vezerlo-v4`.

## Kódból ellenőrzött kiinduló tények
- A kapu a körlimiten már ma is indít célzott szerzői javítást: `runGate` → `targetedRepairSections(lesson, [], gateOutput)` →
  `spendRepair(output, "targetedGate", round + 1)` + `output.gate` → `{ step: "author", round: round + 1 }` (`step-runner.ts`, „Kapu-lelet a limiten”).
- A szerző a `output.gate`-ből (`GateFeedbackLike`: `arc[{ sectionIdx }]`, `reasons[]`) számolja a javítandó fejezeteket, és csak azokat írja újra
  (`authorGateFeedback`, `section-patch.ts`).
- A vezérlő (`sweepFailedStudioJobs`) a V4 fokait eddig kihagyottként naplózta; a kézi gomb ezeket elutasítja (`NOT_RESUMABLE_STRATEGIES`).
- Új gyártás a térképből: `startJobFromMap(mapId, scope, …)` + `driveTracked(jobId, owner, true)` (`POST /lessons/from-map/:mapId`).

## V4.1 — szerzői javítás (`author-repair`)
`step-runner.ts` új `retryWithAuthorRepair(jobId, visit, deps)`:
- Jogosultság: mint a `retryFailedGate` (mentett, nem publikált, kapu-látogatás hibája = a job hibája).
- Célfejezetek: a hibaüzenet `experience.<bank>[i]` útvonalainak `sectionIndex`-e a jelenlegi `lesson.experience`-ben, valamint a „cX: hiányzó …”
  fogalmak tanító fejezetei (a fogalmat `coversConceptIds`-ben tartalmazó `explain` blokk fejezete). Ha üres → nem végrehajtható (a tervező továbblép).
- Szintetikus kapu-visszajelzés: `output.gate = { ok: false, arc: [{ sectionIdx }…], reasons: ["A(z) N. fejezet tanítása alapján a gyakorlóbank nem építhető fel
  hibátlanul: <a fejezet hibás tételeinek üzenete>. Tedd a tanítást egyértelművé és teljessé ezekre a pontokra."] }`.
- `workflowAllowResumeEdge("gate", "author", …, ["animator", "lektor", "gate"])`, majd `saveStep({ step: "author", status: "pending", round: round + 1,
  output: { ...spendRepair(rebuildOutput(...), "targetedGate", round + 1), gate } })` — a régi bank és a gyorsítótár kikerül (a tanítás
  változik, a bank úgyis újraépül), a naplóba `author-repair` kerül.

## V4.2 — teljes újragyártás (`remanufacture`)
`lesson-pipeline-routes.ts` új `remanufactureFromMap(jobId, owner)`:
- `startJobFromMap(job.mapId, undefined, {}, …)` az eredeti térképből (a térkép-szintű javítások, tanári kérés a jobból átvéve, ha van);
  `driveTracked(newJobId, owner, true)`; a régi job kimenete: `remanufacturedAs: newJobId`, `recoveryState: "remanufactured"`, napló `remanufacture`.
- A régi futásnézet (`oneStepRunView`): ha `remanufacturedAs` van, `nextRecovery.reason`: „Új gyártás indult ugyanabból a forrásból (<id>).”
- A söprő a `recoveryState = "remanufactured"` jobot nem veszi fel újra.

## V4.3 — bekötés
- `applyResume` (kézi gomb és vezérlő): kapu-látogatásnál a tervező foka szerint `retryFailedGate` (gate / review / rebuild-*), `retryWithAuthorRepair`
  (author-repair); a `remanufacture` a söprőből a `remanufactureFromMap`-pal (a kézi gombnál is, a tervező szerint).
- `NOT_RESUMABLE_STRATEGIES` → csak `ask-owner`.

## V4.4 — tesztek
- `tests/lesson-pipeline-runner.test.ts`: `retryWithAuthorRepair` → `author`/`pending`, kör + 1, `output.gate.arc` a hibás fejezetekkel, `repairLedger.targetedGate`,
  a bank és a gyorsítótár kikerül; üres célnál elutasítás.
- `tests/recovery-sweep.test.ts`: a `remanufactured` állapotú job nem jelölt.
- `tests/recovery-planner.test.ts`: `NOT_RESUMABLE_STRATEGIES` = `["ask-owner"]`.
- Ellenőrzés: célzott tesztek, `npm.cmd run check`, `lint`, `check:test`, `build`, teljes `npm.cmd test`; száraz futás az éles adatokon.
