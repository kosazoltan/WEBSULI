# Végrehajtás — kivonatolás kerete (ügynöknek)
1. `source/server/studio/run-extraction.ts`: exportált `EXTRACTION_TOKEN_BUDGETS = [8192, 24576]` és
   `completeWithinBudget(create: (maxTokens) => Promise<resp>)`: `length` esetén a következő kerettel ismétel; `stop` → válasz;
   egyéb/utolsó csonka → „A forrásfeldolgozás válasza nem teljes; csonkolt jegyzék nem menthető.” A `callExtractorModel` ezt használja.
2. Új teszt `source/tests/extraction-budget.test.ts` a három EARS-pontra.
3. Ellenőrzés: célzott teszt, teljes unit, tsc, eslint; élő Egyiptom-gyártás újra.
