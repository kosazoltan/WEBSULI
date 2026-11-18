# Szökőár szökés — a téma visszaadása (a hullám a kép és a tét közepén) és a sebesség

Állapot: TERV (1. fázis) — a tulajdonosi döntések rögzítve (lent, 0. fejezet). Végrehajtási utasítás:
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
