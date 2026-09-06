# Spec: Galaktikus Aszteroida — fizika, irányítás, grafika turbó

> Dátum: 2026-09-06 · Ág: `feat/asteroid-physics-turbo` · Kanban: WEBSULI #205
> Osztály: M (tiszta fizika-modul + page wiring + touch)

## Mért jelenlegi állapot (forrás: `SpaceAsteroidQuiz.tsx`)

Ez **shmup** (Galaga/1942), nem klasszikus wrap-Asteroids. A turbó a meglévő
műfajt javítja, nem cseréli.

| # | Finding | file:sor | Hatás |
|---|---|---|---|
| 1 | Átló: `mx` és `my` külön szorzódik, nincs normalizálás | `:1141-1147` | 1.41× gyorsabb átlósan |
| 2 | Nincs tehetetlenség: `x += dir * SPEED * dt` | `:1146` | Digitális start/stop |
| 3 | `touchRef` csak left/right/up/fire | `:686`, `:2234-2270` | Mobil: nincs le |
| 4 | Spawn `spawnAt + interval < lastTime/1000` (fali óra) | `:1188-1190` | Kvíz után burst |
| 5 | Hasadás: gyerek örökli a `vy`-t + kis zaj | `:1568-1569` | Nem repül szét, esik tovább |
| 6 | Minden ellenség 3 tengelyen forog | `:1801` | Vadász/alien bukfencezik |
| 7 | Csillagmező `1/60`, nem `dt` | `:1756` | FPS-függő sodrás |
| 8 | Játékos Y: alsó ~4.8 egység a 24-ből | `:1149` | Alig van függőleges játék |

Ami **jó** (nem nyúlunk hozzá): dt cap 0.05; kör-ütközés; kvíz-pause leállítja a
tick-et; boss 3 fázis; bomba combo-exploit javítva; blur billentyű-reset.

## Cél

Tiszta, tesztelhető fizika-modul (`client/src/lib/spaceAsteroid/physics.ts`),
a page csak hívja. Érezhetően jobb: tehetetlenség, átló 1.0×, mobil le, kvíz
után nincs spawn-roham, hasadt sziklák szétrepülnek, hajók nem bukfenceznek.

## Nem-cél

- Wrap-around Asteroids-klónná alakítás.
- Új Three.js modell / textúra / shader.
- Kvíz-bank, kupon, hullámszám, XP-tábla átírása.
- Gamepad.

## Döntések

1. **Normalizált input + gyorsulás.** `len>1 → /len`. `vx += ax*ACCEL*dt`,
   `speed = hypot(vx,vy)` clamp `MAX_SPEED`. Nincs input → `vx *= FRICTION^dt`.
2. **Játékos Y-sáv** a pálya alsó **40%-a** (`PLAYER_Y_MIN`…`PLAYER_Y_MAX`),
   nem a korábbi ~20%.
3. **Spawn elapsed.** `gameElapsedSec` csak play-tickben nő. A spawn
   `lastSpawnAt` ehhez viszonyít — kvíz alatt az óra áll.
4. **Hasadás.** Két gyerek: szülő sebesség + merőleges ±kick, `vy` nem lehet
   meredekebb mint `SPLIT_VY_FLOOR` (ne zuhanjanak ki 0.3 s alatt).
5. **Facing.** rock/crystal/boss: szabad rotáció. alien: csak Z (korong).
   fighter: orr lefelé (`rotation.x = π` lock, Z enyhe tilt a `vx` felé).
6. **Csillagmező** `STAR_SCROLL * dt`.
7. **Touch:** 5. gomb „Le”, `touchRef.down`.

## Elfogadás (EARS)

- Átlós input 1 s alatt ugyanakkora elmozdulás mint a tengely szerinti
  (`hypot(dx,dy)` ≤ tengely * 1.02).
- Nincs input: a sebesség 0.4 s alatt < 15%-a a maxnak (súrlódás).
- `spawnReady(elapsed=10, lastSpawn=0.1, interval=1)` kvíz-pause után
  (elapsed nem nőtt) → false, amíg elapsed < last+interval.
- `splitRock` két gyerek `vx` ellentétes előjelű (szétrepülés).
- `enemyRenderSpin("fighter")` nem ad X/Y pörgést.
- A page (komment nélkül) hívja `integratePlayer`, `spawnReady`,
  `splitRock`, `starScrollY`; a touch-sáv tartalmazza a `"down"` holdot.

## Nevesített RED

```
node --import tsx --test tests/space-asteroid-physics.test.ts tests/space-asteroid-wiring-guard.test.ts
```
