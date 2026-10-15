# Végrehajtási utasítás — Tételgyár T5: a számolós kvízkulcs programból

Terv: `docs/specs/2026-10-15-tetelgyar-t5-szamolas-programbol.md`. Ág: `feat/tetelgyar-t5`.

## T5.1 — `shared/single-choice-check.ts`
1. `embeddedArithmeticProblems(item)`: a kérdésben PONTOSAN EGY kiszámolható kifejezés (előjeles zárójellel is: `normalizeSignedParens` után
   `evaluateExpression`), a kérdés az eredményére kérdez (`eredmény`, `értéke`, `mennyi`, `egyenlő`, `tartozik`, `kapjuk`), minden válasz szám
   (előjellel, „+6” is) → `exactlyOne` a kiszámolt értékre. A meglévő tiszta-forma (`arithmeticProblems`) előnyt élvez (dupla lelet nincs).
2. `reverseArithmeticProblems(item)`: minden válasz kiszámolható kifejezés (legalább egy műveleti jellel), a kérdésben pontosan egy szám áll és
   „melyik kifejezés” / „melyik művelet” formában az eredményre kérdez → `exactlyOne` a kifejezésekre, amelyek értéke a szám.
3. Hallgatás: több kifejezés a kérdésben; feltétel / tagadás („nem”, „ha”, „nagyobb”, „kisebb”, „között”); nem szám vagy nem kiszámolható válasz.
4. Tesztek (`tests/single-choice-check*.test.ts` bővítés): a T6.0 három valós hibás tétele lelet; a helyes változatuk nem; hallgatási esetek;
   a meglévő tesztek változatlanul zöldek.

## T5.2 — mérés (csak olvasás)
- `source/scripts/measure/arithmetic-key-trial.mts`: a 2026-09-24 óta mentett leckék kvízein lefuttatja az új ellenőrzést; kimenet: a lelet
  minden tételre (kérdés, válaszok, kulcs, kiszámolt érték) — kézi átnézés a téves riasztásra; `docs/measurements/2026-10-15-t5-szamolos-kulcs.json`.

## Ellenőrzés
Célzott tesztek, `check`, `lint`, `check:test`, `build`, teljes `npm test`.
