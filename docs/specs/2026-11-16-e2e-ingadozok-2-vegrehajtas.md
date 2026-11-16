# Végrehajtási utasítás — E2E-ingadozók, 2. kör (kanban #58)

**Állapot:** folyamatban – 2026-11-16, ág `fix/e2e-ingadozok-2`
**Terv:** `docs/specs/2026-11-16-e2e-ingadozok-2.md`

## Fájlok

- 1: `source/tests/joystick-response.spec.ts`.
- 2: a gyökérok szerint (Szökőár lap / teszt) — a mérés után rögzítve lent.
- 3 (közös réteg): `source/client/src/game-engine/CouponHud.tsx`, `game-engine/mobile/modalLayer.ts`,
  `game-engine/mobile/autoPause.ts`, `game-engine/mobile/PauseMenu.tsx`; teszt: `source/tests/coupon-expired-all-games.spec.ts`.
- `docs/specs/2026-11-16-e2e-ingadozok-2*.md`.

## Lépések

1. `ensurePlaying`: egyetlen `page.evaluate` (kártya, kvíz, tárcsa láthatósága); csak eltérésnél `clearQuiz` / új kör.
2. Szóbank-napló: ismétlés SwiftShaderrel, trace hibánál; a hipotézisek célzott kísérlete; javítás a gyökérnél;
   determinisztikus teszt.
3. Lejárt kupon: ideiglenes mérő (rAF / `probe()` / HUD 3 s alatt, előtte és utána) az 5 kuponos játékon; közös
   javítás: `modalLayer` `GAME_HALT_EVENT` + `setCouponExpired` / `useCouponExpired`; `attachAutoPause` a halt-eseményre is
   szünetet kér; `CouponExpiredOverlay` lejáratkor beállítja és kiváltja; `PauseMenu` `open && !couponExpired`.
   e2e: a „lejáratkor a játék megáll” elvárás mind az 5 kuponos játékra.
4. Ellenőrzés: `lint`, `check`, `check:test`, `test`, `build`, a mobil mérő 7 játékra, coupon / joystick / vocab
   ismétléssel; CI.

## Parancsok

```bash
cd source
node --import tsx scripts/run-e2e-tests.ts tests/coupon-expired-all-games.spec.ts
node --import tsx scripts/run-e2e-tests.ts tests/game-mobile-quality.spec.ts
node --import tsx scripts/run-e2e-tests.ts tests/joystick-response.spec.ts -g block-craft --repeat-each 10
node --import tsx scripts/run-e2e-tests.ts tests/vocab-cross-game-log.spec.ts --repeat-each 20
```

SwiftShaderhez ideiglenes, nem commitolt konfiguráció (`--disable-gpu --use-gl=swiftshader`).

## Mérés

A CI útja (buildelt szerver, eldobható Postgres, 1 worker, újrapróba nélkül), SwiftShader, Windows x64. A gép közben
más ügynökök e2e-futásait is vitte (két eldobható konténer egyszerre) — ez terhelés alatti mérés.

### 1. joystick-response › block-craft-quiz
- A #470 utáni spec (archivált `ensurePlaying`-javítással): 12/12 zöld, 2,1–2,5 perc / eset terhelés alatt (a 180 s-os
  keret ~80%-a); a #470-es és a #470 előtti spec kisebb terhelésnél 1,1–1,2 perc volt.
- A kevesebb hívásos változat, váltakozó A/B ugyanabban a futásban (SwiftShader, 8–8×): az új 56–60 s, a #470-es
  (66b67317) 72–84 s / eset — ~25%-kal kevesebb, mindkettő 8/8 zöld. Külön 10× futásban 9/10 zöld; az egy bukás
  „a mozgás-események többlet-renderje a lapon” (8 > 6) — a render-szám mérése, amelyhez ez a változás nem nyúl
  (a tartás alatti szakasz azonos); hogy a régi specben is előfordul-e: UNVERIFIED (a régi 8 futásában nem jött elő).
- A PR CI-je (run a fix/e2e-ingadozok-2 ágon): a teljes E2E 726 passed, 0 flaky.

### 2. vocab-cross-game-log (Szökőár-szakasz)
- CI-tények: a bukott kísérletekben a kvíz a hiba pillanatában már zárva, a válasz beszámított („Cél 1/6”, „3/6”, „4/6”),
  a zárásig eltelt poll-idők 7,9 s / 9,6 s / > 10 s — a Szökőár saját kvíz-ütemének (~9,5 mp) nagyságrendje.
- Célzott kísérlet (2×): `count()` = 1 → a kvíz bezárul → a régi `innerText()` 5385 / 5750 ms-ig vár, és a KÖVETKEZŐ kvíz
  szövegét adja („Számold ki: …”). A hipotézis megerősítve: a poll-függvény két lépése közötti zárás.
- CPU-lassítással (6×) a régi teszt 24/24 kérdésen nem bukott (a versenyablak a hívás-időzítésen múlik); a javítás az
  ablakot megszünteti (atomi `page.evaluate`).
- Ismétlés a javítással (SwiftShader, 10×): 10/10 zöld; a PR CI-jében a teljes E2E 726/726 zöld, flaky nélkül.

### 3. A lejárt kupon (rAF-hívás 3 s alatt, a lejárat után; HUD-szöveg előtte → utána)

| játék | előtte | utána |
| --- | --- | --- |
| Kockavadász (#470) | 0, az óra áll | 0, az óra áll |
| Szökőár | 184–199, pont 36 → 45, víz 37 → 36 m | ~180 (csak a lap framer-motion díszítő animációi; WebGL-rajzolás 0), a HUD áll |
| Brain Rot | 156–198, óra 86 → 83 mp | 0, a HUD áll |
| Aszteroida | 113–131, óra 356 → 353 mp | 0, a HUD áll |
| Viharvadász | 228–243, idő 299 → 296 s, táv 3,34 → 3,30 km | 0, a HUD áll |

Forrás a javítás előtt (rAF-hívási hely): `useThreeScene` (Szökőár, Brain Rot), az Aszteroida és a Viharvadász saját
render-hurka, a Szökőárban a framer-motion képkocka-hurka is.

Mutációs próba: a közös javítás visszavonva az új e2e („nincs rajzolás, a HUD áll”) 4/5 bukik (a Kockavadász a #470 óta
magától áll) — „a lejárt párbeszéd alatt a rajzolás leáll”.

Ismétlés a javítással (coupon-spec 11 eset × 10, SwiftShader): 110/110 zöld. Közös mobil mérő mind a 7 játékra + joystick 4 játék (GPU): 222/222 zöld. A PR CI-je: 726 passed, 0 flaky.
