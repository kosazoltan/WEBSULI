# Végrehajtás — képlet-biztos heurisztikák

1. `shared/formula-text.ts` (új): `formulaNormalize`, `isFormulaText`, `containsFormula` (+ egyenlet-lánc).
2. `server/studio/grounding.ts`: `formulaOf`/`formulaPresent` a közös modulra; a képlet-ág a „< 4 szó” szabály ELŐTT.
3. `server/studio/instruction-check.ts`: bizonyíték- és idézet-ellenőrzés képletnél `containsFormula` (fejezet-törzs / forrás).
4. `server/studio/instruction-points.ts`: kérés-részlet képletnél nem esik ki; `verbatimInSource` képletnél `containsFormula`.
5. `server/studio/verbatim.ts` `checkVerbatim`: képlet-idézetnél `containsFormula` a forrásban.
6. `shared/answer-value.ts` `referenceValueProblems`: zárójelhez tapadó részlánc nem ítélhető (kihagyva).
7. Tesztek: `tests/formula-text.test.ts` + a 7 próba-bemenet a saját modulja tesztjében; a #185 töredék-elvárás frissítése
   (dokumentált). Ellenpróba, teljes unit, visszajátszás (`ground-replay.local.mts`, `accept-replay.local.mts`), tsc, lint.
