# Spec: Dinamikus javítási keret (nem elakadó közzététel, 5. szelet)

> Dátum: 2026-09-30 · Szerző: Claude (Opus 5.5) · Állapot: JÓVÁHAGYVA
> Tulajdonosi utasítás: „gondoskodj róla, hogy a szerzőnek ne fogyjon el a kerete … dinamikus keretet kapjon”.
> Végrehajtás: ez a fájl §4 (kis, 4 fájlos változás; a lépések itt vannak rögzítve).

## Cél
A célzott javítókörök (lektor-tényhiba a limiten, kapu-lelet, tanári kérés hiányzó pontja) a független ellenőrzés szerint
ritkán futhattak: a workflow fix látogatási kerete (szerző 3, animátor/lektor/kapu 4) addigra elfogyott, és a lecke
bukott. Mostantól elfogyott keretnél a javítóút (szerző → animátor → lektor → kapu) egyszeri +1 látogatást kap.

## Döntések
- `workflowEnsureRepairBudget(ok)` (`server/workflows/engine.ts`): csak az elfogyott lépések kapnak +1-et; futásonként
  legfeljebb `REPAIR_BUDGET_GRANTS = 2`; a többletkeret a futás nézetében (`repairGrants`: ok, időpont) rögzül, így
  a folytatás is látja; naplózva. Workflow-kontextus nélkül (unit teszt, kézi eszköz) mindig igaz.
- Használat (`server/studio/step-runner.ts`): a lektor-tényhiba célzott köre, a kapu célzott köre (limit és a limit előtti
  javítókör), a tanári kérés célzott köre — ez utóbbi mostantól a limiten is egyszer jár.
- `MAX_CHAIN_STEPS` + 4 × `TARGETED_REPAIR_ROUNDS` (3), hogy a lépéslánc-korlát ne álljon meg előbb.
- A futásonkénti korlát miatt végtelen hurok nincs; minden célzott kör jobonként egyszer (`targeted*RepairRound` jelzők).

## Elfogadás
- WHEN a célzott javításnak nincs kerete és a futás még nem kapott 2 többletkeretet THEN it SHALL receive +1 on the exhausted repair steps, and the author step SHALL be allowed by the engine.
- WHEN a futás mindkét többletkeretet elhasználta THEN the gate SHALL fail cleanly („nincs több lépéskeret”), without an engine exception.

## Tesztek (spec-változás a meglévőkben)
`review #143 (P2)` és `spec kapu-proba (E2)`: előbb a többletkerettel célzott kör + a motor engedi a szerzőt; a keret
elfogyása után a korábbi tiszta hiba. `tanári kérés … a limiten`: a limiten is egy célzott kör, utána figyelmeztetés.
