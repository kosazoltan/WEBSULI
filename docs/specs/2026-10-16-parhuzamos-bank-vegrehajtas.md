# Párhuzamos gyakorlóbank — végrehajtási utasítás (AI-ügynöknek)
Terv: `docs/specs/2026-10-16-parhuzamos-bank.md`. Ág: `feat/parhuzamos-bank`. Kapuk: tsc, check:test, lint, test, DB-test, célzott
e2e, élő mérés (`scripts/measure/single-run-measure.mts`, a történelem-forrás `030a27c0`).

1. **`engine.ts`:**
   - `singleRunBankConcurrency(env)`: a `STUDIO_BANK_CONCURRENCY` egész 1–5 között; különben 3.
   - A `buildBank` ezzel hívja a `buildLessonExperience`-t (`concurrency: 1` helyett).
2. **`experience-builder.ts`:**
   - Az `onProgress` új mezője `building?: number[]`: az egyszerre készülő egységek fejezetindexei; a `current` megmarad
     (az első), visszafelé kompatibilis.
3. **`engine.ts` haladás-szöveg:**
   - Egy készülő csomag: „a 3. fejezet csomagja készül”.
   - Több csomag: „a 4., 5., 6. fejezet csomagjai készülnek”, ismétlődő fejezetszám nélkül.
4. **Tesztek:**
   - A kapcsoló értelmezése: alap, határok, érvénytelen érték.
   - Kétfejezetes leckénél k=2 → egyszerre 2 bankhívás (a forgatókönyves kliens méri az egyidejű hívásokat), k=1 → 1.
   - A haladásszöveg több készülő csomaggal.
5. **Élő mérés** (eldobható DB, valódi Opus 5.5): az eredmény az átvilágítási dokumentumba kerül.
