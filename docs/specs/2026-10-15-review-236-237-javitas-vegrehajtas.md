# Végrehajtási utasítás — a #236 és a #237 review-leleteinek javítása

Terv: `docs/specs/2026-10-15-review-236-237-javitas.md`. Ág: `fix/review-236-237`.

## R1 + R2 — `scripts/qa/three-phase-check.mjs`
- `decideThreePhase({ files, commits, readFileAt, existsAt })`: a tartalmi és terv-ellenőrzés a **első kódcommit** sha-ján fut
  (`readFileAt(path, sha)`, `existsAt(path, sha)`; a `main()` ezt `git show <sha>:<path>` / `git cat-file -e <sha>:<path>` hívással adja).
  Ha nincs kódcommit (csak a diffben), a HEAD-et nézi. A sorrend-feltétel (első kód ≥ első végrehajtási érintés) marad.
- Kis javítás: `code.length <= 1 && added <= 1 && deleted <= 1` (a szabály „egy soros” kivétele); a figyelmeztetés marad.
- `docs/specs/2026-10-15-haromfazis-ci-ellenorzes.md`: a kivétel és az E3 szövege ehhez igazítva (szigorítás, dokumentált spec-változás).
- Tesztek (`scripts/qa/three-phase-check.test.mjs`): a meglévők az új bemeneti nevekkel; új: üres utasítás az első kódcommitnál → piros;
  1 fájl 2 hozzáadott sor → piros; 1+1 → zöld. A korábbi „≤ 20 sor átmegy” teszt a dokumentált spec-változás szerint „1+1 sor átmegy” lesz.

## R3 — öröklött újragyártás (`lesson-pipeline-routes.ts`, `recovery-planner.ts`)
- `remanufactureFromMap`: az új job kimenetébe (indítás után, a meghajtás előtt) `recovery: [<remanufacture lépés>]` és
  `remanufacturedFrom: <régi id>` kerül.
- `planRecovery`: a `remanufacture` fok, ha a TELJES történetben már szerepel, kimarad (a többi fok számolása változatlan).
- Teszt: `tests/recovery-planner.test.ts` — más osztályú korábbi újragyártás után is `ask-owner`.

## R4 — nem végrehajtható szerzői javítás (`step-runner.ts`)
- `retryWithAuthorRepair`: üres célnál a lépés (`author-repair`, a hiba ujjlenyomatával) a job `output.recovery`-jébe mentődik
  (`saveStep(jobId, { output })`, a job `error` állapotú marad), majd a hibaüzenet megnevezi a következő fokot.
- Teszt: `tests/lesson-pipeline-runner.test.ts` — üres célnál a napló bővül, és a `planRecovery` a következő fokot adja.

## R5 — atomi foglalás (`lesson-pipeline-routes.ts`, `recovery-sweep.ts`)
- `remanufactureFromMap` elején: `UPDATE studio_jobs SET output = output || '{"recoveryState":"remanufacturing"}' WHERE id = $1 AND status = 'error'
  AND coalesce(output->>'recoveryState','') NOT IN ('remanufacturing','remanufactured') RETURNING id`; ha nincs sor → `WorkflowConflict`
  („Az újragyártás már elindult.”). Sikertelen `startJobFromMap` / kivétel → a `recoveryState` kulcs törlése.
- `recoveryCandidate`: `remanufacturing` → „újragyártás folyamatban”.
- Teszt: `tests/recovery-sweep.test.ts` — a `remanufacturing` állapot nem jelölt.

## Ellenőrzés
Célzott tesztek, `npm.cmd run check`, `lint`, `check:test`, `build`, teljes `npm.cmd test`; `node scripts/qa/three-phase-check.mjs`.
