# Ciklus 8 — helyesírási opciók (kis- és nagybetű) + a teljes maradék átalakítása

**Mért (2026-10-21, ciklus 7):** A főnév és Tulajdonságot kifejező szavak a „pontos alak” javítással túljutott a lektoron, de a
végellenőrzés elutasította: a helyesírási ellenőrző blokk („Melyik írás helyes?” — „Petőfi Sándor Általános Iskola” / kisbetűs
változatai; „Eger -i toldalékos alakja” — „Egri” / „egri”) opcióit az egyválasztós ellenőrző „ugyanazt jelentőnek” látta, mert a
szövegkulcs kisbetűsít (`shared/single-choice-check.ts` `textKey`). A magyar helyesírásban a kis- és nagybetű TARTALMI különbség.

**Tulajdonosi kérés (2026-10-21):** „nézd végig a maradék tananyagokat, amelyek még nincsenek az új stúdióformátum minőségére …
hozva … Készítsd el ezek átalakítását.” Mért maradék: 45 anyag nincs a sorban, ebből 4 kizárt (Abigél; hang; 2 kép/beágyazás) → 41.

## Cél
1. Az opció-ismétlődés vizsgálata kis- és nagybetű-érzékeny (a csak betűméretben eltérő opciók különbözők); a szó szerinti (azonos
   betűméretű) ismétlődés és az érték-egyezés vizsgálata változatlan.
2. A két anyag 3. célzott köre (`LEGACY_REDO_ROUND` 3).
3. Ciklus-kapu 137 → 178 (a teljes maradék, 41 anyag) — a mérés és a megállítás lehetősége megmarad.

## Nem-cél
A kizárt anyagok (kép / hang / Abigél) átalakítása.

## Elfogadás (EARS)
- HA két opció csak kis- és nagybetűben tér el, AKKOR nem ismétlődés.
- HA két opció szó szerint azonos (írásjeltől és szóköztől eltekintve), AKKOR ismétlődés.
