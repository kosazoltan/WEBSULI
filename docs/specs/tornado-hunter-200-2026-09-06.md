# Spec: Tornado Hunter 200 — 3D storm-chasing játék

> Dátum: 2026-09-06 · Szerző: Hermes Agent (tulajdonosi leírás alapján) · Állapot: JÓVÁHAGYVA (tulajdonosi megrendelés)
> Kanban: #200 (WEBSULI) · Ág: `feat/tornado-hunter-200`

## 1. Cél

A tulajdonos átadott játékleírásából egy 7. játék a WEBSULI játékkatalógusban:
`tornado-hunter-200`. A gyerek járművet választ, beleveti magát egy szabadon
bejárható 3D viharvadász-világba, felkutatja a tornádót, biztonságos távolságban
lehorgonyoz — és a **pontok osztásakor a rendszer teljesen autonóm, véletlen módon
matek- vagy angolkvízt dob fel**, aminek helyes megválaszolásától függ a horgonyzás
sikere. A játék a tananyag keretein belül marad: a kvízek elsődlegesen a gyerek
osztályához kötött tananyag-kvízbankból jönnek (`/api/games/material-quizzes`),
és csak hiány esetén a beépített, osztályszintre szabott matek/angol bankból.

A többi játékkal (Space Asteroid, BlockCraft) **azonos technológia és
architektúra**: React oldal + Three.js jelenet, tiszta (DB-mentes, tesztelhető)
logikai modulok a `client/src/lib/tornado/` alatt, kupon-motor, achievement,
daily challenge, felhő-ranglista.

## 2. NEM cél (out of scope)

- Nem nyúlunk a Lesson Studio pipeline-hoz (`server/studio/*`) a
  `COUPON_GAME_IDS` bővítésén túl.
- Nincs új szerver-endpoint. A meglévő `/api/games/*` felület elég.
- Nincs valódi 160 külön 3D modell: 5 kategóriához 5 procedurális mesh-építő
  tartozik, kategóriánként generált színsémával/arányokkal — a leírás
  „saját modell" pontja ezen a szinten teljesül (a többi játék is procedurális).
- Nincs fizetős/valódi pénz: a Storm Coin kizárólag játékbeli, `localStorage`.
- Nincs kontroller-(gamepad)-API integráció ebben a szeletben; PC-billentyűzet +
  mobil érintés van (a többi játék is így működik). A leírás kontroller-fejezete
  későbbi szeletre marad, dokumentáltan.
- A meglévő 6 játék viselkedése nem változik (csak katalógus/unió-típus bővül).

## 3. Érintett területek

Új, tiszta logika (node:test-tel tesztelhető, React/Three nélkül):

| Fájl | Tartalom |
|---|---|
| `client/src/lib/tornado/vehicles.ts` | 160 jármű determinisztikus generálása, ritkaság, ár, statok, feloldási szint |
| `client/src/lib/tornado/levels.ts` | 200 szint, 9 nehézségi szakasz, tornádó-paraméterek, jutalom |
| `client/src/lib/tornado/questions.ts` | kvízbank (math/english), osztályszint-választó, AUTO-leképezés, autonóm random húzás |
| `client/src/lib/tornado/wind.ts` | szélsebesség/-irány modell (km/h), távolságfüggés, széllökés |
| `client/src/lib/tornado/scoring.ts` | pontozás, Storm Coin jutalom, horgony-siker feltétel |
| `client/src/lib/tornado/upgrades.ts` | 6 fejlesztési sáv, szintek, ár, hatás |
| `client/src/lib/tornado/progress.ts` | mentett állapot (SC, birtokolt járművek, fejlesztések, highscore, statisztika) tiszta reducerrel |
| `client/src/lib/tornado/world.ts` | determinisztikus (seedelt) világ-elrendezés: utak, farmok, erdők, folyó, dombok |

3D + UI:

| Fájl | Tartalom |
|---|---|
| `client/src/tornado/buildMeshes.ts` | Three.js mesh-építők (jármű kategóriánként, tornádó, terep, épület, fa, út) |
| `client/src/pages/TornadoHunter200.tsx` | oldal: menü, Storm Garage, szintválasztó, beállítások, HUD, játék, kvíz-overlay, highscore, statisztika |

Wiring (meglévő fájlok, minimális diff):

- `client/src/App.tsx` — lazy route `/games/tornado-hunter-200`
- `client/src/pages/Games.tsx` — katalógus-kártya, ikon, akcent, `PLAYABLE_IDS`, fallback sor
- `client/src/lib/achievements.ts` — `RunStats.game` unió + `tornado` kategória + jelvények
- `client/src/lib/dailyChallenge.ts` — `DailyGameId` + `DAILY_GAMES` sor
- `client/src/components/ParentDashboardPanel.tsx` — `GAME_META` sor
- `server/gameQuizBankService.ts` — `ALLOWED_GAME_IDS`
- `server/studio/quiz-export.ts` — `COUPON_GAME_IDS`
- `migrations/0012_games_catalog_tornado_hunter.sql` — `games_catalog` sor (FK-feltétel!)
- `tests/audit-2026-09-static.test.ts` — a migrációs lista + id bővítése

## 4. Rögzített döntések és kényszerek

1. **Játék-azonosító:** `tornado-hunter-200`. Ez a `games_catalog.id`; a
   `game_scores.game_id` és `game_quiz_items.game_id` FK-ja erre mutat, ezért a
   migráció NÉLKÜL minden pontküldés 23503-mal némán elveszne (#0007 tanulsága).
2. **Grafika: szándékosan egyszerű.** Nem fotorealisztikus: lapos színek,
   `MeshLambertMaterial`/`MeshStandardMaterial` alacsony részletességgel,
   `flatShading`, instanced/megosztott geometria, árnyék alapból KI.
   Három minőségi profil (LOW/MEDIUM/HIGH) a részecske- és objektumszámot,
   a pixelratiót és a látótávolságot (fog) állítja.
3. **Teljesítmény-kényszer:** a `world.ts` a világot **chunk-alapú, seedelt**
   módon írja le, a jelenet csak a játékos körüli sugárban tart mesh-t
   (`WORLD_VIEW_RADIUS`). A tornádó részecskeszáma minőségfüggő
   (LOW 140 / MEDIUM 280 / HIGH 520).
4. **Kvíz-forrás sorrend:** (a) `/api/games/material-quizzes?classroom=N` sorok,
   (b) beépített `MATH_BANK` / `ENGLISH_BANK` az adott osztályszintre.
   A tananyagból jövő kérdés élvez elsőbbséget — „a tananyag keretein belül".
5. **Autonóm kvízdobás:** minden pontosztási eseménynél (horgonyzás) fut, és
   **ezen felül** a szabad vezetés közben is, véletlenszerű időzítéssel
   (`randomQuizDue`), determinisztikus RNG-vel tesztelve. A kvíz TÍPUSA
   (math/english) a School Level menü szerint: Math / English / Mixed — Mixed
   esetén random. Az OSZTÁLY az AUTO leképezés szerint a szintből jön, ha a
   választó AUTO.
6. **AUTO leképezés (leírás szerint, kötelező):**
   1–30 → 1–2. o.; 31–70 → 2–3. o.; 71–110 → 3–4. o.; 111–150 → 4–5. o.;
   151–180 → 5. o.; 181–200 → 6. o.
7. **Nehézségi szakaszok (leírás szerint, kötelező):** 1–25 Light Storm,
   26–50 Beginner, 51–75 Advanced, 76–100 Pro, 101–125 Expert, 126–150 Master,
   151–175 Extreme, 176–199 Legendary, 200 THE ULTIMATE STORM.
8. **Ritkasági ársávok (leírás szerint, kötelező):** Common 500–2 500,
   Uncommon 2 500–7 500, Rare 7 500–20 000, Epic 20 000–50 000,
   Legendary 50 000–150 000, Ultimate 150 000–500 000 SC.
9. **Rögzített (nevesített) járművek** a leírás ártáblájával, pontosan:
   TIV 2 = 15 000, Dominator 3 = 25 000, Stormrunner S1 = 2 500,
   Cyclone X = 8 500, Tempest R = 18 000, Stormforce 4 = 45 000,
   Vortex M = 28 000, Thunderhawk = 35 000, Hurricane GT = 60 000,
   Stormtank = 75 000, Tornado-X = 110 000, Cyclone Titan = 200 000.
   A maradék 148 jármű determinisztikusan generált (fix névtő-listákból),
   de mindegyik a saját ritkasági sávjába eső árral.
10. **Storm Coin ≠ Highscore.** Két külön szám, külön mentéssel, ahogy a leírás
    17. pontja előírja.
11. **Mentés:** `localStorage` kulcs `websuli.tornado.v1` (mint a többi játék
    lokális állapota), séma-verzióval és korrupt-adat elleni védelemmel.
12. **Szélsebesség km/h-ban**, HUD-on folyamatosan; a modell adatai:
    `currentWindSpeed`, `maximumWindSpeed`, `windDirection` (8 égtáj + nyíl),
    `windGusts`, `stormIntensity`, `tornadoIntensity`.
13. **Kupon-motor kötelező** (`useCouponSession` + `CouponHud` +
    `CouponExpiredOverlay`), ahogy a 4 kupon-motoros játékban, és a helyes
    kvízválasz `claimBonus(quizItemId)`-t hív, ha a kérdés tananyagból jött
    (van `id`-ja).
14. **Nyelv:** a felhasználói felület magyar; a kód-azonosítók és a kommentek
    angolok, a repo mai konvenciója szerint vegyes — az új tiszta modulok
    kommentjei angolul, a UI-szövegek magyarul.

## 5. Edge case-ek

- **Nincs hálózat / üres tananyagbank** → `material-quizzes` üres tömb,
  a játék a beépített bankra vált, és ezt a HUD-on jelzi (nem hiba).
- **Korrupt `localStorage`** (kézzel írt JSON, régi séma) → `loadProgress()`
  védve, default állapotra esik vissza, nem dob.
- **Nem elég SC vásárláshoz** → a vásárlás visszautasít (`ok:false`), egyenleg
  nem megy negatívba.
- **Zárolt jármű megvétele** (feloldási szint > elért szint) → visszautasít.
- **Dupla horgonyzás / dupla válasz** → válasz-lock, ahogy a SpeedQuizMath-ban:
  a kvíz feldolgozása csak `answerState === "idle"` esetén fut.
- **Rossz válasz** → a horgonyzás sikertelen, ÚJRA lehet próbálni (leírás 10.),
  a tornádó közben tovább mozog; nincs életvesztés, csak pontlevonás-mentes
  újrapróba (`anchorAttempts` nő, a pontszorzó csökken).
- **Tornádó elhalad, mielőtt horgonyoznánk** → a szint sikertelen, újraindítható.
- **Unmount játék közben** → `cancelAnimationFrame`, `ResizeObserver.disconnect`,
  minden geometry/material/texture `dispose()`, timeoutok törlése.
- **Csökkentett mozgásigény** (`prefers-reduced-motion`) → kamera-rázás kikapcsol.
- **200. szint** — külön, legnehezebb paraméterkészlet; a `levels.ts` garantálja,
  hogy a 200. szint minden nehézségi mutatója maximum.

## 6. Elfogadási kritériumok (EARS)

- WHEN a `vehicles.ts` betöltődik THEN the system SHALL pontosan 160 járművet
  adni, egyedi `id`-val és névvel, mind az 5 kategóriában legalább 10 darabbal.
- WHEN egy jármű ritkasága R THEN the system SHALL az árát az R sávján belül
  tartani (határok zárva), és a 12 nevesített jármű árát pontosan a leírás
  szerint adni.
- WHEN a `levels.ts` betöltődik THEN the system SHALL pontosan 200 szintet adni,
  a leírás 9 szakaszhatárával, monoton nem-csökkenő nehézséggel, és a 200. szint
  SHALL a legmagasabb tornádó-intenzitású.
- WHEN a School Level AUTO és a szint N THEN the system SHALL a leírás
  AUTO-táblája szerinti osztályt választani.
- WHEN a pontosztás megtörténik THEN the system SHALL kvízt feldobni, és a
  horgonyzás sikere SHALL a válasz helyességétől függeni.
- WHEN a válasz hibás THEN the system SHALL új kvízt adni és a horgonyzást
  újra engedni (a szint nem bukik el azonnal).
- WHEN a játékos távolsága a tornádótól csökken THEN the system SHALL a
  `currentWindSpeed`-et monoton növelni, és a `maximumWindSpeed` SHALL a futás
  legnagyobb mért értéke lenni.
- WHEN sikeres intercept történik THEN the system SHALL Storm Coint ÉS pontot
  adni, a kettőt külön tárolva, és a következő szintet feloldani.
- WHEN a játékosnak nincs elég SC THEN the system SHALL a vásárlást
  visszautasítani és az egyenleget változatlanul hagyni.
- WHEN a HUD renderel THEN the system SHALL megjeleníteni: szint (N/200),
  vihar-fokozat, szélsebesség km/h, szélirány nyíllal, távolság km-ben,
  horgony-állapot, jármű neve, Storm Coin, pontszám.
- WHEN a `/games/tornado-hunter-200` útvonalra navigálunk THEN the system SHALL
  a játékoldalt rendereli (nem 404).
- WHEN a `games_catalog` migráció lefut THEN the system SHALL tartalmazni a
  `tornado-hunter-200` sort (FK-feltétel a pontküldéshez).

## 7. Tesztterv

Node:test (gate: `npm test`):

| Teszt | Bizonyítja |
|---|---|
| `tests/tornado-vehicles.test.ts` | 160 db, egyedi id/név, ritkaság-ársávok, a 12 nevesített ár, kategória-eloszlás, feloldási szint 1..200 |
| `tests/tornado-levels.test.ts` | 200 szint, szakaszhatárok, monotonitás, 200. szint a legnehezebb, jutalom nő |
| `tests/tornado-questions.test.ts` | AUTO-leképezés minden határon, math/english/mixed szűrés, kérdés-alak (4 opció, helyes index), tananyag-kérdés elsőbbsége, autonóm random dobás determinisztikus RNG-vel |
| `tests/tornado-wind-scoring.test.ts` | szél távolság-monotonitása, max-tartás, égtáj-nyíl leképezés, pontozás összetevői, SC-jutalom, horgony-siker feltétel |
| `tests/tornado-progress.test.ts` | vásárlás fedezettel/anélkül, zárolt jármű, fejlesztés-lépcső és -ár, SC≠score, statisztikák akkumulációja, korrupt storage |
| `tests/audit-2026-09-static.test.ts` (bővítés) | a `games_catalog` migráció tartalmazza az új id-t |

Kapuk: `npm run check`, `npm run lint` (0 warning), `npm run check:test`,
`npm test`, `npm run build`. Playwright e2e: a meglévő suite nem regresszálhat.

Reverz-mutáció (kötelező, minden új kapura): legalább 6 mutáció, mindegyiknek
PIROSRA kell váltania a suite-ot:
m1 jármű-darabszám 160→159; m2 ársáv-plafon megemelése egy nevesített járműnél;
m3 AUTO-határ elcsúsztatása (181→182); m4 szél-monotonitás megfordítása;
m5 vásárlás fedezet-ellenőrzésének kivétele; m6 200. szint intenzitásának
csökkentése; m7 a migrációs id törlése.

## 8. Kockázatok / visszavonási terv

- **Bundle-méret:** a `three` már dependency (2 játék használja), a
  Tornado-oldal lazy route → a fő bundle nem nő. Ellenőrzés: `npm run build`
  után a fő chunk mérete nem ugrik.
- **Mobil teljesítmény:** LOW profil alapértelmezett kis képernyőn
  (`window.innerWidth < 820` vagy `devicePixelRatio > 2 && coarse pointer`).
- **FK-hiba:** ha a Neon-migráció nem futott le, a pontküldés 400/23503-at ad —
  a játék ilyenkor is játszható, csak a felhő-ranglista marad el (a meglévő
  `.catch()` ág kezeli).
- **Visszavonás:** a szelet egyetlen ágon van, a route és a katalógus-sor
  eltávolításával a játék elrejthető; a migráció additív (`ON CONFLICT DO NOTHING`),
  visszavonása nem szükséges.
