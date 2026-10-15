# Külön gombok hiba / megszakadt piszkozat esetén — terv (2026-10-15)

## Tulajdonosi javaslat (2026-10-15)
„Nincs külön gomb a tananyag készítésére, az újragyártásra és a megszakadt folyamat folytatására — ezeket különítsd el, és jelenítsd meg
az oldalon hiba esetén; akkor elkerülhetőek ezek a hibák, és egyszerűbb a kezelés.”

## Tények (kód)
- `client/src/components/studio/SourceUploadForm.tsx`: hibánál „Folytatás a mentett részekből” (ha folytatható), „Forrásellenőrzés megnyitása”,
  „Bezárás”. Újragyártás külön gombja nincs; az újrafeltöltés észrevétlenül új, elölről induló jobot indít (mért: térkép 3f39ab9b, 5 job).
- `runOneStepCore` (`lesson-pipeline-routes.ts`): a térkép forrás-hash szerint újrahasznosul, a job mindig új (`startJobFromMap`).
- A #247 óta a megszakadt piszkozat a mentett részekből folytatható (`restart` fajta), és forrásonként csak a legújabb job fut tovább.

## Cél
A program soha nem kezd újra észrevétlenül. Ha ugyanabból a forrásból (és ugyanazzal a tanári kéréssel) van folytatható piszkozat, az új
feltöltés NEM indít gyártást, hanem választást kér; hibánál ugyanez a három gomb jelenik meg:
1. **Folytatás a megszakadt ponttól** — a piszkozat jobja folytatódik; a haladásjelző a piszkozat futására vált.
2. **Újragyártás ugyanabból a forrásból** — kifejezett új gyártás; a régi piszkozat `superseded` (nincs dupla gyártás).
3. **Új tananyag** — az űrlap kiürül (nincs szerverhívás).

## Nem-cél
- A gyártási lépések és a vezérlő lépcsője nem változik; publikált lecke nem nyúlik.

## Elfogadás (EARS)
- E1: HA ugyanabból a térképből (ugyanazzal a kéréssel) van mentett, nem publikált, nem lezárt-sikeres piszkozat, AKKOR az új feltöltés
  `draft` fázisba áll (gyártás nem indul), a nézet a piszkozat jobját és futását adja.
- E2: „Folytatás” → a piszkozat jobja folytatódik (meglévő resume út), a felület a piszkozat futását követi.
- E3: „Újragyártás” → `forceNew` kéréssel új gyártás indul, a régi piszkozat `superseded`.
- E4: Hibánál (`error`) ugyanez a három gomb látszik (a folytatás csak folytatható megállásnál).
- E5: Valós böngészőben (390 és 1366 px) a gombok átfedés / levágás / vízszintes görgetés nélkül.
