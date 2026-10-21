# A régi anyagok átalakítása 5-ös ciklusokban, felülvizsgálattal

Állapot: tulajdonosi utasítás 2026-10-21 hajnal. „5 tananyagonként vizsgáld felül a saját működésedet, tökéletesítsd, és csak utána
futtasd tovább”. Közben a pazarló gyártási hibákat és minden mért hibát javítani kell, a tudást memóriába, kanbanba és szkillekbe
kell rögzíteni.

## Mérés (2026-10-21 06:20)
- **Állapot:** 97 kész, 1 hibás (Ady, a #351 javítja), 3 fut; kb. $574 eddig.
- **Ellenőrzés (csak olvasás):** mind a 97 anyag publikált lecke, mentéssel; a nyilvános API 96/96 200; legalább 2 fejezet, 45
  feladat és 92 kvízkérdés.
- **Hiba:** az 5 régi, 0-s („Programozási alapismeretek”) kategóriájú informatikai anyag a Stúdiótól 9 / 11 / 12. évfolyamot kapott, így
  kikerült a kategóriájából.

## Cél
1. **Ciklus-kapu:** `LEGACY_BATCH_LIMIT` (kód). A sor csak addig indít új anyagot, amíg a sorelemek száma a korlát alatt van; az
   újrapróba a meglévő elemen belül marad. Minden felülvizsgálati ciklus egy PR, amely a javítások mellett a korlátot 5-tel emeli.
   A deploy így mindig futásmentes állapotban (AKTIV=0) történik.
2. **A kategória megőrzése:** a 0-s kategóriájú régi anyag a helyben cserénél megtartja a 0-s kategóriát (`html_files.classroom`). A
   lecke saját évfolyama (`lessons.json`) a forrásból marad.
3. **Ciklusonkénti felülvizsgálat** (a végrehajtási utasítás szerint): az utolsó 5 anyag telemetriája, a pazarlás forrásai és a hibák.

## Nem-cél
- **A már átalakított 5 informatikai anyag kategóriája:** ezt nem írja vissza automatikus DB-javítás. A tulajdonos 5 kattintással
  visszaállíthatja az admin felületen, vagy egy külön, jóváhagyott lépés teszi meg.

## Elfogadás (EARS)
- HA a sorelemek száma eléri a `LEGACY_BATCH_LIMIT`-et, AKKOR új anyag nem indul; a futó elemek egyeztetése és újrapróbája folytatódik.
- HA a cél régi anyag kategóriája 0, AKKOR a publikálás után is 0.
