# Végrehajtási utasítás — Tornado Hunter fizika (2026-09-29)

Spec: `docs/specs/2026-09-29-tornado-fizika.md`. Munkakönyvtár: `source/`. Minden lépés után a
megadott parancs; a „régi kódon bukik” lépésnél a kimenetet el kell menteni a PR-leíráshoz.

## T0 — Tesztkampó (viselkedés-változás nélkül)
- Fájl: `client/src/pages/TornadoHunter200.tsx`. A játék-komponensben `useEffect`, amely
  `GAME_TEST_HOOKS_ENABLED` esetén `window.__websuliTornado = { getPlayer, setPlayer, getPhase }`-t tesz ki,
  cleanupkor törli. Import: `GAME_TEST_HOOKS_ENABLED` a `@/game-engine/game-test-hooks`-ból.
- Ellenőrzés: `npx tsc --noEmit`.
- Commit: `test(tornado): böngészős próbakampó a játékos-állapothoz`.

## T1 — Reprodukció a régi fizikán (böngésző)
- Szkript: `source/tornado-probe.local.mts` (gitignore: `*.local.mts` — ellenőrizd `git check-ignore`).
- Vite: `npx cross-env VITE_ENABLE_GAME_TEST_HOOKS=1 vite --port 5194 --strictPort` (háttérben).
- Playwright `chromium.launch({ channel: "chrome", args: ["--enable-gpu","--ignore-gpu-blocklist"] })`,
  `/tornado-hunter` (ellenőrizd a route-ot `App.tsx`-ben), `forceState({screen:"play"})`, majd:
  1. `setPlayer({x:0,z:420,heading:0,speed:0})` (a tölcsér felé néz), 3 s input nélkül, `getPlayer()` →
     elvárt a régi kódon: |Δ| > 5 egység, a tölcsértől távolodva.
  2. `keydown s` → 0,5 s → `window.dispatchEvent(new Event("blur"))` → 2 s → `getPlayer().speed < 0`.
- Kimenet mentése a scratchpadba (`tornado-repro-old.json`).

## T2 — Tesztek ELŐBB (régi kódon bukniuk kell)
- `tests/tornado-wind-drift.test.ts`: álló autó 5 s szélben nem mozdul; haladó autó sodrása merőleges
  a tölcsér felé mutató irányra (skalárszorzat ≈ 0); `windDriftUnits(1) === 0.5`.
- `tests/tornado-input-release.test.ts`: `driveKeyFor("S") === "back"`, `releaseDriveKeys` mindent false-ra;
  forrás-őr: a lap regisztrál `blur` és `visibilitychange` figyelőt, és `releaseDriveKeys`-t hív;
  `applyDeadzone(NaN) === 0`; `createGamepadRestGate` nyugalmi `axes[1]=1` padra 0 gázt ad, semleges
  olvasás után a stick vezet.
- `tests/tornado-bridge.test.ts`: E1, E2 (spec 6.) + `terrainHeight` a folyóközépen ≥ 2 egységgel az
  alapmagasság alatt; `groundHeight` hídon = `deckSurfaceHeight`.
- `tests/tornado-collision.test.ts`: E3 — ház, fa frontálisan; 30°-os csúszás; bokor átjárható;
  forgatott doboz; `collidersNear` determinisztikus; a `z = −900` út folyó-metszeténél
  (x ≈ −101,6) van hídkorlát-ütköző.
- Parancs: `node --import tsx --test tests/tornado-wind-drift.test.ts tests/tornado-input-release.test.ts tests/tornado-bridge.test.ts tests/tornado-collision.test.ts`
  → elvárt: FAIL (hiányzó exportok / hibás viselkedés). Kimenet mentése.

## T3 — Szél (H3 elsődleges)
- `lib/tornado/drive.ts`: `windDriftUnits`, sodrás `(sin, −cos) × windPush × dt`, tartás álló autónál.
- `pages/TornadoHunter200.tsx`: `windPush = windDriftUnits(windForceOn(...))`.
- Teszt: `node --import tsx --test tests/tornado-wind-drift.test.ts tests/tornado-drive.test.ts` → PASS.

## T4 — Bemenet elengedése (H3 másodlagos)
- `lib/tornado/controls.ts`: `DriveKeys`, `driveKeyFor`, `releaseDriveKeys`.
- `lib/tornado/gamepad.ts`: NaN-őr az `applyDeadzone`-ban; `createGamepadRestGate`.
- `pages/TornadoHunter200.tsx`: a `down/up` a `driveKeyFor`-t használja; `blur` + `visibilitychange`
  → `releaseDriveKeys(keysRef.current)` és a `touchRef` nullázása; a gamepad a kapun át.
- Teszt: `node --import tsx --test tests/tornado-input-release.test.ts tests/tornado-gamepad.test.ts tests/tornado-controls.test.ts` → PASS.

## T5 — Híd (H1)
- `lib/tornado/world.ts`: `RIVER_*` konstansok, `riverCarve`, `baseHeight` (belső), `terrainHeight`
  mederrel, `deckSurfaceHeight`, `onBridge`, `groundHeight`, `bridgeSpansInChunk`, `surfaceAt` híd-ág,
  `propsInChunk` hídra nem tesz kelléket.
- `tornado/buildMeshes.ts`: `buildBridgeChunk(cx, cz)` → `THREE.Group | null` (egyedi geometria,
  megosztott anyag a `mat()`-ból).
- `pages/TornadoHunter200.tsx`: `streamChunks` hozzáadja a hidat; `terrainHeight` → `groundHeight` a
  járműnél, kameránál, pornál.
- Teszt: `node --import tsx --test tests/tornado-bridge.test.ts tests/tornado-road-factor.test.ts tests/tornado-terrain-shader-road.test.ts` → PASS.

## T6 — Ütközés (H2)
- Új `lib/tornado/collision.ts`: `vehicleDimensions`, `collidersForProp`, `bridgeColliders`,
  `collidersNear`, `resolveVehicleCollisions`.
- `tornado/buildMeshes.ts`: `buildVehicle` a `vehicleDimensions`-t használja.
- `pages/TornadoHunter200.tsx`: `stepVehicle` után `resolveVehicleCollisions`.
- Teszt: `node --import tsx --test tests/tornado-collision.test.ts` → PASS.

## T7 — Kapuk és böngésző
- `npx tsc --noEmit`; `npx tsc --noEmit -p tsconfig.test.json`; `npm run lint`;
  `node --import tsx --test tests/*.test.ts`; `npm run build` → mind PASS.
- T1 szkript újra az új kódon: sodrás |Δ| < 0,5; blur után `speed` ≥ 0 és ≈ 0.
- Képernyőképek (`C:\Temp\claude\D--repo-WEBSULI\a3627f3f-c161-4b37-98e5-e163bb7fb826\scratchpad\`):
  `tornado-hid-asztali.png`, `tornado-hid-mobil.png`, `tornado-utkozes-asztali.png`,
  `tornado-utkozes-mobil.png` (mobil: 390×844, `isMobile`, `hasTouch`).
- Vite leállítása: `Get-CimInstance Win32_Process` a `5194`-es parancssorral → `Stop-Process`.

## T8 — Lezárás
- `git merge origin/main`, kapuk újra, sentinel külön hívásban, push, `gh pr create --base main`.

## Review-javítás (PR #137)
1. Tesztek ELŐBB (a javítás előtti kódon buknak):
   `tests/tornado-input-release.test.ts` (NaN → `[0,1]`: a régin −1 gáz),
   `tests/virtual-joystick-reset.test.ts` (új: `createJoystickDrag` + a `resetSignal` bekötése),
   `tests/tornado-collision.test.ts` (30/60/144 Hz súrlódás; a lap `dt`-vel hívja a feloldást).
   Parancs: `node --import tsx --test tests/tornado-input-release.test.ts tests/virtual-joystick-reset.test.ts tests/tornado-collision.test.ts`.
2. `client/src/lib/tornado/gamepad.ts`: a kapu csak `Number.isFinite` nyers tengelyt fogad semlegesnek.
3. `client/src/game-engine/joystick.ts`: `createJoystickDrag(radius)` (`down/move/up/reset/active`).
   `client/src/game-engine/VirtualJoystick.tsx`: ezt használja; `resetSignal?: number` → effekt, amely
   `reset()` után elengedi a capture-t, `setKnob(null)`, `onChange(0)`.
   `client/src/pages/TornadoHunter200.tsx`: `touchReset` state, `releaseAll` → `setTouchReset((n) => n + 1)`,
   `TouchControls` → `VirtualJoystick resetSignal`.
4. `TornadoHunter200.tsx`: `resolveVehicleCollisions(..., dt)`.
5. Kapuk: `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.test.json`, `npm run lint`,
   `node --import tsx --test tests/*.test.ts`, `npm run build`.
