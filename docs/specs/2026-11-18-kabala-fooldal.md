# Spec: A Websuli makija a főoldalon — animált ajánló a három legújabb tananyaghoz

> Dátum: 2026-11-18 · Szerző: Claude (alügynök) · Állapot: JÓVÁHAGYVA (a tulajdonos a munkát kérte; a nyitott kérdések a 10. szakaszban)
> Végrehajtás: `docs/specs/2026-11-18-kabala-fooldal-vegrehajtas.md`
> Előzmény: `docs/specs/2026-11-18-kabala-maki.md`, `docs/kabala-maki.md` (a figura és a klipek); a figura modellje még változik.

Tulajdonosi kérés, szó szerint: „a kis maki a főoldalon animálva ugráljon és ajánlgassa a legújabb három tananyagot a tanulónak,
mutogasson, ugráljon a tananyagoknál, legyen meganimálva, és a főoldalon jelenjen meg; ne legyen túl nehéz, telefonon szépen
fusson, látványos legyen és cuki.”

## 1. Cél

A főoldalon, a tananyaglista fölött egy „A maki ajánlja” sáv jelenik meg: a kabala (gyűrűsfarkú maki) integet, a három legújabb
tananyag sorához szökken, rájuk mutat, és szövegbuborékban kedves, rövid mondattal ajánlja őket. Koppintásra a következő ajánlat
jön; az ajánlott tananyag egy koppintással megnyílik. A megoldás telefonon is könnyű (nincs 3D-motor a főoldalon), és a végleges
modellből EGY paranccsal újragyártható.

## 2. NEM cél

- A figura modelljének / klipjeinek módosítása (`source/scripts/blender/kabala-maki/*` — azt másik munka végzi; ez a munka csak importálja).
- Új végpont, új adatbázis-mező, új npm-függőség, külső fájl / betűtípus / könyvtár.
- A kabala megjelenítése a játékokban, a leckékben vagy más oldalon.
- A funkció bekapcsolása élesben (a `HOME_MASCOT` kapcsoló alapból KI; a bekapcsolás tulajdonosi döntés).
- Hang, beszéd, szájmozgás.

## 3. Mérések és a technika kiválasztása

Minden szám ebből a munkafából való (2026-11-18, `origin/main` 99c6dc29 + a `kiserlet/kabala-maki` 2d4c180c beolvasztva).

### 3.1 A főoldal ma (a változtatás előtt, `npx vite build`)

| Darab | Méret | gzip |
| --- | --- | --- |
| `main-*.js` (benne a főoldal) | 340 106 B | 116 556 B |
| `react-vendor-*.js` | 147 056 B | 48 004 B |
| `ui-vendor-*.js` | 107 386 B | 34 105 B |
| `main-*.css` | 210 673 B | 36 812 B |

A főoldal ma NEM tölt be 3D-motort: a `three.module-*.js` külön darab, csak a játékok kérik le.

### 3.2 A jelöltek

| Szempont | (A) előre renderelt képkocka-lap (WebP) | (B) lusta WebGL-nézet a GLB-vel | (C) vegyes |
| --- | --- | --- | --- |
| Átvitt méret | **mért prototípus:** 59 képkocka, 128×200 px-es cella, WebP q72: **260,3 KB**; 102×160: 201,5 KB; 152×240: 312,3 KB. **a végleges lap** (az új, magasabb modellből, 44 képkocka, 130×216 px-es cella, q70): **240,2 KB** + álló kép 8,2 KB = 248,4 KB (őr: ≤ 300 KB a képekre); 146×240 px-es cellával 282,3 KB volt | `three.module` 189,3 KB gzip (732,8 KB nyersen) + GLB 244,7 KB (gzip-pel is 189,3 KB) + `GLTFLoader` ≈ 25,2 KB gzip + `DRACOLoader` 5,6 KB + Draco-dekóder (`draco_decoder.wasm` 63,5 KB gzip + burkoló 11,7 KB) = **≈ 485–540 KB** | (A) + (B) összege az interakció után |
| A 350 KB-os keret | belefér (mért: 262 836 B átvitt, lásd a 4.3 végét) | **nem fér bele** (a motor egymaga a keret 54%-a) | az alap belefér, az interakció után nem |
| Dekódolás / memória | egy kép dekódolása; a kibontott lap 1040×1296 px ≈ 5,1 MiB (szélesség × magasság × 4) | 733 KB JS értelmezése + WASM-dekóder + WebGL-környezet + a figura 26 380 háromszöge, csontozás képkockánként | mindkettő |
| Futás közbeni teher | `transform`-animáció a kompozitoron (nincs képkockánkénti JS, nincs újrafestés) | folyamatos WebGL-rajzolás (`requestAnimationFrame`), GPU-terhelés → telefonon melegedés / akkumulátor (NEM MÉRT készüléken) | mint (B), amíg a 3D él |
| Képminőség | a Blender saját renderje (lágy fények, élsimítás) — szebb, mint amit a three.js alapfényei adnak (`docs/kabala-maki.md`: „a three.js-ben a kép nem azonos a Blender-renderrel”) | élő, bármilyen szögből; a fényeket külön hangolni kell | — |
| Rugalmasság | rögzített nézőpont; mozdulatonként 3–12 képkocka; új mozdulat = új sor a gyártó szkriptben + újrafuttatás; tükrözés CSS-ből (két irány egy képsorból) | bármennyi mozdulat és irány, keverés, forgatás | mint (B) |
| Kockázat | a mozgás 6–8 képkocka/mp-es „rajzfilmes” (a helyváltoztatás és az ugrás íve ettől függetlenül 60 képkocka/mp-es CSS) | WebGL-környezet elvesztése, gyenge telefonok, a főoldal JS-e nő | két megjelenítő karbantartása |

**Döntés: (A).** Indok: (B) és (C) a kért 350 KB-os keretet a motorral együtt nem tudja tartani, és a főoldalra folyamatos
WebGL-rajzolást hozna; az (A) a keret alatt marad, a főoldal JS-ét érdemben nem növeli, és a helyváltoztatás / ugrás CSS-ből
60 képkocka/mp-es. Az ár: rögzített nézőpont és lépcsős (6–8 képkocka/mp) testmozgás — a 10. szakasz 1. kérdése rögzíti, hogy ez
tulajdonosi döntéssel bővíthető (több képkocka = több KB).

## 4. Rögzített döntések

### 4.1 Kapcsoló

- Szerver-környezeti változó: `HOME_MASCOT` — csak az `on` érték (kis-nagybetűtől és szóköztől függetlenül) kapcsolja be; alapból KI
  (a repó meglévő mintája: `PLAYER_ACCOUNTS`, `server/player/require-player.ts`).
- A kliens a kapcsolót ÚJ hálózati kérés nélkül kapja meg: bekapcsolva a szerver az `index.html` `<head>`-jébe egy
  `<meta name="websuli-home-mascot" content="on">` sort tesz (`server/lib/home-flags.ts`, a `server/vite.ts` éles és fejlesztői
  ágában is). Kikapcsolva az `index.html` bájtra változatlan (a kiszolgálás a régi `express.static` / `sendFile` úton megy).
- A kliens (`homeMascotEnabled()`, `client/src/lib/home-mascot.ts`) a meta-sort szinkron olvassa — az első rajzoláskor már tudja, kell-e
  helyet foglalni (elrendezés-ugrás nincs, felvillanás nincs).
- Kikapcsolva a főoldal DOM-ja bájtra azonos a mostanival: a `UserFileList` két beszúrási pontja feltételes (`null`).

### 4.2 Mit jelent a „legújabb három” (`mascotPicks`, `client/src/lib/home-mascot.ts`)

- Forrás: a főoldal MEGLÉVŐ listája (`GET /api/html-files`, a `Home.tsx` lekérdezése) — új végpont és új kérés nincs. A lista a
  nyilvános tananyagokat adja; ami benne van, azt tekintjük közzétettnek.
- Ha a tanuló évfolyama ismert (`useClassroomGrade()` — ugyanaz a tár, amelyet a lista évfolyamszűrője és az üdvözlő kártya használ;
  a tanulói profil ezt szinkronizálja) ÉS azon az évfolyamon van legalább egy tananyag: az évfolyam tananyagai közül a három
  legújabb. Különben (ismeretlen évfolyam, anyag nélküli évfolyam, admin / szülő): az összes tananyag közül a három legújabb.
- Rendezés: `createdAt` csökkenő; azonos időnél azonosító szerint (`newestFirst`, `client/src/lib/home-views.ts`) — a sorrend stabil.
  Érvénytelen dátum a legrégebbinek számít.
- 0 tananyag: a sáv nem jelenik meg (a lista „Még nincsenek anyagok” ága változatlan). 1 vagy 2 tananyag: 1 / 2 sor, a sáv ennyivel
  alacsonyabb; egyetlen tananyagnál a koppintás nem lép tovább, a maki helyben ugrik egyet és új mondatot mond.
- Eltérés az üdvözlő kártyától (`newestMaterials`): az a 30 napnál frissebbeket részesíti előnyben, és lehet, hogy csak egyet ad; a
  maki mindig a (legfeljebb) három legújabbat ajánlja. „Új” jelvény: a 30 napnál frissebb tananyagon (ugyanaz az ablak).
- Bekapcsolt és látható makinál az üdvözlő kártya saját hármas listája nem jelenik meg (ne legyen kétszer ugyanaz); elrejtett
  makinál az üdvözlő kártya a régi.

### 4.3 Az eszközök és az újragyártás

- Egy parancs: `node source/scripts/blender/kabala-fooldal/build.mjs` (a Blender helye: `BLENDER_BIN` környezeti változó vagy a
  PATH-on lévő `blender`). Lépések: (1) `home_frames.py` a Blenderben felépíti a figurát a `kabala-maki` szkriptekből (importálva),
  és átlátszó hátterű PNG-képkockákat renderel egy ideiglenes mappába; (2) a `sharp` (már függőség) közös kivágást számol, cellákra
  méretez, egyetlen lapra rak, WebP-be kódol; (3) kiírja a tartalom-hash nevű fájlokat és a manifestet.
- Kimenet: `source/client/public/mascot/kabala-fooldal.<hash>.webp` (a lap), `source/client/public/mascot/kabala-fooldal-allo.<hash>.webp`
  (álló kép), `source/client/src/mascot/home-mascot.manifest.json` (cellaméret, oszlopszám, klipenként képkocka-indexek, fps,
  ismétlődés, az ugrás emelkedése képkockánként, fájlnevek, bájtok). A régi hash-ű fájlokat a szkript törli.
- Mozdulatok (44 képkocka): `idle` 8 (ismétlődik), `blink` 3, `wave` 12, `cheer` 9, `point-in` 3, `point` 4 (ismétlődik), `hop` 5.
  Az `idle`, `wave`, `cheer` a figura gyári klipjeiből mintavételez (a klip saját görbéiből); a `blink` a gyári `blink` alakkulcs; a
  `point` / `point-in` / `hop` ennek a munkának a saját póza (`home_frames.py`), a gyári csontnevekre építve.
- Mutatás balra: ugyanaz a képsor CSS-tükrözéssel (`data-facing="left"`); a lejátszó tudja, a mostani elrendezés a jobbra mutatást
  használja.
- A `cheer` függőleges elmozdulását és a szökkenés ívét NEM a képkockák, hanem a lap animációja adja (a manifest `lift` értékeiből):
  kisebb cella, sima ív.
- A lap keretei (őr-teszt): képek összesen ≤ 300 KB, a lap kibontva ≤ 8 MiB, cella ≥ 1,5 × a telefonos megjelenítési magasság
  (140 px → a mostani 216 px-es cella 1,54×; a 2×-es, 280 px-es cella ≈ 340 KB lenne — a 10. szakasz 1. kérdése).
- **A 250 KB-os cél túllépése — indoklás (orkesztrátori döntés, 2026-11-18):** a mért átvitt méret 262 836 B (≈ 256,7 KiB), a
  250 KB-os cél fölött ≈ 6,7 KiB-tal, a 350 KB-os kemény keret alatt ≈ 93 KiB-tal. A túllépés oka az új, magasabb modell (hosszú
  farok → nagyobb kivágás) és a 216 px-es cella (a 1,5× élességi alsó határ). Kisebb cellánál (≈ 200 px) a cél tartható, de a kép
  ≥ 640 px-en elmosódik; a döntés: a cella marad, a kemény keret (350 KB) a mérce, és az őr-teszt ennek a képekre eső részét (≤ 300 KB) védi.
- A gyártó hibával megáll, ha a figura a renderelt kép szélét éri (pl. hosszabb farok az új modellen) vagy a képek túllépik a keretet.

### 4.4 Megjelenítés

- A főoldal fő darabjában csak a hely lefoglalása van (`HomeMascotSlot`, rögzített magasságú doboz) és a tiszta logika; a sáv
  tartalma (`client/src/mascot/HomeMascot.tsx` + saját CSS) külön, lustán betöltött darab, amelyet a lista megjelenése UTÁN, tétlen
  időben kér le. A képkocka-lapot csak akkor tölti le, ha a sáv a képernyő közelében van, a mozgás engedélyezett, és nincs adatkímélő mód.
- Lejátszás: a lap egy `<img>`, egy cellányi ablak mögött; a képkockaváltás `transform` lépcsős Web Animations-animáció (kompozitor).
  A helyváltoztatás és az ugrás íve külön `transform`-animáció a burkoló elemeken. Képkockánkénti JS nincs.
- A lap háttérbe kerülésekor (`visibilitychange`) és ha a sáv kigördül a képernyőről, minden animáció és időzítő megáll; visszatéréskor folytatódik.

### 4.5 Viselkedés

Állapotok (a `HomeMascot` állapotgépe; a tiszta átmenetek a `client/src/mascot/mascot-script.ts`-ben, egységteszttel):

1. **Belépés:** a maki integet (`wave`), buborék: köszönés (első látogatás és visszatérő látogató külön mondatkészlet).
2. **Ajánlás (i):** ha más sorhoz kell mennie, odaszökken (`hop` + ív, ≈ 0,5 mp), rámutat (`point-in`, majd `point` ismétlődve), a sor
   kiemelést kap, buborék: ajánló mondat a tananyag címével.
3. **Körbevezetés (csak első látogatáskor):** 5 mp-enként a következő tananyag; a harmadik után örömugrás (`cheer`) és záró mondat,
   majd pihenés. Visszatérő látogatónál nincs körbevezetés: az első ajánlásnál megáll.
4. **Pihenés:** `idle` + időnként pislogás (`blink`); buborék: „koppints rám” mondat. Magától többé nem mozdul el.
5. **Koppintás a makira** (gomb, „Következő ajánlat”): a következő tananyag ajánlása (körbe); a körbevezetést leállítja. Egyetlen
   tananyagnál helyben ugrik, és új mondatot mond.
6. **Koppintás egy sorra:** a tananyag megnyílik (ugyanaz az út, mint a kártyáknál: `/preview/:id`, PDF-nél `/materials/pdf/:id`).

Nem idegesítő: a sáv a dokumentumfolyamban áll (semmit nem takar, nem úszik a tartalom fölé); két gomb: **Csendesítés** (a maki
áll, nincs mozgás és körbevezetés; a buborék és a három link marad) és **Bezárás** (a sáv egy 44 px-es „Maki visszahívása” gombbá
zsugorodik; az üdvözlő kártya hármas listája visszatér). A választást és azt, hogy a látogató járt-e már itt, az eszköz jegyzi meg
(`localStorage`, kulcs: `websuli:home-mascot`, alak: `{"v":1,"mode":"on"|"quiet"|"hidden","seen":<szám>}`; sérült érték = alapállapot).

Feliratok: `MASCOT_PHRASES` kódszótár (`client/src/mascot/mascot-script.ts` — a lusta darab része, a fő JS-darabot nem növeli), magyarul, csoportonként több változat (köszönés,
visszatérő köszönés, ajánlás `{title}` helyőrzővel, záró, pihenő, egyetlen tananyag); a választás determinisztikus (nap + sorszám),
egymás után kétszer ugyanaz a mondat nem jön. A buborékban a cím legfeljebb 60 karakter (utána „…”); a teljes cím a sorban olvasható.

Csökkentett mozgás (`prefers-reduced-motion: reduce`): álló kép + buborék + a három link; a makira koppintva a kiemelés és a mondat
vált, mozgás nélkül. Adatkímélő mód (`navigator.connection.saveData`): ugyanez — a képkocka-lap NEM töltődik le (értelmezés: a
„csak álló kép” a figurára vonatkozik; a buborék szövege és a linkek nem kerülnek adatba, ezért maradnak).

### 4.6 Elhelyezés

A sáv a `UserFileList`-ben az üdvözlő kártya (`WelcomeCard`) UTÁN, az évfolyamszűrő ELŐTT áll, `home-panel` kinézettel,
`max-w-3xl` szélességgel középen. Az adventi kártya (`feat/advent-c-felulet`: a Hero után, a támogatók előtt, ≤ 132 / 160 px) más
beszúrási ponton van — a két ág összefésülése két független sor a `UserFileList.tsx`-ben.

```
┌ A maki ajánlja ─────────────────────────────────────┐
│ ╭ buborék (3 sor helye) ───────────╮ [Csend] [✕]    │   72 px
│ ╰──╮───────────────────────────────╯                │
│  maki   ┌ 1. tananyag: kép · évfolyam · cím · → ┐   │   sor: 68 px
│ (a sorok┌ 2. tananyag ─────────────────────────┐    │
│  mellett┌ 3. tananyag ─────────────────────────┐    │
└─────────────────────────────────────────────────────┘
```

- A maki a bal oszlopban áll (telefon, < 640 px: 66 × 110 px, oszlop 72 px; ≥ 640 px: 102 × 170 px, oszlop 112 px), a sorok tőle
  jobbra; az ajánlott sor magasságába szökken, és jobbra, a sorra mutat. A mutatott sort a kiemelés MELLETT a sor bal szélén, a maki
  felől egy borostyán nyíl jelöli (mozgás mellett finoman „bök”) — a figura mutató karja telefonon kicsi, a nyíl teszi egyértelművé.
- Telefonon a sor kompakt: 44 px magas teljes szélességű cél, 34 px-es bélyegkép, az évfolyam és a cím egy-egy sorban (a cím
  levágva; a teljes cím a tananyag oldalán). ≥ 640 px-en 68 px-es sor, a cím két sorban.
- Rögzített magasság (a hely előre foglalt, tananyagszám szerint): telefon 200 / 172 / 172 px (3 / 2 / 1 tananyag), ≥ 640 px:
  336 / 286 / 286 px; bezárva 44 px. Levezetés: `client/src/mascot/home-mascot.css` fejléce; egységteszt köti a kettőt össze.
- **Orkesztrátori döntés (2026-11-18):** kis telefonon a sáv legfeljebb ~200 px, hogy a tananyaglista eleje a hajtás közelében
  maradjon (a korábbi változat 324 px volt, a 360 × 640-es képernyő fele).
- 360 × 640-en a sáv 200 px (a képernyő 31%-a); ismert névnél az üdvözlő kártya hármas listája (≈ 240 px) kiesik, így
  a lista nagyjából ugyanott kezdődik, mint ma.

### 4.7 Akadálymentesség

- A figura díszítő elem (`aria-hidden`, üres `alt`). Az ajánló tartalma egy `<ul>` három valódi linkkel (`<a href>`): Tab-bal
  elérhető, Enterrel nyílik; a sáv `<section aria-labelledby>` „A maki ajánlja” címmel (képernyőolvasónak látható).
- A makira koppintás billentyűzetről is megy: `<button aria-label="Következő ajánlat">`. A felhasználó által kért váltást egy
  udvarias élő régió mondja be („Ajánlat: <cím>”); az önműködő körbevezetés NEM beszél.
- Érintőcélok ≥ 44 × 44 px (sorok, maki, Csendesítés, Bezárás, visszahívás). A buborék szövege `#1e293b` fehér (`#ffffff`) alapon
  (≥ 4,5:1; a teszt a számított színekből méri). Fókuszjelzés: 3 px-es körvonal, mint az üdvözlő kártyán.

## 5. Edge case-ek

- 0 / 1 / 2 tananyag (4.2); azonos `createdAt`; érvénytelen dátum; nagyon hosszú cím (a buborék és a sor levág, a magasság nem nő).
- Az évfolyamon nincs anyag → minden évfolyamból; admin → minden évfolyamból.
- A lista percenként frissül: ha a három ajánlat változik, a sáv a helyén frissül (a kiemelt sor az új lista első eleme lesz), ugrás nélkül.
- A lap letöltése nem sikerül / lassú: az álló kép marad, a buborék és a linkek működnek, a koppintás mozgás nélkül vált.
- A lusta darab letöltése nem sikerül / hibázik: a sáv erre a megnyitásra eltűnik, az üdvözlő kártya hármas listája visszatér, a
  lista használható (hibahatár a sáv körül; ez az egyetlen eset, amikor a lefoglalt hely utólag felszabadul).
- `localStorage` tiltva: az alapállapot érvényes, a választás csak erre a megnyitásra szól.
- Régi böngésző Web Animations nélkül: álló kép (mint csökkentett mozgásnál).
- Háttérbe tett lap / kigördített sáv: minden áll (4.4).
- Keresés / évfolyamszűrő a listában: a sávot nem érinti (az ajánlás a tanuló évfolyamához kötött, nem a pillanatnyi szűrőhöz).
- Kapcsolati hiba korábban betöltött listával: a sáv a meglévő listából dolgozik.

## 6. Elfogadási kritériumok

| # | Feltétel | Mérőszám | Teszt |
| --- | --- | --- | --- |
| K1 | Kikapcsolt kapcsolónál a főoldal változatlan | a `main` DOM-ja bájtra azonos a bekapcsolt állapot DOM-jával a sáv eltávolítása után; nincs `/mascot/` kérés, nincs lusta darab | e2e |
| K2 | A kapcsoló csak `on`-ra kapcsol; kikapcsolva az `index.html` érintetlen | egységteszt a beszúró függvényre | egység |
| K3 | A három legújabb kiválasztása (4.2) | 0 / 1 / 2 / 3+ tananyag, évfolyam, admin, holtverseny, rossz dátum | egység |
| K4 | Belépés, körbevezetés, koppintás, megnyitás (4.5) | a kiemelt sor és a buborék a várt sorrendben vált; a sorra koppintva az URL a tananyagé | e2e |
| K5 | Visszatérő látogató: nincs körbevezetés; Csendesítés és Bezárás megmarad újratöltés után | `localStorage` + DOM | e2e + egység |
| K6 | A kabala főoldali eszközei összesen | ≤ 350 KB átvitt (cél ≤ 250 KB): lap + álló kép + lusta JS + lusta CSS | e2e (válaszméretek) + egység (fájlméret ≤ 300 KB) |
| K7 | Lusta betöltés a fő tartalom után | a lap kérése a lista megjelenése UTÁN indul; a `main-*.js` növekedése ≤ 3 KB gzip; az LCP-elem nem a sáv része | e2e + build-mérés |
| K16 | Kis telefonon kompakt sáv (orkesztrátori döntés 2026-11-18) | 360×640-en a sáv ≤ 200 px; a lista eleje legfeljebb a sáv magassága + 12 px-szel kerül lejjebb, mint kikapcsolva | e2e + egység |
| K8 | Elrendezés-ugrás | a sáv magassága a megjelenéstől az animációig változatlan; a lista első kártyájának helye nem mozdul; CLS bekapcsolva ≤ CLS kikapcsolva + 0,005 | e2e |
| K9 | Teljesítmény 4× lassított CPU-n | animáció alatt ≥ 50 képkocka/mp átlag, nincs 50 ms-nál hosszabb képkocka (3 mp-es mérés a lapon belül) | e2e (CDP) |
| K10 | Csökkentett mozgás / adatkímélő mód | nincs futó animáció, a lap nem töltődik le, az álló kép, a buborék és a 3 link látszik | e2e |
| K11 | Háttérbe tett lapon megáll | minden animáció `paused`, visszatérve `running` | e2e |
| K12 | Akadálymentesség | 3 link Tabbal elérhető és Enterrel nyit; a figura `aria-hidden`; célok ≥ 44 px; buborék-kontraszt ≥ 4,5:1 | e2e |
| K13 | Semmit nem takar, nincs vízszintes túlcsordulás | 360×640, 390×844, 1366×768: `scrollWidth ≤ clientWidth`; a sorok és gombok közepén `elementFromPoint` a saját elemük | e2e |
| K14 | Regresszió | névtelen, bejelentkezett, admin, üres lista: a meglévő főoldali tesztek zöldek; üres listánál nincs sáv | e2e |
| K15 | Újragyárthatóság | a manifest és a fájlok egyeznek (hash, bájt, képkockaszám); a gyártó nem tartalmaz gépfüggő útvonalat | egység |

EARS-alak a legfontosabbakra:

- WHEN a `HOME_MASCOT` nincs `on`-ra állítva THEN the system SHALL a főoldalt a mostanival bájtra azonos DOM-mal és kérésekkel adni.
- WHEN a kapcsoló be van kapcsolva és van legalább egy tananyag THEN the system SHALL a 4.2 szerinti legfeljebb három tananyagot linkként felsorolni.
- WHEN a látogató a makira koppint THEN the system SHALL a következő tananyagot kiemelni és új mondatot mutatni.
- WHEN a rendszer csökkentett mozgást vagy adatkímélő módot jelez THEN the system SHALL NOT letölteni a képkocka-lapot és SHALL NOT animálni.
- WHEN a lap háttérbe kerül THEN the system SHALL minden animációt megállítani.

## 7. Tesztterv

- `source/tests/home-mascot.test.ts` (egység): `mascotPicks`, mondatválasztás (determinisztikus, nincs ismétlés, a cím levágása),
  beállítások olvasása / írása, az állapotgép átmenetei, `mascotHref`, a kapcsoló olvasása.
- `source/tests/home-mascot-flag.test.ts` (egység): `homeMascotOn`, `withHomeMascotFlag` (csak `on`; egyszer szúr be; `<head>` nélkül változatlan).
- `source/tests/home-mascot-assets-guard.test.ts` (őr): a manifest ↔ fájlok egyezése, méretkeret, kibontott méret, klipek listája,
  képkocka-indexek a lapon belül, a gyártó szkriptben nincs meghajtóbetűs útvonal.
- `source/tests/home-mascot.spec.ts` (böngésző, 360×640 / 390×844 / 1366×768): K1, K4–K14 + képernyőképek.
- Mutációs ellenpróba (kézzel, a jegyzőkönyv a `docs/kabala-fooldal.md`-ben): (1) a kapcsoló-ellenőrzés kiiktatása → K1 bukik;
  (2) a csökkentett mozgás ágának kiiktatása → K10 bukik; (3) a rögzített magasság eltávolítása → K8 bukik; (4) a méretkeret
  túllépése (keret 1 KB-ra) → az őr bukik; (5) a `visibilitychange` kezelő kiiktatása → K11 bukik.
- Meglévő tesztek: `welcome-card.spec.ts`, `home-views.spec.ts` (kapcsoló KI — változatlanul zöld).

## 8. Kockázatok / visszavonás

- Visszavonás: a `HOME_MASCOT` törlése (alapból KI) — kód-visszaállítás nélkül eltűnik.
- Az `index.html`-t gyorsítótárazó CDN-szabály késleltetheti a kapcsoló érvényesülését (UNVERIFIED: az éles CDN-szabályok nem
  ismertek ebből a munkafából; rokon csapda: C-24).
- A K9 mérés gépfüggő (helyi gép ≠ CI, C-30): a teszt a lapon belül mér, beállt hálózat után; ha a CI-ben ingadozik, jegy kell.
- A figura modellje változik: a saját pózok (`point`, `hop`) a csontnevekre (`arm.L`, `forearm.L`, `thigh.*`, `shin.*`, `foot.*`,
  `head`, `chest`, `hips`, `ear.*`, `tail2…8`) és a `blink` / `smile` alakkulcsra építenek — ha ezek átneveződnek, a gyártó hibával megáll (nem gyárt csendben rosszat).
- Készüléken (valódi telefonon) nincs mérve; a teljesítmény-számok asztali Chrome-ból, CPU-lassítással valók.

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-18-kabala-fooldal-vegrehajtas.md`

## 10. Tulajdonosi döntést igénylő kérdések

1. **Látvány ↔ méret.** A választott (A) technika rögzített nézőpontú és 6–8 képkocka/mp-es. Opciók: (a) marad (≈ 200–250 KB) —
   AJÁNLOTT; (b) sűrűbb képsor / nagyobb cella a 350 KB-os keretig (≈ +40% képkocka); (c) élő 3D koppintásra (≈ +490–540 KB, kívül a kereten).
2. **Bekapcsolás élesben** (`HOME_MASCOT=on`): mikor, és a végleges modell elkészülte után-e. AJÁNLOTT: a végleges modell után, újragyártással.
3. **Körbevezetés visszatérő látogatónál:** (a) nincs — AJÁNLOTT (nem idegesítő); (b) naponta egyszer.
