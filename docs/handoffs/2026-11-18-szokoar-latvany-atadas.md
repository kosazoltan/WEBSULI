# Szökőár — a látvány átadása (2026-11-18)

Átvevő: friss alügynök. Ág: `fix/szokoar-tema-es-sebesseg`, munkafa: `.claude/worktrees/szokoar-tema`. Push / PR nincs.
Terv: `docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md` (7.2: C irány, Blender; 7.3: elrendezés ≤ 600 ms).
Végrehajtás: `docs/specs/2026-11-18-szokoar-tema-es-sebesseg-vegrehajtas.md` (8. lépés).

## A tulajdonos elvárása (szó szerint és összefoglalva)
- Az első képekre: „Ez iszonyatosan ocsmánytervezés. Használd a valamelyik szabad 3D-s tervezőt a pálya megalkotásához. Mert ez
  így nagyon csúnya. … erőltesd meg magad, és te készítsd el normálisan a szép 3D-s grafikát.”
- Döntés: „Telepítem a Blendert” — saját tervezésű pálya Blenderrel; modellcsomagot NEM töltünk le.
- Téma: emelkedő víz elől menekülés a hegyre; sodródó törmelék (nem autó, nem akadály); látványos szökőár; vonzó menedék;
  kedves figura; gyerekeknek való, mai mobiljáték-színvonal; telefonon ~60 fps.
- Minden lépés után valódi böngészős kép (390×844 és asztali), teljes útvonallal; a koordinátor mutatja a tulajdonosnak. A kapu
  zöldje nem elég.

## Mi van kész
**Blender-szkript:** `source/scripts/blender/szokoar/build_all.py` — fej nélkül: `"$BLENDER_BIN" -b -P source/scripts/blender/szokoar/build_all.py`
(Blender 5.3: `C:\Program Files\Blender Foundation\Blender 5.3\blender.exe`; az útvonal ne kerüljön a kódba).
- Modellek (névvel, a jelenet név szerint klónoz): `palm_a`, `palm_b` (ívelt, keskenyedő, lehajló levelek — `palm_leaf`),
  `rock_a/b/c`, `bush`, `hut_a`, `hut_b` (cölöpház), `lighthouse` (csíkos torony + kis ház + zászló), `debris_plank`,
  `debris_barrel`, `debris_crate`, `pier_post`.
- Modellenként egy mesh (a részek összevonva), Meshopt-tömörítés, `PALETTE` a szkript elején.
- Kimenet: `source/client/public/models/szokoar/szokoar-props.<hash>.glb` + `manifest.json` (most ~134 KB, 4744 háromszög).
- Keret-őr: `source/tests/tsunami-models-budget.test.ts` (fájl ≤ 200 KB, ≤ 15 000 háromszög, ≤ 20 mesh, ≤ 60 primitív).

**Jelenet:** `source/client/src/game-engine/scenes/TsunamiScene3D.tsx`
- GLB-betöltés: `loadModels()` (a menü alatt; hiba / hiány esetén a primitív díszlet marad); `fitInto()` a régi tárgy
  magasságára igazít; `lambertize()` — nem „high” szinten Lambert-anyag (`lambertDecor`).
- Menedék: `shelter` csoport, benne a GLB `lighthouse` (`fitInto(shelter.group, lh, 1.5)`); deszka-magasság
  `SHELTER_TOP_PORTRAIT = 24` / `SHELTER_TOP_LANDSCAPE = 30` (a lap CSS-e `--ts-shelter-top`-ként ugyanezt használja).
- Paraméterek: ég `SKY_TOP` / `SKY_HORIZON` / `SKY_BOTTOM` (95–97. sor körül), köd `FOG_NEAR` / `FOG_FAR` (92–93.),
  nap `sunDirection` (`createGradientSky`) + `uSunDir` + a `layout()`-ban a `sunPoint` (`worldX(0.12, -400)`), víz-színek
  `uShallow` / `uDeep` / `uFrontTop` / `uFrontDeep`, hullámfal `waveWall` + `waveUniforms` (`uDanger`) és az `update()`-ben a
  `dz` / `wallTop` / `wallBottom`, figura `buildKid()` (gömbfej, kapszula-törzs — kódból, nem Blenderből), törmelék `debris`
  (a `update()`-ben ringatózik), kép-eltolás `live.shiftPx` (≈ 300 ms, `damp(…, 16)`).
- A víz képi leképezése a lapon: `WATER_VIEW_SCALE = 0.8` (`source/client/src/pages/TsunamiEscapeEnglish.tsx`).

## Ismert hibák (a következő kör feladata)
1. Álló nézetben, alacsony víznél a kép kifakult / fehéres (valószínűleg a balra áthelyezett nap fénye — UNVERIFIED).
2. A közeledő hullámfal alig látszik (a taraj csak foltokban; nem főszereplő) — közelebb és a kép középmagasságába kell.
3. A dombok még a régi kúpok (`buildTerrain`) — szikla-domb modell kell (Blender), a sziklák a talajon üljenek.
4. Rajzolási hívás 139–164 (cél ≤ 130) — példányosítás (`InstancedMesh`) a sziklákra / pálmákra / törmelékre.
5. A figura kerekded, de egyszerű; Blenderes, kedvesebb figura a mostani mozgásokhoz (`kid.armL/armR/legL/legR/head`) nincs kész.
6. A 4× lassított CPU-s indítási tüske telefonon 250 ms volt (cél ≤ 200 ms).

## Képek készítése
- **Fejlesztői build + teszt-kampó (magas víz is):** ideiglenes Playwright-spec a `source/tests/` alatt (NE commitold), futtatás
  `npm.cmd run test:e2e -- tests/<ideiglenes>.spec.ts --workers=1`; a vízszint: `window.__websuliGame.forceState({ water: 75 })`.
  Ez szoftveres (SwiftShader) megjelenítés, legalacsonyabb szint — a képre írd rá.
- **Valódi GPU:** a `source/scripts/perf/measure-game-frames.mjs` (fejes Chrome, valódi GPU) ideiglenes másolata, amely a
  `/models/` útvonalat is a helyi buildből szolgálja ki, és `--shot <mappa>`-ra képet ment (a kampó itt nincs, a víz alacsony).
  Előtte: `npx.cmd vite build` a `source` mappában.
- Mentés: `docs/measurements/szokoar-tema/latvany/` (eddig: `c1-*`, `c2-*`, `c3-*`).

## Teljesítménymérés
- Parancs (a `source` mappából): `node scripts/perf/measure-game-frames.mjs --out <mappa> --gpu real --view phone|fold --cpu 4 --rep <n> --game tsunami-english --local dist/public`
  (a `--local` az /api-t az élesről, a HTML-t és az /assets-et a helyi buildből veszi; a /models-hez a fenti módosított másolat kell).
- Alapvonalak: koordinátori 57,7 fps (390×844, 1×). Mérve a modellekkel: 1× CPU 59,9 fps, indítás 17 ms; 4× CPU telefon: indítás
  250 ms, játék 59,5 fps (p95 50 ms). A kihajtott (fold) 4× mérés terhelt gépen 12–20 fps volt — nyugodt gépen újra kell mérni
  (előtte: `docker ps --filter name=websuli-e2e-`).

## Ne felejtsd
- Háromfázisú rend, `gate:stage` szakaszonként, `gate:push` a végén (a `native-arch` önmagában ismert kivétel — C-75).
- Tesztet gyengíteni tilos; a `tsunami-play.spec.ts` elrendezés-esetei (≤ 600 ms-os nyugalom, figura / menedék szabadsága) maradnak.

## Kiegészítés — látvány 4. lépés (átvevő fejlesztő, 2026-11-18; terv 7.4, végrehajtás 9.)

**Elrendezés (360×640) — gyökérok és javítás:** `docs/agent-csapdak.md` C-76. A takarás-döntés a figura testére szól, a jelöltek
egy lépésben mérve; a nyitott kérdés alatt a kép-eltolás követi a figurát. A döntés NEM függ a tárcsa oldalától: a kérdés-sáv
alsó határa a vezérlők (`tsunami-touch-controls` gyerekei) mért tetejéből jön, a takarás a figura és a kérdés dobozaiból.

**Mi változott a látványban**
- Blender (`build_all.py`): sRGB-paletta → lineáris csúcs-szín, egy közös anyag, modellenként egy primitív; új: `cliff`, `hill`,
  `debris_log`, `kid_board / kid_torso / kid_head / kid_arm / kid_leg`. Két fájl: `szokoar-props.<hash>.glb` + `szokoar-kid.<hash>.glb`.
  A kimenet nem bájtazonos futásról futásra (a hash változik) — a manifestet és a GLB-ket együtt kell commitolni.
- Jelenet (`TsunamiScene3D.tsx`): hullámfal-shader (a horizont és a dombok fölé ér, a vízszinttel nő és közelít: `dz` 120 → 34,
  taraj a kép 71 → 86 %-áig), azúr ég + semleges tónusleképezés (`NeutralToneMapping`), viharos hangulat a veszéllyel, áttetsző
  vágott vízfal mélyvíz-háttérrel (a víz alatti hegy / cölöpök átderengenek), habgyűrű a hegy körül (`uCliff`), példányosított
  díszlet (`SPOTS`) és törmelék (`DRIFT`), összevont stégek cölöpökkel (`buildPlatforms`), a menedék a hegy tetején.
- A kódból épített díszlet már csak tartalék (`buildFallbackDecor`), ha a modellek nem töltődnek be.

**Hangolási pontok:** hullámfal — `waveMat` (színek: `deep / body / lit`, taraj: `edge`, habnyelvek: `tongues`), elhelyezés az
`update()`-ben (`dz`, `wallTop`); hegy — `CLIFF_Z`, `CLIFF_FLARE` (a Blender-szkriptben is!), `cliffScale` a `layout()`-ban;
díszlet-sűrűség — `SPOTS`, `hillK` / `propK` (keskeny képen kisebb).

**Képek (valódi GPU: AMD Radeon 890M, fejes Chrome, helyi build, csonk /api):** `docs/measurements/szokoar-tema/latvany/c4-*`
(`c4-elotte-*` = a lépés előtti állapot).

**Mérés (saját mérő, csonk /api, 390×844, dpr 3; a gépen közben 1–3 idegen e2e-konténer futott — zajos):**
rajzolási hívás 155 → 45 (asztali, bloommal: 166 → 59); háromszög 72,7 e → 65,5 e; 1× CPU: 57,8–58,7 fps (előtte 56,3–58,2);
4× CPU indítási leghosszabb képkocka 183–350 ms (előtte 283 ms) — a ≤ 200 ms NEM igazolt, nyugodt gépen újra kell mérni.

**Nyitva maradt**
- A 4× CPU-s indítási tüske nyugodt gépen mérve; menet közben egy 200–900 ms-os hosszú képkocka az első kérdés körül (a lépés
  előtt is megvolt: 183–583 ms) — ok-feltárás kell (CPU-profil).
- Álló nézetben alacsony víznél a hullámfal csak a bal domb és a hegy közti résben látszik (távol van) — ha kell, a bal domb
  alacsonyabb lehet.
- Fekvő nézetben a figura oldalra mozogva a szélső válasz-oszlop alá kerülhet (a követő eltolás csak álló nézetben él).
- Valódi telefon: UNVERIFIED.

## Kiegészítés — csiszoló kör (terv 7.5, végrehajtás 10.)

- **Lagg gyökéroka:** C-77 (lusta `new AudioContext()` az első kérdés suhogásánál, 0,8–2 s). Javítva `prewarmAudio()`-val a
  menü alatt. A közös director minden játékban így viselkedik — a többi játékban is be kell kötni (kanban-javaslat).
- **Maradék:** megoldás-kijelzéskor 50–160 ms-os képkockák (a GPU a DOM raszterhez Skia-shadert fűz össze); ritkán 350–500 ms-os
  GPU-megakadás tétlen főszállal, játékeseménytől függetlenül — terhelt gépen egy üres WebGL-oldal is 160 ms-ot mutatott, ezért
  nyugodt gépen újra kell nyomkövetni.
- **Mérés (1 idegen konténer mellett):** `c5-meres-1x.txt`, `c5-meres-4x.txt`.
- **Képek:** `docs/measurements/szokoar-tema/latvany/c5-*` (valódi GPU; a `-swiftshader` végű a tesztkörből).
- **Blender:** a fájlnév normalizált tartalmi lenyomat (`content_digest`); a bájtok futásonként eltérnek, a név nem.
