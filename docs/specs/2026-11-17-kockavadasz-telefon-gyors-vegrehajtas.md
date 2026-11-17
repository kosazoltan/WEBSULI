# Végrehajtási utasítás: Kockavadász telefonon — gyors, main-alapú szelet

Terv: `docs/specs/2026-11-17-kockavadasz-telefon-gyors.md` (alapja: `docs/specs/2026-11-17-kockavadasz-telefon.md`).
Munkafa: `.claude/worktrees/kockavadasz-telefon-gyors`, ág: `perf/kockavadasz-telefon-gyors` (`origin/main` `b4b84db6`-ról).
Minden parancs a munkafa gyökeréből. Push / PR csak orkesztrátori jelre; a PR előtt megállás (független ellenőr).

## 0. Előkészítés

- `npm.cmd ci --prefix source --ignore-scripts` (C-38).
- „Előtte” build a változatlan mainről teszt-kampókkal (`VITE_ENABLE_GAME_TEST_HOOKS=1 vite build`) → másolat a scratchpadba
  (`kockavadasz-telefon/dist-before`): ebből készülnek az „előtte” képek és mérések (`?seed=` → azonos világ előtte / utána).

## 1. feladat — tiszta segédek + egységtesztek

1. `source/client/src/game-engine/perf/pixelBudget.ts`:
   - `pixelRatioForBudget(cssW, cssH, basePixelRatio, maxPixels: number | null): number` — ha `maxPixels` `null` vagy a
     `cssW·cssH·base²` belefér: `base`; különben `sqrt(maxPixels / (cssW·cssH))` (soha nem nagyobb `base`-nél, soha nem ≤ 0).
   - `isLightGraphicsFrom({ tier, reducedMotion, memoryGb }): boolean` — `tier === "low" || reducedMotion || (memoryGb !== null && memoryGb <= 4)`
     (a Szökőár `isLowEnd` szabálya).
   - `LIGHT_GRAPHICS_MAX_PIXELS = 1_000_000`.
   Teszt: `source/tests/pixel-budget.test.ts` (belefér → base; 827×835 @1,5 → ≤ 1,0 Mpx és arányos; `null` → base; 0 méret → base;
   a három „könnyű” jel külön-külön; erős telefon → hamis).
2. `source/client/src/lib/voxelSunShade.ts`:
   - `sunShadeAt(solidAt, leafAt, x, y, z, maxY): 0 | 1 | 2` — a (x, y+k, z−k) és a (x, y+k, z−k+1) cellákon lépked k = 1 … (maxY − y):
     tömör (nem lomb) találat → 2 (árnyék); csak lomb találat → 1 (lombszűrte); semmi → 0. A `solidAt(x, y, z)` a rácson kívül hamis.
   - `SUN_SHADE_TINT: readonly [r, g, b][]` = `[[1, 1, 1], [0.58, 0.62, 0.72], [0.46, 0.5, 0.62]]`.
   Teszt: `source/tests/voxel-sun-shade.test.ts` (szabad ég → 0; közvetlenül a nap felőli átlóban tömör → 2; csak lomb → 1; lomb
   mögött tömör → 2; a rács széle → 0; a naptól elfelé eső blokk nem árnyékol).
3. `source/client/src/game-engine/perf/perfStats.ts`, `perfOverlay.ts`, `source/tests/perf-stats.test.ts` — változatlan áthozás a
   `perf/kockavadasz-telefon` ágról (`git show perf/kockavadasz-telefon:<út>`), egy bővítéssel a `perfOverlay.ts`-ben:
   `PerfControls.simpleLabel?: readonly [string, string]` (a gomb két felirata; alap: „PBR” / „egyszerű”).

Parancs: `cd source && node --import tsx --test tests/perf-stats.test.ts tests/pixel-budget.test.ts tests/voxel-sun-shade.test.ts` → mind `pass`.
Utána `npm run gate:stage`.

## 2. feladat — `source/client/src/pages/BlockCraftQuiz.tsx` (kicsi, elkülönülő változások)

1. `makeBlockMaterials(lite: boolean)`: `lite` esetén `MeshLambertMaterial` (a `roughness` / `metalness` nélkül; `emissive*` marad),
   a víz `MeshPhongMaterial({ map, transparent: true, opacity: 0.78, shininess: 90, specular: 0x8fb8d8 })`, a lomb
   `transparent` / `opacity` / `alphaTest` nélkül. `lite === false` → a mostani kód bájtra.
2. Jelenet-effekt:
   - `const lite = tier !== "high";`
   - `applyRendererLook(renderer, tier, { exposure: 1.0, shadows: !lite })`.
   - `maxAniso`: `tier === "low" ? 1 : Math.min(lite ? 2 : 8, getMaxAnisotropy())`.
   - `rebuildWorld`: ha `!shadowsOn`, a példányok színe `SUN_SHADE_TINT[sunShadeAt(…)]` (`mesh.setColorAt`, a víz kimarad);
     `instanceColor.needsUpdate = true`.
   - Méret: `let sizeDirty = true;` + `ResizeObserver(() => { sizeDirty = true; })` a `canvas.parentElement`-en és `window` `resize`;
     a hurokban `if (sizeDirty) { sizeDirty = false; syncSize(); }`; `ResizeObserver` nélkül a régi, képkockánkénti hívás.
     Takarításkor `disconnect` + `removeEventListener`.
   - Könnyű grafika: `const lightGraphics = isLightGraphicsFrom({ tier, reducedMotion: reducedMotionRef.current, memoryGb })`;
     a `syncSize` a `renderer.setPixelRatio(pixelRatioForBudget(width, height, basePixelRatio * perfScale, lightGraphics ? LIGHT_GRAPHICS_MAX_PIXELS : null))`-t
     hívja a `setSize` előtt (ha nem könnyű mód és `perfScale === 1`, az érték a mostani — G-5).
   - Köd: `const fog = new THREE.FogExp2(…); scene.fog = fog;` — az `applyLevelLook` a `fog` állandót használja.
   - Panel: `perfControls` (`shadowsAvailable: shadowsOn`; `setShadows`; `setResolution` → `perfScale`; `setSimpleMaterials` → a
     másik anyagkészlet lustán (`makeBlockMaterials(!lite)` + ugyanaz a textúra-előkészítés és „AO”), az `instMeshes` anyagának cseréje,
     és a `rebuildWorld` az aktuális készletből vesz; `setFog`); `simpleLabel`: lite → `["Lambert", "PBR"]`, high → `["PBR", "egyszerű"]`;
     dinamikus `import("@/game-engine/perf/perfOverlay")` csak `perfEnabledFrom(location.search)` esetén; `perf?.frameStart(now)`,
     `perf?.beforeRender()`, `perf?.afterRender()` a hurokban; takarításkor `dispose`.
   - `renderCountRef` a komponens tetején (a panel „React-render / s” sora).
3. Más nem változik. `npm run gate:stage`.

## 3. feladat — böngészős teszt

`source/tests/blockcraft-perf-panel.spec.ts` áthozva és a main lapjához igazítva (a main indítási útja: `bc-start`, a HUD
`bc-touch-controls`); `look=medium` mellett az „Árnyék” gomb felirata „Árnyék: nincs” és le van tiltva (G-1), a vászon szélessége
alapból `827 × 1,5` (G-5), a felbontás-kapcsoló 75 / 50 % (E-4), az anyag- és köd-kapcsoló után a jelenet tovább rajzol; paraméter
nélkül nincs panel. Új eset: `look=high` mellett az „Árnyék: be” gomb él (G-4).
Futtatás külön lépésben a sorompó után: `cd source && npm run test:e2e -- tests/blockcraft-perf-panel.spec.ts --workers=1`.

## 4. feladat — képi ellenőrzés (kötelező)

Szkript a scratchpadban (`kockavadasz-telefon/shots.mjs`): az „előtte” és az „utána” teszt-kampós build ugyanazzal a `?seed=`-del,
`/api` csonkolva (mint az e2e-ben), `look=medium`; nézetek: 360×640, 390×844, 844×390 (dpr 3) és 827×896 (dpr 2,625); jelenetek:
kezdő nézet, körbefordulás (erdő), séta utáni nézet, víz, árnyékos / barlangos rész (amennyire a magból elérhető), kérdés nyitva.
A képek: `docs/measurements/2026-11-17-kockavadasz-telefon-gyors/{elotte,utana}/<nézet>-<jelenet>.png` (lekicsinyítve, hogy a repó
ne hízzon). Mindegyik párt meg kell nézni (Read): lapos-e a kép, van-e hibás szín / csíkozódás / hiányzó blokk / levágott HUD.

## 5. feladat — mérés előtte / utána

`gpu-measure.mjs --mode ab` (scratchpad): a két build, azonos seed, kihajtott nézet és 390×844, plafon nélkül; GPU-idő
(`EXT_disjoint_timer_query_webgl2` a rAF-visszahívás körül), szinkron képkocka-költség (`readPixels`), hívás, háromszög, fps.
A tábla ide (lent) és a PR-leírás tervezetébe; megjegyzés: asztali GPU, valódi telefonon nem mért.

## 6. feladat — teljes ellenőrzés és zárás

- Külön lépésekben, sorompó után, `--workers=1`: `tests/blockcraft-play.spec.ts` (ha a mainen létezik), a közös mobil mérő
  (`playwright.game-mobile.config.ts`) block-craft esetei, a meta-mérő (`game-meta-quality.spec.ts`) block-craft esete.
  Az ismert ingadozó `joystick-response` block-craft esetet, ha CSAK az bukik, jelenteni kell, nem javítani.
- `npm run gate:stage` szakaszonként; a végén `npm run gate:push`.
- Megállás a PR előtt: fej-hash, képek útvonala, mérőtábla → független ellenőr (orkesztrátor indítja).

## 7. Mit kell a #484 új megjelenítési kódjában megismételni (a #484 gazdájának, a main beolvasztásakor)

A #484 a `BlockCraftQuiz.tsx` jelenet-effektjét átírta (`createGameRenderer`, cellánkénti `InstancedMesh`-frissítés), ezért ez a
szelet ott ütközni fog. A feloldásnál a #484 kódját kell megtartani, és ezt az öt pontot rátenni:

1. **Árnyék ki telefonon:** `createGameRenderer(canvas, tier, { exposure: 1.0, shadows: tier === "high" })`.
2. **Sütött árnyék:** az `addCell(idx, t, x, y, z)`-ben a `setMatrixAt` mellé `setColorAt(slot, SUN_SHADE_TINT[sunShadeAt(…)])`
   (ha `!shadowsOn` és `t !== WATER`), `instanceColor.needsUpdate = true`; a `removeCell` cserés törlésénél a színt is át kell
   másolni (`getColorAt(last)` → `setColorAt(slot)`); az `updateDirtyCells`-ben a megváltozott cella ALATTI átló (x, y−k, z+k és
   z+k−1, k = 1 … y) celláinak színét újra kell számolni (bányászás után az árnyék eltűnik) — a mainen ezt a teljes `rebuildWorld` adja.
3. **Anyagok:** `makeBlockMaterials(lite)` (Lambert / Phong / átlátszatlan lomb), a #484 új `RUNE_ORE` anyagával együtt
   (`emissiveMap` Lamberten is működik); **anizotrópia** `Math.min(lite ? 2 : 8, …)`.
4. **`ResizeObserver` + `sizeDirty`** a `syncSize()` képkockánkénti hívása helyett; a könnyű grafika képpont-plafonja a `syncSize`-ban.
5. **Panel:** a `perf/kockavadasz-telefon` ág `ee5b52a8` commitja már tartalmazza a #484-re illesztett bekötést (ott a „Anyag”
   kapcsoló saját Lambert-készletet épít — a `makeBlockMaterials(!lite)`-re cserélendő); a `game-engine/perf/*` modulok azonosak.

## Mért eredmények

### Mérés előtte / utána (asztali GPU — valódi telefonon NEM mért)

Gép: AMD Radeon 890M (integrált), fejes Chrome, vsync-plafon nélkül (`--disable-gpu-vsync --disable-frame-rate-limit`).
„Előtte” = `origin/main` `b4b84db6`, „utána” = ez az ág; mindkettő teszt-kampós build, `look=medium`, ugyanaz a magozott világ
(a `Math.random` az indítás előtt újramagozva, mag: 21), `/api` csonkolva (éles hívás nincs). GPU-idő =
`EXT_disjoint_timer_query_webgl2` a képkocka-visszahívás körül (3 s átlaga); a szinkron képkocka-költség (`readPixels`) ~3,5 ms
állandó többletet tartalmaz. Szkript és nyers adatok a repón kívül (scratchpad `kockavadasz-telefon/ab-measure.mjs`, `runs/ab-*.json`).

**Kihajtott nézet (827×896 CSS, dpr 2,625 → vászon 1240×1252 = 1,55 Mpx — előtte és utána AZONOS)**

| Jelenet | GPU-idő r1 (előtte → utána) | GPU-idő r2 | fps r1 | fps r2 | szinkron ms r1 | hívás / háromszög |
|---|---|---|---|---|---|---|
| kezdő (talaj) | 2,42 → 1,68 ms (−31 %) | 2,71 → 1,66 (−39 %) | 308 → 408 | 376 → 381 | 5,5 → 4,7 | 24 / 80 076 |
| horizont | 2,94 → 1,94 (−34 %) | 2,85 → 1,52 (−47 %) | 317 → 408 | 312 → 408 | 5,7 → 4,7 | 35 / 80 220 |
| erdő | 1,80 → 1,41 (−22 %) | 2,57 → 1,29 (−50 %) | 410 → 446 | 374 → 430 | 5,3 → 4,5 | 26 / 80 112 |
| víz felé | 2,60 → 1,62 (−38 %) | 2,57 → 1,64 (−36 %) | 369 → 473 | 355 → 450 | 5,1 → 4,1 | 27 / 80 460 |

**Telefon (390×844 CSS, dpr 3 → vászon 585×1174 = 0,69 Mpx — azonos)**

| Jelenet | GPU-idő r1 | GPU-idő r2 | fps r1 | fps r2 | hívás / háromszög |
|---|---|---|---|---|---|
| kezdő (talaj) | 2,20 → 0,80 ms (−64 %) | 2,48 → 1,30 (−48 %) | 452 → 492 | 352 → 663 | 24 / 80 076 |
| horizont | 2,10 → 0,76 (−64 %) | 2,50 → 1,29 (−48 %) | 454 → 459 | 369 → 562 | 27 / 80 124 |
| erdő | 1,59 → 1,17 (−26 %) | 2,03 → 1,15 (−43 %) | 527 → 487 | 396 → 600 | 23 / 80 076 |
| víz felé | 1,61 → 1,48 (−8 %) | 2,04 → 1,03 (−50 %) | 526 → 501 | 391 → 614 | 26 / 80 112 |

Olvasat, őszintén: a GPU-idő minden jelenetben és mindkét futásban csökkent (kihajtva −22 … −50 %, telefon-nézetben −8 … −64 %);
a szórás nagy (n = 2, a 390×844 r1 futásban két jelenet fps-e az „utána” oldalon kisebb volt — zaj). A rajzolási hívások és a
háromszögszám NEM változott (ez a szelet a képpont-költséget csökkenti, nem a geometriát). A vászon képpontmérete változatlan
(G-5). Mindez asztali, azonnali módú GPU-n igaz; a telefon csempés GPU-ján az árnyék-mintavétel és az anizotróp szűrés aránya más
lehet (UNVERIFIED) — a tulajdonos `?perf=1` fotója dönt. NOT RUN: valódi telefon; séta / bányászás közbeni mérés; low és high szint.

### Képi ellenőrzés (megnézve, előtte / utána párban)

Képek: `docs/measurements/2026-11-17-kockavadasz-telefon-gyors/` — `lap-fold.jpg`, `lap-p390.jpg`, `lap-p360.jpg`, `lap-l844.jpg`
(összevető lapok: kezdő nézet, horizont, három fordulat — erdő, domboldal, víz —, két séta utáni nézet, lomb alulról, kérdés
nyitva), `par-viz-arnyek.jpg` (nagyított pár), `elotte/` és `utana/` (a kihajtott és a 390×844 nézet egyenkénti képei). Mag: 21,
`look=medium`.

Megállapítások: a színek, a textúra élessége, a köd és a HUD a párokban megegyezik; hiányzó blokk, csíkozódás, levágott HUD nincs.
Látható különbségek: (1) a fák talajra vetett árnyéka megvan, de kockánkénti (szögletes folt a törzs mellett), kisebb és
keményebb szélű, mint az árnyéktérkép lágy, hosszú árnyéka; (2) a víz csillanása a part mentén halványabb; (3) a lomb teljesen
fedő (a 7 %-os áttetszőség eltűnt) — képen nem észrevehető. A kép nem lapos: a domboldalak árnyékos oldala, a lomb alja és a fák
alja sötétebb. Barlang / fedett rész a kezdő pályán a magból nem érhető el a szkripttel — NOT RUN (a legközelebbi megfelelő a lomb
alatti és a domb mögötti rész). Időjárásos pályák (eső, hó, homokvihar): NOT RUN.

### Tesztek

- `node --import tsx --test tests/perf-stats.test.ts tests/pixel-budget.test.ts tests/voxel-sun-shade.test.ts` → 26 / 26.
- `npm run test:e2e -- tests/blockcraft-perf-panel.spec.ts tests/blockcraft-two-finger.spec.ts --workers=1` → `9 passed (1.0m)`.
- `npx playwright test -c playwright.game-mobile.config.ts -g "block-craft" --workers=1` (közös mobil mérő, meta-mérő, joystick-reakció block-craft esetei) → `40 passed (4.3m)`.
