# Tételgyár T3: rubrikafordító — terv és T3.0 mérés (2026-10-15)

Szülőterv: `docs/specs/2026-10-15-tetelgyar-bank-lektor-uj-modszertan.md`, 3. fejezet, 1. elem („Rubrika-fordítás (G1)”), 5. fejezet, T3 sor.
Sorrend: a 8. fejezet szerint T2 → T7 → T6 → T5 → **T3**.

## Cél
- A nyílt feladat rubrikája ne szó szerinti kifejezéseket kérjen, hanem a lényegi gondolatokat.
- A helyes, saját szavas válasz determinisztikusan teljes pontot kapjon.
- Ezzel csökkenjen a T2 után maradt „helyes válasz nem kap teljes pontot” osztály és a döntőbírói (T7) hívások száma.

## Nem-cél
- A régi leckék pontozása nem változik (E4: a v1 paritás és a HTML-pontozó azonos marad).
- A T2 kalibrációt és a T7 döntőbírót nem cseréljük le.

## T3.0 mérés (modellhívás és DB-írás nélkül)
Eszköz: `source/scripts/measure/rubric-gap.mts`. Adat: `docs/measurements/2026-10-15-t3-rubrika-hiany.json`.
- **Bemenet:** a T2.0 mérés 4 jobjának 188 tesztelt nyílt feladata, a mentett tesztválaszokkal. A jelenlegi T2 kalibráció a „legalább 2 helyesből hiányzik” küszöbbel futott.
- **Maradék:** 144 feladatban 298 helyes tesztválasz nem kap teljes pontot. A kalibráció a kötelező csoportok átlagos számát 5,26-ról 4,11-re csökkentette.

A hiányzó csoportok besorolása (317 csoport):

| Osztály | Darab | Arány | Példa |
|---|---:|---:|---|
| nincs rokon szó (más szóval mondja) | 166 | 52% | „terület” ↔ „vidék”; „élén” ↔ „vezették”; „utolsó két helyiérték” ↔ „utolsó két számjegy” |
| összetétel (a válasz szava tartalmazza / része) | 95 | 30% | „toronytemplom” ↔ „torony alakú templom”; „egészség” ↔ „egészségvédelmi” |
| kifejezés-rész (a többszavas tagnak csak egy része van meg) | 28 | 9% | „4-gyel, 20-szal, … való oszthatóság” |
| toldalék | 18 | 6% | „vitamin” ↔ „vitaminjai” |
| közös tő | 10 | 3% | „őslakói” ↔ „őshonos” |

Ezeken felül 19 válasz a tagadás-szabályon bukott, 5 a szóminimumon.

Szimulált megoldások ugyanazon az adaton (a „hibás átmegy” jelenleg 18):

| Változat | Bukó helyes | Hibás átmegy |
|---|---:|---:|
| jelenlegi (T2 kalibráció) | 298 | 18 |
| R1: többszavas tag → tartalmi szavak („25-tel való oszthatóság” → „25 oszthatóság”) | 295 | 18 |
| R1 + R3: összetett szó két tagja külön, ha a tanítás igazolja („torony templom”) | 291 | 18 |
| R1 + R2 + R3 + R5: hosszú felsorolás feje + képzőlevágás is | 289 | 18 |
| a pontozó összetétel-felismerése (csak új feladatokra lehetne) | 290 | **23** |

**Következtetés (mért):**
- A determinisztikus fordítás, akár az adat, akár a pontozó szintjén, legfeljebb 3%-ot javít (298 → 289).
- A pontozó tágítása a hibás átengedéseket is növeli (18 → 23), tehát nem elfogadható.
- A maradék több mint fele szemantikai parafrázis, ezt csak modell kezelheti. Két hely van rá:
  - **gyártáskor:** kulcsgondolat-alapú rubrikaírás, kevesebb és rövidebb kötelező csoporttal;
  - **futáskor:** T7 döntőbíró. Ez már élesben van, és a gyerek valódi, nem-„ok” válaszát megítéli.
- A T2 második döntése óta a helyes-eset bukás nem blokkolja a gyártást. A T3 haszna tehát:
  - kevesebb döntőbírói hívás (költség, várakozás);
  - azonnali, determinisztikus visszajelzés a gyereknek;
  - a HTML-leckék is jobb rubrikát kapnak.

## Javasolt irány (tulajdonosi döntésre)
- **A — T3 lezárása mért eredménnyel.** Nincs kód, a T7 viszi a parafrázist. A döntőbíró élő hívásszámát (`arbiter_daily_usage`) 1–2 hét
  múlva visszamérjük; ha drága vagy lassú, a B jön.
- **B — Kulcsgondolat-alapú rubrikaírás (modell) mérése.** A bank-szerep promptja: legfeljebb 3 rövid kulcsgondolat, mindegyik 1–2 tartalmi
  szóval és a tanítás szavaival; hosszú kifejezés és felsorolás tilos a `required`-ben.
  - Mérés: a 4 job 188 feladatának rubrikája újraírva, ugyanazokkal a T2-tesztválaszokkal. Becslés: kb. 25 bankmodell-hívás, tesztíró-hívás nem kell.
  - Élesítési küszöb: a bukó helyes válaszok száma legalább 30%-kal csökken, és a „hibás átmegy” nem nő.
- **C — Csak a determinisztikus R1 + R3.** Kicsi, biztonságos (−2%), új kód a kalibráció előtt; önmagában nem éri el a T3 célját.

Ajánlás: **A**, a B-t a T7 élő hívásszáma alapján indítjuk. Indok: mért adatok szerint a determinisztikus út kimerült, a parafrázist a T7
már kezeli, és a B új promptköltséget és bankkockázatot hoz. A próbaharness-tapasztalat szerint (promptváltozás csak mért alapvonalhoz)
ennek csak bizonyított igény esetén van értelme.

## Elfogadás (EARS) — ha a B indul
- E1: HA a kulcsgondolat-prompt él, AKKOR a próbakészleten a bukó helyes tesztválaszok száma ≥ 30%-kal kevesebb, mint 298.
- E2: A „hibás átmegy” szám nem nő a 18-hoz képest.
- E3: A régi leckék pontozása változatlan (v1 paritás-tesztek zöldek).

## Tulajdonosi döntés (2026-10-15)
- **A — a T3 lezárva, mért eredménnyel.** Nincs termékkód. A szemantikai parafrázist a T7 döntőbíró viszi.
- Visszamérés 1–2 hét múlva: a döntőbíró élő hívásszáma (`arbiter_daily_usage`) és válaszideje. Ha drága vagy lassú, a B (kulcsgondolat-prompt mérése) indul.
- A mérőeszköz (`source/scripts/measure/rubric-gap.mts`) a repóban marad, hogy a visszamérés megismételhető legyen.
