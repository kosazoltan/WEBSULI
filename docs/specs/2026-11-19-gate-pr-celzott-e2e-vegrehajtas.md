# Végrehajtás: a PR-kapu célzott böngészős köre és fail-fast sorrendje (AI-olvasható utasítás)

> Terv: `docs/specs/2026-11-19-gate-pr-celzott-e2e.md` · Ág: `fix/gate-pr-celzott-e2e` · Munkafa: `.claude/worktrees/gate-pr-celzott-e2e`

Minden pont ELŐBB bukó teszttel (a régi kódon bukik); mutációs ellenpróba másolaton; commit-üzenet fájlból.

1. Ez a doksi-commit (terv + végrehajtás), a kód előtt.
2. `scripts/qa/gates/gates.config.json`: `gameE2e` (játékonként `specs` + `meterGrep`), `sharedGameFiles`, `gameAreaPatterns`; az
   `alwaysGameSpecs` marad (a teljes körhöz). Őr-teszt (`scripts/qa/gates/pre-pr-gate.test.mjs`): a valódi `source/tests/*.spec.ts`
   listán minden, a `games` regexre illő spec pontosan egy `gameE2e`-játéknál vagy a közös listán szerepel; minden felsorolt spec
   létezik.
3. `scripts/qa/gates/pre-pr-gate.mjs`: `classifyChanges` → `shared` / `unknown` jelzés; `pickE2eSpecs` → játékonkénti kör az
   `alwaysGameSpecs` nélkül, közös / ismeretlen → teljes kör, `leftToCi` lista; a kapu a futás előtt kiírja (`gate.log`) a helyi és a
   CI-ra hagyott spec-eket. Tesztek: egy játék, két játék, hangmotor, mérő spec, tesztsegéd, több játékra illő fájl, ismeretlen játékfájl,
   változott, táblán kívüli spec.
4. `scripts/qa/gates/pre-push-gate.mjs`: `runCheapSteps({ gate, ctx, stopOnFail })` (tiszta munkafa → fetch → háromfázisú rend →
   PR-méret); a `runPrePushSteps({ …, skipCheap })` ezzel kezd. `scripts/qa/gates/pre-pr-gate.mjs`: `cheapPhase` — PR-leírás →
   ítélet → külső sor → `runCheapSteps`; az első FAIL után `finish`, `pre-pr-<fej>` `ok: false`, kilépés 1. Teszt: a lépésnevek
   sorrendje, és hogy bukó olcsó lépés után a drága lépés függvénye nem hívódik.
5. Doksi: `docs/minosegkapuk.md` (PR-kapu: célzott kör, CI-ra hagyott rész, fail-fast sorrend), `websuli-pr-elotti-kapu` skill + tükör.
6. Ellenőrzés: `node --test scripts/qa/gates/pre-pr-gate.test.mjs scripts/qa/gates/pre-push-gate.test.mjs`; mutációs ellenpróba;
   `npm run gate:stage`; gép-zárral egy játékra szabott helyi kör mérése és `npm run gate:push`.
