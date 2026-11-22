# Spec: Kockavadász telefonon — eltérés-tábla, mérés, eszközön belüli diagnosztika (`?perf=1`)

> Dátum: 2026-11-17 · Szerző: Claude Code (alügynök, tulajdonosi panaszra) · Állapot: 1. szelet (A–C) JÓVÁHAGYVA a megbízásban;
> a 2. szelet (D, új megjelenítési út) sorrendje az 1. szelet jelentése után, orkesztrátori jóváhagyással indul.
> Végrehajtás: `docs/specs/2026-11-17-kockavadasz-telefon-vegrehajtas.md`
> Ág: `perf/kockavadasz-telefon` (a #484 helyi fejéről, `bc360c12`, + a `main` helyben beolvasztva a kapuszkriptekért).

## 0. A tulajdonos panasza (2026-11-17 este, szó szerint)

„Térj vissza a Kockavadász játékhoz. Egyszerűen borzasztó, keress teljesen más nézőpontot, teljesen más megközelítést. Gyakorlatilag
telefonon használhatatlanul lassú, laggol. Élvezhetetlen. Az összes többi játék szépen fut, ez az egy hulladékszint.”
Eszköz: Honor Magic V6 (hajlítható, 120 Hz), a nagy, kihajtott kijelzőn. Korábban: „maradjon meg a felbontás, de fusson zökkenőmentesen”.

## 1. Cél

1. **Eltérés-tábla:** miben tér el a Kockavadász megjelenítése és képkocka-hurka a telefonon jól futó 3D-s játékoktól (Aszteroida,
   Tornado, Szökőár, Brain Rot) — fájl:sor hivatkozással (3. szakasz).
2. **Mérés asztalon**, őszintén körülhatárolva: mit bizonyít és mit nem (5. szakasz; az eredmények a végrehajtási fájl végén).
3. **Eszközön belüli diagnosztika:** `?perf=1` URL-paraméterrel bekapcsolható, képernyőfotózható panel a Kockavadászban, négy
   kapcsolóval, hogy a tulajdonos a saját telefonján egy perc alatt lássa, MI segít (6. szakasz).
4. (2. szelet, jóváhagyás után) új megjelenítési út telefonra (7. szakasz — javaslat, becsült nyereséggel).

## 2. NEM cél

- A kérdésbank-szűrés javítása (`useMaterialQuizzes` memo) — az a #491 (`perf/kerdesbank-hook-memo`); ehhez az ághoz nem nyúlunk.
- A #484 munkafájának (`.claude/worktrees/jatek-j3a`) módosítása; a játékszabály, a kérdéskezelés, a HUD átrendezése.
- A közös `three-look` szintek (`LOOK_BUDGET`) módosítása az 1. szeletben (más játékokat is érintene).
- Adatgyűjtés: a panel semmit nem küld és nem tárol (se hálózat, se `localStorage`); személyes adat nincs benne.
- Annak ígérete, hogy „megoldja a telefonon” — azt csak a tulajdonos próbája dönti el.

## 3. Eltérés-tábla — Kockavadász vs. a jól futó játékok

Útvonalak a `source/client/src/` alatt. A Kockavadász sorszámai a #484 `bc360c12` fejére érvényesek
(`git show bc360c12:source/client/src/pages/BlockCraftQuiz.tsx`); ezen az ágon a panel bekötése után a sorok ~75-tel lejjebb vannak. Rövidítések: **BC** = `pages/BlockCraftQuiz.tsx`,
**AST** = `pages/SpaceAsteroidQuiz.tsx`, **TOR** = `pages/TornadoHunter200.tsx`, **TSU** = `game-engine/scenes/TsunamiScene3D.tsx`,
**BR** = `game-engine/scenes/BrainRotArena3D.tsx`. „medium” = az érintőképernyős eszköz szintje (`three-look/tier.ts:58`).

| # | Szempont | Kockavadász | Aszteroida | Tornado | Szökőár | Brain Rot | Eltérés |
|---|---|---|---|---|---|---|---|
| E1 | **Árnyéktérkép medium szinten** | BE: `createGameRenderer(canvas, tier, { exposure: 1.0 })` — nincs `shadows: false` (BC:1925); `sun.castShadow = true`, 1024² (BC:1974–1977); minden blokk-háló vet és fogad (BC:2094–2097) | KI: `shadows: false` (AST:1359) | KI mediumon: `shadows: quality === "high"` (TOR:1657), helyette „blob” árnyék (TOR:1694) | KI: `shadows: false` (TSU:1252–1255) | KI: `shadows: false` (BR:770) | **A Kockavadász az EGYETLEN játék, amely telefonon (medium) árnyéktérképet használ.** Képpontonként 5 árnyék-mintavétel + zajfüggvény (three r184 `shadowmap_pars_fragment.glsl.js:131–142`, Vogel-korong) |
| E2 | **Mit fed le a drága anyag a képen** | A teljes képet kitöltő, átlátszatlan terep, mind `MeshStandardMaterial` (PBR) (BC:544–549) | Sötét űr, kis testek; a kép nagy része háttér (AST:1360, 1363) | Terep + ég; Standard, de árnyék nélkül | Saját olcsó `ShaderMaterial` a vízre (TSU:740, 826), terep Standard `flatShading` (TSU:677) | Túlnyomórészt saját `ShaderMaterial` / Basic (BR:61–265, 449–454) | A Kockavadászban a képpontok ~100 %-a PBR + árnyék + köd + ACES útvonalon megy; a többinél a kép jelentős része olcsó árnyalás |
| E3 | **Túlrajzolás (overdraw)** | A látható kockák mind a 6 lapja kirajzolódik, a példányok rendezetlenül (típusonként egy `InstancedMesh`, BC:2086–2100); nincs mélység-előmenet | kevés, kis test | terep-háló, kevés takarás | egy terep + vízfelszín | aréna-lapok | Első személyű nézetben a dombok / fák egymás mögött → a drága képpont-árnyaló többször fut le ugyanarra a képpontra (rendezetlen példányoknál a korai mélységteszt nem véd) — UNVERIFIED mérték, lásd 5. |
| E4 | **Háromszögszám és vágás** | MÉRT: 79 800 háromszög, 27 hívás / kép; `mesh.frustumCulled = false` (BC:2092) → a kamera MÖGÖTTI világ csúcsai is végigmennek a csúcsárnyalón; árnyék-menetkor még egyszer | MÉRT: 9 530 háromszög, 29 hívás (a hullám előtti kvíz alatt) | MÉRT: 10 876 háromszög, 214 hívás | MÉRT: 63 514 háromszög, 120 hívás | NOT RUN | A Kockavadászé a legtöbb háromszög, de a LEGKEVESEBB hívás; a Szökőár háromszögszáma hasonló nagyságrend |
| E5 | **Átlátszó menet** | Lomb: `transparent: true, opacity: 0.93, alphaTest: 0.05` (BC:591) — minden lombkocka mind a 6 lapja keveréssel, rendezetlenül; víz: `transparent, opacity 0.78` (BC:602); felhők `transparent` (BC:2356–2363); fényoszlopok (BC:2335) | additív sprite-ok (AST:1424–1425) | por `NormalBlending` (TOR:1724) | néhány áttetsző elem (TSU:560, 570, 888, 907) | részecskék | A lomb a terep nagy részét takarja az erdős pályán: PBR + árnyék + keverés, korai mélység-elvetés nélkül (`alphaTest` → a fragmensárnyaló `discard`-ot tartalmaz, ami csempés GPU-n kikapcsolja a rejtett felület korai elvetését — általános GPU-ismeret, eszközön UNVERIFIED) |
| E6 | **Textúraszűrés** | `anisotropy = min(8, max)` + `NearestMipmapLinearFilter` minden blokk-textúrán, ha a szint nem low (BC:2032–2040) | nincs `anisotropy` beállítás | nincs | nincs | nincs | Csak a Kockavadász kér 8× anizotróp szűrést (képpontonként több mintavétel a lapos szögben látott talajon) |
| E7 | **Anyagok száma / program** | Fű: 6 anyagos tömb (BC:555–562) → 6 rajzolási hívás a fű-hálóra, árnyék-menetben is; `onBeforeCompile` „AO” minden blokk-anyagon (BC:2048–2064) | sok Standard anyag, kis testek | — | — | — | Kis tétel (hívásszám), de az árnyék-menetet is szorozza |
| E8 | **Köd** | `FogExp2` (BC:1959) | `FogExp2` (AST:1363) | lineáris `Fog` (TOR:1663) | lineáris `Fog` (TSU:611) | nincs köd (BR:354) | Kis tétel |
| E9 | **Fények** | 1 félgömb + 1 irányfény (BC:1963, 1969) | 1 ambient + 1 félgömb + 3 irány + 3 pontfény (AST:1381–1399) | 1 félgömb + 1 irány + 1 pont (TOR:1667–1687) | 1 félgömb + 2 irány (TSU:636–641) | 1 ambient + 1 irány + 2 pont (BR:421–428) | A Kockavadász itt OLCSÓBB — a fényszám nem ok |
| E10 | **Utófeldolgozás** | nincs (`renderer.render`, BC:2768) | bloom csak high szinten (`three-look/postfx.ts:37`, AST:1474) | ua. (TOR:1726) | ua. (`useThreeScene.ts:74`) | ua. | Mediumon egyik játékban sincs — nem ok |
| E11 | **Képpontarány / élsimítás** | közös: plafon 1,5 mediumon, `antialias: tier !== "low"` (`three-look/renderer.ts:28, 45`) | ugyanaz (AST:1358–1359) | ugyanaz (TOR:1654–1657), DE a játékos állíthat minőséget (TOR:254–270) | ugyanaz + „könnyű grafika” mód (`pages/TsunamiEscapeEnglish.tsx:584–591`) | ugyanaz | A Kockavadászban nincs se kézi minőségváltó, se „könnyű” mód |
| E12 | **Vászon mérete a kihajtott nézetben** | a teljes játékteret kitölti (`w-full h-full`, BC:3653–3657); MÉRT 1240×1252 = 1,55 Mpx | keretezett jelenet (AST:2889–2890); MÉRT 1216×966 = 1,17 Mpx | teljes (TOR:2438–2439); MÉRT 1240×1344 = 1,67 Mpx | teljes színpad (`pages/TsunamiEscapeEnglish.tsx:1605–1607`); MÉRT 1,67 Mpx | NOT RUN | A vászon mérete NEM különbözteti meg a Kockavadászt (a Tornado és a Szökőár vászna nagyobb) |
| E13 | **Átméretezés figyelése** | KÉPKOCKÁNKÉNT olvas elrendezést: `syncSize()` → `parent.clientWidth / clientHeight` (BC:466–470, 2016–2026, 2568) | `ResizeObserver` (AST:1509) | `ResizeObserver` (TOR:1756) | `ResizeObserver` (`three-look/useThreeScene.ts:97`) | ua. | A hurok közben a HUD-ba írt stílus (`--p`, `--a`: BC:2634, 2694) után a következő képkocka elején kényszerített elrendezés-számítás fut a 4100 soros lap teljes DOM-ján — költsége telefonon UNVERIFIED (a panel „JS” ideje mutatja) |
| E14 | **React-állapot a hurok mellett** | játékóra 1 s-onként a 4100 soros lapot rendereli (BC:1406–1416); HUD-pillanatkép 100 ms-onként, csak változáskor (BC:3012–3020); kőhely-mérés 200 ms-onként a zár alatt (BC:3001) | 2 időzítő (AST:1170, 1186) | — | 1 időzítő (`pages/TsunamiEscapeEnglish.tsx:1348`) | 1 időzítő (`pages/BrainRotSteal.tsx:814`) | Önmagában kicsi; a kérdésbank-hibával együtt (E15) ez váltja ki a főszál-blokkot |
| E15 | **Kérdésbank-szűrés a render-úton** | `useMaterialQuizzes` (BC:1307) + `bank` memo `isPlayableQuestion`-nel (BC:1309–1337) — a diagnózis szerint a főszál 87–96 %-a | **nem használja a hookot** | **nem használja a hookot** | használja (`pages/TsunamiEscapeEnglish.tsx:753`) | használja (`pages/BrainRotSteal.tsx:424`) | Az Aszteroidát és a Tornadót a hiba nem érinti — ez részben megmagyarázza az „összes többi szépen fut” észlelést. A Szökőár asztali mérésben ugyanúgy lassú volt; a Brain Rot UNVERIFIED. A javítás a #491 (nem cél itt) |
| E16 | **Árnyék-újrarajzolás és példánypuffer változáskor** | minden blokkváltozás: teljes árnyék-menet a világ minden vető példányával (`shadowMap.needsUpdate`, BC:2197, 2215) + az érintett típus TELJES `instanceMatrix`-feltöltése (BC:2127, 2155) | — | — | — | — | Tartásos bányászásnál ismétlődő tüske; csak a Kockavadászban |
| E17 | **Képkocka-hurok egyéb** | DDA-sugárvetés képkockánként (BC:2607, olcsó); a zár alatt `getBoundingClientRect` képkockánként (BC:2283); `stoneColor.set("#…")` szöveg-elemzés kövenként (BC:2677–2678) | — | — | — | — | Kis tétel |

**Fontos ellenbizonyíték (MÉRT, asztali GPU — végrehajtási fájl, M2):** ugyanazon a nézeten a Kockavadász egy képkockája
OLCSÓBB, mint a telefonon jól futó Tornadóé és Szökőáré (plafon nélkül 301 fps vs. 156 és 229; szinkron képkocka-költség 5,6 ms
vs. 9,8 és 9,0 ms). Az alábbi eltérések tehát a kódban valósak, de asztali GPU-n NEM teszik a Kockavadászt a legdrágábbá — csak
akkor magyarázzák a panaszt, ha a telefon csempés GPU-ján aránytalanul többe kerülnek (árnyék-mintavétel, `discard`, anizotróp
szűrés). Ezt csak a telefonon készült panel-fotó döntheti el.

**Összefoglalva (kódból igazolt, telefonon nem mért):** a Kockavadász az egyetlen játék, ahol telefonon (medium szinten) egyszerre
igaz, hogy (a) van árnyéktérkép, (b) a kép 100 %-át PBR-anyagú, átlátszatlan + átlátszó terep tölti ki, (c) a geometria rendezetlen
példányokból áll rejtett lapokkal, vágás nélkül, (d) 8× anizotróp szűrés megy, és (e) a képkocka-hurok elrendezést olvas. A többi
játékban ezekből legfeljebb egy van. Emellett (f) a Kockavadász a kérdésbank-hibát is hordozza (E15), amely az Aszteroidát és a
Tornadót nem érinti.

## 4. A valószínű okok rangsora (bizonyítékkal; a sorrendet a panel fotója dönti el)

| Rang | Ok | Bizonyíték | Ami hiányzik |
|---|---|---|---|
| 1 | **Főszál-blokk a kérdésbank-szűréstől (E15)** — az élesben még bent van | MÉRT asztalon (diagnózis): 3,6–7,7 fps → üres bankkal 59,9; a hibát két jól futó 3D-s játék (Aszteroida, Tornado) nem hordozza (KÓD); MÉRT (M2): a megjelenítés asztali GPU-n nem drágább a társjátékokénál. ELLENE SZÓL: a Szökőár ugyanazt a 25 ezres bankot tölti le, a tulajdonos mégis jónak látja (feloldatlan) | telefonon nem mért; a panel „hosszú feladat ms/s” és „React-render / s” sora mutatja meg |
| 2 | **Képpontköltség: árnyék (5 minta) + PBR + köd + 8× anizotróp szűrés a teljes képen, túlrajzolással (E1–E3, E5, E6)** | KÓD: csak a Kockavadászban van így. MÉRT (M1): a jelenet képpont-korlátos — fele felbontáson a GPU-idő −61 %, árnyék ki + egyszerű anyag −35 %. ELLENE SZÓL (M2): asztali GPU-n a teljes képkocka így is olcsóbb, mint a Tornadóé / Szökőáré | telefonon a panel „GPU” sora + a kapcsolók |
| 3 | **120 Hz-es keret:** 8,3 ms / képkocka; ami 60 Hz-en belefér, 120 Hz-en akadozásként látszik (váltakozó 8 / 16 ms) | KÓD: a hurok `requestAnimationFrame`-re fut, plafon nélkül (BC:2555) | a panel „leggyorsabb képkocka” és „1 % low” sora |
| 4 | **Csúcsköltség: ~80 ezer háromszög vágás nélkül, árnyék-menetben duplán (E4, E16)** | KÓD + kutatási jegyzet (lapalapú hálóval −80 %) | M1: „egyszerű anyag” és „árnyék ki” mellett megmaradó költség |
| 5 | **Kényszerített elrendezés-számítás képkockánként (E13)** | KÓD | a panel „JS” ideje |
| 6 | Hőfojtás / energiatakarékos mód / a böngésző WebView-ja | — | nem mérhető itt (NOT RUN) |

## 5. Mérés asztalon — terv (eredmények: a végrehajtási fájl „Mért eredmények” szakasza)

- **M1 — a Kockavadász képkocka-költsége kapcsolónként** (Playwright, fejes Chrome, valódi GPU, kihajtott nézet 827×896 CSS,
  dpr 2,625, érintés-emuláció, üres kérdésbank az E15 kizárására, helyi build az éles API csak-olvasó GET-jeivel; minden nem-GET
  `/api` kérés letiltva): a panel szinkron GPU-próbája (`readPixels` a képkocka után → a GPU-munka bevárása) és a
  `EXT_disjoint_timer_query_webgl2`, ha elérhető. Változatok: alap; árnyék ki; egyszerű anyag; köd ki; felbontás 75 % / 50 %;
  mind együtt.
- **M2 — játékok közti összevetés** ugyanazon a nézeten: vászon-képpont, rajzolási hívás és háromszög / kép (a WebGL
  `draw*` hívások számlálásával), szinkron képkocka-költség — Kockavadász, Aszteroida, Tornado (a Szökőár és a Brain Rot DOM-vezérelt
  indítása miatt csak akkor, ha a szkript megbízhatóan eljut a játékig; különben NOT RUN).
- **Mit bizonyít:** a kapcsolók RELATÍV hatását ugyanazon a jeleneten (melyik tétel mennyit visz), és a játékok közti arányt
  egy asztali GPU-n. **Mit NEM:** az abszolút telefonos képkockaidőt. Az asztali integrált GPU azonnali módú megjelenítő, a telefoné
  csempés; a hőfojtás, a 120 Hz-es kompozitor és a mobil illesztőprogram viselkedése nem szimulálható. A Chrome DevTools
  eszközemulációja GPU-t nem emulál.

## 6. A `?perf=1` panel (1. szelet szállítmánya)

- **Bekapcsolás:** `https://websuli.vip/games/block-craft-quiz?perf=1` (más paraméterrel kombinálható: `&look=low`). Paraméter
  nélkül a panel kódja be sem töltődik (dinamikus `import()`), a hurokban egy `null`-ellenőrzés marad.
- **Megjelenített adatok** (0,5 s-onként frissül, az utolsó ~4 s ablakából):
  fps átlag és 1 % low; képkockaidő p50 / p95 és a leggyorsabb képkocka (a kijelző frissítésére utal); **JS-frissítés** ideje vs.
  **`render()` hívás** ideje; **GPU-idő** (`EXT_disjoint_timer_query_webgl2`, ha a böngésző adja; különben „n. a.”); a szinkron
  GPU-próba eredménye (gombra); `renderer.info` (rajzolási hívás, háromszög, textúra, geometria, program); vászon px × px és
  megapixel, CSS-méret, eszköz-dpr → alkalmazott képpontarány; grafikai szint; **hosszú feladat / s és ms / s**; **React-render / s**;
  WebGL renderer-név (`WEBGL_debug_renderer_info`); rövidített `userAgent` (böngésző + főverzió, rendszer + főverzió).
- **Kapcsolók** (a panelen, azonnal hatnak, a lap újratöltéséig élnek): **Árnyék** be / ki · **Felbontás** 100 / 75 / 50 % ·
  **Anyag** PBR / egyszerű (Lambert) · **Köd** be / ki. Gombok: **GPU-próba** (40 képkocka szinkron mérése; ha 10 s alatt nem gyűlik össze mind a 40 minta, nincs teljes eredmény — a felirat
  „részleges n/40”, 2026-11-21, 2. vak kör L3), **Másol** (a panel
  szövege a vágólapra — helyben, hálózat nélkül), **–** (összecsukás).
- **Adatvédelem:** semmit nem küld, nem tárol; a `userAgent` rövidítve; nincs azonosító, nincs felhasználói adat.
- **Hibatűrés:** ha a panel modulja nem tölthető be vagy a GPU-kiterjesztés hiányzik, a játék változatlanul fut.

### EARS-elfogadás

- E-1: AMIKOR az URL `perf=1` paramétert tartalmaz ÉS a játék fut, a rendszer megjeleníti a `bc-perf-panel` panelt a fenti sorokkal.
- E-2: AMIKOR az URL nem tartalmaz `perf=1`-et, a rendszer nem tölti be a panel modulját, és nem jelenít meg panelt.
- E-3: AMIKOR a játékos az „Árnyék” kapcsolót kikapcsolja, a rendszer a következő képkockától nem rajzol és nem mintavételez
  árnyéktérképet; visszakapcsolásra az árnyék visszatér.
- E-4: AMIKOR a játékos a „Felbontás” 50 / 75 / 100 % értékét választja, a vászon képpontszáma a szint alap-képpontarányának
  megfelelő arányára áll, a CSS-méret és a HUD változatlan.
- E-5: AMIKOR a játékos az „Anyag: egyszerű” állást választja, a blokkok `MeshLambertMaterial`-lal rajzolódnak (ugyanazzal a
  textúrával); a később létrejövő hálók is.
- E-6: AMIKOR a játékos a „Köd” kapcsolót kikapcsolja, a jelenet köd nélkül rajzolódik; pályaváltás nem dob hibát.
- E-7: A panel SOHA nem indít hálózati kérést és nem ír tartós tárolóba.
- E-8: HA a `EXT_disjoint_timer_query_webgl2` nem érhető el, a „GPU” sor „n. a.” — a többi sor működik.

### Edge case-ek

- WebGL nélkül (a `createGameRenderer` `null`): nincs jelenet, nincs panel.
- Kontextusvesztés / visszaállás: a függő GPU-lekérdezések eldobva; a panel a visszaállás után tovább mér.
- Szünet / kvíz / lejárt kupon: a hurok áll → a panel az utolsó értékeket mutatja, „áll” jelzéssel (nem oszt nullával).
- Pályaváltás kikapcsolt köddel (`applyLevelLook`): a köd-objektum megmarad, csak a `scene.fog` hivatkozás `null`.
- Új blokktípus hálója „egyszerű anyag” mellett: a `makeTypeMesh` az aktuális anyagkészletből vesz.
- `PerformanceObserver` „longtask” nem támogatott (Safari): a sor „n. a.”.

## 7. Új megjelenítési út telefonra — javaslat (2. szelet; a sorrendet az 1. szelet mérése és a tulajdonos fotója után véglegesítjük)

| # | Változtatás | Várható nyereség (becslés, UNVERIFIED telefonon) | Kockázat | Mit mér |
|---|---|---|---|---|
| D1 | **Árnyéktérkép helyett sütött kontaktárnyék telefonon:** medium szinten `shadows: false`; a talajra vetülő árnyék csúcsszínbe / AO-ba sütve a hálóépítéskor (oszloponként „van-e fölötte blokk”), a fák alá sötétített folt | a képpont-árnyalóból kiesik az 5 árnyék-minta, megszűnik az árnyék-menet (E1, E16) — M1 „árnyék ki” sora adja a mértékét | kevésbé plasztikus kép; a sütés bányászáskor az érintett oszlopot frissíti | panel GPU-idő, árnyék be / ki |
| D2 | **Lambert-anyag medium / low szinten** (PBR csak high-on), az „AO” árnyalás megtartásával | olcsóbb képpont-árnyaló (E2) — M1 „egyszerű anyag” sora | a víz csillanása gyengébb | panel GPU-idő |
| D3 | **Rejtett lapok nélküli, darabolt (16×14×16) összevont háló atlasz-textúrával** az `InstancedMesh`-ek helyett | ~80 ezer → ~16 ezer háromszög (kutatási jegyzet A/5), 25–37 → ~12–20 hívás, darabonkénti vágás, elölről hátra rendezhető darabok → kevesebb túlrajzolás (E3, E4, E7) | a legnagyobb átírás: hálóépítő, atlasz (mipmap-szivárgás), a cellánkénti frissítés darabszintűre cserélése | háromszög / hívás (`renderer.info`), GPU-idő |
| D4 | **Képpontszám-plafon a 3D vásznon** (pl. ≤ 1,1 Mpx mediumon, a dpr-plafon mellett); a HUD natív DOM marad | a kihajtott kijelzőn −30 % képpont (1,55 → ~1,1 Mpx) | enyhén lágyabb 3D kép (a HUD éles) | panel vászon-Mpx, M1 felbontás-sorok |
| D5 | **Átlátszóság olcsóbban:** a lomb `alphaTest`-es átlátszatlan (keverés nélkül), 8× → 2× anizotrópia mediumon | kevesebb keverés és mintavétel (E5, E6) | a lomb széle keményebb | panel GPU-idő |
| D6 | **A hurok tehermentesítése:** `ResizeObserver` a képkockánkénti elrendezés-olvasás helyett (E13); a játékóra saját kis komponensbe (E14) | főszál: képkockánként 1 kényszerített elrendezés-számítás kevesebb; másodpercenként 1 lapszintű render kevesebb | kicsi | panel JS-idő, React-render / s |
| D7 | **Hiszterézises dinamikus felbontás** (csak lefelé lép, lassan; alsó korlát) | biztosíték hőfojtás ellen | villogó élesség rossz hangolásnál | skálaváltások / perc |

Javasolt sorrend (jóváhagyásra): **0. a #491 élesítése a panellel együtt, és a tulajdonos panel-fotója** → D1 + D2 (együtt) → D6 →
D4 → D5 → D3 → D7. Indok: az M2 szerint a megjelenítés asztali GPU-n nem drágább a jól futó játékokénál, ezért a legvalószínűbb ok
továbbra is a főszál-blokk (E15); a megjelenítési átírás (főleg a D3) csak akkor indokolt, ha a telefonos fotón a „hosszú feladat”
0 körüli, a „GPU” / „GPU-próba” pedig magas. D1 + D2 kis kód, az M1 szerint együtt −35 % GPU-idő; a D4 −30 % képpont a kihajtott
kijelzőn; a D3 a legnagyobb munka, a nyeresége a csúcs- / hívás-oldalon van (M1: a „mind” változat után megmaradó ~0,6 ms).

## 8. Érintett fájlok (1. szelet)

- ÚJ `source/client/src/game-engine/perf/perfStats.ts` — tiszta statisztika + URL- és UA-segédek.
- ÚJ `source/client/src/game-engine/perf/perfOverlay.ts` — a DOM-panel, GPU-lekérdezés, hosszú feladatok.
- MÓD `source/client/src/pages/BlockCraftQuiz.tsx` — a panel bekötése a hurokba + a négy kapcsoló megvalósítása a jelenetben.
- ÚJ `source/tests/perf-stats.test.ts` — egységteszt.
- ÚJ `source/tests/blockcraft-perf-panel.spec.ts` — böngészős teszt (E-1 … E-6).
- A `docs/agent-csapdak.md` közös katalógusba ez a szelet NEM ír (C-48): a csapda-javaslatok a zárójelentésben mennek az orkesztrátornak.
