# Kabala-maki — a Websuli 3D kabalafigurája (kísérlet, terv)

**Dátum:** 2026-11-18 · **Ág:** `kiserlet/kabala-maki` (munkafa: `.claude/worktrees/kabala-maki`) · **Végrehajtás:**
[`docs/specs/2026-11-18-kabala-maki-vegrehajtas.md`](2026-11-18-kabala-maki-vegrehajtas.md) · **Állapot:** KÍSÉRLET — nincs push,
nincs PR, a játékok kódjába nincs bekötve.

## 0. A tulajdonos kérése (szó szerint, 2026-11-18)

> „egy kis kabala figurát a websuli számára. Legyen az egy nagyszemű, szürke, csíkos farkú, nagyon aranyos, cuki, Borneo-i Maki,
> amitől elolvadnak a tanulók, ezt nézd meg, hogy tudod előállítani 3D-ben, és ezt majd hogyan tudjuk mozgatni.”

**Név — tulajdonosi döntés (2026-11-18, kérdőíven): „A Websuli makija”** (nem borneói); az irányról: „Ez az irány jó, finomítsd”.

**Az eredeti névkérdés (egy mondat):** a leírt külső (szürke bunda, gyűrűs-csíkos farok) a madagaszkári gyűrűsfarkú makira
illik, Borneón makik nem élnek (ott a nagy szemű lajhármaki és koboldmaki él) — a kért KÜLSŐT valósítjuk meg, a „borneói” jelzőt
a figura meséjéhez / nevéhez a tulajdonos dönti el (javaslat: maradjon egyszerűen „a Websuli makija”).

## 1. Cél

1. Eredeti tervezésű, nagyon aranyos, „chibi” arányú maki-figura 3D-ben, teljesen szkriptből (eljárással) előállítva.
2. Csontvázas, alakkulcsos (morph target) modell öt rövid animációs klippel, egyetlen tömörített GLB-ben, amely a böngészőben
   three.js-szel lejátszható.
3. Bemutató képek a tulajdonosnak (ez a legfontosabb kimenet) és közérthető leírás arról, hogyan mozgatjuk.
4. Megismételhető gyártás: a szkript kétszeri futtatása azonos kimenetet ad; a méretkeretet őr-teszt védi.

## 2. Nem-cél

- Bekötés bármelyik játékba, a kezdőlapra vagy a kliens kódjába (`source/client/src/` nem változik).
- Push, PR, telepítés; külső modell / textúra / kiegészítő / betűkészlet letöltése; fizetős szolgáltatás.
- Szőr-részecskék, valósághű anatómia, beszéd / szájszinkron (csak leírjuk, mi kellene hozzá).
- Kézi (nem szkriptelt) Blender-munka: `.blend` fájl nem kerül a repóba.

## 3. Stílus

- **Arány:** kb. 2,3 fej magas; nagy, gömbölyded fej, kis tojásforma test, rövid, tömzsi végtagok.
- **Szem:** hatalmas, csillogó; meleg borostyán írisz, nagy pupilla, két fehér fénypont; körülötte puha, sötétebb szürke folt
  (a maki-maszk), de barátságos — nem meredt, nem ijesztő.
- **Bunda:** puha középszürke; a pofa, a has és a fül belseje krémfehér; halvány rózsaszín pír az arcon.
- **Fej:** kis kerek fülek, apró sötét orr világos pofán, kis mosoly; pofaszőr-pamacsok a „bolyhosság” jelzésére.
- **Farok:** hosszú, bozontos, sötét–világos gyűrűs-csíkos, a hát mögül oldalra-felfelé kunkorodik, hogy szemből is látsszon.
- **Felület:** stilizált, sima; a szín csúcsszínből jön (nincs textúrafájl). Gyerekbarát (6–18 év), eredeti — nem hasonlít
  létező rajzfilm- vagy márkafigurára.

## 4. Technikai keret

| Tétel | Keret |
| --- | --- |
| Eszköz | Blender 5.3, fej nélkül: `blender -b --factory-startup -P <szkript>`; a helye `BLENDER_BIN` vagy a PATH |
| Szkriptek | `source/scripts/blender/kabala-maki/` (közös modul + `build.py` + `render.py`); gépfüggő útvonal nincs |
| Háló | alapformákból (ikoszféra, UV-gömb, csövek) bmesh-sel; ≤ 20 000 háromszög |
| Anyag | ≤ 6; egyszerű PBR, csúcsszín (`COLOR_0`), textúra nélkül |
| Csontváz | gyökér, csípő, gerinc, mellkas, fej, 2 fül, 2×2 kar, 2×2 láb, 7 farokcsont; a súlyok képletből (nem automata) |
| Alakkulcs | legalább `blink` (pislogás) és `smile` (mosoly) |
| Klipek | `idle` (hurkolható), `wave`, `cheer`, `sad`, `blink`; egyenként 1–3 mp |
| Export | egy Draco-tömörített GLB: `source/client/public/models/kabala/kabala-maki.<hash8>.glb` + `kabala-maki.manifest.json`; ≤ 400 KB |
| Képek | `docs/measurements/kabala-maki/*.jpg`, 768 px (a repóba összesen ≤ 1,5 MB), világos háttér, puha fény |
| Őr-teszt | `source/tests/kabala-model-budget-guard.test.ts` (`node:test`, a GLB JSON-részéből olvas) |

Tengelyek: Blenderben a figura a −Y irányba néz, Z a „fel”; a glTF-export után +Z-be néz, Y a „fel” (a three.js alapértelmezése).

## 5. Szélső esetek

- A Draco-tömörítés a böngészőben dekódolót kér (`DRACOLoader`; a `three` csomagban benne van) — a leírás ezt megnevezi.
- Az alakkulcsos rész külön kis háló (szemhéj + száj), hogy a morph-adat ne terhelje az egész testet.
- A klipek nem animált csontjai kimaradnak az exportból (méret), ezért a klipek keverhetők (pl. `idle` + `blink`).
- Ha a Blender fej nélkül nem tud EEVEE-vel renderelni, a tartalék a Cycles (CPU).

## 6. Elfogadási pontok

<!-- acceptance-checklist -->

- [x] K-1 A terv és a végrehajtási utasítás az első commit; kód csak utána.
- [x] K-2 A figura megfelel a 3. pontnak: nagy csillogó szem, szürke bunda világos pofával és hassal, kis fül, apró orr, mosoly,
      gyűrűs-csíkos bozontos farok; a saját képek megnézése alapján „cuki”, nem ijesztő.
- [x] K-3 A szkript fej nélkül, gépfüggő útvonal nélkül újraépíti a hálót, az anyagokat, a csontvázat (súlyozva) és a `blink` +
      `smile` alakkulcsot.
- [x] K-4 A GLB-ben öt, név szerint elkülönülő klip van: `idle`, `wave`, `cheer`, `sad`, `blink`; mind 1–3 mp; az `idle` első és
      utolsó képkockája azonos.
- [x] K-5 Egy tömörített GLB a `source/client/public/models/kabala/` alatt, tartalom-hash a névben, mellette manifest a klipnevekkel.
- [x] K-6 Keret: ≤ 400 KB, ≤ 20 000 háromszög, ≤ 6 anyag — őr-teszt védi, és a teszt zöld.
- [x] K-7 Legalább 6 kép (eredetileg PNG ~1024 px; a finomító kör óta JPG 768 px): elöl, háromnegyed, oldal, hátul, arc-közeli, tabló az animációk kulcspózaival.
- [x] K-8 Legalább 2–3 javító kör a saját képek alapján; őszinte minőségértékelés a jelentésben.
- [x] K-9 Kétszeri futtatás: a GLB hash-e azonos (vagy az eltérés oka leírva).
- [x] K-10 `docs/kabala-maki.md`: hogyan mozgatjuk (klip ↔ játékhelyzet, alakkulcsok, új mozdulat, beszéd, teljesítmény-becslés).
- [x] K-11 (ha belefér) Önálló előnézeti HTML CDN nélkül; ha nem készül el: NOT DONE, okkal.
- [x] K-13 Finomító kör (tulajdonosi kérés, 2026-11-18): kerekded láb; puha, bolyhos pofaszőr; hosszabb kar ujj-jelzéses kézfejjel;
      vállgömb és a törzsbe olvadó comb; jól látható pillaív; sima színfolt-szélek; a farok töve a hátból nő ki; képek ≤ 1,5 MB.
- [x] K-12 `npm run gate:stage` eredménye a munkafából (vagy pontosan megnevezve, mi hiányzik).

## 7. Második változat — „élethűbb gyűrűsfarkú maki” (tulajdonosi kérés, 2026-11-18)

> „Jelentősen javíts rajta és egy picit legyen élethűbb, közelítsd a valós modellhez, mondjuk egy gyűrűsfarkú makihoz, aki
> Madagaszkáron él.” — a tulajdonos, 2026-11-18

Ez a szakasz a 3. (stílus), a 4. (technikai keret) és a 6. pont kereteit FELÜLÍRJA; a korábbi „szépítő kör” két pontja (puha
pofaszőr, nyitott tekintet) ebbe olvad. Az integető kéz az arc mellett marad (tulajdonosi döntés). Referenciakép nem töltődik le.

### 7.1 Cél

A figura legyen ránézésre felismerhetően **gyűrűsfarkú maki (Lemur catta)**, és maradjon nagyon aranyos, nagy szemű kabala.
Mérce: „ez egy gyűrűsfarkú maki, és nagyon aranyos”. Nem lehet ijesztő vagy „uncanny”.

### 7.2 A valódi állat átvitt jegyei (stilizálva)

- **Arc:** fehér arc; a szem körül sötét, kifelé-lefelé nyúló csepp alakú folt; fekete orr, sötét orrtájék; enyhén megnyúlt,
  rókaszerű pofa; sötétszürke „sapka”, amely a homlok közepén csúcsban lenyúlik; borostyán–narancs szem.
- **Fül:** felálló, enyhén hegyesedő, fehér szőrrel szegett (nem kerek, nem rózsaszín belsejű).
- **Test:** szürke hát, fehér / krém has és mellkas, a végtagok belseje világos; sötét kéz- és lábfej; a hátsó láb hosszabb és
  erősebb; karcsúbb törzs és végtagok.
- **Farok:** a testnél hosszabb, vastag, bozontos, 14 váltakozó sötét–világos gyűrű, a vége FEKETE; magasra tartva,
  kérdőjel-ívben.
- **Arány:** fej : test magasság kb. 1 : 1,6–1,8 (a korábbi ~1 : 1 helyett); a szem nagyobb a valóságosnál, kerek, nyitott,
  fényponttal; a mosoly marad.
- **Tartás:** két lábon áll (kabala-póz) + új klip: `sunbathe` — felegyenesedve ül, karjai széttárva a nap felé.

### 7.3 Technikai keret (felülírja a 4. pont megfelelő sorait — dokumentált spec-változás)

| Tétel | Új keret |
| --- | --- |
| Háló | a test, a végtagok és a fej EGY összefüggő háló: alapformák → voxel-remesh → simítás → decimálás (szkriptből); a farok, a szem, az orr és az alakkulcsos arc-rész külön, pontos paraméteres háló marad |
| Súlyok | a kiinduló alapformák képletes súlyai a legközelebbi pontok szerint átvíve az összefüggő hálóra (determinisztikus; nem a Blender hő-alapú automatája, amely ilyen hálón megbízhatatlan) |
| Szín | az arc kis, szkriptből festett textúra (512 px, a GLB-be ágyazva) — éles foltszélek; a többi csúcsszín; a farok gyűrűi élhurokra illesztve |
| Keret | ≤ 600 KB, ≤ 30 000 háromszög, ≤ 6 anyag, ≤ 30 csont, legfeljebb 1 beágyazott kép |
| Klipek | `idle`, `wave`, `cheer`, `sad`, `blink`, `sunbathe`; alakkulcsok: `blink`, `smile` |
| Képek | elöl, háromnegyed, oldal, hátul, arc-közeli, tabló a klipekkel, „napozó” póz — JPG, a repóban összesen ≤ 1,5 MB |

### 7.4 Elfogadási pontok (második változat)

- [x] M-1 A terv és a végrehajtási utasítás frissítése külön commit, a kód ELŐTT.
- [x] M-2 Felismerhető gyűrűsfarkú maki: fehér arc, sötét szemfolt, megnyúlt pofa fekete orral, homlokcsúcsos sapka, hegyesedő
      fehér szegélyű fül, 14 gyűrűs, fekete végű, magasra tartott farok; fej : test kb. 1 : 1,6–1,8.
- [x] M-3 Aranyos marad: nagy, kerek, nyitott, csillogó szem; mosoly; nem ijesztő.
- [x] M-4 Összefüggő háló: a kar–váll és a láb–törzs csatlakozásnál nincs varrat.
- [x] M-5 Éles, tiszta foltszélek az arcon és a farok gyűrűin; „tépett”, tincses sziluett a pofa két oldalán (nem golyósor).
- [x] M-6 Hat klip (mind 1–3 mp), köztük a `sunbathe`; `blink` + `smile` alakkulcs.
- [x] M-7 Keret: ≤ 600 KB, ≤ 30 000 háromszög, ≤ 6 anyag, ≤ 30 csont — az őr-teszt az új keretre igazítva, zöld.
- [x] M-8 Kétszeri gyártás azonos hash-t ad (vagy az eltérés oka leírva).
- [x] M-9 Hét kép (a „napozó” pózzal), összesen ≤ 1,5 MB; legalább 3–4 javító kör a saját képek alapján, őszinte értékeléssel.
- [x] M-10 Az ÚJ GLB betöltve a böngészős előnézetben, mind a hat klip lejátszva, konzolhiba nélkül, képernyőképpel.
- [x] M-11 `gate:stage` zöld.
