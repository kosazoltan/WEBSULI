# Ciklus 4 — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-21-ciklus4-minta-kifejezes-autofix.md`.

1. **`server/studio/tools/bank-packet-autofix.ts`:**
   - `fixSamplePhrases(task, fixes)`: a `missingPhrases(sample)` csoportjaira ablakkeresés a minta v2-tokenjein;
   - a tűrő illesztést a `missingAnswerConcepts` adja;
   - az új alternatíva legfeljebb 80 karakter (séma).
   - `fixTypedValues(task, fixes)`: szám → `String(value)`.
2. **Teszt:** `tests/ciklus4-minta-kifejezes-autofix.test.ts`.
