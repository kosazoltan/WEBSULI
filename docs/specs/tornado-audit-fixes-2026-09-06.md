# Spec: Tornado Hunter audit-javítások

> Dátum: 2026-09-06 · Szerző: Hermes Agent · Állapot: JÓVÁHAGYVA (tulajdonosi megrendelés)
> Kanban: #203 (WEBSULI) · Ág: `feat/tornado-audit-fixes`
> Forrás: az audit 11 findingje `main@0246368` kódolvasásából.

## 1. Cél

Az auditban feltárt hibákat **egyesével, szeletenként** javítani, TDD-vel:
előbb a megnevezett bukó teszt, mért RED, majd a minimális GREEN, majd
reverz-mutáció. A gyerek (Dominik) a főoldalról eléri a Tornadót, a világ
vezetés közben nem tűnik el, a kvíz nem spammel 18 s után, a kupon-óra egy,
az Esc/C/timeout viselkedés a súgóval egyezik.

## 2. NEM cél

- Nem refaktoráljuk a 3D jelenetet, a járműkatalógust, a 200 szintet.
- Nem kötjük be a `claimBonus`-t a másik 4 kupon-játékba (külön slice, #175).
- Nem adunk kontrollert / 160 külön 3D modellt (spec out-of-scope).
- Nem nyúlunk Lesson Studio pipeline-hoz.

## 3. Szeletek (függetlenül elutasítható egységek)

### S1 — Chunk dispose nem öli a megosztott geometriát (audit #1)

**Hiba:** `streamChunks` unload-kor `child.geometry.dispose()` a cache-elt
prop-geometrián (`geo("house-w")` stb.). A terep saját PlaneGeometry-je
törölhető.

**Javítás:** `buildMeshes.ts` exportáljon `isSharedGeometry(g)` /
`SHARED_GEO_KEYS`, a chunk-unload CSAK a nem-megosztott geometry-t
dispose-olja. A terep-chunk (`userData.perScene` + saját geo) marad
dispose-olható.

**Teszt:** `tests/tornado-chunk-dispose.test.ts`
- `a cache-elt prop-geometria megosztottnak számít`
- `a terep-chunk saját PlaneGeometry-je NEM megosztott`
- `disposePropSafe csak a nem-megosztottat hívja` (mock/spy a dispose-on)

**Parancs:** `node --import tsx --test tests/tornado-chunk-dispose.test.ts`

### S2 — Kvíz-sorsolás egyszer / gap, nem frame-enként (audit #2)

**Hiba:** `randomQuizDue` minden rAF-en fut 18 s után → kumulált esély.

**Javítás:** új tiszta helper `shouldFireRoamQuiz({ elapsed, lastQuizAt, rng, alreadyPending })`
ami (a) pending kvíznél soha, (b) a min-gap alatt soha, (c) a max-gap felett
EGY dobást enged, utána `lastQuizAt`-ot a hívó frissíti. A rAF ezt hívja.

A meglévő `randomQuizDue` marad a „egyszeri dobás" modell, de a frame-hurok
NEM hívhatja 60× másodpercenként anélkül, hogy a helper a lastQuizAt-ot
előre ne léptetné egy sikertelen dobáskor is? **Döntés:** sikertelen dobáskor
`lastQuizAt` NEM lép — de a helper **cooldown-t** tart: egy értékelés / N
másodperc (`QUIZ_EVAL_INTERVAL_SEC = 1`). Így 18 s után max ~1 dobás/sec,
nem 60.

**Teszt:** `tests/tornado-questions.test.ts` bővítés:
- `shouldFireRoamQuiz 18 s alatt soha, 60 hívásból 0`
- `shouldFireRoamQuiz a sávban max 1 igaz / másodperc (60 hívás 0.5 s alatt ≤1)`
- `shouldFireRoamQuiz pending=true esetén soha`
- `shouldFireRoamQuiz max-gap felett az első eval-tick-en igaz`

**Parancs:** `node --import tsx --test tests/tornado-questions.test.ts`

### S3 — Főoldali kártyák: Aszteroida + Tornado (audit #3, #11)

**Hiba:** `HomePracticeGames` 5 játékot listáz; a `/games` 7-et.

**Javítás:** két kártya (space-asteroid-quiz, tornado-hunter-200), a rács
`xl:grid-cols-6` (vagy 4+3 wrapping — a 7 kártya `xl:grid-cols-4` maradhat,
nem kell 7 oszlop). Teszt: parse-guard, hogy a fájl tartalmazza a két href-et.

**Teszt:** `tests/home-practice-games-catalog.test.ts`
- `a főoldali gyakorló lista tartalmazza a 7 játszható játék href-jét`
- `tornado-hunter-200 és space-asteroid-quiz benne van`

**Parancs:** `node --import tsx --test tests/home-practice-games-catalog.test.ts`

### S4 — Egy kupon-óra (audit #4)

**Hiba:** `useCouponSession` a szülőben ÉS a PlayScreen-ben.

**Javítás:** a szülő átadja `coupon`-t a PlayScreen-nek propként; a gyerek
hook-hívása törlődik. Parse-guard: a fájlban pontosan 1 `useCouponSession(` hívás.

**Teszt:** `tests/tornado-wiring-guard.test.ts`
- `TornadoHunter200.tsx pontosan egy useCouponSession( hívást tartalmaz (kommentek nélkül)`

**Parancs:** `node --import tsx --test tests/tornado-wiring-guard.test.ts`

### S5 — C kamera, Esc pause, timeout cleanup (audit #5, #6, #7)

**Hiba:** C nincs bekötve; Esc kilép; setTimeout unmount után finishRun-t hív.

**Javítás:**
- `case "c"`: `settings.cameraMode` chase ↔ cockpit (progress.updateSettings +
  settingsRef).
- Esc: ha `play` fázisban van, `paused` flag (új PlayPhase vagy `pausedRef`);
  második Esc / gomb = tényleges onExit. Overlay: „Folytatás / Szintek".
- Minden `window.setTimeout` a PlayScreen-ben `timeoutsRef`-be, unmountkor
  `clearTimeout` (SpaceAsteroidQuiz mintája).

**Teszt:** `tests/tornado-wiring-guard.test.ts` bővítés:
- `a keydown handler tartalmazza a case "c"`
- `a PlayScreen unmount cleanup clearTimeout-ot hív (timeoutsRef minta)`
- `Esc nem hívja azonnal az onExit-et a play fázisban` — tiszta helper
  `escAction(phase) → "pause" | "exit" | "noop"`

Új tiszta modul: `client/src/lib/tornado/controls.ts`
- `toggleCamera(mode)` chase↔cockpit
- `escAction(phase)` : seeking/approach/quiz → pause; result_* → exit; paused → exit
- `shouldClearTimeoutsOnUnmount` dokumentált szerződés a guard tesztnek

**Parancs:** `node --import tsx --test tests/tornado-controls.test.ts tests/tornado-wiring-guard.test.ts`

### S6 — Mobil kamera-gomb (audit #8)

**Javítás:** TouchControls kap egy kamera-gombot, `onCamera` callback.
Parse-guard: a TouchControls JSX-ben van kamera-címke.

**Teszt:** wiring-guard: `TouchControls` propjai között `onCamera`.

## 4. Elfogadási kritériumok (EARS)

- WHEN egy chunk unloadolódik THEN the system SHALL NOT dispose a
  `geo()`/`mat()` cache-elt BufferGeometry-t.
- WHEN 18 s eltelt a kvíz óta AND a hurok 60×/s hív THEN the system SHALL
  legfeljebb 1 kvíz-értékelést végezni másodpercenként.
- WHEN a főoldal renderelődik THEN the system SHALL linkelni
  `/games/tornado-hunter-200` és `/games/space-asteroid-quiz`.
- WHEN a Tornado oldal mountolódik THEN the system SHALL pontosan egy
  `useCouponSession` példányt indítani.
- WHEN a játékos C-t nyom THEN the system SHALL chase↔cockpit-ot váltani.
- WHEN a játékos Esc-et nyom seeking/approach közben THEN the system SHALL
  szüneteltetni, nem kilépni.
- WHEN a PlayScreen unmountolódik THEN the system SHALL minden pending
  timeoutot törölni.

## 5. Tesztterv (kötelező, Coder RED először)

| Fájl | Parancs | Várott RED |
|---|---|---|
| `tests/tornado-chunk-dispose.test.ts` | `node --import tsx --test tests/tornado-chunk-dispose.test.ts` | missing export / assertion |
| `tests/tornado-questions.test.ts` (új case-ek) | ugyanaz a fájl | `shouldFireRoamQuiz is not a function` |
| `tests/home-practice-games-catalog.test.ts` | `node --import tsx --test tests/home-practice-games-catalog.test.ts` | href hiányzik |
| `tests/tornado-controls.test.ts` | `node --import tsx --test tests/tornado-controls.test.ts` | missing module |
| `tests/tornado-wiring-guard.test.ts` | `node --import tsx --test tests/tornado-wiring-guard.test.ts` | 2× useCouponSession / nincs case "c" |

Reverz-mutációk (mindegyik PIROS kell legyen):
m1 `disposePropSafe` mindig dispose-ol; m2 eval-interval 0; m3 tornado href törlése;
m4 második useCouponSession vissza; m5 case "c" törlése; m6 escAction mindig exit.

## 6. Kapuk a végén

`npm run check && npm run lint && npm run check:test && npm test && npm run build`
Playwright: `tornado-hunter-render.spec.ts` + a meglévő e2e.

## 7. Kockázat

Chunk-dispose viselkedés Three.js-függő; a teszt a **döntési függvényt** méri
(`shouldDisposeGeometry`), nem a GPU-t. A rAF-spam a tiszta helperen mért.
Főoldali kártya vizuális ellenőrzése Playwright/screenshot a S3 után.
