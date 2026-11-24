# Végrehajtás: összevont eredménylevél (U4)

Terv: `docs/specs/2026-11-24-osszevont-eredmenylevel.md`. Szeletek, mindegyik külön PR, a szokásos kapulánccal (bukó teszt → zöld → próbahiba → `gate:stage` → `gate:push` → `local-review` → `gate:pr` → PR → zöld CI és `gate:merge`):

1. **U4a — adatmodell és sablon.**
   - Migráció: `lesson_result_pending`.
   - `buildCombinedResultEmail` (két szakasz, közös összesítő, részleges jelölés).
   - Tesztek: egységteszt a sablonra; DB-teszt a migrációra és a részenként egy nyitott sor egyediségére.
   - Részletek: migráció `0047_lesson_result_pending.sql` (az U3 a 0046-ot foglalja); a tanulói tartalom (`graded`, `learner`) nyitott sorban kötelező, elküldés után törölhető (CHECK); a rész törzse közös segéd (`gradedBodyHtml`), az egyrészes levél bájtra változatlan.
   - Állapot: folyamatban (PR: `feat/u4a-osszevont-sablon-v2`).
2. **U4b — szerverút** (a kapcsoló alapértéke KI; a zárolás és az utak a terv 6. pontja szerint).
   - Kapcsoló (`resultCombinedEmailEnabled`); a lecke részeinek megállapítása (van-e nyitott feladat, illetve kvíz).
   - Kétrészes leckénél a végleges eredmény félretétele vagy párosítása `SELECT … FOR UPDATE`-tel; `awaiting` a válaszban.
   - Közös `(lesson_id, owner_key)` tanácsadó zár (`pg_advisory_xact_lock`), ezt a söprő is felveszi.
   - A `sendPracticeResult` útja is a párosítón megy át, ugyanazzal a tulajdonoskulccsal.
   - Tesztek: DB-teszt E1–E3, E5, E6, E8 (két külön DB-kapcsolat, üres várakozóállapot), E9 (fiókos út) és E10. Valódi levél nincs: hamis küldő (`setResultSender`).
3. **U4c — söprő.**
   - Óránként és induláskor fut; a 7 napnál régebbi nyitott sorokból jelölt részleges levél megy.
   - Teszt: DB-teszt E4, az óra paraméterként.
4. **U4d — kliens.** (A bejelentkezett tanuló gyakorlókör-válaszában is érkezik `awaiting`.)
   - Az `awaiting` válasz és a lecke állapota alapján figyelmeztetés a lecke végén és tetején.
   - Teszt: e2e E7.
5. **U4e — élesítés.** A `RESULT_COMBINED_EMAIL` alapértéke élesben (`NODE_ENV=production`) BE lesz, csak az U4b–U4d beolvadása után. Teszt: a kapcsolóteszt a V0 mintájára.
