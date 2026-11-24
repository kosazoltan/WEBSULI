# Végrehajtás: összevont eredménylevél (U4)

Terv: `docs/specs/2026-11-24-osszevont-eredmenylevel.md`. Szeletek, mindegyik külön PR, a szokásos kapulánccal (bukó teszt → zöld → próbahiba → `gate:stage` → `gate:push` → `local-review` → `gate:pr` → PR → zöld CI és `gate:merge`):

1. **U4a — adatmodell és sablon.**
   - Migráció: `lesson_result_pending`.
   - `buildCombinedResultEmail` (két szakasz, közös összesítő, részleges jelölés).
   - Tesztek: egységteszt a sablonra; DB-teszt a migrációra és a részenként egy nyitott sor egyediségére.
2. **U4b — szerverút.**
   - Kapcsoló (`resultCombinedEmailEnabled`); a lecke részeinek megállapítása (van-e nyitott feladat, illetve kvíz).
   - Kétrészes leckénél a végleges eredmény félretétele vagy párosítása `SELECT … FOR UPDATE`-tel; `awaiting` a válaszban.
   - Tesztek: DB-teszt E1–E3, E5, E6 és E8. Valódi levél nincs: hamis küldő (`setResultSender`).
3. **U4c — söprő.**
   - Óránként és induláskor fut; a 7 napnál régebbi nyitott sorokból jelölt részleges levél megy.
   - Teszt: DB-teszt E4, az óra paraméterként.
4. **U4d — kliens.**
   - Az `awaiting` válasz és a lecke állapota alapján figyelmeztetés a lecke végén és tetején.
   - Teszt: e2e E7.
