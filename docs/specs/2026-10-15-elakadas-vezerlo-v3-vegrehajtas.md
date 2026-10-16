# Végrehajtási utasítás — Elakadás-vezérlő V2+V3: célzott újraépítés és automatikus, haladás-alapú végrehajtás

Terv: `docs/specs/2026-10-15-elakadas-vezerlo.md` (V2, V3). Ág: `feat/elakadas-vezerlo-v3` (a V1-re épül).

## Kódból ellenőrzött kiinduló tények (2026-10-15)
- `workflowOrchestratorAllow(point, perPoint = 2, perRun = 8)` (`server/workflows/engine.ts`): a keret FUTÁSONKÉNTI, a pont a tételhelyhez kötött
  (`gate:<kör>:experience.tasks[7]`); a 416-nál a folytatások és a bank-újraépítés után az új bank tételei a régi, elfogyott keretet örökölték.
- `rebuildOutput` (`step-runner.ts`) a teljes `experienceCheckpoint`-ot és a `lesson.experience`-t törli, de a régi sorszámú jelzéseket
  (`choiceFlags`, `bankOpenFindings`, `gateRepairs`, `choiceGate`) megtartja.
- A `sweepStudioJobs` csak a nem-hibás (`status NOT IN ('ok','error')`) jobokat viszi tovább; a hibás jobot semmi nem folytatja magától.
- `executeWorkflow` keret: 4 (automatikus) / 6 (`explicitResume`).

## 1. Orkesztrátor-keret végrehajtásonként (engine)
`workflowOrchestratorAllow`: ha `view.orchestrator.execution !== view.executions`, a számlálók nullázódnak (`{ calls: 0, byPoint: {}, execution }`).
A keret végrehajtásonként marad korlátos; a végrehajtások számát a vezérlő lépcsője korlátozza. Típus: `orchestrator?: { calls; byPoint; execution? }`.

## 2. Újraépítéskor a régi sorszámú jelzések törlése
`rebuildOutput`: a `choiceFlags`, `bankOpenFindings`, `gateRepairs`, `choiceGate` is kikerül (a lektor az új bankra új jelzéseket ad).

## 3. Célzott újraépítés (V2)
`step-runner.ts` új `targetedRebuildOutput(output, error, attempt)`: a hibaüzenet `experience.<bank>[i]` útvonalaiból a JELENLEGI
`lesson.experience` tételeinek `sectionIndex`-e → hibás fejezetek halmaza; az `experienceCheckpoint.parts` közül csak azok maradnak, amelyek
egyetlen tétele sem ezekből a fejezetekből való; a `lesson.experience` és a régi jelzések kikerülnek; `bankRebuild: "targeted"`,
`rebuiltSections`. Ha nincs azonosítható fejezet → a teljes újraépítés (`rebuildOutput`).

## 4. Egy szabály: a stratégia a tervezőből
- `retryFailedGate(jobId, visit, deps, strategy?)`: ha `strategy` adott (`gate` | `review` | `rebuild-targeted` | `rebuild-full`), az dönt; különben a
  `planRecovery` a `recoveryHistoryOf(output)` alapján. A `resumeKindOf` továbbra is a jogosultságot (mentett, nem publikált, naplózott hiba) ellenőrzi.
- `recoveryHistoryOf(output)`: a `output.recovery[]` + a régi mezőkből visszafejtve (`gateRecoveryAttempt ≥ 1` → `gate`; `bankRebuild` → `rebuild-full`).
- Minden végrehajtott stratégia a `output.recovery[]`-be kerül (stratégia, ujjlenyomat, hibás tételszám, idő) — a mentés a végrehajtás ELŐTT.
- A kézi „Folytatás” gomb ugyanezt a tervezőt használja.

## 5. Automatikus végrehajtás (V3)
`lesson-pipeline-routes.ts` új `sweepFailedStudioJobs()` a `startStudioJobSweeper` időzítőjében (100 s), a meglévő söprés mellett:
- Jelöltek: `status = 'error'`, mentett lecke, nem publikált, workflow-napló van és `error` állapotú, a megállás óta ≥ 2 perc, a lízing szabad.
- `planRecovery` → végrehajtható stratégia (`gate`, `review`, `rebuild-targeted`, `rebuild-full`, `retry-provider` → a meglévő bank/lektor ág) esetén
  `driveTracked(..., recoveryResume)`; `author-repair`, `remanufacture` (V4) → a lépés kihagyott-ként naplózva, a tervező a következő fokra lép;
  `ask-owner` → `output.recoveryState = "ask-owner"` egyszer, további automatikus lépés nincs.
- Keret: `executeWorkflow` bemenete kap `recoveryResume?: true` → `WORKFLOW_RECOVERY_BUDGET = WORKFLOW_EXPLICIT_RESUME_BUDGET + 8` (a lépcső hossza);
  a haladás-őr (tervező) a valódi korlát.
- Egyszerre legfeljebb 1 automatikus folytatás söprésenként (költség és naplózhatóság).

## 6. Tesztek
- `tests/recovery-planner.test.ts`: `recoveryHistoryOf` (régi mezők).
- `tests/lesson-pipeline-runner.test.ts`: `retryFailedGate` stratégiával (gate / review / rebuild-targeted / rebuild-full); a célzott újraépítés csak a
  hibás fejezet csomagjait veszi ki; a régi jelzések törlődnek.
- `tests/lektor-evidence.test.ts` vagy új: az orkesztrátor-keret új végrehajtásban nullázódik.
- Új `tests/recovery-sweep.test.ts`: a jelöltszűrés tiszta függvénye (`recoveryCandidate(row, now)`) — 2 perc, lízing, publikált, ask-owner.
- Ellenőrzés: célzott tesztek, `npm.cmd run check`, `lint`, `check:test`, `build`, teljes `npm.cmd test`; élő E1 a `416ad01d`-n (deploy után a
  söprés magától viszi tovább).
