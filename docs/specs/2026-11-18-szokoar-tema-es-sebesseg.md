# Szökőár szökés — a téma visszaadása (a hullám a kép és a tét közepén) és a sebesség

Állapot: TERV, a döntésekkel frissítve (2026-11-18) — a tulajdonosi döntések rögzítve (lent, 0. fejezet). Végrehajtási utasítás:
`docs/specs/2026-11-18-szokoar-tema-es-sebesseg-vegrehajtas.md`.

## 0. Tulajdonosi döntések (2026-11-18, kérdőíven, a választott opciók szó szerint)

- **D1:** „Vissza a régi, emelkedő vízhez” — a #483 ELŐTTI játékmenet jön vissza: függőleges menekülés felfelé, alulról emelkedő
  tengerrel; a jó válasz lejjebb viszi a vizet, a rossz feljebb hozza; a háromsávos futópálya megszűnik.
- **D2:** „Sodródó törmelék helyettük” — autó nincs; ha a régi játékmenetben van kerülendő akadály, az szökőárhoz illő sodródó
  törmelék (uszadékfa, hordó, láda, csónakroncs), ami nem borul fel; ha a régiben nem volt akadály, nem találunk ki újat a döntésen
  túl, hanem javaslattal kérdezünk.
- **D4:** „Igen, látványosan” — a válasz hatása a vízre a képen is látszik (jó válasz: a víz láthatóan visszahúzódik, permet; rossz
  válasz / ütközés: egy ugrással feljebb jön, rázás, morajlás); a cél (menedék fent) mindig látszik, győzelemkor a víz megtörik alatta.
- (A korábbi D1-A „megfordított kamera” és D3 javaslatok ezzel tárgytalanok.)

### 0.1 Tény a D2-höz: a régi játékmenetben NINCS kerülendő akadály
A `b4b84db6` lapja (`TsunamiEscapeEnglish.tsx:1128-1220`): egy tengelyen (balra–jobbra) mozgás, a zöld biztonsági zóna 5–8 mp-enként
máshová ugrik (benne lassabban emelkedik a víz), a sodrás oldalra tol, Sprint gomb; a deszkák a jelenetben díszletek. Ütközés nincs.
Ezért a döntés szerint NEM találunk ki akadályt — **kérdés a tulajdonosnak (D2-b):**
- **A) Javasolt: nincs akadály** (a régi játékmenet szerint) — a „rossz válasz / ütközés” hatásból csak a rossz / lejárt válasz marad.
- B) Sodródó törmelék a vízfelszínen (uszadékfa, hordó, láda), amely a figura felé sodródik; ha eltalálja, a víz egy ugrással feljebb
  jön (ez a D4 „ütközés” ága) — új mechanika, külön döntés kell.

### 0.2 Mi jön vissza, mi marad, mi szűnik meg

| Elem | Sors | Megjegyzés |
|---|---|---|
| Függőleges jelenet, alulról emelkedő tenger, deszkák, szörfös figura, zóna, sodrás, Sprint, villám (régi `TsunamiScene3D` + lap) | **vissza** a `b4b84db6`-ból | a friss main közös rétegeihez igazítva |
| Teljes képernyős, a világot MEGÁLLÍTÓ kvíz-fázis (a J1 fő kifogása) | **nem jön vissza** | helyette a közös, nem blokkoló kérdés-sáv (`InlineQuestion`, „buttons” mód, 4 gomb, ≥ 48 px) — a víz a kérdés alatt lassítva emelkedik (`slowMo`), nem áll meg |
| Győzelem = N jó válasz | **marad**, de látható úttal | a menedék fent mindig látszik; minden jó válasz egy deszkányival közelebb viszi (mérő a menedékig); győzelemkor a víz alatta megtörik |
| D4 visszajelzés a vízen | **új** | jó: a víz látványosan visszahúzódik + permet; rossz / lejárt: ugrás felfelé + rázás + morajlás (csökkentett mozgásnál rázás nélkül) |
| Közös kérdés-director + a mostani API, közös kupon-szabály, kérdésbank-sorrend, ismétlési sor | **marad** a #483-ból / közös rétegből | a kiesett tétel visszatér (J1 kifogás pótolva) |
| 48 px-es gombok, mobil mérő M1–M9, levágás-háló, élesítés (a kérdés-óra szerint), determinizmus-őr hatóköre | **marad** | a lista mód / gombok a közös mérő küszöbén |
| Háromsávos futópálya, kapuk, kapu-táblák, akadályok (autó, kerítés, fa), kagylók, `lib/tsunami/{core,obstacles,sim}.ts` | **megszűnik** | D1 |
| Joystick | **marad** (a régiben is volt: oldalirányú mozgás) | a joystick-mérő Szökőár-esete a régi „x” tengelyt méri |

### 0.3 Tesztek (dokumentált SPEC-VÁLTOZÁS, a mérce nem lazul)

| Teszt | Változás |
|---|---|
| `tsunami-core.test.ts`, `tsunami-sim.test.ts` (a futó-mag) | a mag megszűnik → helyettük új mag- és sim-teszt a víz-modellre (`lib/tsunami/water.ts`, tiszta TS): víz-emelkedés, zóna, jó / rossz hatás, győzelem / vereség, determinizmus; a J-mérőszámok (kérdés/perc ≥ 5, leghosszabb kérdés nélküli szakasz ≤ 15 s) a director + víz-sim-mel mérve |
| `tsunami-play.spec.ts` (kapuk, sávok, táblák, ÚK2 „Jó kapu!”, D-J1a-18, ÚK3) | a kapu- / sáv-esetek megszűnnek (D1); maradnak / átírva: a kérdés nem blokkol, a lista (4 gomb) nem takarja a figurát és a tárcsát, gomb ≥ 48 px, nincs levágás, élesítés = elfogadás (léptetett órával), a 12 kockázatos válasz, Újrakezdés, két ujj, billentyűzet, szünet / „Miért?” megállítási okok; új: D4 (a víz képi szintje jó válasznál csökken, rossznál nő), a menedék mindig a képen, győzelemkor a víz-törés |
| `tsunami-mobile.test.ts` (forrás-őrök) | a régi kvíz-fázis őrei a nem blokkoló kérdés őreire; a J1a-őrök (táblák, `runKey`) a régi szerkezethez igazítva |
| `game-mobile-cases/tsunami-english.ts` | `quizScope` / `answerWrong` a kérdés-sávra (4 gomb), mérce változatlan |
| `joystick-response.spec.ts` Szökőár-eset | a mérő a figura vízszintes helyzetét (régi `x`) méri — a #492 stabilizálása (kérdés nélküli ablakok) marad |
| `remaining-learning.spec.ts`, `coupon-expired-all-games`, `game-win-paths`, `vocab-cross-game-log` | a Szökőár-esetek a kérdés-sávra igazítva |
| `game-sim-determinism-guard.test.ts` | a `lib/tsunami/` új mag-fájlja a hatókörben; a lap engedélylistája (a villám `Math.random`-ja; a zóna helye a menet seedjéből) |
Ág: `fix/szokoar-tema-es-sebesseg`, munkafa: `.claude/worktrees/szokoar-tema` (a `origin/main` `a7b3b787`-ről).

## Tulajdonosi panasz (2026-11-18, szó szerint)

> „Te, a szökőár szökésből hogyan lett autóborogató futós játék? Ezt nem is értem, hogy semmi köze már a szökőárhoz, hanem fut,
> és autókat borogat. Tehát ez már egy futóverseny-játék lett, plusz ugyanúgy laggol az is.”

## 1. Tények (mérve, 2026-11-18)

### 1.1 Mit lát a gyerek az élő játékban (websuli.vip, valódi GPU, 390×844 és 827×896)

Képek: `docs/measurements/szokoar-tema/` (`elo-*`, `hook491-*`, `regi-*`).

- **A hullám a menet nagy részében egyáltalán nem látszik.** A kamera a futó mögött–fölött áll (`TsunamiScene3D.tsx`
  `placeCamera`: z = 8,6, előre néz), a hullám a futó MÖGÖTT, `z = 1,4 + waveGap × 0,33` (`TsunamiScene3D.tsx:605-607`). A kezdő
  30 m-es résnél z ≈ 11,3 — a kamera MÖGÖTT van, nem látszik; csak kb. 22 m alatt ér a képbe, és akkor sem falként, hanem
  (lásd lent) ködként.
- **Amikor közel ér** (20 m, a `hook491-390x844-hullam-kozel-kod.jpg`): a kamera a hullám-hálóba kerül, az egész kép halvány kék
  köddé válik — a futó, az út eltűnik. Olvasható, fenyegető fal soha nem jelenik meg: a hullám vagy láthatatlan, vagy elnyel mindent.
- **A képet az út, a futó, a piros felborult autók és a kérdés-táblák uralják** (`elo-390x844-1-kezdet.jpg`): tengerparti út
  pálmafákkal, a távolban egy hegy. A „VÍZ 30 m” csak egy szám a HUD-on.
- **Az „autóborogatás”:** a „felborult kocsi” akadály (`lib/tsunami/obstacles.ts:18,28,113-115,143`; piros karosszéria, kerekek az
  égnek: `TsunamiScene3D.tsx:355-359`). Ütközéskor (`lib/tsunami/core.ts:509-514`) az akadály oldalra billen és odébb csúszik
  (`TsunamiScene3D.tsx:518-521`, „Elütve: oldalra billen”) — a gyerek szemében: nekifut az autónak, és felborítja. A sávban álló
  autó a leggyakoribb, csak sávváltással kerülhető akadály, így a menet tényleges tartalma az autók kerülgetése.

### 1.2 Mi volt a #483 előtt (`b4b84db6`)

- A víz VOLT a jelenet: függőleges menekülés felfelé, szörfdeszkán álló figura, alul a tenger emelkedik, permet; a „HULLÁM 38 m”
  és a „Zónában: lassabb víz” jelzés közvetlenül a látott vízhez tartozott (`regi-b4b84db6-390x844-kezdet.jpg`).
- A szökőár a tét és a kép közepe: a víz folyamatosan emelkedett (`TsunamiEscapeEnglish.tsx:599-635, 1151-1181` a régi lapon),
  a jó válasz lejjebb vitte, a rossz feljebb hozta („Jó válasz: XP és lejjebb megy a hullám. Rossz vagy lejárt: kicsit feljebb jön”).
- **Mi veszett el a #483-mal:** a látható víz mint fő elem; a „menekülök a víz elől” érzet (a futó előre néz, a veszély mögötte,
  képen kívül); a víz és a kérdés közvetlen, látható kapcsolata. A #483 a menekülést egy futópálya-mechanikára cserélte, amelyben
  a hullám csak HUD-szám és egy ritkán, rosszul megjelenő háló.

### 1.3 Sebesség (élő oldal, a `scripts/perf/measure-game-frames.mjs` (#491) mérővel, a játékmenet szakaszai)

| Nézet, CPU | Élő (main): fps / képkocka / főszál foglalt | Csak a #491 hook-javítással: fps / képkocka / foglalt |
|---|---|---|
| 390×844, 1× | 2,1 / 1633 ms / 99% | **57,7 / 17 ms / 4%** |
| 390×844, 4× | 3,5 / 3367 ms / 90% | **53,4 / 17 ms / 6%** |
| 390×844, 6× | nem indult el (a kattintás időtúllépés) | **41,5 / 17 ms / 12%** |
| 827×896, 1× | 3,0 / 967 ms / 99% | **57,7 / 17 ms / 3%** |
| 827×896, 4× | 0,6 / 3617 ms / 97% | **55,1 / 17 ms / 4%** |
| 827×896, 6× | nem indult el | **45,8 / 17 ms / 9%** |

- Rajzolási hívás 54–58, háromszög 12–13 ezer — a GPU-terhelés kicsi; a lassúság **nem a grafika**.
- A 4×-es CPU-profil szerint a főszál ideje a kérdés-tételek érvényesítésében / normalizálásában telik (a közös kódban:
  szövegnormalizálás, `isPlayableQuestion`-szerű ellenőrzés — `gameScoreRunId-*.js` és `option-key-*.js` csomagok, ~77%).
- Ok: a `useMaterialQuizzes` minden renderben új tömböt ad; a lap `useMemo([materialItems])` szűrése / érvényesítése így minden
  renderkor újrafut (a 10 Hz-es HUD-dal együtt), több ezer tételen. **A javítás a #491** (referencia-stabil kimenet) — önmagában
  1–3 fps-ről 41–58 fps-re hozza a Szökőárt. Ez nem ennek a szeletnek a kódja.
- A lassúság a játékmenetet is torzította: 204 s alatt 144 m (a cél 1200 m) — a szimuláció a képkocka-plafon miatt a valós idő
  töredékével haladt; a hullám így szinte sosem ért utol, és nem is látszott.
- A #491-gyel is marad 1 db ~530–560 ms-os hosszú feladat a menet elején (a kérdés-sáv első megjelenése / shader-fordítás) —
  a terv része a mérése és csökkentése.
- Valódi telefonon NEM mértünk (UNVERIFIED); a mérés asztali Chrome-ban, telefon-emulációval és CPU-lassítással készült.

> **HATÁLYTALAN (2026-11-18):** a 2–6. fejezet a döntések ELŐTTI javaslat (pl. a „régi, függőleges játék visszaállítása”
> nem-cél, hullámfal-EARS). Ami érvényes: a 0. fejezet (D1, D2, D4, D2-b: A), a 7. fejezet (válaszablak, látvány C irány) és
> a végrehajtási utasítás. A régi szöveg csak a döntés előzményeként marad.

## 2. Cél és nem-cél

**Cél:** a játék témája újra a szökőár: a hullám a kép és a tét közepe — látható, közeledő, képben és hangban fenyegető fal a futó
mögött; a hibás válasz / ütközés látványosan közelebb hozza, a jó válasz láthatóan távolabb löki. A #483 jó részei maradnak:
háromsávos mozgás, kérdés-kapuk és lista mód, közös kupon-szabály, a 48 px-es gombok, a mobil mérő, az élesítés, a levágás-háló.
A sebesség a #491-gyel és a Szökőár saját, mért kisebb javításaival.

**Nem-cél:** a régi, függőleges játék visszaállítása; a közös kérdés-ütemező vagy a közös mérők módosítása; a #491 kódja.

## 3. Döntési pontok (tulajdonosi döntés kell — az ajánlott opció elöl)

### D1. Honnan lássa a gyerek a hullámot? (a fő döntés)
- **A) Javasolt: a kamera megfordul — a futó FELÉNK fut, mögötte a hullám.** A kamera a futó előtt áll, visszanéz; a kép tetején
  (a futó mögött) a teljes szélességű, tarajos hullámfal, amely a rés szerint nő / közeledik. A hullám MINDIG a képen van, a
  közeledése a legfontosabb képi információ; a kapuk és az akadályok a kamera felé jönnek (a futó elé), a kérdés-táblák alul.
  Előny: egyértelmű „menekülök” érzet, minden képkockán látszik a tét. Kockázat: a kamera-csere a jelenet és a táblák
  elrendezésének átírása (a K4/D-J1a-18 fej-korlát újramérése).
- **B) Marad az előre néző kamera, a hullám a kép SZÉLÉN / felül tükörképként jelenik meg** (visszapillantó-sáv a kép tetején,
  vagy alul a kép széléről benyúló taraj és permet, a rés szerint nő). Kisebb átépítés, de a hullám mellékszereplő marad.
- **C) Oldalnézet (jobbról balra fut, balról jön a hullám).** Klasszikus és jól olvasható, de a háromsávos mozgás és a kapuk
  nehezen férnek bele; nagy átépítés.

### D2. Az autók
- **A) Javasolt: nincs autó; a helyükön a szökőárhoz illő SODRÓDÓ TÖRMELÉK** (uszadékfa-halom, hordó, láda, csónak-roncs), amelyet
  kerülni / átugrani kell; ütközéskor a figura botlik és megbillen, a TÖRMELÉK nem „borul fel” (nincs autóborogató hatás). A
  „csak sávváltással kerülhető” szerepet egy nagyobb törmelék (pl. csónakroncs) veszi át.
- **B) Az autó marad, de víz sodorta, félig elmerült kocsiként** (a hullám előtt sodródik); ütközéskor sem billen.
- **C) Az autó változatlanul marad** (nem javasolt: ez a panasz tárgya).

### D3. A menet célja
- **A) Javasolt: marad a „menedék a hegytetőn”**, de a cél-hegy és a menedék a kép tetején / távolban mindig látszik, és a táv a
  hegyre vezető út; a végén a futó a menedékbe ér, a hullám a hegy lábánál megtörik (győzelmi kép).
- **B) Időre túlélés** (pl. 3 perc), a hegy nélkül. A „hegyre fel” ív elvész.

### D4. A jó / rossz válasz hatása a hullámra (látványosan)
- **A) Javasolt:** jó kapu → turbó + a hullám látványosan hátrébb esik (a fal kisebb lesz, permet-robbanás a kapunál), rossz kapu
  vagy ütközés → botlás + a hullám egy ugrással közelebb (a fal nő, rázás, mély morajlás), és a HUD „VÍZ” sávja a falhoz kötött
  színnel jelez. A mostani számok (turbó, +12 m, botlás) maradnak, csak láthatóvá válnak.
- **B)** Csak a HUD és a hang jelez (kisebb munka, gyengébb hatás).

## 4. Sebesség — tervezett, mért lépések
1. **A #491 a mainre** (a fő ok; nem ennek a szeletnek a kódja) — a Szökőár ezután mérve 41–58 fps (asztali emuláció).
2. A Szökőár saját része, előtte / utána mérőtáblával (a Kockavadász telefonos szeletének tanulságai alapján): a menet eleji
   ~550 ms-os hosszú feladat okának mérése (shader-fordítás / első kérdés-render); a pixelarány-plafon és az anyagok (telefonos
   szinten Lambert a PBR helyett, ha a mérés indokolja); árnyék nincs (már most sincs); a hullám-háló csúcsszáma telefonon.
3. A valódi telefonos mérés UNVERIFIED marad — a tulajdonos telefonján javasolt egy próba a kiadás után.

## 5. Tesztek és spec-változás
- A régi J1a-tesztek közül, amelyek az autós akadályt / a kamera irányát rögzítik (pl. az akadály-fajták, a kapu-táblák a futó feje
  fölött), dokumentált SPEC-VÁLTOZÁS lesz a döntések szerint; a mérce (a futó feje szabad, ≥ 48 px, nincs levágás) nem lazul.
- Új mérés: a hullám MINDEN képkockán a képen van (vetített doboza a nézetablakban, a rés szerint nő), és sosem takarja el a futót
  (a kamera nem kerül a hullám-hálóba).

## 6. Elfogadás (EARS)
- AMIKOR a menet fut, a hullám-fal vetülete MINDIG a nézetablakon belül van, és a mérete a rés csökkenésével monoton nő.
- AMIKOR a rés < 5 m, a futó továbbra is látható (a kamera nem kerül a hullám belsejébe).
- AMIKOR a gyerek rossz kapun fut át vagy ütközik, a hullám képi mérete 0,5 s-on belül láthatóan nő; jó kapunál csökken.
- A pályán nincs felborítható autó (D2 szerint).
- 390×844 és 827×896 nézetben, asztali emulációval, 4× CPU-n a játékmenet medián képkocka-ideje ≤ 33 ms (a #491 után).


## 7. Kiegészítés (2026-11-18, koordinátori döntések)

### 7.1 Válaszablak az olvasási idő szerint (K1)
A tulajdonos Brain Rot-panasza („nagyon kevés időt adsz a válaszadásra”) nyomán: a kérdés ablaka = tájékozódás (1 s) + a
teljes olvasnivaló (kérdés + 4 válasz) az évfolyam olvasási sebességének 0,65-szörösével + döntés (3 s; 3–4. évf. 3,8 s),
legalább a közös ablak, legfeljebb 40 s (`client/src/lib/tsunami/pacing.ts`). A közös ablakon túli **többletidő alatt a víz
áll**. A sim valódi hosszúságú (évfolyam-bank) kérdésekkel és a lap pálya-tempójával (0,85–1,15) is mér.
**Későbbi közösítés:** a Szólétra `lib/wordLadder/pacing.ts` és a #497 (Brain Rot) burkolójával egy közös
`game-engine/play` modulba emelendő a #497 összevonása után (kanban-jegy).

### 7.2 Látvány — C irány: saját tervezésű pálya Blenderrel (tulajdonosi döntés: „Telepítem a Blendert”)
Modellcsomagot nem töltünk le. A modellek a repóban lévő Blender-szkriptekből gyárthatók újra (fej nélkül:
`"$BLENDER_BIN" -b -P source/scripts/blender/szokoar/<szkript>.py` (a Blender helye a `BLENDER_BIN` környezeti változóból vagy a PATH-ból; gépfüggő útvonal nincs)), glTF-exporttal.

**Téma (koordinátor, 2026-11-18):** emelkedő víz elől menekülés a hegyre, sodródó törmelék (nem autó), látványos szökőár.
A játékhoz és a CI-hoz Blender NEM kell: a kész, tömörített GLB követett fájl.

**Jelenet-elemek** (oldalnézeti öböl, a játéktér változatlan: alulról emelkedő víz, deszkák, zóna-bóják):
| Elem | Leírás | Háromszög-keret | GLB-keret |
|---|---|---|---|
| Sziget / part | két lekerekített, rétegzett sziklás-homokos domb az öböl két oldalán, fűtakaró, nedves part-sáv | 3 000 | 120 KB |
| Sziklák (3 változat) | lekerekített, enyhén lapított kövek, példányosítva (instancing) | 3 × 300 | 30 KB |
| Pálmák (2 változat) | ívelt törzs gyűrűkkel, 6–8 levél, szélben billegés a vertex shaderben | 2 × 500 | 40 KB |
| Házak (3 változat) | stilizált halászkunyhók, pasztell falak, lekerekített tető, ablakfény (emissive) | 3 × 600 | 60 KB |
| Világítótorony-menedék | a felső deszka fölötti sziklán: vastag, csíkos torony, üveges lámpaház forgó fénnyel, kis ház zászlóval | 2 500 | 100 KB |
| Deszkák | mólószerű fa pallók cölöpökkel (a sárga-fekete fém és a jég helyett) | 4 × 400 | 40 KB |
| Hajóroncs (díszlet) | félig homokba fúrt csónak az öböl alján | 800 | 40 KB |
| Figura | kerekded, nagyfejű gyerek (nem kockás), szörfdeszkán; egyszerű csontváz: kar / láb / fej (3 mozdulat) | 2 500 | 120 KB |
Összesen ≤ 15 000 háromszög, ≤ 600 KB GLB (Meshopt-tömörítve), textúra nélkül vagy 1 db 256×256 palettás webp
(gradient-atlasz). Rajzolási hívás ≤ 40 (anyag-egyesítés + példányosítás) a mostani 125 helyett.

**Stílus:** stilizált, lekerekített low-poly (simított élek, nem kocka), egységes meleg paletta (homok #f3d19c, fű #6cc070,
szikla #8d7b6a, fa #b77a4a, víz #1ccfd6 → #0a62a8, pasztell házak), lapos árnyalás helyett finom gradient (vertex color).

**Víz / ég / fény kódból:** hullámfal a front-shaderben (sötétebb, áttetsző fal, fehér taraj, permet-részecskék), hab a
part mentén; színátmenetes naplementés ég (`createGradientSky`), mérsékelt köd; egy meleg fő fény + ég / talaj kitöltés;
a közös `postfx` (telefonon bloom nélkül).

**Fájlok és szerkezet:**
- `source/scripts/blender/szokoar/common.py` — paletta, lekerekítő segédek (bevel + subdivision), vertex-color gradient, export
  (glTF 2.0 bináris, `export_draco_mesh_compression_enable` vagy Meshopt utólag `gltfpack`-kel — UNVERIFIED, a telepítés
  után ellenőrzendő, melyik érhető el).
- `source/scripts/blender/szokoar/build_island.py`, `build_props.py`, `build_lighthouse.py`, `build_kid.py` — elemenként egy szkript.
- `source/scripts/blender/szokoar/build_all.py` — mindet legyártja, determinisztikusan (rögzített seed), a kimenet:
  `source/client/public/models/szokoar/<elem>.<tartalom-hash>.glb` + `manifest.json` (név → hashes fájl).
- Betöltés: `GLTFLoader` (+ `MeshoptDecoder`) a MENÜ alatt (a mostani előkészítés helyén), a hiányzó modellnél a mostani
  primitív díszlet a tartalék.
- Mérés: a #491 mérőjével indítás ≤ 200 ms (4× CPU), ~60 fps; minden lépés után kép (390×844, 827×896).

**Őr-teszt (keret):** `tests/tsunami-models-budget.test.ts` — a `manifest.json` minden GLB-je létezik, összméret ≤ 600 KB,
egy fájl ≤ 200 KB, a glTF JSON-ban a háromszögszám összesen ≤ 15 000, a mesh-ek száma ≤ 40.

### 7.3 Spec-pontosítás: a figura szabadsága nyitott kérdés alatt (orkesztrátori döntés, 2026-11-18)
A figura a kérdés megjelenése után **legfeljebb 600 ms-on belül** szabaddá válik, és a kérdés nyitva tartása alatt **végig szabad**
marad. Eszközök sorrendben: kompakt (alacsonyabb) kérdés-sáv ugyanott → a másik hely → kép-eltolás (≈ 400 ms, lassuló görbe;
csökkentett mozgásnál azonnali). A sáv `data-layout="settled"` állapotjelzőt kap, amikor az elrendezés nyugalomba ért; a teszt
erre az állapotra vár, KÜLÖN méri a ≤ 600 ms-os beállást (`layoutSettleMs`), majd 3 mintával a folyamatos szabadságot. A mérce
nem lazítható; ha 600 ms alatt nem megy, a mért értéket kell jelenteni.

### 7.4 Látvány 4. lépés — a szökőár a főszereplő, szikla-hegy a menedékkel (átvevő fejlesztő, 2026-11-18)

Előzmény: az átadó jegyzet (`docs/handoffs/2026-11-18-szokoar-latvany-atadas.md`) „Ismert hibák” listája. A 7.2 elem-táblája és
kerete érvényes; ez a fejezet a megvalósítás módját pontosítja ott, ahol a 7.2 nyitva hagyta vagy a mérés mást mutatott.

**Cél (a tulajdonos szava szerint: emelkedő víz, sodródó törmelék, látványos szökőár; „szép 3D-s grafika”):** a kép első
pillantásra szökőárt mutasson — a háttérben teljes szélességű, tarajos-habos, közeledő hullámfal; elöl élő vízfelszín; jobbra a
vízből kiemelkedő szikla-hegy, a tetején a menedék (világítótorony); telt, tiszta színek.

**Nem-cél:** a játékmenet, a kérdés-sáv és a HUD módosítása; új akadály (D2-b: A marad); letöltött modell / textúra; a közös
`three-look` réteg átírása (a jelenet a saját tónusleképezését állítja be a kapott rendereren).

**Elemek és döntések**
| Elem | Megvalósítás |
|---|---|
| Hullámfal | egy rajzolási hívás, saját shader: sötétkék tő → türkiz, áttetszőnek ható fal → világító perem → vastag, tépett fehér taraj; előrebukó ajak (vertex-hajlítás), a falon felfelé futó habcsíkok, a tövénél permet-köd. A vízszinttel (`fill`) nő és közelít: a taraj a kép ~58 %-ától (alacsony víz) ~84 %-áig ér, a távolság ~120 → ~34 egység; a part és a dombok FÖLÉ magasodik (a régi a dombok mögé bújt — ezért „alig látszott”). Győzelemkor visszahúzódik. |
| Hangulat | a veszéllyel (`danger`) az ég teteje mélyül, a fény hűvösebb lesz — de a színek teltek maradnak (nincs szürke köd). |
| Kifakulás | ok-feltárás méréssel (képpel): fényerő (a Lambert-anyag a 2,2-es fő fénnyel túlvezérel), ACES-tónusleképezés (a világos színeket fehér felé húzza), barack színű ég-alj és köd, lineárisnak vett paletta a Blender-szkriptben. Javítás: semleges tónusleképezés a jelenetben, visszafogott fények, azúr ég, sRGB-ben megadott és lineárisra váltott paletta. |
| Szikla-hegy | Blender: `cliff` (magas, lapos tetejű, rétegzett sziklatömb fűsapkával — a menedék ezen áll, a víz az oldalán emelkedik, a tövénél habgyűrű) és `hill` (lekerekített, rétegzett domb a háttérbe, példányosítva). A régi kúp-hegyek (`ConeGeometry`) megszűnnek; az analitikus terep (part, öböl) sima árnyalást és szelídebb hullámzást kap. |
| Figura | Blender: nagyfejű, kerekded gyerek mentőmellényben, szörfdeszkán; részek a meglévő mozgáshoz: `kid_board`, `kid_torso`, `kid_head`, `kid_arm`, `kid_leg` (a kar / láb tükrözve kétszer). A forgáspontok a jelenetben állandók. Betöltésig a kódból épített figura a tartalék. |
| Törmelék | a meglévő `debris_*` modellek (deszka, hordó, láda) + `debris_log` (uszadékfa), példányosítva, a vízen sodródva és ringatózva, a hullámfal előtt is (távolabb, kisebbnek látszva). Díszlet, nem akadály. |
| Deszkák | mólószerű pallók cölöpökkel (`pier_post` példányosítva), egy összevont geometria. |
| Anyag | minden Blender-modell EGY anyagot használ, a szín csúcs-színből jön (finom függőleges átmenettel) → modellenként egy primitív; a jelenetben modellenként egy `InstancedMesh`. |

**Keret (mérve):** rajzolási hívás ≤ 130 (cél ≤ 70); a modell-keret őre zöld (fájl ≤ 200 KB, ≤ 15 000 háromszög, ≤ 20 mesh);
390×844 emulált méréssel ≥ 57,7 fps; a 4× lassított CPU-s indítási tüske ≤ 200 ms (a modellek shaderei a menü alatt fordulnak:
`renderer.compile`).

**Elfogadás (EARS)**
- AMIKOR a menet fut, a hullámfal taraja a part és a dombok fölött látszik, és a vízszint emelkedésével nagyobb és közelebb van.
- AMIKOR a víz alacsony, álló nézetben a kép nem fehéres: az ég kék, a növényzet zöld, a víz türkiz–kék (képpel igazolva).
- A menedék a szikla-hegy tetején áll, MINDIG a képen (a `tsunami-play` menedék-mérése változatlan mércével zöld).
- A figura és a díszlet Blender-szkriptből készül; hiány / hiba esetén a kódból épített tartalék marad.
- Minden lépés után valódi böngészős kép (390×844 és asztali; alacsony / közepes / magas víz), a készítés módjával megjelölve.

**Tesztek:** `tsunami-models-budget.test.ts` bővül az új modellnevekkel (`cliff`, `hill`, `kid_*`, `debris_log`) és azzal, hogy
modellenként egy primitív van (a mérce szigorodik: primitív ≤ 20); a `tsunami-play.spec.ts` változatlan.

### 7.5 Csiszoló kör (tulajdonosi döntés a c4 képekre: „Igen, de még csiszold”, 2026-11-18)

Sorrend (a lagg a tulajdonos fő panasza, ezért az előre kerül):
1. **Menet közbeni hosszú képkockák** — CPU-profillal, tényből megnevezett ok, javítás. Cél: menet közben nincs 50 ms-nál hosszabb
   képkocka a kérdés megjelenésén kívül; ott ≤ 100 ms.
2. **Álló kezdőkép:** a hullámfal tarajának jól olvasható része már alacsony víznél is látszik (a súgó-buborék, a felső stég és a
   hegy nem takarja).
3. **Stégek:** nem állványzat — kevesebb szint, lépcsőzetes hossz, szabálytalan deszkák és cölöpök, kötélkorlát.
4. **Fekvő nézet:** a figura szabadsága a nyitott kérdés alatt oldalra mozgáskor is (≤ 600 ms), teszttel; a próba a ténylegesen
   kirajzolt kép-eltolással mér. A megoldás a tárcsa oldalától független (a `feat/joystick-jobb-kez` ággal összefésülhető).
5. **Teljesítmény nyugodt gépen** (≤ 1 idegen e2e-konténer): ≥ 57,7 fps 390×844-en, ≤ 200 ms indítási tüske 4× CPU-n, 5–5 mérés,
   szórással.
6. **Blender-kimenet:** bájtazonosság, vagy ha az exportáló miatt nem megy, normalizált tartalmi lenyomat a fájlnévben —
   igazolva több futással.
7. Meta-mérő a Szökőárra; a friss főág beolvasztása, a Brain Rot `pacing` és a determinizmus-őr összhangja.

### 7.6 A vak, hibakereső ellenőrzés javításai (ítélet: NEM, fej c2da722a; 2026-11-19)

Minden pont előbb bukó teszttel.
- **B1:** a takarás-döntés a figura ténylegesen kirajzolt méretével számol (a jelenet vetített befoglaló dobozából, a talpponthoz
  képest), nem 44 px-es állandóval; a tesztek a teljes testet mérik (5 × 7 rács a fej tetejéig) minden nézetben, az oldalra
  mozgatós esetben 360×640-en is, x = 8 / 50 / 92 %, víz 50 %.
- **K1:** a többletidőben csak a víz áll (a mag `holdWater` jelzője), a mozgás, a sodrás és a zóna fut.
- **K2:** a modellek aszinkron fordulnak (`compileAsync`, a végleges jelenet fényeivel), és egy lépésben kerülnek a jelenetbe;
  mérés nyugodt gépen (≤ 100 ms a kérdés megjelenésekor, ≤ 200 ms indításkor, 4× CPU).
- **K3:** álló nézetben a taraj a felső sáv jelzői alatt, a vízfelszín fölött mindig látszik; a hegy keskenyebb.
- **K4 / KICSI 5:** a vezérlők (tárcsa, Sprint — a tényleges dobozuk, bármelyik oldalon) és a felső sáv is akadály; a kép-eltolás
  kérdés nélkül is követ, és ha a nulla eltolás is szabad, visszaáll.
- **KICSI:** hangkontextus mozdulathoz kötve (nincs konzol-figyelmeztetés), az Indításkor is; részleges modellhibánál nincs
  kettőzés; a modell-keret őre a GLB-kből számol; az olvasási ablak a director saját bemutatásán (helyes statisztika); a
  mérési képek tömörítése.

### 7.7 A PR előtti kapu leletei (fej 90b3f83f, 2026-11-19)

A `gate:pr` a böngészős körben két, a saját kódomból eredő hibát fogott (a harmadik bukás — Vihargarázs 915×412 — nem ennek az
ágnak a kódja; jelentve).
- **M11 (közös mobil mérő, Szökőár, mindhárom nézet):** a K2 javítás `compileAsync` hívása a three.js-ben `extensions.get`-tel
  kérdezi a `KHR_parallel_shader_compile` kiterjesztést, ami hiányzó kiterjesztésnél konzol-figyelmeztetést ír. Javítás: a
  jelenet `extensions.has`-szal kérdez (az nem ír), és kiterjesztés nélkül a szinkron `compile`-t hívja — ott a programok amúgy
  is szinkron fordulnak. A mérő zajszűrőjét NEM bővítjük. Bukó teszt: a meglévő M11 (a kapu naplójában 3 bukás).
- **7.3 mérce terhelt gépen (360×640, 70 %-os víz, egyszeri bukás):** az ok méréssel dől el, nem találgatással — a beállási idő
  (`layoutSettleMs`) és a figura tényleges szabaddá válása 1× / 4× / 6× CPU-n, valódi GPU-val; a teszt a mért értéket a naplóba is
  kiírja (`SETTLE|…`). A javítás a mérésből következik; a 600 ms-os mérce nem lazul.
  **Mérés (2026-11-19, fej 6b124a33):** a mérő-környezetben (szoftveres WebGL, 15 futás) eltolásnál a beállás 427–437 ms
  (ebből 420 ms a rögzített eltolás-idő), a tartalék ~165 ms; valódi GPU-n a döntés késése 4× CPU-n 75–104 ms, 6× CPU-n
  118–176 ms — ott eltolással 540–600 ms, a mérce határán. A bukó állítás szövege a kapu időtúllépése miatt nem maradt meg, a
  bukás 45 ismételt futásban (15 elrendezés-eset × 3) nem jött elő újra. **Helyesbítés (a `gate:pr` 2. futása, fej 577c9945):** az ok
  mért — lásd alább, „A nyugalom-jelző oka”.
  **Javítás:** az eltolás gyorsabb (csillapítás 12 → 16, a nyugalom-jelző 420 → 320 ms; 320 ms után < 1 % marad hátra), így a
  tartalék ~265 ms, és 6× lassított CPU-n is a mércén belül marad. A mérce és a tesztek állításai változatlanok.
  **Utómérés a teljes körből (fej f419a4c0, 2026-11-19 14:14 UTC, 75/75 zöld):** `SETTLE` eltolással 327–339 ms (tartalék
  261–273 ms), eltolás nélkül 5–12 ms. Nézetenként (eleje / 35 / 45 / 50 / 70 %): 360×640 12 / 337 / 331 / 331 / 334;
  390×844 7 / 5 / 339 / 330 / 5; 844×390 334 / 327 / 328 / 332 / 6 ms. A közös mobil mérő M11-je mindhárom nézetben zöld.
- Friss `origin/main` beolvasztva; a csapdakatalógusban a saját bejegyzések a főág C-75-e után (C-76 / C-77 / C-78).

**A nyugalom-jelző oka (mért, `gate:pr` fej 577c9945, 2026-11-19 16:09–16:59 UTC):** terhelt gépen (szoftveres WebGL) négy
elrendezés-eset bukott (360×640 / 70 %; 844×390 / 35, 45, 50 %) ugyanazzal az állítással: a `data-layout="settled"` után az első
mintában a figura teste 5–30 rácspontban a kérdés alatt volt, miközben a mért beállás 334–340 ms (a 600 ms-os mérce teljesült). Ok:
a jelző falióra szerinti 320 ms-os időzítő, a kirajzolt eltolás viszont képkockánként, 50 ms-ra vágott `dt`-vel csillapodik — hosszú
képkockáknál a kép a jelzés idejére még nem ért oda (vak visszanézés KICSI 1). A 420 → 320 ms-os gyorsítás a tartalékot elvette; a
fej 90b3f83f egyszeri bukása ugyanez.

**Javítás (koordinátori döntés „A”, 2026-11-19):**
- A nyugalom a KIRAJZOLT eltoláshoz kötött: „nyugalomban”, ha a jelenet által visszaírt eltolás (`shownShiftPx`) és a kívánt
  eltolás (`shiftPx`) különbsége < 1 px — egy kódhelyen (`lib/tsunami/shift.ts`), a lap képkocka-követője ellenőrzi. Időzítő nincs.
- A csillapítás (16) ugyanabból a modulból jön (vak KICSI 2); az eltolás a valós eltelt idővel csillapodik (legfeljebb 250 ms
  lépésenként), nem a játékmenet 50 ms-ra vágott `dt`-jével — így lassú képkockáknál is ~300 ms falióra alatt beáll.
- WebGL nélkül (nincs kirajzolt eltolás) és csökkentett mozgásnál az eltolás azonnali, a jelző a döntéskor vált.
- Bukó teszt előbb: 844×390, 35 %-os víz, 6× lassított CPU — a „nyugalomban” jelzéskor a figura teljes teste szabad. A 600 ms-os
  mérce és a meglévő tesztállítások változatlanok.
