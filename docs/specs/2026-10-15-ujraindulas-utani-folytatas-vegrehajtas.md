# Végrehajtási utasítás — újraindulás utáni folytatás

Terv: `docs/specs/2026-10-15-ujraindulas-utani-folytatas.md`. Ág: `fix/ujraindulas-folytatas`.

1. `orphan-jobs.ts` `sweepDecision`: a `runState` `running` VAGY `interrupted` (lejárt lízing) → `resume` (a keret alatt); keret felett → `close`.
   A „leave” csak élő lízingnél / futás nélküli jobnál (futás közben). Teszt: `tests/orphan-jobs*.test.ts` bővítés.
2. `step-runner.ts` `resumeKindOf`: új fajta `restart` — `error === ORPHAN_JOB_ERROR`, mentett lecke, nem publikált. `applyResume`: a job a
   futás utolsó (megszakadt) látogatásának lépésére áll vissza `pending`-be (a bank-checkpoint és a lecke marad); a lépés a meglévő
   folytatási úton fut. A vezérlő (`sweepFailedStudioJobs`) csak az adott forrás LEGÚJABB jobját veszi fel (a régebbi duplikátum kimarad).
3. `server/index.ts`: leállásjelző (`markShuttingDown()`); a `driveTracked` hibaága leálláskor nem írja a jobot hibára (a futás `interrupted`
   marad → E1). 
4. `POST /lessons/from-map/:mapId`: ha ugyanabból a térképből (ugyanazzal a tulajdonossal) van nem publikált, mentett leckéjű job, amely
   újraindulás miatt áll vagy gazdátlanul `running`, akkor azt folytatja (`{ jobId, resumed: true }`); kifejezett `forceNew` új jobot ad.
5. `applyBankPacketRepair`: a jogosulatlan tétel- / mezőváltozás figyelmen kívül marad (`onIgnored` napló), a többi érvényes. A meglévő
   tesztek a dokumentált szerződésváltozás szerint (dobás → figyelmen kívül hagyás) igazodnak.
6. `redactWorkflowError`: `(?<![\w-])(?:sk-|Bearer\s+)` — csak szóelején.
Ellenőrzés: célzott tesztek, `check`, `lint`, `check:test`, `build`, teljes `npm test`; deploy után élő megfigyelés (a következő deploy alatt futó gyártás folytatódik).
