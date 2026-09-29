# Végrehajtási utasítás: forrásonkénti fedettség (2026-09-29)

Terv: `docs/specs/2026-09-29-forrasonkenti-fedettseg.md`. Ág: `fix/forrasonkenti-fedettseg` (alap: `origin/main`).
1. **Tesztek ELŐBB** (`source/tests/source-coverage.test.ts`, új tesztek). Futtatás: `node --import tsx --test tests/source-coverage.test.ts`.
   - E1: két fájl (hosszú „web.txt”, rövid „fuzet.jpg”); az általános kör csak a webre ad fogalmat, a `perFile` a füzetre ad egyet → a füzet fogalma bekerül.
   - E2: a `perFile` csak a fedetlen fájlra hívódik.
   - E3: a más fájlra hivatkozó pótlás hibát ad.

   A régi kódon E1 és E2 bukik.
2. **Kód:**
   - `source/server/studio/extractor.ts` `completeSourceCoverage(concepts, files, audit, perFile?)`: az általános kör után fájlonkénti fedettség, a fedetlen fájlra célzott pótlás;
   - `source/server/studio/run-extraction.ts:190`: `perFile` bekötése egyfájlos `callExtractorModel`-lel.
3. **Kapuk:** tsc ×2, lint, teljes unit-suite, build.
4. **Élő újramérés** a `web-live-mezo-kombi.local.mts`-sel, merge és deploy után; a térkép fogalmait csak olvasó lekérdezéssel ellenőrizd.
