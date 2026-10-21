# Ciklus 8 — a számolás-ellenőrzők két mért hamis jelzése (címke-kettőspont, maradékos osztás)

Állapot: a tulajdonosi állandó megbízás („minden mért gyártási hibát javíts”) része; a ciklus 8 (2026-10-21, 43 anyag) naplóbányászata
(`mine-logs`, a „kísérlet:” sorok) alapján. A ciklus KPI-ja: 6,17 USD/anyag, javítókör 2,02/anyag, válaszkulcs-hiba 1,05/anyag.

## Mérés (éles napló, csak olvasva)
- **Címke-kettőspont osztásnak olvasva** (`server/studio/tools/arithmetic-claims.ts` `falseArithmeticClaims`), három bankcsomag-kísérlet:
  - „s3_q16: hibás számítás … 0: 4 + 0 = 4 (helyesen: 0)”;
  - „s3-q4: … 1: 5 + 6 + 1 = 12 (helyesen: 7.2)”;
  - „s7-q-1: … 40 · 6: 4 · 6 = 24 (helyesen: 360)”.
  A szöveg lépés-címkéje („0:”, „1:”, „40 · 6:”) a számhoz tapadó, utána szóközös kettőspont — nem osztás; a címke utáni állítás igaz.
- **Maradékos osztás** (`shared/single-choice-check.ts` E1): „s4-q8: 0 opció egyenlő a kiszámolt eredménnyel (95 : 4 = 23.75)”. Az
  anyag az írásbeli (maradékos) osztás 4. osztályos leckéje; a végleges bankban a szerző a „77 : 12 = ? (hányados)” zárójeles alakkal
  kerülte meg a kaput (a zárójel miatt az ellenőrző hallgat), a helyes válasz 6 — az EGÉSZ hányados. A „maradéka?” kérdés a maradékot kéri.

A válaszkulcs-teszt (31 blokkoló jelzés) és az opció-ismétlődés („20” / „20.”, „VIII.” / „VIII”) mért jelzései valódi hibák — nem cél.

## Cél
1. **(A)** `falseArithmeticClaims`: ha a lánc első tagjában a számhoz TAPADÓ, utána szóközös kettőspont áll („0: 4”), a címke utáni
   olvasatot is kiértékeljük; hamis állítás csak akkor, ha mindkét olvasat (osztás és címke) hamis. A szóközös („95 : 4”) és a
   szóköz nélküli („12:4”) osztás változatlan.
2. **(B)** E1 (`embeddedArithmeticProblems`): ha a kifejezés egyetlen egész-osztás („a : b”), az eredmény nem egész, és minden opció egész:
   - ha a kérdés a maradékra kérdez („maradék…”), a várt érték `a mod b`;
   - különben az egész hányados (`⌊a / b⌋`) — a maradékos osztás hányadosa.
   Pontosan egy opció egyezzen (a meglévő `exactlyOne` szabály). Egész eredménynél és nem-egész opcióknál változatlan.

## Nem-cél
Más kapuk (válaszkulcs-teszt, ismétlődés, lektor) — a mért jelzéseik valódiak. A zárójeles kifejezések kezelése változatlan.

## Edge case-ek
- „12: 4 = 3” (hanyag, tapadó kettőspontos osztás): az osztás-olvasat igaz → nincs jelzés.
- „15 nap: 60 : 15 = 4” — a meglévő mértékegység-címke ág változatlan.
- „Mennyi 95 : 4?” tizedes opciókkal („23,75”): nem minden opció egész → a pontos érték számít (változatlan).
- „Hány teljes doboz kell?” (felfelé kerekítés) — a NOT_COMPUTABLE szavai között nincs; ha a válasz ⌈a/b⌉, a tétel jelzést kap: ez a
  nyelvi kör nem tárgya (a mérésben nem fordult elő).

## Elfogadás (EARS)
- HA a lánc „N: kifejezés = érték” alakú, és a címke utáni állítás igaz, AKKOR nincs hamis-számítás jelzés.
- HA mindkét olvasat hamis, AKKOR a jelzés megmarad.
- HA egy egész számos opciójú kérdés egyetlen nem maradék nélküli egész-osztásra kérdez, AKKOR a várt érték az egész hányados (maradék-
  kérdésnél a maradék), és pontosan egy opció egyezzen vele.
