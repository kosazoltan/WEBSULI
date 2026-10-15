# Tételgyár T3.0 — a mérés végrehajtási utasítása (AI-olvasható)

Terv: `docs/specs/2026-10-15-tetelgyar-t3-rubrika-fordito.md`. Termékkód nincs (tulajdonosi döntés: A), csak a mérőeszköz.

## Fájl
- `source/scripts/measure/rubric-gap.mts`. Csak olvas (`withReadOnlyDb`), modellt nem hív, a DB-be nem ír.
  - Bemenet: a T2.0 mérés nyers `answer-key-trial.json`-ja (tesztesetek) + a jobok mentett bankja és a fejezetek tanítása.
  - Az esetek kulcsa **`jobId:taskId`**: újrahasznált bankcsomagnál két job azonos feladatazonosítót kaphat (review #249).
  - Lépések: `calibrateRubric` (élő T2-szabály), majd a még bukó helyes válaszok hiányzó csoportjainak besorolása.
  - Szimulált változatok a kalibráció előtt (R1/R2/R3/R5). Mindegyiknél ugyanaz az őr: a minta `ok`, egyik hibás eset sem `ok`.
  - A pontozó összetétel-felismerésének szimulációja: a rubrika ≥ 5 betűs szava + **legalább 3 betűs** folytatás, vagy ≥ 3 betűs előtag + toldalékszerű vég.
    A változatlan v1 pontozó dönt.

## Futtatás (source/ mappából)
`npx tsx scripts/measure/rubric-gap.mts <answer-key-trial.json> ../docs/measurements/2026-10-15-t3-rubrika-hiany.json`

## Elvárt kimenet
JSON a következő mezőkkel:
- `tested`, `failingTasks`, `failingCorrect`;
- `avgRequiredGroups` (kalibráció előtt és után);
- `missingGroupClasses` (5 osztály), `otherReasons`;
- `simulations` (változatonként `failingCorrect` és `wrongPass`).

A terv táblázatai ebből a fájlból származnak; a számok változásakor a tervet is frissíteni kell.
