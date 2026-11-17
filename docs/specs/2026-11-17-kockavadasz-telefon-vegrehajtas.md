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
- Csapda-javaslatok a zárójelentésben (C-48: szelet-ág nem ír a közös `docs/agent-csapdak.md` katalógusba).
- Teljességellenőrzés a megbízás 1–3. pontjára; jelentés az orkesztrátornak; a 2. szelet (terv 7.) jóváhagyásra vár.

## Mért eredmények

Gép: AMD Radeon 890M (integrált), fejes Chrome 157, Windows; nézet 827×896 CSS, dpr 2,625, érintés-emuláció → szint: medium,
képpontarány 1,5. Üres kérdésbank (E15 kizárva), helyi build (`ee5b52a8`), az éles API csak-olvasó GET-jei; nem-GET kérés nem volt.
Szkript és nyers adatok (a repón kívül): a munkamenet scratchpadja, `kockavadasz-telefon/gpu-measure.mjs`, `runs/*.json|*.png`.

### M1 — a Kockavadász képkocka-költsége kapcsolónként (vsync-plafon nélkül: `--disable-gpu-vsync --disable-frame-rate-limit`)

Két futás (r1 / r2), mindkettő a kezdő nézetből (a világ futásonként más — a futáson belüli arány számít).
„GPU-idő” = `EXT_disjoint_timer_query_webgl2` a `render()` köré (30 képkocka átlaga); „szinkron” = a panel GPU-próbája
(`readPixels` után mért medián — ~3,5 ms állandó többletet tartalmaz, ezért csak a KÜLÖNBSÉGE értelmezhető).

| Változat | fps r1 / r2 | GPU-idő ms r1 / r2 | GPU-idő az alaphoz | szinkron ms r1 / r2 | vászon |
|---|---|---|---|---|---|
| alap (árnyék 1024², PBR, köd, 100 %) | 307 / – (1) | 2,11 / – (1) | — | 5,6 / – (1) | 1,55 Mpx |
| árnyék ki | 343 / 339 | 1,91 / 1,84 | −11 … −16 % | 5,2 / 5,5 | 1,55 Mpx |
| egyszerű anyag (Lambert) | 365 / 344 | 1,70 / 1,68 | −20 … −24 % | 4,9 / 4,9 | 1,55 Mpx |
| köd ki | 306 / 301 | 2,28 / 2,38 | ≈ 0 (zajon belül) | 5,7 / 5,5 | 1,55 Mpx |
| felbontás 75 % | 407 / 388 | 1,59 / 1,46 | −27 … −34 % | 5,0 / 4,7 | 0,87 Mpx |
| felbontás 50 % | 608 / 441 | 0,87 / 0,81 | −60 … −63 % | 4,0 / 4,2 | 0,39 Mpx |
| árnyék ki + egyszerű anyag | 414 / 360 | 1,42 / 1,40 | −34 … −36 % | 4,9 / 4,8 | 1,55 Mpx |
| mind (árnyék ki, egyszerű, köd ki, 50 %) | 716 / 401 | 0,60 / 0,59 | −72 … −73 % | 3,9 / 3,6 | 0,39 Mpx |
| alap (ismét, a sor végén) | 287 / 285 | 2,23 / 2,45 | — | 5,8 / 6,1 | 1,55 Mpx |

(1) Az r2 első „alap” sora a futás naplójából nem maradt meg (csak a kimenet vége); az arányok az r1 két alap-sorához és az r2
záró alap-sorához mérve értendők.
Minden változatban 27–28 rajzolási hívás és 79 800 háromszög / kép; vsync alatti futásban `render()` hívás 0,5–0,7 ms,
JS-frissítés 0,15–0,19 ms, 57–60 fps minden változatban (a plafon elrejti a különbséget).

Olvasat: (1) a jelenet ezen a GPU-n képpont-korlátos (negyedannyi képpont → −61 % GPU-idő); a felbontástól független rész
(csúcsok, hívások, állandó költség) ~0,6 ms. (2) Az árnyék és a PBR-anyag együtt a GPU-idő ~35 %-a. (3) A köd nem mérhető tétel.
(4) Az alap abszolút költsége 2,1–2,5 ms GPU-idő — egy 120 Hz-es keret (8,3 ms) negyede ezen a GPU-n.

### M2 — játékok közti összevetés (ugyanaz a nézet, plafon nélkül, a játék indítása után 7 s-mal, 3 + 3 s mintán)

| Játék | vászon | hívás / kép | háromszög / kép | fps (plafon nélkül) | rAF-visszahívás p50 | szinkron képkocka-költség p50 / p90 |
|---|---|---|---|---|---|---|
| Kockavadász | 1240×1252 (1,55 Mpx) | 27 | 79 800 | 301 | 2,5 ms | 5,6 / 6,3 ms |
| Aszteroida (a hullám előtti kvíz állapotában) | 1216×966 (1,17 Mpx) | 29 | 9 530 | 602 | 1,1 ms | 6,1 / 7,6 ms |
| Tornado | 1240×1344 (1,67 Mpx) | 214 | 10 876 | 156 | 5,0 ms | 9,8 / 11,8 ms |
| Szökőár | 1240×1344 (1,67 Mpx) | 120 | 63 514 | 229 | 1,7 ms | 9,0 / 12,5 ms |
| Brain Rot | NOT RUN (DOM-vezérelt indítás; a szkript nem jut el megbízhatóan a játékig) | | | | | |

(n = 1 futás játékonként; egy korábbi futásban a Tornado 59 fps / 9,5 ms, a Szökőár 165 fps / 8,5 ms volt — a sorrend azonos.)

Olvasat: asztali GPU-n a Kockavadász képkockája NEM drágább a telefonon jól futó Tornadóénál és Szökőárénál — sem a főszálon,
sem a GPU-n. A megjelenítési eltérések (terv 3., E1–E6) tehát önmagukban nem magyarázzák, hogy a Kockavadász lenne az egyetlen
lassú játék.

### Kérdésbank — mely játék tölti le (éles, csak-olvasó GET, 2026-11-17)

`/api/games/quiz-bank/block-craft-quiz`: 25 235 tétel (2,87 MB tömörítve); `/api/games/quiz-bank/tsunami-english`: 25 244 tétel
(2,87 MB); az Aszteroida és a Tornado nem kér kérdésbankot ezen az úton és nem használja a `useMaterialQuizzes` hookot (KÓD).
A főszál-blokk (terv E15) tehát a Kockavadászt és a Szökőárt érinti, az Aszteroidát és a Tornadót nem.

### Mit bizonyít és mit nem

- BIZONYÍTJA: a négy kapcsoló relatív súlyát ugyanazon a jeleneten; hogy a jelenet képpont-korlátos; hogy asztali GPU-n a
  Kockavadász megjelenítése nem drágább a társjátékokénál; hogy a panel mérései (GPU-idő, szinkron próba) a kapcsolókra reagálnak.
- NEM BIZONYÍTJA: a telefon (csempés Adreno GPU, 120 Hz, hőfojtás, mobil illesztőprogram) abszolút vagy relatív költségeit — az
  árnyék-mintavétel, a `discard` és az anizotróp szűrés ott aránytalanul drágább lehet (UNVERIFIED). Az asztali integrált GPU
  nem modellje a telefonénak; n = 1–2 futás, a világ futásonként más.
- NEM MÉRT (NOT RUN): valódi telefon; Brain Rot; az Aszteroida harc közbeni állapota; séta / bányászás közbeni költség (csak a
  kezdő nézet); a `look=high` szint.

### Böngészős teszt

`npm run test:e2e -- tests/blockcraft-perf-panel.spec.ts --workers=1` → `2 passed (51.9s)` (eldobható Postgres, buildelt szerver,
szoftveres WebGL, `look=medium`). Képernyőkép a panelről valódi GPU-n: scratchpad `kockavadasz-telefon/runs/m1-fold-r1.png`
(a panel a bal felső sarokban, a HUD bal szélét takarja — a „–” gombbal összecsukható; a joystickot és az akciógombokat nem fedi).
