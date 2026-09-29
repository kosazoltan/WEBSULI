# Végrehajtási utasítás — Tornado út + kormányzás (ügynöknek)

Spec: `docs/specs/2026-09-29-tornado-ut-kormanyzas.md`. Munkakönyvtár: a munkafa `source/` mappája.
Tesztfuttatás: `node --import tsx --test tests/<fájl>.test.ts`. Sorrend kötelező; minden új teszt előbb
a régi kódon fut, és a bukást a kimenettel kell igazolni (E8).

## T1 — Új teszt: tárgyak távolsága az úttól (bukik a régi kódon)
Fájl: `source/tests/tornado-prop-clearance.test.ts`.
1. Bejárja a térkép összes chunkját (`cx, cz ∈ [−13, 12]`), minden `propsInChunk` tárgyra a
   `collidersForProp` minden ütközőjének világtengely menti fél-kiterjedését számolja (kör: r; doboz:
   `hx|cos θ| + hz|sin θ|` x-re, `hx|sin θ| + hz|cos θ|` z-re), és a legközelebbi útvonaltól
   (`−1200 + 300k`) mért távolságból levonja. Elvárás: minden érték ≥ `ROAD_HALF_WIDTH + 1.5`.
   Hibaüzenetben az átfedések száma és az első 5 példa.
2. Ugyanez a `propFootprint`-tal (bokor is), és: minden ütköző ⊆ lábnyom (mindkét tengelyen a
   kiterjedés ≤ a lábnyomé + 1e-9).
3. Determinizmus: két hívás mély-egyenlő; minden tárgy `chunkCoordsFor(x, z)` = a saját chunkja.
4. `PROP_ROAD_CLEARANCE === ROAD_HALF_WIDTH + 1.5`.
Futtatás a régi kódon → elvárt: az 1. teszt 325 átfedéssel bukik, a 2.–4. importhiba miatt bukik.

## T2 — Új teszt: analóg érintés, tempó, részlépés, kamera (bukik a régi kódon)
Fájl: `source/tests/tornado-touch-drive.test.ts`.
1. `touchDriveInput` (controls.ts): nulla vektor → {0,0}; 20°-os, 0,88 nagyságú vektor → |steer| < 0,15
   és throttle = 1; 45° → 0,3 < steer < 0,7; 90° → steer = 1, throttle = 0; lefelé → throttle = −1;
   monoton a szögben (0..90° lépésenként nem csökken); a kimenet mindig [−1, 1].
2. Fej nélküli vezetés (a spec H2 modellje, 12 mag, 60 és 30 Hz), `joystickVector` → leképezés →
   `stepVehicle` (+ `driveSubsteps`), a régi négyirányú bontással (`joystickToDirections`) összevetve,
   a spec E3 szerint: (a) korrekció nélkül 6° + σ12, 5 s; (b) korrigáló vezető σ20, 40 s.
   A teszt a régi kódon a hiányzó `touchDriveInput` miatt bukik.
3. `maxSpeedUnits(172) ≥ 1.5 × fromKm(172/3600)` és `DRIVE_PACE === 1.6`.
4. `driveSubsteps`: 1/60 → 1, 1/30 → 2, 0.05 → 3, 0 → 1; 260 km/h-s jármű 0,05-ös képkockákkal,
   részlépésekkel, merőlegesen egy kerítésnek (`box hx 50, hz 0.11`) hajtva 3 s alatt nem jut át (z > 0).
5. `followHeight`: 30/60/144 Hz, 0,5 s, cél 1 → ±2%-on belül azonos; 0 → 10 ugrás azonnal 10.
6. Bekötés (a lap forrásából, kommentek nélkül): a `TouchControls` `touchDriveInput(` hívást tartalmaz,
   a játékhurok `driveSubsteps(` és `followHeight(` hívást.
Futtatás a régi kódon → elvárt bukás (hiányzó exportok).

## T3 — Spec-változás a meglévő tesztekben (spec 4. pont)
- `tests/tornado-drive.test.ts`: az első teszt elvárt értéke `fromKm(168/3600) * DRIVE_PACE`, az őr
  `u / fromKm(168/3600) < 2`; a második teszt km/h-felső korlátja `180 * DRIVE_PACE`. Fejkomment a
  specre hivatkozva.
- `tests/tornado-mobile-controls.test.ts`: a négyirányú assert helyett `touchDriveInput\s*\(` és
  `touchRef\.current\.(throttle|steer)\s*=`; a régi gombok hiánya és a horgony/Cam marad. Komment.

## T4 — Kód
1. `world.ts`: `PropFootprint` típus, `propFootprint(p)`, `footprintExtent(fp)` → `{ ex, ez }`,
   `PROP_ROAD_CLEARANCE`; a `propsInChunk` a régi szűrés után `clearRoads` segédlettel eltol, majd
   víz/híd újravizsgálat.
2. `controls.ts`: `touchDriveInput(v)` (D3), `TouchDrive` típus.
3. `drive.ts`: `DRIVE_PACE`, `maxSpeedUnits` szorzóval, `driveSubsteps`, `followHeight`.
4. `TornadoHunter200.tsx`: `touchRef` → `{ throttle, steer }`; `TouchControls` `touchDriveInput`-tal;
   `releaseAll` nullázza; a hurok `driveSubsteps`-szel részlépésez (belső `driveStep(dt)`, amely a
   `resolveVehicleCollisions(..., dt)`-t hívja); kamera-magasság `camGroundRef` + `followHeight`;
   tesztkampó `getCamera`.

## T5 — Kapuk (a `source/`-ban), mind zöld
`npx tsc --noEmit` · `npx tsc --noEmit -p tsconfig.test.json` · `npm run lint` ·
`node --import tsx --test tests/*.test.ts` · `npm run build`.

## T6 — Mérés utána, képek
- `node --import tsx tornado-overlap.local.mts` → `overlapRoadBand: 0`.
- `node --import tsx tornado-sim.local.mts 60 new 12`, `... 30 new 20` → a spec 8. pontjába.
- Vite 5194 (`VITE_ENABLE_GAME_TEST_HOOKS=1`), `node --import tsx tornado-drive-probe.local.mts
  --label=after --shots=<scratchpad>` (és `--cpu=4`) → számok a specbe; képek
  `tornado2-{before,after}-{road,driving}.png`. Utána a Vite-folyamatfa leállítása (csak 5194).

## T7 — Commit, push, PR
Atomi commitok (tesztek+kód szeletenként), `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
Push előtt külön hívásban `.audit-ok` mindkét helyen; `git push -u origin fix/tornado-ut-kormanyzas`;
`gh pr create --base main` magyar leírással.
