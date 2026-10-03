# Végrehajtás — hamis egyenlőség a forrásban

1. `server/studio/source-corrections.ts`: `CorrectionBasis` += `"arithmetic"`; `normalizeSignedParens` (előjel-összevonás:
   `-(-b)`→`+b`, `-(+b)`→`-b`, `+(-b)`→`-b`, `+(+b)`→`+b`, vezető `(-a)`→`-a`); `sourceArithmeticClaim(quote)` (pipa-levágás,
   `=`-lánc, vezető `+` az eredményen, olvashatatlan eredmény); `arithmeticSourceCorrections(concepts)` (idempotens, definíció-
   szöveg: „A helyes eredmény: 9-(-6) = 15. A forrás átirata „9-(-6)=+3”-at ír — ez a sor hamis (tanulói hiba vagy olvasati
   zaj); a helyes eredményt tanítsd, a forrás sorát javítandó hibaként említheted.”); `mergeCorrections(det, model)`;
   `correctionAuditText`/`correctionPromptLines` a harmadik alappal + figyelmeztető sor.
2. `server/studio/lesson-pipeline-routes.ts` `correctMapFromOwner`: determinisztikus kör mindig; modell-javaslat csak
   kérés/fotó esetén; `mergeCorrections`; mentés változatlan úton.
3. `server/studio/structured-improvement.ts`: ugyanez a merge a javítási forrásra.
4. `server/studio/bank-verifier.ts`: a fogalom-lista `correction?: string` mezőt fogad; prompt-sor az idézet alatt; a
   `verifierContext` hash a helyesbítést is tartalmazza.
5. `server/studio/step-runner.ts`: a bank-ellenőrnek és a kontextusnak átadott fogalmak a `job.output.sourceCorrections`-ből
   kapják a `correction` szöveget.
6. Teszt: `tests/source-arithmetic-corrections.test.ts` (élő térkép 13 idézete, edge case-ek, prompt-sorok, verifier-prompt,
   merge, idempotencia, forrás-ellenőrzés a `correctMapFromOwner` korai visszatérésére). Teljes unit, tsc, lint.
