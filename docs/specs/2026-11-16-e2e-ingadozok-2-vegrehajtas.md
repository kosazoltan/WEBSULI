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

(a futások után kitöltve)
