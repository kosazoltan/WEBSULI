# Kockavadász — mobil megjelenítés és gördülékenység (kutatás, 2026-11-17)

Kanban #90. Tulajdonosi kérés (2026-11-17): a Kockavadász telefonon (Honor Magic V6, kihajtva) „LAGGOL, de nagyon”; keressük meg a
gyökérokot, és korszerűsítsük a futtatást úgy, hogy mobilon a felbontás is megmaradjon és a játék is zökkenőmentes legyen.

Ez a dokumentum a háromfázisú rend 1. fázisa előtti kutatás. Két részből áll:
(A) **mért tények** a mi játékunkról (diagnózis-alügynök + saját kódolvasás);
(B) **szakirodalom és nyílt forráskód**, technikánként döntéssel („alkalmazzuk / nem / később”) a mi játékunkra.

Jelölések: **MÉRT** = futtatott mérés eredménye; **KÓD** = a forrásban ellenőrizve (fájl:sor a `perf/kockavadasz-megjelenites` ágon,
amely a #484 ágából indul); **FORRÁS** = külső forrás állítása; **UNVERIFIED** = nem igazoltuk.

---

## A) Mért tények — a lassúság gyökéroka NEM a 3D-megjelenítés

A diagnózis részeredményei (`scratchpad/kockavadasz-diag/reszeredmenyek.md`, nyers mérések `runs/*.json`; mérőszkript `measure.mjs`:
Playwright + CDP, fejes Chrome, valódi GPU és SwiftShader, 1× / 2× / 4× CPU):

1. **MÉRT — CPU-profil (éles, telefonnézet 390×844, dpr 3, 1× CPU):** 157,7 s mintaidőből **137,7 s (87 %)** a lap `bank` `useMemo`-jában
   telt (`isPlayableQuestion` → `singleChoiceProblems` → `duplicateProblems` …). A teljes three.js-renderhurok (`step`) ugyanebben az
   időben **0,97 s (0,6 %)**, a GC 1,1 s.
2. **KÓD — miért fut minden renderben:** a közös `useMaterialQuizzes` hook (`client/src/hooks/useMaterialQuizzes.ts:52-56`) az `items`
   tömböt minden híváskor ÚJ tömbként adja (memo nélküli IIFE, benne `filter(isPlayableQuestion)` és `uniqueQuizContent`). A lap `bank`
   memója (`pages/BlockCraftQuiz.tsx:1301-1333`) ettől függ (`materialItems`), ezért minden renderben újra átszűri a teljes
   kérdésbankot (25 144 tétel, 10,4 M karakter JSON — MÉRT) a drága `isPlayableQuestion`-nel. A rendert a játékóra 1 s-os
   `setInterval`-ja és minden állapotot író bemenet (bányászás, HUD-üzenet) váltja ki. A hookot négy lap használja (Kockavadász,
   BrainRotSteal, TsunamiEscapeEnglish, WordLadderHuEn) — a hiba náluk is fennállhat (UNVERIFIED, nem mérve).
   A React dokumentációja pontosan ezt a mintát írja le: „a single value that's 'always new' is enough to break memoization”
   ([react.dev/reference/react/useMemo](https://react.dev/reference/react/useMemo)).
3. **MÉRT — kihajtott nézet (827×896 CSS, dpr 2,625, érintés, valódi GPU, 1× CPU), éles vs. ÜRES kérdésbank (ellenpróba):**

   | állapot | éles fps | éles képkocka p95 | éles hosszú feladat ms/s | üres bank fps | üres p95 | üres hosszú feladat |
   |---|---|---|---|---|---|---|
   | tétlen | 7,7 | 658 ms | 915 | 59,9 | 17 ms | 0 |
   | séta | 3,6 | 625 ms | 990 | 59,9 | 17 ms | 0 |
   | körbenézés | 4,7 | 667 ms | 973 | 59,9 | 17 ms | 0 |
   | bányászás | 4,1 | 820 ms | 978 | 59,8 | 19 ms | 0 |

   E → kvíz: éles 1754 ± 391 ms, üres bankkal 36 ± 8 ms. JS-heap 60 s után: 135 ± 34 MB vs. 18 MB. Érintéses körbenézés: eseményenként
   ~0,6 s többletkésés. A #484 ágán (helyi build, kihajtott nézet) ugyanez a kép: bányászás közben 1,9–2 fps, 700–733 ms-os p95
   (`runs/pr484-block-craft-quiz-real-fold-cpu1-r1.json`). **Ugyanazzal a megjelenítéssel, csak a kérdésbank nélkül a játék 60 fps-en,
   0 hosszú feladattal fut.** Ez a gyökérok.
4. **MÉRT — GPU-oldal (kihajtott nézet):** vászon 1240×1252 = 1,55 Mpx (a medium szint 1,5-ös pixelarány-korlátja él:
   `game-engine/three-look/renderer.ts:28`, `tier.ts:41,58`), ~24–37 rajzolási hívás, ~80 000 háromszög / kép (árnyék-menet nélkül, mert
   `shadowMap.autoUpdate = false`). Ezen a (laptop-) GPU-n üres bankkal p95 = 17 ms (vsync) → nem GPU-korlátos. Valódi telefon-GPU-n
   (Adreno) NEM mértünk (UNVERIFIED).
5. **KÓD — világ-háló a #484 ágán:** a review M1-lelete (teljes újraépítés blokkonként) a #484 `d296f39b` commitjában már javult:
   blokkonként csak a cella és 6 szomszédja frissül, típusonként egy `InstancedMesh` (`BlockCraftQuiz.tsx:2060-2209`). Maradó költség
   blokkváltozáskor: (a) az érintett `InstancedMesh` TELJES `instanceMatrix`-feltöltése (`needsUpdate`, nincs `updateRange`);
   (b) az árnyéktérkép teljes újrarajzolása (`renderer.shadowMap.needsUpdate = true`, `:2207`) a teljes világgal; (c) a látható kockák
   mind a 6 lapja kirajzolódik, a takartak is (a háromszögszám a látható kockák számának 12-szerese). A main (éles) változatban a
   `rebuildWorld` a profilban 41 ms alatt maradt (MÉRT) → a bányászás utáni ~1 s-os akadás a React-render, nem a háló.
   **MÉRT (saját számolás, `generateVoxelWorld`, 3 seed):** 6461–6604 látható kocka → példányosítva 77 500–79 200 háromszög (egyezik a
   diagnózis ~80 000-ével); lapalapú hálóval (csak a nem-szolid szomszéd felé néző lapok) 15 800–16 300 háromszög (**−80 %**), a világ
   külső falai és alja nélkül 7 550–8 030.
6. **KÓD — sugárvetés már DDA:** `lib/voxelcraft.ts:446` `raycastVoxel` Amanatides–Woo rácsbejárás, nem `THREE.Raycaster` a hálón.

**Következtetés:** a tulajdonos által tapasztalt „iszonyatos lassúság” mért oka egy React-memoizációs hiba (kérdésbank-szűrés minden
renderben), nem a voxel-háló és nem a felbontás. A megjelenítés korszerűsítése (B rész) másodlagos: a kihajtott nagy kijelzőn a
képpontszám és az árnyék-újrarajzolás valódi telefon-GPU-n számíthat, de ezt a mérés nem igazolta.

---

## B) Technikák — források és döntés

### B1. Voxel-háló

| Technika | Forrás (mit állít, megbízhatóság) | Mibe kerül / mikor éri meg | Hogyan mérhető | Döntés a mi játékunkra |
|---|---|---|---|---|
| **Darabolás (chunk) + csak az érintett darab újraépítése** | three.js manual „Voxel(ish) Geometry” ([forrás](https://threejs.org/manual/pages/voxel-geometry.html), példakód `manual/examples/voxel-geometry-culled-faces-ui.html`, MIT): 32³-as cellák; `updateVoxelGeometry` a voxel + 6 lapszomszéd helyén lévő cellákat gyűjti halmazba, mindegyik egyszer épül újra. prismarine-viewer (`viewer/lib/worldrenderer.js`, MIT): 16³-as szekciók, a szomszéd szekció csak akkor piszkos, ha a koordináta `&15` 0 vagy 15. noa-engine (`src/lib/chunk.js`, MIT): szélső voxelnél a szomszédok, AO miatt az átlósak is. — elsődleges kód, magas | Kis kód; nagy világnál nélkülözhetetlen. Nálunk a világ csak 48×14×48 = 32 256 cella; a #484 már cellaszinten frissít | Számláló: újraépített darabok / blokkváltozás; `renderer.info` | **Később / feltételesen:** csak ha a lapalapú hálóra váltunk (lásd alább); akkor 16×14×16-os oszlopok (3×3 = 9 háló), szabály: saját darab + x vagy z = 0 / 15 esetén a lapszomszéd |
| **Rejtett lapok kihagyása (face culling)** | three.js manual (`generateGeometryDataForCell`: lap csak üres szomszéd felé); 0fps „Meshing in a Minecraft game” ([forrás](https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/)): a culled háló négyszögszáma a felülettel arányos. — magas | A mostani „látható kocka” példányosítás a takart lapokat is rajzolja; a lapalapú háló ezt elhagyja. Ára: saját hálóépítő + atlasz (az `onBeforeCompile` „AO” shader átírandó) | `renderer.info.render.triangles`, képkocka-idő valódi GPU-n | **Később:** a háromszögszám-csökkenés valódi, de a mért szűk keresztmetszet nem a GPU (A/4). Csak telefonos GPU-mérés után |
| **Greedy meshing** | 0fps 2012 + „Texture atlases, wrapping and mip mapping” ([forrás](https://0fps.net/2013/07/09/texture-atlases-wrapping-and-mip-mapping/)): atlaszból csak shaderes `fract`-ismétléssel vagy array textúrával csempézhető, mipmap-varratok; noa `terrainMesher.js` greedy, AO-egyezési feltétellel | Bonyolult (atlasz-csempézés, AO), 32k cellás világon kicsi a nyereség | háromszögszám | **Nem alkalmazzuk** |
| **Textúra-atlasz + egy anyag** | three.js manual (oszlop / sor UV, `NearestFilter`, egy anyag); MDN WebGL best practices ([forrás](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)): atlasz a rajzolási hívások összevonásához | Rajzolási hívás –10–15; a mipmap-szűrés atlaszon szivárog (0fps 2013) | `renderer.info.render.calls` | **Később**, a lapalapú hálóval együtt |
| **`BufferGeometry` helyben frissítése vs. új geometria** | three.js manual: a szerző maga írja, hogy az új `BufferAttribute` + `computeBoundingSphere` lassú lehet, a gömb lehet fix. prismarine / noa: új geometria darabonként | Darabonként új attribútum kis világon olcsó; a mostani `InstancedMesh`-nél a teljes `instanceMatrix` feltöltődik | időmérés a frissítés körül | **Alkalmazzuk, kicsiben:** `instanceMatrix.addUpdateRange` (csak a módosított slotok) — a telepített three 0.184.0 támogatja (`node_modules/three/src/core/BufferAttribute.js:181`) |
| **Hálóépítés Web Workerben, átadható tömbökkel** | prismarine-viewer `worker.js`: 4 worker, 50 ms-onként üríti a piszkos szekciókat, `Float32Array` pufferek transferable-ként | Szálkezelés, világmásolat a workerben; nagy világnál éri meg | hosszú feladatok | **Nem alkalmazzuk:** a main `rebuildWorld` 41 ms alatt (MÉRT), cellaszintű frissítés még olcsóbb |
| **Időszeletelt építés** | noa `world.js`: `maxProcessingPerTick = 5` ms, `maxProcessingPerRender = 3` ms, távolság szerinti sor | Egyszerű; csak sok darabnál kell | hosszú feladatok | **Nem kell** (egy blokk = legfeljebb 1–3 darab) |
| **`InstancedMesh` voxelre** | vyse12138/minecraft-threejs (`src/terrain/index.ts`, MIT): típusonként egy `InstancedMesh` — a takart lapokat is rajzolja; Babylon „use instances … single draw call” ([forrás](https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene)) | Kevés rajzolási hívás, de lapszinten pazarló | háromszögszám | **Marad most** (a #484 megoldása); lapalapú hálóra váltás csak mért GPU-korlát esetén |

### B2. Képpontszám és felbontás mobilon

| Technika | Forrás | Mibe kerül / mikor éri meg | Mérés | Döntés |
|---|---|---|---|---|
| **Pixelarány-korlát** | three.js manual „Responsive Design” ([forrás](https://threejs.org/manual/pages/responsive.html)): 3× dpr = 9× képpont; a natív felbontás nehéz jelenetnél lassú; javasolt a **belső felbontás felső korlátja képpontszámban** (`maxPixelCount`, arányos lekicsinyítés). three.js fórum ([iOS-szál](https://discourse.threejs.org/t/low-fps-on-ios-mobile-with-pixel-ration-set-as-window-devicepixelratio/4963)): nyers dpr mellett egyszerű jelenet is ~40 fps. Babylon: alapból nem követi a dpr-t, „this can look low-res” | Már van: a tier-korlát (medium 1,5). A kihajtott nézeten így is 1,55 Mpx, ami ~2,2× a 390×844-es telefonénak (0,69 Mpx) | vászon-Mpx (`getDrawingBufferSize`), képkocka-idő | **Alkalmazzuk:** a korlát ne csak dpr-alapú legyen, hanem **képpontszám-plafon** is (a nagy kihajtott kijelző ne kapjon több képpontot, mint egy nagy telefon) — a Kockavadász lapján helyben; a közös rendererbe orkesztrátor-kérés |
| **Dinamikus felbontás képkocka-idő alapján, hiszterézissel** | three.js fórum ([szál](https://discourse.threejs.org/t/changing-pixelratio-based-on-fps-good-or-bad-idea/34563)): oszcilláció (lent gyors → fel → lassú), fekete képkockák átméretezéskor, változó frissítésű kijelzőn hibás fps-mérés; javaslat: kis lépés, 20+ képkocka átlag, ha nem javul, vissza és zárolás; model-viewer automatikus render-scale. Unity Dynamic Resolution ([forrás](https://docs.unity.com/en-us/engine/current/manual/cameras/resolution-scale/dynamic-resolution)): „scales down the resolution when the frame rate … decreases” | Átméretezés = puffer-újrafoglalás + vászontörlés (MDN); rossz hangolásnál villogó élesség. 120 Hz LTPO kijelzőn az fps-mérés félrevezető → képkocka-IDŐ (a render-munka ideje), nem fps | p95 képkocka-idő, skála-váltások száma / perc | **Alkalmazzuk, óvatosan:** csak lefelé lépő, lassú, hiszterézises állapotgép (pl. 0,85 → 0,7 skála, ≥ 2 s rossz ablak után; vissza csak ≥ 5 s jó ablak után), alsó korlát. Tiszta modul, egységtesztelve |
| **HUD / szöveg natív felbontáson** | three.js manual: a vászon CSS-mérete marad, csak a puffer kisebb. A mi HUD-unk DOM (React), nem a vásznon | Ingyenes: a DOM-szöveg mindig natív | képernyőkép | **Már teljesül** (a HUD DOM-ban van); megőrizzük |
| **Élsimítás (MSAA) költsége** | Arm közösségi fórum ([szál](https://community.arm.com/support-forums/f/graphics-gaming-and-vr-forum/56051/some-questions-about-msaa-on-mali-g77/183974)): 4× MSAA Mali-G77-en ~20–30 % GPU-aktív többlet (anekdotikus); Arm Vulkan-minta ([forrás](https://arm-software.github.io/vulkan-sdk/multisampling.html)): csempés GPU-n a multisample puffer kiírása a drága, nem a mintavétel. WebGL-ben a store-op nem vezérelhető (UNVERIFIED a böngésző-implementációkra) | Magas dpr-en (≥ 2) az élsimítás látható haszna kicsi | képkocka-idő antialias be/ki | **Később / mérés után:** a közös renderer `antialias: tier !== "low"`; nem változtatunk, amíg telefonon nincs mérés |
| **Árnyéktérkép mérete / frissítése** | KÓD: medium 1024, high 2048; `autoUpdate=false`, de minden blokkváltozás teljes árnyék-menetet indít | Tartásos bányászásnál 0,4 s-onként egy teljes árnyék-menet (a világ minden árnyékvető példánya) | rajzolási hívás / háromszög a bányászás képkockájában | **Alkalmazzuk:** az árnyék-újrarajzolás összevonása (legfeljebb N ms-onként egyszer, pl. 250 ms), hogy sorozatos bányászás ne indítson képkockánként menetet |
| **`powerPreference`, `precision`, felesleges `clear`, mélység-/stencil-másolás, átlátszó felületek** | MDN WebGL best practices: stencil csak ha kell; `invalidateFramebuffer` csempés GPU-n; `highp` feltételesen; a `get*Parameter` / `getError` szinkron megakaszt | A közös renderer intézi; a Kockavadászban nagy átlátszó felület a víz és a felhők | — | **Nem változtatunk most** (közös renderer); megfigyelés az orkesztrátor-kérésben |

### B3. Főszál

| Technika | Forrás | Döntés |
|---|---|---|
| **React-állapot a játékhurokban / drága számítás renderben** | react.dev `useMemo` (fent); web.dev „Optimize long tasks” ([forrás](https://web.dev/articles/optimize-long-tasks)): 50 ms feletti feladat = hosszú feladat, blokkolja a bemenetet | **ELSŐDLEGES (a gyökérok):** a `useMaterialQuizzes` `items` memoizálása (`useMemo` a `q.data` + `topicFilter` függőségre), és a lap `bank` memójának stabil függősége. Ez NEM megjelenítési réteg → hatókör-kérdés (lásd C) |
| **Szemétgyűjtés elkerülése (előre foglalt vektorok)** | review L4 (`core.ts:483`, `:601`); a hurokban kevés allokáció | **Később**, kis tétel |
| **Fix lépés + interpoláció 120 Hz-en** | KÓD: a mag már fix 1/60 s lépésű, a kamera interpolál (`BlockCraftQuiz.tsx:2496-2521`) | **Már teljesül** |
| **Olcsó sugárvetés rácson (DDA)** | three.js manual `intersectRay` (Amanatides–Woo); KÓD `raycastVoxel` | **Már teljesül** |

### B4. Hajlítható / nagy kijelző

- **KÓD:** a vászon-méret képkockánként szinkronizálódik (`syncSize`, `BlockCraftQuiz.tsx:2008-2018`), csak változáskor hív `setSize`-t → kihajtás /
  forgatás nem épít világot újra. Megtartjuk.
- **Hiányzó mérőnézet:** a közös mobil mérő 360×640 / 390×844 / 844×390 nézetei a kihajtott osztályt nem fedik. A diagnózis nézete: **827×896 CSS,
  dpr 2,625** (UNVERIFIED a valódi Honor Magic V6-ra; a belső kijelző 2352×2172 FORRÁS: GSMArena / TechRadar összefoglalók).

---

## C) A 3–5 legtöbbet hozó, legkisebb kockázatú változtatás (mért sorrendben)

1. **A kérdésbank-szűrés memoizálása** (`useMaterialQuizzes` + a lap `bank`-memója). Mért hatás az ellenpróbán: 3,6–7,7 fps → 59,9 fps, hosszú feladat
   ~950 ms/s → 0, E → kvíz 1,75 s → 36 ms. **Hatókörön kívül esik** (kérdéskezelés + közös hook) → tulajdonosi / orkesztrátori döntés kell.
2. **Képpontszám-plafon a 3D vásznon** (dpr-korlát mellett Mpx-korlát), DOM-HUD natív felbontáson. Kis kód, a kihajtott kijelzőn a GPU-munkát a nagy
   telefonok szintjére hozza.
3. **Hiszterézises dinamikus felbontás-skálázó** (tiszta állapotgép, egységtesztelve; csak tartósan rossz képkocka-időnél lép le).
4. **Árnyéktérkép-frissítés összevonása** sorozatos bányászásnál + az `instanceMatrix` részleges feltöltése (ha a three.js-verzió támogatja).
5. **Kihajtott mérőnézet** (827×896, dpr 2,625) a közös mobil mérőbe + megismételhető mérőszkript a repóban.

A lapalapú (face-culled) darabolt háló + atlasz **később**: valódi, de a mérések szerint most nem ez a szűk keresztmetszet; telefon-GPU-mérés után döntsünk.

## Ellentmondások a források között

- Dinamikus felbontás: a játékmotorok (Unity) és a model-viewer automatikusan skáláz; a three.js fórum többsége az indításkori mérést / előbeállítást
  tartja jobbnak (oszcilláció, villogó élesség). Feloldás nálunk: csak lefelé és lassan lépő, hiszterézises skálázó, alsó korláttal.
- MSAA csempés GPU-n: a „szinte ingyenes” közvélekedéssel szemben egy Mali-G77-es mérés 20–30 % többletet mutatott (anekdotikus); a WebGL a
  store-opot nem engedi vezérelni. Nincs döntés mérés nélkül.
- Darabméret: noa / vyse 24, prismarine 16, three.js manual 32. A mi 48-as világunkhoz a 16 (3×3 darab) illik.

## Nyílt forráskódú anyagok (csak elv, kód nem került át)

| Projekt | Olvasott fájlok | Licenc |
|---|---|---|
| three.js manual voxel-fejezet + példa | `manual/pages/voxel-geometry.html`, `manual/examples/voxel-geometry-culled-faces-ui.html` | MIT |
| three.js `webgl_geometry_minecraft` | `examples/webgl_geometry_minecraft.html` (egyetlen összefűzött statikus háló, módosítás nincs) | MIT |
| noa-engine | `src/lib/world.js`, `chunk.js`, `terrainMesher.js` | MIT |
| prismarine-viewer | `viewer/lib/worker.js`, `worldrenderer.js`, `models.js` | MIT |
| vyse12138/minecraft-threejs | `src/terrain/index.ts`, `worker/generate.ts`, `control/index.ts` | MIT |
| voxel-engine | `index.js` (a `setBlock` csak a saját darabot jelöli → határon lyuk-kockázat) | BSD-3-Clause |

UNVERIFIED: a `webgl_geometry_minecraft_ao` a three.js dev ágán nem létezik (404); a voxel (mesherek) repó licence; Arm Mali best-practices útmutató
teljes szövege (a dokumentumoldal tartalmát nem lehetett letölteni); az Android dinamikus felbontás oldal (404).
