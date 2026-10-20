# Pontozó angol tagadás — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-20-pontozo-angol-tagadas.md`. Munkakönyvtár: `source/`. Ág: `fix/pontozo-angol-tagadas`.

1. **`shared/lesson-experience-score.ts`:**
   - `const ENGLISH_NEGATIONS = [...]` — a zárt lista + „cannot”;
   - `export function negationKind(tokens: string[]): "none" | "hu" | "en"` — „not”, „n + t” pár vagy lista → en; „nem” → hu;
   - `unexpectedNegation(answerTokens, sampleTokens)`:
     `(neg(answer) && !neg(sample)) || (negationKind(sample) === "en" && !neg(answer))`;
   - a v1 és a v2 a meglévő `hasUnexpectedNegation` helyett ezt hívja.
     - Ha a mintában magyar és angol tagadás is van, az „en” elsőbbséget kap.
   - **`OPEN_ANSWER_RULES_HU` 4. pont, a tagadás mondata:**
     „Tagadás: a nem/not és az angol n't (don't, mustn't, can't…) tagadásnak számít; ha a válaszban van tagadás, a mintában
     nincs → 0,5; ha a minta angolul tagadó (not / n't), a válasz pedig nem → 0,5.”
2. **`server/ai/lesson-html-spec.ts` `ee_evaluate`:** ES5-ben ugyanez — `ee_negKind(words)`, és a `unexpectedNegation` a fenti képlettel.
3. **Tesztek:**
   - `tests/score-english-negation.test.ts`: a terv EARS-esetei v1-re és v2-re (típusos feladattal);
   - a „Where I Live” rubrika szó szerint;
   - `ee_evaluate` paritás ugyanezekre.
   - A `tests/lesson-html-score.test.ts` változatlanul zöld.
4. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`.
5. **Kitelepítés:** az aktív-futás őr = 0.
