# A hét játék 3D-s látványának feljavítása (2026-09-29)

## Kérés
„Nézd át a websuli bankban található összes játékot, és mindegyiknek javítsd a 3D grafikáját …
mutasd meg, milyen szép, milyen háromdés tudod tenni az összes kis egyszerű játékot, hogy a
gyerekek szívesebben játsszanak vele.”

## Kiindulás (felderítve 2026-09-29, `source/` alatt)
Hét játék (`client/src/pages/`), útvonal az `App.tsx`-ben, mind `lazy()` importtal.

| Játék | Megjelenítés most | Kiinduló kép (800×600 pane) |
| --- | --- | --- |
| `SpaceAsteroidQuiz.tsx` | three.js, felülnézet | sötét kék háttér, apró hajó, lapos fények; nincs tónusleképezés, nincs ragyogás |
| `TornadoHunter200.tsx` (+ `tornado/buildMeshes.ts`) | three.js, 3. személy | szürke-zöld síkság, lapos Lambert-fény, fakó égbolt, nincs árnyék |
| `BlockCraftQuiz.tsx` | three.js, FPS voxel | textúrás kockák (ez a legjobb), de nincs árnyék, egyszínű ég |
| `TsunamiEscapeEnglish.tsx` | DOM/CSS oldalnézet | lapos vonal-platformok, CSS-víz, doboz-figura |
| `SpeedQuizMath.tsx` | DOM/CSS „izometrikus” lépcső | lapos kék téglák, kis figura |
| `WordLadderHuEn.tsx` | DOM/CSS létra oldalt | keskeny barna létra, emoji-figura |
| `BrainRotSteal.tsx` | DOM/CSS aréna | lila rács, lapos avatárok |

Tények a kódból:
- A három 3D játék rendererje: `SpaceAsteroidQuiz.tsx:1034`, `TornadoHunter200.tsx:1110`,
  `BlockCraftQuiz.tsx:1547`; a render-hívás: `:2023`, `:1657`, `:1834`. Egyiknél sincs
  `toneMapping`, `shadowMap`, `scene.environment`, utófeldolgozás.
- A Tornado szándékosan „olcsó” (`tornado/buildMeshes.ts:1-12`: Lambert, flat shading, NINCS árnyék,
  NINCS textúra) és van saját minőségi profilja: `QUALITY_PROFILES` (`buildMeshes.ts:37`), a
  `settings.quality` (`low|medium|high`) a játékos választása (`TornadoHunter200.tsx:751`).
- `three@0.184` + `@types/three@0.184` telepítve; az `examples/jsm` alatt elérhető `EffectComposer`,
  `RenderPass`, `UnrealBloomPass`, `OutputPass`, `RoomEnvironment` (ellenőrizve `ls`-sel).
- `useReducedMotion()` közös hook (`game-engine/useReducedMotion.ts`).
- A fejlesztői gép GPU-ja: RTX 5090 (ANGLE/D3D11) — a mérőkép ezen készül; a gyerekek gépe NEM ilyen,
  ezért a minőségi szint kötelező.

## Cél
1. Mind a hét játék **valódi, élő 3D jelenettel** rendelkezzen, gyerekbarát, színes, „játékszerű”
   (stilizált, nem fotórealisztikus) látvánnyal: fény-árnyék, mélység, ragyogás, mozgó részletek.
2. A három meglévő 3D játék látványa érezhetően jobb legyen (tónusleképezés, környezeti fény,
   árnyék/ragyogás a minőségi szint szerint, szebb ég, részecske-effektek).
3. A négy DOM-os játék játéktere kapjon three.js 3D jelenetet, amely a játék MEGLÉVŐ állapotát
   jeleníti meg — a játéklogika, a kvíz, a pontozás változatlan.
4. Gyenge gépen/telefonon se romoljon a játszhatóság: automatikus minőségi szint.

## Nem cél
- Játékmenet, fizika, nehézség, kvíz-logika, pontozás, kupon, achievement módosítása.
- Új játék, új útvonal, katalógus-változás.
- Külső 3D modell/textúra-fájl (glTF, kép) — minden procedurális, a bundle-ban.
- A HUD/kvíz-panel (DOM) áttervezése; csak a játéktér vizuális rétege változik.
- A vezérlés (joystick, billentyű) módosítása.

## Rögzített döntések
1. **Közös látványmodul**: `client/src/game-engine/three-look/` — egy helyen a renderer-beállítás,
   minőségi szint, környezeti fény, ragyogás (bloom), gradiens ég, csillogó-részecske, izzó sprite.
   Minden játék ezt használja; játékonkénti másolat tilos.
2. **Minőségi szint (`LookTier`: `low|medium|high`)** automatikusan:
   - `low`: szoftveres WebGL (`SwiftShader`/`llvmpipe`/`Software` a renderer-névben), vagy
     `hardwareConcurrency <= 4`, vagy `deviceMemory <= 2`.
   - `medium`: durva mutató (érintőképernyő) vagy `deviceMemory <= 4`.
   - `high`: minden más.
   - Felülírás: `?look=low|medium|high` URL-paraméter (mérőképekhez, hibakereséshez).
   - A Tornado a játékos saját `settings.quality` választását használja (az a felhasználó döntése).
3. **Szintenkénti költségkeret**:
   | | low | medium | high |
   | --- | --- | --- | --- |
   | tónusleképezés (ACES) | ✅ | ✅ | ✅ |
   | pixelarány-plafon | 1 | 1.5 | 2 |
   | környezeti fény (PMREM, `RoomEnvironment`) | ❌ | ✅ | ✅ |
   | árnyék (PCFSoft, egy irányfény) | ❌ | ✅ (1024) | ✅ (2048) |
   | bloom (`UnrealBloomPass` + `OutputPass`) | ❌ | ❌ | ✅ |
   | részecskeszám-szorzó | 0.4 | 0.7 | 1.0 |
   A `medium` és `low` szinten az izzást additív „glow sprite” pótolja (olcsó).
4. **Reduced motion**: a dekoratív mozgás (lebegés, kamera-rázkódás, részecske-eső) `useReducedMotion`
   esetén kikapcsol vagy minimálisra csökken; a játékállapot megjelenítése marad.
5. **DOM-os játékok**: a 3D vászon a játéktér HÁTTERE (`absolute inset-0`, `pointer-events: none`,
   `aria-hidden`), a meglévő interaktív/tesztelt DOM-elemek maradnak. A vizuálisan kiváltott DOM-díszek
   (CSS-víz, CSS-platform-csík, emoji-figura) eltávolíthatók, ha teszt nem hivatkozik rájuk; ha hivatkozik,
   maradnak, és a 3D réteg alattuk/felettük illeszkedik.
6. **WebGL nélkül** (a `getContext` null vagy a renderer-konstruktor dob): a DOM-os játékok a
   mostani DOM-látványra esnek vissza (nem fagy le a játék); a 3D játékok viselkedése változatlan.
7. **Erőforrás-felszabadítás**: minden új geometria/anyag/textúra/render-target/composer/PMREM a
   komponens lebontásakor `dispose()`-t kap; a `ResizeObserver` és `requestAnimationFrame` leáll.

## Játékonkénti látványterv
### Aszteroida (neon űr)
Bloom (high), szín-ködös procedurális nebula több rétegben, kerek, pislákoló csillag-sprite-ok
(parallaxis), távoli bolygó gyűrűvel és atmoszféra-peremfénnyel, hajtómű-csóva részecskékből,
találatkor szikra-robbanás, fémes-fényes hajóanyag a környezeti fény miatt. A kamera-konstansok
(`CAMERA_*`, `lib/spaceAsteroid/physics.ts`) NEM változnak — teszt őrzi a látható sávot.

### Tornádó (vihar-síkság)
ACES tónus, drámaibb égbolt-gradiens (napkorong-fénnyel), finomabb terep-színezés (magasság szerinti
árnyalat), a jármű alatt olcsó „blob” árnyék minden szinten, valódi árnyék a járműre `high` szinten,
por-felhő a kerekek mögött, villámláskor az ég felvillan. A meglévő köd/kupola/vágósík-párosítás
(`skyDomeRadiusFor`, `cameraFarFor`) és a cache-rendszer változatlan.

### Kockavadász (voxel)
ACES tónus, napárnyék (medium/high) a kockákra, gradiens égbolt napkoronggal, puhább, többrétegű
felhők, a víz enyhén áttetsző csillogással, bányászáskor szikra-részecske.

### Szókötél / Tsunami (oldalnézet)
Most: a jelenet `TsunamiEscapeEnglish.tsx:1328-1535`, DOM-rétegek (ég 1330, nap 1337, felhők 1348,
hegyek 1363, rács 1370, platformok 1405, biztonságos sáv 1427, játékos 1439, víz 1466, eső 1507).
Állapot %-ban: `surfacePct` (víz 5–88), `playerX` (8–92), `safeZoneX` (16–84), `stormFlash`,
`lightGraphics`; a `setWater/setPlayerX` 24 fps-sel frissül (950–955).
Új: `TsunamiScene3D` (új fájl) — gradiens ég, nap, felhők, 3D hegyek/sziget, a platformok 3D
pallók, a víz hullámzó shader-felszín a `surfacePct` magasságában, a játékos 3D kocka-figura
szörfdeszkán a víz felszínén (futó/billegő animáció), a biztonságos sáv világító bója-sáv,
vihar-villanás. A 3D a célértékek felé simít (lerp), így a 24 fps-es állapot is sima.
A HUD-chipek (1377–1402) DOM-ban maradnak. WebGL nélkül a mostani DOM-rétegek látszanak.

### Matek torony (SpeedQuiz)
Most: `components/MathTowerScene.tsx` SVG (`current`, `target`; 8 lépcső, `step = round(progress*7)`),
hívása `SpeedQuizMath.tsx:759`; `role="img"` + `aria-label` a burkolón.
Új: `MathTowerScene3D` — neon 3D lépcső-spirál a csillagos égen, a figura ugrással lép a
következő fokra, a célzászló a csúcson lobog, a teljesített fokok világítanak. Ugyanaz a prop-API
és ugyanaz a `role="img"`/`aria-label`; WebGL nélkül a mostani SVG-t rendereli.

### Szólétra (WordLadder)
Most: `wl-ladder` oszlop (`WordLadderHuEn.tsx:800-834`, 72/92 px széles), `Ladder` SVG (16 fok),
`Climber` SVG `motion.div`-ben, `climberBottomPct = 3 + rung/16*88`; zónák: meadow/forest/clouds/stars.
Új: `LadderScene3D` az oszlopban — 3D létra 3/4-es nézetben, a kamera követi a mászót, a háttér a
zóna szerint vált (rét → erdő → felhők → csillagok), a cél-csillag a tetején forog. A `wl-ladder` és
`wl-climber` testid-ek megmaradnak (a DOM-mászó átlátszó helyőrzőként marad, ha teszt hivatkozik rá).

### Brain Rot Lopás (aréna)
Most: aréna `BrainRotSteal.tsx:939-1071`, a lények kattintható DOM-gombok (`aria-label="Kapd el: …"`),
pozíció CSS-pixelben (a tábla bal felső sarkától), `CollectibleAvatar` SVG.
Új: `BrainRotArena3D` a tábla HÁTTERÉBEN — neon aréna-padló perspektívában, izzó perem, lebegő
kristályok; minden lény alatt a padlóra vetített izzó gyűrű (a DOM-pozícióból sugárvetéssel a padló
síkjára), elkapáskor 3D szikra-robbanás. A lények kattintható DOM-gombok maradnak.

## Teszt-kötöttségek (felderítve, betartandó)
- `tests/game-feedback-wiring-guard.test.ts:160-165`: a lapon a legnagyobb `z-[N]` kisebb legyen a
  `QuizFeedbackCard.tsx` z-értékénél → az új rétegek `z-0`/inline `zIndex: 0`.
- `tests/tornado-hunter-render.spec.ts:47`: a Tornado játékképernyőn pontosan EGY `canvas` lehet.
- `tests/games-pointer-controls.spec.ts:75-79`: Aszteroida/Kockavadász első `canvas`-a a játékvászon
  (magasság ≥ 60% viewport) → új canvas nem kerülhet eléjük a DOM-ban.
- `tests/game-viewport-experience.spec.ts:106-108`: menüben a játéktér nem látszik → a 2D játékok új
  vászna csak játék közben jelenik meg.
- `tests/games-touch-controls.spec.ts:167-196`: minden látható gomb ≥ 44×44 → új gomb nincs.
- `tests/tornado-sky-storm.test.ts`: `buildSkyDome` `BackSide`/`fog:false`/`depthWrite:false`, a kupola
  és vágósík viszonya; `buildStormCloud` anyagai `fog:false` → ezek megmaradnak.
- `tests/space-asteroid-visible-bounds.test.ts`: kamera-konstansok változatlanok.
- `tests/tornado-mobile-controls.test.ts:75`: `canvas[^>]{0,80}touch-none` a Tornado canvasán.
- `tests/speed-quiz-explanations.test.ts`, `quiz-bank-integrity.test.ts`, `game-quiz-explanations.test.ts`:
  a kérdésbankok sorai és nevei érintetlenek.

## Edge case-ek
- WebGL-kontextus elvesztése (`webglcontextlost`): ne dobjon kivételt; a 3D réteg újraépül vagy elrejtőzik.
- Nagyon kicsi konténer (0×0 mérés): a méret legalább 1×1 (a meglévő minta szerint).
- Oldal-elhagyás gyorsan a betöltés közben: a lebontás idempotens.
- Headless E2E (szoftveres WebGL): `low` szint — ne lassítsa a meglévő Playwright-teszteket.
- Retina telefon (DPR 3): a pixelarány-plafon miatt legfeljebb 2 (high) / 1.5 (medium).

## Elfogadási feltételek (EARS)
- **E1** Amikor bármelyik játék játéktere látszik, a rendszer SHALL egy WebGL `<canvas>`-t megjeleníteni
  a játéktérben (mind a 7 játék).
- **E2** Amikor a `LookTier` `high`, a rendszer SHALL bloomot és árnyékot használni azokban a játékokban,
  ahol a terv előírja; `low` szinten SHALL NOT bloomot, árnyékot, PMREM-et létrehozni.
- **E3** Minden 3D renderer SHALL `ACESFilmicToneMapping`-et és `SRGBColorSpace` kimenetet használni.
- **E4** Amikor a komponens lebomlik, a rendszer SHALL minden általa létrehozott renderert, composert,
  render-targetet és PMREM-textúrát felszabadítani.
- **E5** A játékmenet SHALL változatlan maradni: a meglévő unit-, szerződés- és wiring-guard-tesztek
  módosítás nélkül zöldek (`npm test`), a típusellenőrzés és a lint hibátlan.
- **E6** Minden játékról SHALL valós böngészős (1024×768 és 390×844 mobil) képernyőkép készülni
  játék közben, átfedés/levágás/vízszintes görgetősáv nélkül, konzol-hiba nélkül.
- **E7** Ha a WebGL nem érhető el, a DOM-os játékok SHALL a korábbi DOM-látvánnyal játszhatók maradni.
