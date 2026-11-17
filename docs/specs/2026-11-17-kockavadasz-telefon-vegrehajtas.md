# Végrehajtási utasítás: Kockavadász telefonon — 1. szelet (eltérés-tábla, mérés, `?perf=1` panel)

Terv: `docs/specs/2026-11-17-kockavadasz-telefon.md`. Munkafa: `.claude/worktrees/kockavadasz-telefon`, ág: `perf/kockavadasz-telefon`.
Minden parancs a munkafa gyökeréből fut. Push és PR NINCS (orkesztrátori jelzésig). A 2. szelet (terv 7.) NEM része ennek a fájlnak.

## 0. Előfeltételek

- `npm.cmd ci --prefix source --ignore-scripts` (C-38: a `better-sqlite3` natív kötése Node 26 alatt nem fordul; a `native-arch`
  helyi kivétel a `docs/minosegkapuk.md` szerint).
- A `main` helyben beolvasztva (a `scripts/qa/gates/*` a #484 ágán még nem volt meg).

## 1. feladat — `source/client/src/game-engine/perf/perfStats.ts` (új, tiszta modul)

Exportok:

- `perfEnabledFrom(search: string): boolean` — igaz, ha az URL-keresőrész `perf` paramétere pontosan `"1"`.
- `type FrameSample = { dt: number; js: number; render: number }` (ms).
- `class FrameWindow { constructor(capacity = 480); push(s: FrameSample): void; clear(): void; get size(): number; summary(): FrameSummary | null }`
  — gyűrűpuffer `Float32Array`-okkal (a képkocka-hurokban nincs foglalás).
- `type FrameSummary = { frames; fpsAvg; fpsLow1; dtP50; dtP95; dtMin; jsAvg; renderAvg }` —
  `fpsAvg = 1000 * n / Σdt`; `fpsLow1 = 1000 / (a leglassabb 1 % képkocka átlagos dt-je, legalább 1 képkocka)`; percentilis:
  rendezett tömb `floor(p * (n - 1))` indexe.
- `shortUserAgent(ua: string): string` — „Chrome 142 · Android 16” alak: böngésző (HonorBrowser / HuaweiBrowser / SamsungBrowser /
  EdgA / Edg / OPR / Firefox / CriOS / Chrome / Version+Safari sorrendben) + főverzió; rendszer (Android N / iOS N / Windows /
  macOS / Linux); ismeretlen → „ismeretlen”. Eszközmodell és build-azonosító NEM kerül bele.
- `megapixels(w: number, h: number): number` — két tizedesre.
- `fmt(n: number | null, digits = 1): string` — `null` / nem véges → „n. a.”.

Teszt: `source/tests/perf-stats.test.ts` (node:test) — `perfEnabledFrom` (`?perf=1`, `?perf=0`, `?look=low&perf=1`, üres);
`FrameWindow` (60 Hz-es egyenletes minta → 60 fps, 1 % low 60; 99 × 10 ms + 1 × 100 ms → fpsLow1 = 10; körbefordulás a kapacitás
fölött; üres → `null`); `shortUserAgent` (Android Chrome, HonorBrowser, iOS Safari, asztali Chrome; a modellnév nem szerepel a
kimenetben); `megapixels(1240, 1252) === 1.55`.
Parancs: `cd source && node --import tsx --test tests/perf-stats.test.ts` → minden teszt `pass`.

## 2. feladat — `source/client/src/game-engine/perf/perfOverlay.ts` (új)

```ts
export type PerfToggleState = { shadows: boolean; resolution: 1 | 0.75 | 0.5; simpleMaterials: boolean; fog: boolean };
export type PerfControls = {
  /** false, ha a szinten eleve nincs árnyék (a gomb letiltva). */
  shadowsAvailable: boolean;
  setShadows(on: boolean): void;
  setResolution(scale: 1 | 0.75 | 0.5): void;
  setSimpleMaterials(on: boolean): void;
  setFog(on: boolean): void;
};
export type PerfOverlayOptions = {
  renderer: THREE.WebGLRenderer; host: HTMLElement; tier: string; title: string;
  controls: PerfControls; getReactRenders(): number;
};
export type PerfOverlay = {
  frameStart(now: number): void;   // a képkocka elején (a rAF időbélyegével)
  beforeRender(): void;            // közvetlenül a renderer.render előtt
  afterRender(): void;             // közvetlenül utána
  snapshot(): PerfSnapshot;        // a panel adatai objektumként (mérőszkript, teszt)
  runGpuProbe(frames?: number): Promise<number | null>;
  dispose(): void;
};
export function createPerfOverlay(opts: PerfOverlayOptions): PerfOverlay;
```

- DOM: `div[data-testid="bc-perf-panel"]`, `position:absolute; top:4px; left:4px; z-index:60`, 11 px monospace, sötét áttetsző
  háttér, `pointer-events:none` a szövegen, `auto` a gombokon; a `host` a vászon szülője (`.game-scene`).
  Sorok `pre[data-testid="bc-perf-text"]`-ben; gombok: `bc-perf-shadow`, `bc-perf-res`, `bc-perf-mat`, `bc-perf-fog`,
  `bc-perf-probe`, `bc-perf-copy`, `bc-perf-collapse` (mind ≥ 40 px magas érintőcél).
- Mérés: `frameStart` → `dt` az előző `now`-hoz (az első képkocka és a > 1000 ms-os szünet nem kerül az ablakba);
  `beforeRender` / `afterRender` `performance.now()`-val: `js = tBefore − tFrameStart`, `render = tAfter − tBefore`.
- GPU-idő: `gl.getExtension("EXT_disjoint_timer_query_webgl2")` (csak WebGL2); `beforeRender`-ben `beginQuery(TIME_ELAPSED_EXT)`, ha
  nincs aktív és a függő sor < 4; `afterRender`-ben `endQuery`; `frameStart`-ban a függők lekérdezése
  (`QUERY_RESULT_AVAILABLE`, `GPU_DISJOINT_EXT` → eldobás); mozgóátlag az utolsó 30 eredményből (ms).
- Szinkron GPU-próba (`runGpuProbe(40)`): a következő N képkockán `afterRender`-ben `gl.readPixels(0,0,1,1,RGBA,UNSIGNED_BYTE,buf)`,
  a `tBefore`-tól a `readPixels` visszatéréséig mért idő mediánja (ms). A próba alatt az időzítő-lekérdezés szünetel.
- Hosszú feladatok: `PerformanceObserver({ type: "longtask" })`; darab / s és ms / s az utolsó 4 s-ból; nem támogatott → `null`.
- React-render / s: `getReactRenders()` különbsége a frissítések között.
- Frissítés 500 ms-onként (`afterRender`-ben idő alapján; ha a hurok áll, a szöveg nem frissül — a fejlécben „fut” / „áll” a
  legutóbbi képkocka kora szerint, egy 1 s-os `setInterval` írja át).
- `renderer.info.render.calls / triangles`, `info.memory.textures / geometries`, `info.programs?.length`; vászon
  `renderer.getDrawingBufferSize`, CSS `canvas.clientWidth × clientHeight`, `window.devicePixelRatio`, `renderer.getPixelRatio()`;
  renderer-név: `WEBGL_debug_renderer_info` a JÁTÉK kontextusán (nem új kontextus), legfeljebb 60 karakter.
- `dispose()`: megfigyelő, időzítő, DOM, függő lekérdezések törlése; a `window.__websuliPerf` törlése.
- `window.__websuliPerf = { snapshot, controls: { set(partial: Partial<PerfToggleState>) }, runGpuProbe }` — csak a panel élete alatt
  (mérőszkript és teszt használja; hálózatot nem érint).
- Tilos: `fetch`, `XMLHttpRequest`, `sendBeacon`, `localStorage`, `sessionStorage`, `console.log`.

## 3. feladat — `source/client/src/pages/BlockCraftQuiz.tsx` (bekötés, minimális diff)

1. Import: `perfEnabledFrom` a `@/game-engine/perf/perfStats`-ból; típus-import `PerfOverlay`, `PerfControls` a `perfOverlay`-ből.
2. Komponens-szinten: `const renderCountRef = useRef(0); renderCountRef.current += 1;` (a lap renderjeinek számlálója — csak ref).
3. A jelenet-effektben (`useEffect` a `createGameRenderer` hívással):
   - `const fog = new THREE.FogExp2(...)`; `scene.fog = fog;` — az `applyLevelLook` a `fog` állandót használja a
     `scene.fog as THREE.FogExp2` helyett (E-6: kikapcsolt köd mellett sincs `null`-hivatkozás).
   - `const basePixelRatio = renderer.getPixelRatio();`
   - Egyszerű anyagok: `let simpleOn = false; let simpleMats: Map<number, THREE.Material | THREE.Material[]> | null = null;`
     `const materialFor = (t) => (simpleOn ? simpleMats?.get(t) : undefined) ?? blockMaterials.get(t);` — a `makeTypeMesh` ezt
     használja. A `simpleMats` lustán épül a `blockMaterials`-ból: `MeshLambertMaterial({ map, transparent, opacity, alphaTest,
     emissive, emissiveMap, emissiveIntensity })`; a textúrák közösek (a takarítás csak az anyagot `dispose`-olja).
   - `const perfControls: PerfControls = { shadowsAvailable: shadowsOn, setShadows(on) { sun.castShadow = on;
     renderer.shadowMap.needsUpdate = true; }, setResolution(s) { renderer.setPixelRatio(basePixelRatio * s); appliedW = 0;
     syncSize(); }, setSimpleMaterials(on) { … typeMeshes.forEach((tm, t) => { tm.mesh.material = materialFor(t) }) },
     setFog(on) { scene.fog = on ? fog : null; } }`.
   - `let perf: PerfOverlay | null = null;` — ha `perfEnabledFrom(window.location.search)`: dinamikus
     `import("@/game-engine/perf/perfOverlay")`, majd (ha az effekt még él) `perf = createPerfOverlay({ renderer, host:
     canvas.parentElement, tier, title: "Kockavadász", controls: perfControls, getReactRenders: () => renderCountRef.current })`;
     a betöltési hiba elnyelve (a játék fut tovább).
   - A `step`-ben: a `syncSize()` ELŐTT `perf?.frameStart(now)`; a `renderer.render(scene, camera)` előtt `perf?.beforeRender()`,
     utána `perf?.afterRender()`.
   - Takarítás: `perf?.dispose(); perf = null;` + a `simpleMats` anyagainak `dispose()`-a.
4. Más viselkedés nem változik; paraméter nélkül a hurokban három `null`-ellenőrzés a többlet.

Ellenőrzés: `npm run gate:stage` → zöld (a `native-arch` helyi KIVÉTEL megengedett).

## 4. feladat — böngészős teszt `source/tests/blockcraft-perf-panel.spec.ts`

A `tests/blockcraft-play.spec.ts` indítási mintájával (osztálykapu, `bc-start`):

- `?perf=1`: a játék indítása után `bc-perf-panel` látható; a `bc-perf-text` tartalmazza: „FPS”, „JS”, „render()”, „GPU”,
  „hívás”, „vászon”, „hosszú feladat”, „React-render”; a `window.__websuliPerf.snapshot()` `calls > 0`, `triangles > 0`.
- Felbontás: a `bc-perf-res` egy kattintása után a vászon `width` attribútuma az eredeti 0,75-szöröse (± 2 px), a CSS-szélesség
  változatlan; még két kattintás után visszaáll.
- Köd / anyag / árnyék: kattintás után a `snapshot().toggles` megfelelő mezője átvált, a konzolon nincs hiba, a képkockaszámláló nő.
- Paraméter nélkül: `bc-perf-panel` nincs a DOM-ban, `window.__websuliPerf === undefined`.
- Hálózat: a panel bekapcsolása és a kapcsolók alatt nincs új kérés a panel moduljának betöltésén kívül (E-7) — a teszt a
  kattintások alatt figyeli a `request` eseményt, és csak a játék saját, már korábban is futó végpontjait engedi (`/api/`), új
  eredetet nem.

Futtatás (E2E-sorompó után: `docker ps --filter name=websuli-e2e- --format "{{.Names}} {{.RunningFor}}"`; ha ≥ 2 db 90 percnél
fiatalabb konténer fut, várakozás 60 s-onként, legfeljebb 30 percig):
`cd source && npm run test:e2e -- tests/blockcraft-perf-panel.spec.ts --workers=1` → minden eset `passed`.

## 5. feladat — asztali mérés (terv 5.)

Szkript a munkamenet scratchpadjában (`…/scratchpad/kockavadasz-telefon/gpu-measure.mjs`; nem kerül a repóba): helyi build
(`cd source && npm run build:client`), a `dist/public` kiszolgálása az éles eredet alatt Playwright-útvonallal, az `/api` csak GET
(minden más metódus megszakítva), `/api/games/quiz-bank/*` üres bankkal (E15 kizárása), `?perf=1`. Lépések: indítás → 4 s
bemelegítés → változatonként `__websuliPerf.controls.set(...)` → 2 s → `runGpuProbe(60)` + `snapshot()`. M2-höz a `draw*` hívások
számlálása init-szkriptből és ugyanaz a `readPixels`-próba a rAF-visszahívás végén.
Az eredmények ennek a fájlnak a „Mért eredmények” szakaszába kerülnek, a „mit bizonyít / mit nem” megjegyzéssel.

## 6. feladat — zárás

- `npm run gate:stage` minden szakasz után; a végén `npm run gate:lint`.
- Csapda-bejegyzés a `docs/agent-csapdak.md`-be a futás tanulságaiból.
- Teljességellenőrzés a megbízás 1–3. pontjára; jelentés az orkesztrátornak; a 2. szelet (terv 7.) jóváhagyásra vár.

## Mért eredmények

(A mérés után töltjük ki — 5. feladat.)
