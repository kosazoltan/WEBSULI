# Végrehajtás — S2 tartalom alapú besorolás
1. `shared/catalog-taxonomy.ts`: `CATALOG_SUBJECTS`, `LESSON_TYPES`, típusok.
2. `shared/instruction-bundles/roles.ts`: `"catalog-classifier"` a `PROMPT_ROLES`-ban; `server/studio/support-skills.ts`:
   `"catalog-classifier"` skill-szöveg (szerep, bemenet, kimenet, lépések, tilalmak, önellenőrzés — a meglévő minta szerint).
3. `server/catalog/classify.ts`: `classificationInput(items, meta)`, `buildClassificationPrompt`, `parseClassification`
   (zod), `classifyLesson(call, input)` tartalék-lánccal (a modellek a hívótól).
4. `scripts/catalog/classify.mts`: a `.catalog/<dátum>-items.json`-ból leckénként csoportosít; `--pilot` / `--all`;
   `callStepModel(createStudioStepProvider(model, "topicFocus"), { role: "catalog-classifier", … })`; tokenhasználat a
   válaszból; kimenet a docs/measurements alá.
5. `tests/catalog-classify.test.ts`: prompt-tartalom (taxonómia, évfolyam-mező elsőbbsége), séma (érvénytelen tantárgy →
   tartalék / unclassified), szerep + skill regisztráció.
