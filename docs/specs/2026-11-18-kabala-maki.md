# Kabala-maki — a Websuli 3D kabalafigurája (kísérlet, terv)

**Dátum:** 2026-11-18 · **Ág:** `kiserlet/kabala-maki` (munkafa: `.claude/worktrees/kabala-maki`) · **Végrehajtás:**
[`docs/specs/2026-11-18-kabala-maki-vegrehajtas.md`](2026-11-18-kabala-maki-vegrehajtas.md) · **Állapot:** KÍSÉRLET — nincs push,
nincs PR, a játékok kódjába nincs bekötve.

## 0. A tulajdonos kérése (szó szerint, 2026-11-18)

> „egy kis kabala figurát a websuli számára. Legyen az egy nagyszemű, szürke, csíkos farkú, nagyon aranyos, cuki, Borneo-i Maki,
> amitől elolvadnak a tanulók, ezt nézd meg, hogy tudod előállítani 3D-ben, és ezt majd hogyan tudjuk mozgatni.”

**Névkérdés a tulajdonosnak (egy mondat):** a leírt külső (szürke bunda, gyűrűs-csíkos farok) a madagaszkári gyűrűsfarkú makira
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
| Képek | `docs/measurements/kabala-maki/*.png`, ~1024 px, világos háttér, puha fény |
| Őr-teszt | `source/tests/kabala-model-budget-guard.test.ts` (`node:test`, a GLB JSON-részéből olvas) |

Tengelyek: Blenderben a figura a −Y irányba néz, Z a „fel”; a glTF-export után +Z-be néz, Y a „fel” (a three.js alapértelmezése).

## 5. Szélső esetek

- A Draco-tömörítés a böngészőben dekódolót kér (`DRACOLoader`; a `three` csomagban benne van) — a leírás ezt megnevezi.
- Az alakkulcsos rész külön kis háló (szemhéj + száj), hogy a morph-adat ne terhelje az egész testet.
- A klipek nem animált csontjai kimaradnak az exportból (méret), ezért a klipek keverhetők (pl. `idle` + `blink`).
- Ha a Blender fej nélkül nem tud EEVEE-vel renderelni, a tartalék a Cycles (CPU).

## 6. Elfogadási pontok

<!-- acceptance-checklist -->

- [ ] K-1 A terv és a végrehajtási utasítás az első commit; kód csak utána.
- [ ] K-2 A figura megfelel a 3. pontnak: nagy csillogó szem, szürke bunda világos pofával és hassal, kis fül, apró orr, mosoly,
      gyűrűs-csíkos bozontos farok; a saját képek megnézése alapján „cuki”, nem ijesztő.
- [ ] K-3 A szkript fej nélkül, gépfüggő útvonal nélkül újraépíti a hálót, az anyagokat, a csontvázat (súlyozva) és a `blink` +
      `smile` alakkulcsot.
- [ ] K-4 A GLB-ben öt, név szerint elkülönülő klip van: `idle`, `wave`, `cheer`, `sad`, `blink`; mind 1–3 mp; az `idle` első és
      utolsó képkockája azonos.
- [ ] K-5 Egy tömörített GLB a `source/client/public/models/kabala/` alatt, tartalom-hash a névben, mellette manifest a klipnevekkel.
- [ ] K-6 Keret: ≤ 400 KB, ≤ 20 000 háromszög, ≤ 6 anyag — őr-teszt védi, és a teszt zöld.
- [ ] K-7 Legalább 6 PNG (~1024 px): elöl, háromnegyed, oldal, hátul, arc-közeli, tabló az animációk kulcspózaival.
- [ ] K-8 Legalább 2–3 javító kör a saját képek alapján; őszinte minőségértékelés a jelentésben.
- [ ] K-9 Kétszeri futtatás: a GLB hash-e azonos (vagy az eltérés oka leírva).
- [ ] K-10 `docs/kabala-maki.md`: hogyan mozgatjuk (klip ↔ játékhelyzet, alakkulcsok, új mozdulat, beszéd, teljesítmény-becslés).
- [ ] K-11 (ha belefér) Önálló előnézeti HTML CDN nélkül; ha nem készül el: NOT DONE, okkal.
- [ ] K-12 `npm run gate:stage` eredménye a munkafából (vagy pontosan megnevezve, mi hiányzik).
