# Végrehajtási utasítás — külön gombok hiba / megszakadt piszkozat esetén

Terv: `docs/specs/2026-10-15-hiba-gombok.md`. Ág: `feat/hiba-gombok` (a #247-re épül).

## Szerver
1. `OneStepRequest`: új opcionális `forceNew: boolean` (a `parseOneStepRequest` engedi).
2. `runOneStepCore`: a térkép elkészülte után, `startJobFromMap` előtt — ha nincs `forceNew` — `resumableDraftFor(mapId, instruction)`:
   a legújabb job a térképhez, mentett leckével, nem publikált, nem `ok`/`done`, `recoveryState` nem `superseded`/`remanufactured`, és a
   tanári kérés (`ownerInstruction`) egyezik. Ha van: `updateRun(runId, { phase: "draft", mapId, jobId: draft.id, detail })` és vége (gyártás
   nem indul). A piszkozat futás-azonosítója (`draftRunId`: az a `one_step_runs` sor, amelynek `job_id`-je a piszkozat) a nézetbe kerül.
3. `forceNew` esetén a régi piszkozat(ok) `recoveryState = "superseded"` (atomi UPDATE), utána a megszokott új gyártás.
4. `OneStepPhase`: új `draft` érték (a `one_step_runs.phase` varchar(16) elfér).

## Kliens (`SourceUploadForm.tsx`)
- `draft` vagy `error` fázisban három gomb: „Folytatás a megszakadt ponttól” (a piszkozat jobjára `POST /jobs/:id/resume`, majd a
  `draftRunId` futás követése; errornál a meglévő folytatás), „Újragyártás ugyanabból a forrásból” (ugyanaz a kérés `forceNew: true`-val),
  „Új tananyag” (űrlap ürítése). A `draft` szöveg: „Ebből a forrásból van megszakadt piszkozat (N fejezet, M kész gyakorlócsomag).”
## Tesztek
- Szerver: `resumableDraftFor` (egyezés, publikált / superseded / más kérés kizárva); `forceNew` → superseded; a `draft` fázis a nézetben.
- Böngésző: `tests/lesson-draft-choice.browser.ts` mockolt API-val — `draft` és `error` állapot, a három gomb, a kattintások kérései, 390/1366 px.

## Végrehajtás közbeni pontosítások (dokumentált eltérések)
- A böngészős próba a meglévő `tests/studio-generation-recovery.spec.ts`-be került (azt a CI E2E-lépése futtatja; külön konfiguráció nem kellett).
- A szerveroldali tesztek valódi, eldobható Postgresen futnak: `tests/lesson-draft-db.integration.ts` (`npm run test:learning-db`).
  A régi piszkozatok félretétele külön függvény lett (`supersedeDraftsOf`), hogy önállóan tesztelhető legyen.
- E2 tartalék: ha a piszkozat jobja már nem hibás (a folytatás elindult, vagy a söprés folytatja), a választó futás nézete a job valódi
  állapotát mutatja — így a felület akkor sem ragad a választásnál, ha a régi futás sora (`draftRunId`) már nincs meg.
- A szakaszjelző `draft` fázisban is a megszakadás helyét mutatja (mint hibánál).
