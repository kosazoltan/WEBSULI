# A kötőjeles szám — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-20-v1-kotojeles-szam.md`. Munkakönyvtár: `source/`. Egy PR, ág: `fix/v1-kotojeles-szam`.

1. **`shared/lesson-experience-score.ts` `normalizeAnswer`:** a számminta `(?:(?<![\p{L}\d])[+-])?\d+(?:\.\d+)?` lesz. A `+`
   levágása marad.
2. **`server/ai/lesson-html-spec.ts` `ee_norm`:** ugyanez a minta (a sablonban kettőzött visszaperrel).
3. **Teszt** (`tests/v1-kotojeles-szam.test.ts`):
   - „72/552-270”, „72-552-270” → a „270” teljesül;
   - „-4.5”, „−4,5” negatív marad;
   - „2-3” → „2 3”;
   - HTML-paritás a kötőjeles esetekre.
4. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`, háromfázisú ellenőrzés.
