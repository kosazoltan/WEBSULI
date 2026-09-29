# Végrehajtási utasítás — hét játék 3D látványa (2026-09-29)

Terv: `docs/specs/2026-09-29-jatekok-3d-latvany.md`. Minden útvonal a `source/` alatt értendő.
Ág: `feat/jatekok-3d-latvany`. Minden feladat után atomi commit (`feat(games-3d): …`).

## Közös szabályok minden feladathoz
- Játéklogikát, kérdésbankot, pontozást, vezérlést, testid-et, aria-t NEM módosítasz.
- Tesztet nem módosítasz (új teszt írható). A lapon új `z-[N]` csak `N < 60`; új gomb nincs.
- Minden three.js erőforrás `dispose()`-t kap lebontáskor; a render-hurok `cancelAnimationFrame`-mel áll le.
- Minőségi szint: `detectLookTier()` (a Tornádónál a játékos `settings.quality`-je).
- Reduced motion: `useReducedMotion()` (`@/game-engine/useReducedMotion`) → dekoratív mozgás ki.
- Ellenőrzés feladatonként (a `source/` mappában):
  - `npx tsc --noEmit 2>&1 | grep -E "<saját fájlok>"` → üres kimenet.
  - `npx eslint <saját fájlok> --max-warnings 0` → 0 hiba.
  - `node --import tsx --test tests/<érintett>.test.ts` → mind `pass`.
  - Képernyőkép: `npx tsx game-look-shot.local.mts <route> <kimenet.png> [--mobile] [--look=high]` (T0 hozza létre).

## T0 — Közös látványmodul (`client/src/game-engine/three-look/`)
Fájlok és API (pontosan ezek az exportok):
1. `tier.ts`
   - `export type LookTier = "low" | "medium" | "high"`
   - `export type TierEnv = { override: string | null; rendererName: string; cores: number; memoryGb: number | null; coarsePointer: boolean }`
   - `export function detectLookTierFrom(env: TierEnv): LookTier` — tiszta függvény, a terv 2. döntése szerint.
   - `export function readTierEnv(): TierEnv` — böngészőből (URL `look`, `WEBGL_debug_renderer_info`, `navigator.hardwareConcurrency`, `navigator.deviceMemory`, `matchMedia("(pointer: coarse)")`); SSR/teszt alatt biztonságos alapértékek.
   - `export function detectLookTier(): LookTier` — `detectLookTierFrom(readTierEnv())`, modul-szinten gyorsítótárazva.
   - `export const LOOK_BUDGET: Record<LookTier, { maxPixelRatio: number; environment: boolean; shadows: boolean; shadowMapSize: number; bloom: boolean; particleScale: number }>` — a terv 3. döntésének táblázata.
2. `renderer.ts`
   - `export function applyRendererLook(renderer: THREE.WebGLRenderer, tier: LookTier, opts?: { exposure?: number; shadows?: boolean }): void` — `ACESFilmicToneMapping`, `SRGBColorSpace`, pixelarány-plafon, árnyék `PCFSoftShadowMap` csak ha a budget ÉS az `opts.shadows !== false`.
   - `export function createGameRenderer(canvas: HTMLCanvasElement, tier: LookTier, opts?: { alpha?: boolean; exposure?: number; shadows?: boolean }): THREE.WebGLRenderer | null` — `try/catch`; hiba esetén `null`.
3. `environment.ts` — `export function createRoomEnvironment(renderer, intensity?): { texture: THREE.Texture; dispose(): void }` (PMREM + `RoomEnvironment`).
4. `postfx.ts` — `export type PostFx = { readonly bloom: boolean; render(): void; setSize(w: number, h: number): void; dispose(): void }`;
   `export function createPostFx(renderer, scene, camera, tier, opts?: { strength?: number; radius?: number; threshold?: number }): PostFx` — `high` + `bloom` esetén `EffectComposer`(`RenderPass`+`UnrealBloomPass`+`OutputPass`), egyébként `renderer.render(scene, camera)`.
5. `sky.ts` — `export function createGradientSky(opts: { top: THREE.ColorRepresentation; horizon: THREE.ColorRepresentation; bottom?: THREE.ColorRepresentation; sunDirection?: THREE.Vector3; sunColor?: THREE.ColorRepresentation; sunSize?: number; radius?: number }): THREE.Mesh` — `BackSide`, `fog:false`, `depthWrite:false`, `renderOrder=-2`; uniformok: `topColor`, `horizonColor`, `bottomColor`, `sunDirection`, `sunColor`, `sunSize`.
6. `sprites.ts` — `export function glowTexture(): THREE.Texture` (gyorsítótárazott radiális gradiens); `export function createGlowSprite(color, size, opacity?): THREE.Sprite` (additív, `depthWrite:false`).
7. `particles.ts` — `export class SparkleField { constructor(scene: THREE.Object3D, capacity: number); emit(origin: THREE.Vector3, opts: { count: number; color: THREE.ColorRepresentation; speed?: number; life?: number; gravity?: number; size?: number }): void; update(dt: number): void; dispose(): void }` — egyetlen `THREE.Points`, additív, élettartam szerint halványul.
8. `dispose.ts` — `export function disposeObjectTree(root: THREE.Object3D): void` (geometria, anyag, anyag-textúrák).
9. `useThreeScene.ts` — React hook a DOM-os játékok 3D rétegéhez:
   ```ts
   export type ThreeSceneContext = { renderer: THREE.WebGLRenderer; scene: THREE.Scene; tier: LookTier; reducedMotion: boolean };
   export type ThreeSceneController = { camera: THREE.Camera; update(dt: number, elapsed: number): void; resize?(w: number, h: number): void; dispose?(): void; bloom?: { strength?: number; radius?: number; threshold?: number } };
   export function useThreeScene(canvasRef: RefObject<HTMLCanvasElement>, setup: (ctx: ThreeSceneContext) => ThreeSceneController, deps: unknown[]): { supported: boolean | null };
   ```
   Felelősség: renderer (`createGameRenderer`), `ResizeObserver` a canvas szülőjén (min. 1×1), `PostFx`, rAF-hurok (`dt ≤ 0.05`), `webglcontextlost` → `preventDefault` + hurok leáll, lebontáskor `disposeObjectTree(scene)` + postfx + renderer dispose. `supported`: `null` az első futásig, `false` ha nincs WebGL.
10. `index.ts` — újraexportál mindent.
11. Új teszt: `tests/three-look.test.ts` — `detectLookTierFrom` minden ágára (SwiftShader→low, 4 mag→low, 2 GB→low, coarse→medium, 4 GB→medium, erős gép→high, `override` érvényes/érvénytelen), `LOOK_BUDGET` invariánsok (low: nincs bloom/árnyék/környezet; high: bloom; pixelarány nő a szinttel).
12. Új helyi képernyőkép-szkript: `source/game-look-shot.local.mts` (gitignore-olt) — Playwright `chromium` `channel:"chrome"`, `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist`, a `http://localhost:5188` probe-szerverre, argumentum: útvonal, kimenet, `--mobile` (390×844, touch), `--look=…`, `--script=<js-fájl>` (a játék elindításához kattintás-lépések).
Ellenőrzés: `node --import tsx --test tests/three-look.test.ts` → pass; `npx tsc --noEmit` a modulra hibátlan.
Commit: `feat(games-3d): közös three-look látványmodul (tier, tónus, bloom, ég, részecske)`.

## T1 — Aszteroida (`client/src/pages/SpaceAsteroidQuiz.tsx`)
1. `:1034` renderer után `applyRendererLook(renderer, tier)`; `tier = detectLookTier()`.
2. Környezet: `scene.environment = createRoomEnvironment(renderer).texture` ha `LOOK_BUDGET[tier].environment`.
3. Háttér: a `nebula` sík (`:1098-1126`) helyett/mellett két-három rétegű procedurális nebula (más színű, lassan forgó síkok), kerek glow-textúrás csillagok (`PointsMaterial.map = glowTexture()`, additív), távoli bolygó gyűrűvel és peremfénnyel.
4. Hajtómű-csóva + találati szikra: `SparkleField` (kapacitás `600 * particleScale`), `emit` a hajó hajtóműnél minden frame-ben (reduced motion: ritkítva), robbanáskor 24–40 szikra.
5. Render: `:2023` `renderer.render` → `postFx.render()`; resize-ban `postFx.setSize`.
6. Lebontás: environment, postFx, sparkle `dispose`.
Kamera-konstansok, fizika, testid változatlan. Teszt: `space-asteroid-*.test.ts`, `game-feedback-wiring-guard.test.ts`.

## T2 — Tornádó (`client/src/pages/TornadoHunter200.tsx`, `client/src/tornado/buildMeshes.ts`)
1. `:1110` után `applyRendererLook(renderer, quality)` (a játékos `quality`-je `LookTier`-ként).
2. Ég: `buildSkyDome` marad (teszt őrzi), de a shader kap napkorong-fényt és háromszínű átmenetet — az aláírás visszafelé kompatibilis (új opcionális paraméter).
3. Terep: `buildTerrainChunk` szín: magasság- és lejtés-függő árnyalás (völgy sötétebb zöld, domb világosabb, sárgás fűfoltok); a meglévő út/víz/sár logika marad.
4. Jármű: blob-árnyék (glow-textúra fekete változata a talajon) minden szinten; `high`-on valódi `castShadow` a járműre és `receiveShadow` a közeli terepre, a nap-shadow-kamera a járművet követi.
5. Por: `SparkleField` barnás, normál (nem additív) keveréssel a kerekek mögött, sebességgel arányosan.
6. Villám: a `lightning` fény mellett az ég-uniform rövid kivilágosodása.
7. `high` szinten `createPostFx` enyhe bloommal (`strength 0.35`, `threshold 0.85`).
Egyetlen `<canvas>` marad; `touch-none` a canvason marad. Teszt: `tornado-*.test.ts`.

## T3 — Kockavadász (`client/src/pages/BlockCraftQuiz.tsx`)
1. `:1547` után `applyRendererLook(renderer, tier)`.
2. `scene.background` egyszínű → `createGradientSky` (a pálya `skyTint.day` színéből: zenit sötétebb, horizont világosabb, napkorong a `sun` irányában); a köd színe a horizont színe.
3. Árnyék (`medium`/`high`): `sun.castShadow`, a shadow-kamera a világot (`WX×WZ`) fedi, `InstancedMesh.castShadow = receiveShadow = true`, `shadow.bias`/`normalBias` beállítva a csíkosodás ellen.
4. Felhők: a lapos dobozok helyett 3–5 dobozból álló „bolyhos” felhőcsoportok, lágy árnyalattal.
5. Víz: áttetsző (`opacity 0.78`), enyhén csillogó (`roughness 0.15`, `metalness 0.1`).
6. Bányászás: a meglévő `spawnBurst` marad, plusz `SparkleField` szikra.
Teszt: `blockcraft-subject-mapping.test.ts`, `game-feedback-wiring-guard.test.ts`, `game-touch-controls.test.ts`.

## T4 — Tsunami (`client/src/pages/TsunamiEscapeEnglish.tsx`, új `client/src/game-engine/scenes/TsunamiScene3D.tsx`)
1. Új komponens: props `{ water: number; playerX: number; safeZoneX: number; stormFlash: boolean; sprinting: boolean; phase: string; light: boolean }`; `useThreeScene`-nel; `aria-hidden`, `pointer-events-none`, `absolute inset-0`, `z-0`.
2. A jelenet a terv szerint (ég, nap, felhők, hegyek, pallók, shader-víz a `water`% magasságban, szörfös figura `playerX`% helyen, bója-sáv `safeZoneX`% helyen); a %-koordinátát a kamera látómezejéből számolt világ-koordinátára képezi le; a célértékek felé simít.
3. A lapon: a `supported === false` esetén a mostani DOM-rétegek (1330–1370, 1405–1519) látszanak; egyébként a 3D réteg helyettesíti őket. HUD-chipek, reward burst, dialógusok változatlanok.
Teszt: `game-touch-controls.test.ts`, `game-feedback-wiring-guard.test.ts`, `coupon-claim-wiring-guard.test.ts`.

## T5 — Matek torony (`client/src/components/MathTowerScene.tsx`, új `client/src/components/MathTowerScene3D.tsx`)
1. Új komponens ugyanazzal a prop-API-val (`current`, `target`), burkoló `role="img"` + ugyanaz az `aria-label`.
2. Jelenet: csillagos ég, hold, 8 neon lépcsőfok spirálban felfelé, a teljesített fokok világítanak, a figura ugrás-ívvel lép (`step` változásakor 0,45 s), zászló a csúcson; `high`-on bloom.
3. `SpeedQuizMath.tsx:759` a 3D komponenst hívja; a 3D komponens WebGL nélkül a meglévő SVG `MathTowerScene`-t rendereli.
Teszt: `speed-quiz-explanations.test.ts`, `game-feedback-wiring-guard.test.ts`.

## T6 — Szólétra (`client/src/pages/WordLadderHuEn.tsx`, új `client/src/game-engine/scenes/LadderScene3D.tsx`)
1. Új komponens props `{ rung: number; total: number; zoneId: string; streak: number; mood: string }`.
2. Jelenet: 3D létra (két fa-oldalrúd, 16 fok), 3/4-es kamera, amely a mászót követi; zóna-háttér (rét/erdő/felhők/csillagok gradiens ég + díszek), mászó figura, cél-csillag a tetején; a teljesített fokok aranyszínűek, a következő fok pulzál.
3. A `wl-ladder` oszlopban a `Ladder` SVG helyett a 3D komponens (fallback: SVG). A `wl-climber` DOM-elem testid-je megmarad.
Teszt: `word-ladder-logic.test.ts`, `game-feedback-wiring-guard.test.ts`, `game-quiz-explanations.test.ts`.

## T7 — Brain Rot (`client/src/pages/BrainRotSteal.tsx`, új `client/src/game-engine/scenes/BrainRotArena3D.tsx`)
1. Új komponens props `{ rots: { id: number; x: number; y: number; size: number; warning: boolean }[]; bursts: { id: number; x: number; y: number }[] }`, a tábla háttere (`absolute inset-0 z-0`).
2. Jelenet: perspektivikus neon-aréna padló, izzó perem, lebegő kristályok, csillagos kupola; minden lény alatt izzó gyűrű a DOM-pozícióból a padló síkjára vetítve (`Raycaster` a canvas NDC-jéből), figyelmeztetésnél piros pulzálás; elkapáskor `SparkleField` robbanás.
3. A lények DOM-gombok maradnak; a meglévő 2D részecskék/feliratok maradnak.
Teszt: `brainrot-physics.test.ts`, `game-feedback-wiring-guard.test.ts`, `quiz-bank-integrity.test.ts`, `game-quiz-explanations.test.ts`.

## T8 — Verifikáció (a spechez mérve)
1. `npm run check`, `npm run lint`, `npm run check:test`, `npm test` → mind hibátlan.
2. `npm run build` → sikeres; a `three` chunk mérete feljegyezve (előtte/utána).
3. Képernyőképek mind a 7 játékról játék közben: 1024×768 `--look=high` és 390×844 `--mobile` (auto tier) — átfedés, levágás, vízszintes görgetősáv, konzol-hiba ellenőrzése.
4. `--look=low` mérés: a low szinten a játék játszható, bloom/árnyék nincs (E2).
5. Záró jelentés: módosított fájlok, PASS/FAIL, képek, maradó kockázat.
