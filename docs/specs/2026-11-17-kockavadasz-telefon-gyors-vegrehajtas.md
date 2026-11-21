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
   - `sunShadeAt(occluderAt, x, y, z, maxY): 0 | 1 | 2` — EGYETLEN átlón lépked: a (x, y+k, z−k) cellákon, k = 1 … amíg y+k < maxY
     (review F3: a kód így működik, a korábbi „két átló” leírás hibás volt). `occluderAt` 2 = tömör blokk → 2 (árnyék, azonnal);
     1 = lomb → legalább 1 (lombszűrte); semmi → 0. Az `occluderAt` a rácson kívül 0.
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
   másolni (`getColorAt(last)` → `setColorAt(slot)`); az `updateDirtyCells`-ben a megváltozott (x, y, z) cella ALATTI egyetlen átló — a
   (x, y−k, z+k) cellák, k = 1 … y — színét újra kell számolni (ugyanaz az átló visszafelé, mint a `sunShadeAt` bejárása) (bányászás után az árnyék eltűnik) — a mainen ezt a teljes `rebuildWorld` adja.
3. **Anyagok:** `makeBlockMaterials(lite)` (Lambert / Phong / átlátszatlan lomb), a #484 új `RUNE_ORE` anyagával együtt
   (`emissiveMap` Lamberten is működik); **anizotrópia** `Math.min(lite ? 2 : 8, …)`.
4. **`ResizeObserver` + `sizeDirty`** a `syncSize()` képkockánkénti hívása helyett; a könnyű grafika képpont-plafonja a `syncSize`-ban.
5. **Panel (a vak review #504 L1/L3 után):** a `createPerfOverlay` hívásban `isRunning: () => runningRef.current` (a „fut / áll”
   jelző a játék valódi állapota, nem becslés) és `getTopInset` (a panel a pályajelző alá, vízszintesen középre kerül); a
   `perfEnabledFrom` importja a `@/game-engine/perf/perfFlag` modulból jön.
   Korábbi pont: **Panel:** a `perf/kockavadasz-telefon` ág `ee5b52a8` commitja már tartalmazza a #484-re illesztett bekötést (ott a „Anyag”
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
nyitva), `par-viz-arnyek.jpg` (nagyított pár), `lap-akna.jpg` (5 blokk mély, lefelé ásott akna alja: oldalra és felfelé nézve).
Az egyenkénti képek a review F7 szerint nincsenek a repóban (a scratchpadban maradtak). Mag: 21,
`look=medium`.

Megállapítások: a színek, a textúra élessége, a köd és a HUD a párokban megegyezik; hiányzó blokk, csíkozódás, levágott HUD nincs.
Látható különbségek: (1) a fák talajra vetett árnyéka helyett csak alig észrevehető, kockánkénti folt marad a törzs mellett (a hosszú, lágy árnyék eltűnik), kisebb és
keményebb szélű, mint az árnyéktérkép lágy, hosszú árnyéka; (2) a víz csillanása a part mentén halványabb; (3) a lomb teljesen
fedő (a 7 %-os áttetszőség eltűnt) — képen nem észrevehető. A kép nem lapos: a domboldalak árnyékos oldala, a lomb alja és a fák
alja sötétebb. Zárt tér (review F4): lefelé ásott, 5 blokk mély akna alján mindkét változat — az „utána” kép falai nem sötétebbek, inkább
világosabbak (a régi árnyéktérkép az akna falát is árnyékolta), ezért a szórt fényt nem kellett külön kezelni. Természetes barlang
a kezdő pályán nincs: NOT RUN. Időjárásos pályák (eső, hó, homokvihar): NOT RUN.

### Tesztek

- `node --import tsx --test tests/perf-stats.test.ts tests/pixel-budget.test.ts tests/voxel-sun-shade.test.ts` → 26 / 26.
- `npm run test:e2e -- tests/blockcraft-perf-panel.spec.ts tests/blockcraft-two-finger.spec.ts --workers=1` → `9 passed (1.0m)`.
- `npx playwright test -c playwright.game-mobile.config.ts -g "block-craft" --workers=1` (közös mobil mérő, meta-mérő, joystick-reakció block-craft esetei) → `40 passed (4.3m)`.

### Vak review #504 (8e72fe90) — javítások

| Lelet | Javítás | Teszt (előbb bukó) |
|---|---|---|
| L1 (közepes) „fut / áll” falióra-becslés | `LoopClock` (`perfStats.ts`): elsődleges a játék jelzője (`isRunning` → `runningRef.current`); a tartalék becslésnél a ≥ 1 s-os rés után `lastDt = 0` | `perf-stats.test.ts` „LoopClock” — 150/150/1600 ms, 19 gyors + 2500 ms, szünet → 1 képkocka → szünet, tartalék-rés: a régi viselkedéssel 4 / 4 bukott |
| L2 `perfStats` a játék darabjában | `perfEnabledFrom` külön modulban (`perfFlag.ts`); a `perfStats`-ot csak a panel tölti be | a játék nem importálja a `perfStats`-ot (kódellenőrzés) |
| L3 panel a vezérlők / HUD fölött | a panel a pályajelző alatt, vízszintesen középen, kompaktabb (7 sor), áttetszőbb; fekvő, alacsony nézetben a két oldalsó 170 px-es vezérlősáv szabad — a joystick bármelyik oldalra kerülhet | böngészős: fekvő 800×360 és álló 360×800 — a panel nem fed vezérlőt, a pályajelző alatt kezdődik |
| L4 nincs viselkedés-teszt | böngészős: szünet → „áll” azonnal, folytatás → „fut”, rövid folytatás → szünet → „áll”; méretkövetés három nézetméreten | lásd ott |
| L5 `render()`-kivétel után beragadt mérés | a `begin` lezárja és eldobja a félbemaradt lekérdezést (torz, két képkockás minta nem kerül az átlagba) | `gpu-timer.test.ts` „kivétel a render() alatt” — a régi kóddal bukott (a torz minta bekerült) |
| L6 sötét lombbelső | nem változott (a terv vállalja; tulajdonosi ízlés) | — |

### 2026-11-21 — vak kör (86df05ae)

- **L1 (blokkoló) — valódi.** Az FPS-mintát a `frameStart` írta, a megszakadó rajzolás is minta lett. Javítás: `DrawnFrameClock` (`perfStats.ts`), a minta csak a sikeres `afterRender`-ben születik, a köz az előző sikeres kirajzolástól számít, újrainduláskor megszakad. Teszt (előbb bukott): `perf-stats.test.ts` „DrawnFrameClock”; böngészős „megszakadó rajzolásnál …” (draw-kivétel élő rAF mellett; régi kód: 14 minta, 112 FPS).
- **L2 (közepes) — valódi.** Elveszett kontextuson a `render()` rajzolás nélkül tér vissza, a panel kirajzolt képkockának könyvelte. Javítás: `afterRender` `gl.isContextLost()` esetén nem számol, nem ad mintát, megszakítja a sort és a futó GPU-próbát (`null`); a `webglcontextlost` üríti a mintaablakot. Teszt (előbb bukott): böngészős „WebGL-kontextusvesztéskor …” (`WEBGL_lose_context`; régi kód: a próba 0-t adott).
- **L3 (közepes) — valódi.** A százalék a plafon ELŐTT szorzott, aktív plafonnál 75 % = 100 %. Javítás: `scaledPixelRatio` (`pixelBudget.ts`), a plafonos 100 %-os arányt skálázza; `BlockCraftQuiz.tsx` ezt hívja. Teszt (előbb bukott): `pixel-budget.test.ts` „scaledPixelRatio”; böngészős „könnyű grafika módban …” (950×1000, 4 GB; régi kód: 75 %-on 251 px-es eltérés).
- **L4 (kicsi) — valódi.** A panel csak a pályajelző aljához igazodott, a sort törő súgót takarta. Javítás: a felső HUD tárolója `data-testid="bc-top-hud"`, a `getTopInset` ennek az aljához igazít. Teszt (előbb bukott): böngészős „álló 360×640-en …” (régi kód: panel teteje 114, súgó alja 138).
- Ellenőrzés: `npx tsc --noEmit` zöld; az érintett egységtesztek 77 / 77; `npm run test:e2e -- tests/blockcraft-perf-panel.spec.ts tests/blockcraft-two-finger.spec.ts` → `23 passed`. Valódi Honor Magic V6 mérés továbbra is NOT RUN (fizikai eszköz kell).

### 2026-11-21 — 2. vak kör (d1d73559)

- **L1 (közepes) — valódi.** Kapcsoláskor a mintaablak kiürült, de az előző sikeres kép időbélyege megmaradt, így a váltás előtti várakozás az új mód első mintája lett. Javítás: `DrawnFrameClock.reset()` (`perfStats.ts`), az `applyToggles` hívja (`perfOverlay.ts`). Teszt (előbb bukott): `perf-stats.test.ts` „kapcsolás (reset) után …”; böngészős „anyagváltás után az első új kép …” kézi rAF-fal, az első és a második új képet külön méri (régi kód: az első új kép 1275 ms-os mintát adott).
- **L2 (közepes) — valódi.** A `ResizeObserver` a rAF-lépés után jelez, a festett első kép még a régi pufferrel készült. Javítás: `BlockCraftQuiz.tsx` `onParentResize` — futó hurokban a megfigyelő hívásában azonnal `syncSize()` és újrarajzolás (képkockánkénti elrendezés-olvasás nélkül). Teszt (előbb bukott): böngészős „a szülő méretváltozása után az ELSŐ festett kép …” — a képkocka utolsó rajzolásának pufferszélességét méri (régi kód: 1240 a várt 1071 helyett).
- **L3 (közepes) — valódi.** Időtúllépéskor a próba a részleges minták mediánját teljes eredményként adta. Javítás: `probeOutcome` / `probeLabel` (`perfStats.ts`); részleges vagy üres próba → `null`, felirat „részleges n/N”; a pillanatképben `gpuProbe` (mintaszám, részlegesség). Teszt (előbb bukott): `perf-stats.test.ts` „probeOutcome” (teljes / részleges / üres); böngészős „részleges GPU-próba …” (régi kód: 2/40 mintából 32,6 ms). Terv: `2026-11-17-kockavadasz-telefon.md` 6. szakasz kiegészítve.
- **L4 (kicsi) — valódi tesztrés (nem termékhiba).** A kapcsolótesztek csak feliratot és képszámot néztek. Javítás: WebGL-hatásmérő a böngészős tesztben (`installGlProbe`): a fő renderpassz programjai (PBR / Lambert / köd / árnyékot fogadó megvilágított anyag) és az árnyéktérkép-rajzolás. Mutánssal igazolva: `setShadows` és `setFog` no-op → 2 teszt bukik (286 árnyékos / ködös rajzolás), `setSimpleMaterials` no-op → bukik (0 PBR-rajzolás); visszaállítva zöld.
- **L5 (kicsi) — valódi dokumentációs eltérés.** A gyors terv 7. szakasza a kód szerinti működést írja le: befejezett kirajzolás a mérce, kivétel / fagyás „áll”, türelmi idő az első befejezésig, 5000 ms-os közkorlát. A kód és a jelzés nem változott.
