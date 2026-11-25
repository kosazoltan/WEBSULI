# Végrehajtás: összevont eredménylevél (U4)

Terv: `docs/specs/2026-11-24-osszevont-eredmenylevel.md`. Szeletek, mindegyik külön PR, a szokásos kapulánccal (bukó teszt → zöld → próbahiba → `gate:stage` → `gate:push` → `local-review` → `gate:pr` → PR → zöld CI és `gate:merge`):

1. **U4a — adatmodell és sablon.**
   - Migráció: `lesson_result_pending`.
   - `buildCombinedResultEmail` (két szakasz, közös összesítő, részleges jelölés).
   - Tesztek: egységteszt a sablonra; DB-teszt a migrációra és a részenként egy nyitott sor egyediségére.
   - Részletek: migráció `0047_lesson_result_pending.sql` (az U3 a 0046-ot foglalja); a tanulói tartalom (`graded`, `learner`) nyitott sorban kötelező, elküldés után törölhető (CHECK); a rész törzse közös segéd (`gradedBodyHtml`), az egyrészes levél bájtra változatlan.
   - Állapot: kész (#585).
2. **U4b — szerverút** (a kapcsoló alapértéke KI; a zárolás és az utak a terv 6. pontja szerint).
   - Kapcsoló (`resultCombinedEmailEnabled`); a lecke részeinek megállapítása (van-e nyitott feladat, illetve kvíz).
   - Kétrészes leckénél a végleges eredmény félretétele vagy párosítása `SELECT … FOR UPDATE`-tel; `awaiting` a válaszban.
   - Közös `(lesson_id, owner_key)` tanácsadó zár (`pg_advisory_xact_lock`), ezt a söprő is felveszi.
   - A `sendPracticeResult` útja is a párosítón megy át, ugyanazzal a tulajdonoskulccsal.
   - Tesztek: DB-teszt E1–E3, E5, E6, E8 (két külön DB-kapcsolat, üres várakozóállapot), E9 (fiókos út) és E10. Valódi levél nincs: hamis küldő (`setResultSender`).
   - Részletek (U4b):
     - `resultCombinedEmailEnabled(env)` = `RESULT_COMBINED_EMAIL === "on"` (alapból KI; az U4e élesít).
     - Kétrészes lecke = a tapasztalatban van szöveges feladat ÉS kvíz is; egyrészes leckénél a régi út változatlan. A lecke sémája (shared/lesson-experience.ts) minden tapasztalatban ≥1 feladatot és ≥2 kvízkérdést ír elő, így a mai adatban minden tapasztalatos lecke kétrészes; az E1 egységtesztként a hiányos / régi adatot védi.
     - `pairOrPark` (új, `server/lesson-result-combine.ts`): egy tranzakcióban `pg_advisory_xact_lock(hashtext(lecke|tulajdonos))`; ha a kör már elküldött párban szerepel → `alreadySent`; ha van nyitott másik rész → mindkét sor `sent_at`/`pair`, és a tranzakció után EGY összevont levél (`sendLessonResult` `combined` móddal, a két kör kulcsából képzett körkulccsal és idempotencia-kulccsal); különben a rész nyitott sora (az újabb kör felülírja) és `awaiting`.
     - Az összevont úton a B4 tulajdonos-ellenőrzés (`claimFinalRound` + tulajdonos-sor) a `RESULT_PARTIAL_EMAIL`-től függetlenül fut.
     - A `sendPracticeResult` ugyanazt a párosítót hívja a fiók azonosítójával (`who` = a felhasználó azonosítója, mint a POST-ban), és visszaadja az `awaiting`-et.
     - Az elküldött sorok tanulói tartalmának törlése (graded/learner → NULL) a söprő (U4c) dolga, a sikeres kézbesítés után.
   - Állapot: folyamatban (PR: `feat/u4b-osszevont-szerverut`).
3. **U4c — söprő.**
   - Óránként és induláskor fut; a 7 napnál régebbi nyitott sorokból jelölt részleges levél megy.
   - Teszt: DB-teszt E4, az óra paraméterként.
   - Részletek (U4c, a #586 review-ja után):
     - `sweepPendingResults({ now })` (új, `server/lesson-result-sweeper.ts`), soronként a közös `(lecke, tulajdonos)` tanácsadó zár alatt:
       1. **Lejárt rész:** a `now − 7 nap`-nál régebbi nyitott sor → `sent (timeout)`, majd jelölt részleges levél (`buildCombinedResultEmail`
          egy hiányzó résszel; körkulcs: tulajdonos + rész + kör). A `delivered_at` csak a sikeres kézbesítés után.
       2. **Kézbesítetlen pár / rész:** a `sent_at IS NOT NULL AND delivered_at IS NULL` és 10 percnél régebbi sorok újrakézbesítése
          (pár: összevont levél a pár kulcsával; `timeout`: a részleges levél). Az idempotencia-kulcs és a levélnapló miatt nincs dupla levél.
       3. **Tartalom-törlés:** a kézbesített sorok `graded` / `learner` mezője NULL (adatkímélés; a nyitott sor CHECK-je érintetlen).
     - A söprő a kapcsolótól FÜGGETLENÜL fut (KI állásban is kiüríti a maradékot), E2E-ben nem indul.
     - Tesztek (DB): S1 = E4 (8 napos rész → egy jelölt levél, `timeout`, kézbesítve, tartalom törölve); S2 újrafuttatás nem küld újra;
       S3 6 napos rész marad; S4 kézbesítetlen pár pótlása; S5 kézbesítetlen `timeout` pótlása; S6 két egyidejű söprés → egy levél.
4. **U4d — kliens.** (A bejelentkezett tanuló gyakorlókör-válaszában is érkezik `awaiting`.)
   - Az `awaiting` válasz és a lecke állapota alapján figyelmeztetés a lecke végén és tetején.
   - Teszt: e2e E7.
   - Részletek (U4d):
     - Szerver: a `sendPracticeResult` a párosítás eredményét (`awaiting`) azonnal adja, a levél a háttérben megy; az `answerPractice` /
       `finishPractice` a kör lezárásakor legfeljebb 3 s-ig vár rá, és a válasz nézetébe `resultAwaiting` kerül (időtúllépés / hiba → nincs mező).
     - Kliens: `client/src/lesson-runtime/resultAwaiting.ts` — leckénkénti tár (`localStorage`, memóriás tartalékkal) és `useResultAwaiting`
       hook; a vendég / párosított út (`useResultReport`) a POST-válasz `awaiting`-jét írja, a bejelentkezett kvíz a `resultAwaiting`-et;
       bármely rész `awaiting` nélküli sikeres beküldése törli.
     - UI: `ResultAwaitingNotice` (`data-testid="result-awaiting"`) a lecke tetején (eszközsor alatt) és a kész rész eredménye alatt, gombbal
       a hiányzó részhez; a hiányzó rész beküldése után eltűnik.
     - Tesztek: egységteszt a tárra (beállítás, törlés, másik lecke független); DB: E9b — a gyakorlókör nézete `resultAwaiting: "tasks"`;
       e2e E7 — a POST-válasz `awaiting`-jére (útvonal-helyettesítéssel) a figyelmeztetés megjelenik, a másik rész után eltűnik.
5. **U4e — élesítés.** A `RESULT_COMBINED_EMAIL` alapértéke élesben (`NODE_ENV=production`) BE lesz, csak az U4b–U4d beolvadása után. Teszt: a kapcsolóteszt a V0 mintájára.
