# R5 — pontozó-korpusz — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-20-r5-pontozo-korpusz.md`. Munkakönyvtár: `source/`. Ág: `test/r5-pontozo-korpusz`.

1. **`tests/fixtures/scorer-corpus.json`:** legalább 20 eset (`name`, `source`, `task{required,minWords,needsSentence,sample}`,
   `answer`, `expected`).
2. **`tests/scorer-corpus.test.ts`:**
   - a korpusz betöltése;
   - a v1 (`evaluateOpenAnswer`) és a HTML-referencia (`ee_evaluate`, a `LESSON_HTML_SPEC_V74`-ből `runInNewContext`) ellenőrzése:
     minta = 1, válasz = elvárt;
   - a hibalista egyben jelenjen meg.
3. **`shared/lesson-experience-score.ts`:**
   - `ASSIMILATED_INSTRUMENTAL = /([bcdfghjklmnpqrstvwxyz])\1(al|el)$/`;
   - `stem`: ≥ 6 betűnél levágás;
   - `wordHit`: `token.slice(0, -3) === word` a ragos tokenre;
   - `OPEN_ANSWER_RULES_HU` 2. pont kiegészítése.
4. **`server/ai/lesson-html-spec.ts`:** `ee_stem` és `ee_wordHit` ugyanez (a template literálban `\\1`).
5. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`.
6. **Kitelepítés:** az aktív-futás őr = 0.
