# Végrehajtás: Tornado Hunter 200 — `roadFactor` javítása

> Spec: `docs/specs/2026-09-29-tornado-roadfactor.md`. Munkakönyvtár: `source/`. Sorrend kötelező.

## T1 — Új teszt (előbb piros)

Fájl: `tests/tornado-road-factor.test.ts` (új), `node:test` + `node:assert/strict`, import `../client/src/lib/tornado/world.ts`.
1. `LINES = [-1200, -900, …, 1200]` (`-HALF_WORLD + k·ROAD_SPACING`, k = 0..8); `MID = -1050` (cellaközép).
2. A1: minden `L ∈ LINES`: `roadFactor(L, MID) === 1` és `roadFactor(MID, L) === 1`; kereszteződés `roadFactor(0, 0) === 1`.
3. A2: minden cellaközép `(-1050 + 300i, -1050 + 300j)`, i, j = 0..7 → `0`; továbbá `roadFactor(L + 9, MID) === 0`, `roadFactor(L - 9, MID) === 0`.
4. A3: `d = 0, 0.25, …, 12`: `roadFactor(-900 + d, MID)` nem nő; `d < 9` szakaszon szigorúan csökken; `+d` és `-d` oldal egyenlő.
5. A4: `x, z ∈ [-1300, 1300]`, 7 egység lépés → `0 <= r <= 1`.
6. A5: `surfaceAt(x + 0.5, z + 0.5)` 4 egységes rácson a térképen → aszfalt-arány `< 0.30` és `> 0.01`; mező-arány a legnagyobb.
7. A6: `propsInChunk(cx, cz)` a teljes térképen (`cx, cz ∈ [-12, 11]`) → egyik kellék sem `surfaceAt === "asphalt"`; a kellékszám > 0.
Parancs: `node --import tsx --test tests/tornado-road-factor.test.ts` → a javítás előtt A1/A2/A5 bukik.

## T2 — `roadFactor` javítása

Fájl: `client/src/lib/tornado/world.ts`, `roadFactor` (95-103. sor).
1. Új, nem exportált `distToGridLine(v: number): number`: `m = (((v + HALF_WORLD) % ROAD_SPACING) + ROAD_SPACING) % ROAD_SPACING; return Math.min(m, ROAD_SPACING - m);`
2. `roadFactor`: `near = Math.min(distToGridLine(x), distToGridLine(z))`; `halfWidth = 9`; `near >= halfWidth` → `0`; különben `1 - near / halfWidth`.
Parancs: `node --import tsx --test tests/tornado-road-factor.test.ts` → minden `ok`.

## T3 — Színezés-komment

Fájl: `client/src/tornado/buildMeshes.ts`, `buildTerrainChunk` színező ága (`const road = roadFactor(wx, wz);`).
Komment a `const road` sor fölé: `roadFactor` 1 a középvonalon, 0 a 9 egységes félszélességen túl; `> 0.55` aszfalt mag (±4 egység), `> 0.15` földút-padka (±7,6 egység) — ugyanaz a küszöb, mint a `surfaceAt`-ban. Logika változatlan.

## T4 — Verifikáció

1. `npx tsc --noEmit` → 0 hiba.
2. `npx eslint client/src/lib/tornado client/src/tornado --max-warnings 0` → 0.
3. `node --import tsx --test tests/tornado-*.test.ts` → minden `ok`, `fail 0`.
4. Mérés (scratchpad szkript): felület-eloszlás, kellékszám a teljes térképen és a `high` látókörben (520 egység) a (0,0) körül — előtte/utána.
5. Valós böngészős render (`/tornado-hunter-200` vagy a játék útvonala) — ha a helyi szerver indítható; különben NOT RUN + ok.
