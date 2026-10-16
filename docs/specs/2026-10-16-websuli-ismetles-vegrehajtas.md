# Memóriakártya és ismétlés — végrehajtási utasítás (AI-ügynöknek)

Terv: `docs/specs/2026-10-16-websuli-ismetles.md`. Ág: `feat/websuli-design-ismetles`. Két PR (a PR-méret miatt): **C —
adat és szerver**, **D — felület**. A parancsok a `source/` mappából futnak.

## C — adat és szerver (PR 1)
1. **`shared/review-schedule.ts`:**
   - `ReviewRating = "again" | "known"`, `ReviewState = { intervalDays, repetitions, dueAt }`;
   - `nextReview(previous, rating, now)`: a mesterutasítás §7 képlete változtatás nélkül;
   - `reviewQueue(cards, states, now)` → `{ due: id[], fresh: id[], later: { id, dueAt }[] }`. Az esedékesek `dueAt`
     szerint növekvően jönnek, az újak a lecke sorrendjében.
2. **`shared/lesson-flashcards.ts`:** `lessonFlashcards(lesson)` → `{ id, front, back, kind: "quiz" | "glossary" }[]`.
   - `experience.quiz`, ahol `intent !== "apply"`: id `q:<id>`, hátlap `options[correctIndex]`;
   - `experience.glossary`, ha van `experience.language`: id `g:<index>`;
   - nincs `experience` esetén `[]`.
3. **`shared/schema.ts`:**
   - `reviewStates`: `user_id` → users cascade, `lesson_id` → lessons cascade, `card_id varchar(80)`, `interval_days int`,
     `repetitions int`, `due_at timestamptz`, `updated_at timestamptz`; elsődleges kulcs `(user_id, lesson_id, card_id)`;
   - `reviewEvents`: `id uuid`, ugyanaz a három kulcs, `rating varchar(8)`, `created_at timestamptz`, index
     `(user_id, lesson_id, created_at)`.
4. **`migrations/0027_review_states.sql`:** `CREATE TABLE IF NOT EXISTS` és `CREATE INDEX IF NOT EXISTS` (idempotens,
   additív), `CHECK (rating IN ('again','known'))`.
5. **`server/rewards/review-store.ts`:**
   - `readReview(userId, lessonId, now)` → `{ states: Record<cardId, ReviewState> }`;
   - `rateCard(userId, lessonId, cardId, rating, now)`, egy tranzakcióban:
     - advisory lock `["review", userId, lessonId]`;
     - csak publikált, sémának megfelelő lecke, különben 404;
     - a `cardId` a `lessonFlashcards` eredményében legyen, különben 400;
     - előző állapot, majd `nextReview`, végül esemény-insert és állapot-upsert.
   - `ReviewError(status, message)`.
6. **`server/rewards/review-router.ts`:**
   - `GET /:lessonId` és `POST /:lessonId/rate` (`{ cardId: string ≤ 80, rating }`, zod `.strict()`);
   - `req.user.id` nélkül 401 „Vendégként a böngésződben gyakorolhatsz.” — a `practice-router` mintájára.
   - Felcsatolás a `server/studio/lesson-routes.ts`-ben: `lessonPublicRouter.use("/review", reviewRouter)`.
7. **Tesztek:**
   - `tests/review-schedule.test.ts`: a §7 számpéldái (10 perc; 1, 2, 4 … 60 nap; az `again` nulláz), a sorrend.
   - `tests/lesson-flashcards.test.ts`: a `fusionFixture()` kártyái (csak recall, a helyes válasz a hátlap), szószedet,
     üres lecke.
   - `tests/review-db.integration.ts`: valódi Postgresben, `npm.cmd run test:learning-db`:
     - esemény és állapot;
     - ismeretlen kártya 400;
     - publikálatlan lecke 404;
     - két tanuló nem látja egymást;
     - párhuzamos értékelés: minden esemény mentve.
   - `scripts/run-learning-db-tests.ts`: a 0027-es migráció kétszer (idempotencia), az új tesztfájl a listában.
8. **Kapuk:** `npx.cmd tsc --noEmit`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run test:learning-db`.

## D — felület (PR 2)
1. **`client/src/lesson-runtime/FlashcardReview.tsx`:**
   - Bejelentkezés-ellenőrzés `/api/auth/user` alapján (a `PracticeAccess` mintájára).
   - Bejelentkezve: `GET /api/lessons/review/:lessonId`, majd értékelésenként `POST /api/lessons/review/:lessonId/rate`.
     A „Mentve” csak 200 után; hibánál „Nem sikerült menteni.” és „Újrapróbálás”.
   - Vendégként vagy `lessonId` nélkül: `localStorage` `websuli:review:guest:<storageKey>`, a kiírt figyelmeztetéssel.
   - Kártya: `button.ws-flash` (`aria-pressed`, `aria-label` „Válasz megjelenítése” / „Válasz visszafordítása”), felirat
     „KÉRDÉS · KOPPINTS A FORDÍTÁSHOZ” / „HELYES VÁLASZ · KOPPINTS A VISSZAFORDÍTÁSHOZ”.
   - Gombok: „Még gyakorlom” (`lesson-outline-btn`), „Már tudom” (`fusion-primary`); mentés alatt tiltva.
   - Állapotsor (`role="status"`): hányadik kártya, hány esedékes, következő esedékesség `hu-HU` szerint.
2. **`LessonExperienceView.tsx`:**
   - `TABS` + `{ id: "review", label: "Ismétlés", icon: Layers }`, csak ha van kártya;
   - a billentyűnavigáció a fülek számából dolgozik;
   - `aria-label` „A tananyag oldalai”.
3. **`lesson-design.css`:** `.ws-flash` (referencia `.flash`: szaggatott keret, `linear-gradient(140deg, panel, soft)`,
   `min-height: 153px`), a nagy szöveg a téma `--grade-size`-ánál nem kisebb, a felirat 13px.
4. **`tests/lesson-flashcards.spec.ts`** (`/__lesson-runtime-probe?fusion=1&classroom=N`):
   - vendég: Enter / Space / kattintás fordít, az értékelés továbblép, a figyelmeztetés látszik, nincs `/api/lessons/review`
     kérés;
   - bejelentkezve (`page.route` mock): a „Mentve” csak 200 után látszik; 500-nál újrapróbálás;
   - mind az öt téma 390 / 768 / 1440 px-en: nincs kilógás, kontraszt, képernyőkép a `test-results/websuli-design/`-ba.
5. **Kapuk:** tsc, lint, unit, célzott Playwright (workers=1), képernyőkép-ellenőrzés.

## Állapot (2026-10-16)
- **C — kész, mérve:**
  - unit 2036/2036, valódi Postgres DB 38/38 (a 0027-es migráció kétszer fut le);
  - tsc, check:test, lint: tiszta.
  - A kliens állapotot nem küldhet: a `dueAt` mező 400-at ad (HTTP-teszt).
- **C — review #268 (javítva, mérve):**
  - a kártya-azonosító a tartalomhoz kötött; helyben javított lecke DB-teszttel;
  - idempotens újrapróbálás (`requestId`, `review_events.result`, egyedi index);
  - tanulónkénti keret a közös IP-keret helyett;
  - DB 40/40.
- **D — kész, mérve:**
  - Ötödik fül „Ismétlés”, kártyafordítás (kattintás, Enter, Space), „Még gyakorlom” / „Már tudom”.
  - Bejelentkezve `apiRequest` (CSRF-token; mérve: a nyers `fetch` miatt a `client-csrf-guard` teszt bukott). A
    `requestId` újrapróbáláskor változatlan. 409-nél újratöltésre kér, nincs újrapróbálás.
  - Vendégként helyi tárolás, kiírt figyelmeztetéssel, szerverkérés nélkül. Mentés közbeni 401: vendég módra vált, és kiírja,
    hogy az értékelés nem mentődött (a terv szélső esete, önellenőrzésben pótolva).
  - A fülsor a fülek számából dolgozik, és mobilon sem lóg ki. A haladássáv a referencia sínje és főszíne.
  - Mérés:
    - unit 2038/2038; tsc, check:test, lint: tiszta;
    - e2e: lesson-flashcards 9/9, lesson-design 8/8;
    - a lesson-fusion és lesson-band-visual a szóbeli tesztek nélkül 19/19 elindult, hibajelzés nem volt, de a futás
      Windowson nem zárult le (ismert kilépési lefagyás), ezért ez nem bizonyíték; a teljes futást a CI végzi (Linux).
- **D — review #269 (javítva, mérve):**
  - Sikertelen mentés után az értékelőgombok tiltva, csak az „Újrapróbálás” küld, ugyanazzal a `requestId`-val.
  - A vendégállapot kulcsa a stabil leckekulcs (`persistId ?? lessonId ?? mapId`), nem az experience-lenyomat. Így a változatlan
    kártyák javítás után is megtartják az ütemezésüket.
  - A betöltéskori 401 is vendég módra vált, és nem hivatkozik meg nem történt értékelésre.
  - A sikeres mentés a lekérés gyorsítótárát is frissíti.
  - A kártya leírása (`aria-describedby`) az aktuális szöveg; fordításkor a válasz be is jelentődik.
  - A `contentKey` NFC-re normalizál: a kliens a megjelenítéshez NFC-re hozott leckéből, a szerver a tárolt JSON-ból számol, és
    NFD-s regressziós teszt bizonyítja az egyezést.
  - Az e2e órája rögzített. Mérés: lesson-flashcards 10/10.
