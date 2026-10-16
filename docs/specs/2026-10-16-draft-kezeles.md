# Piszkozatok kezelése: törlés, mindig van továbblépés, folyamatjelző (terv, 2026-10-16)

Tulajdonosi jelzés (2026-10-16):
- a piszkozaton nincs törlés;
- van olyan, amelyhez nincs folytatás;
- sok az ismétlődő piszkozat, amelyből már van kész tananyag;
- folytatáskor vagy újragyártáskor nem látszik, hol tart a program.

## Mért helyzet (élő DB, csak olvasva, 2026-10-16)
- **51 nem publikált, mentett piszkozat.** 41-nek van workflow-gazdája, **10 gazdátlan** (régi, workflow nélküli futás). Ez utóbbiak ma nem látszanak és nem kezelhetők.
- **20 piszkozatnak** ugyanabból a forrásból (térképből) már van **publikált** leckéje, ezek feleslegesek.
  Például „Műveleti sorrend tanulása” 9×, „6. évfolyam matematika feladatlap” 4×, „Zöldségek növényi szervei” 3×.
- A legtöbb piszkozat olyan okkal állt meg, amelyre a tervező szerint a mentett részekből nincs végrehajtható folytatás. Ilyenkor a kártya gomb nélkül marad.

## Cél
1. **Törlés minden piszkozaton**, megerősítéssel. Ez elvetés (`recoveryState = "discarded"`, `discardedAt`, `discardedBy`): a piszkozat
   eltűnik a listából, a piszkozat-felismerésből és az automatikus vezérlőből. Az adat megmarad, tehát visszaállítható, nem végleges törlés.
2. **Kötegelt törlés:** „A kész tananyaggal rendelkező piszkozatok törlése (N)”. Csak azokra hat, amelyeknek ugyanabból a forrásból publikált leckéje van.
3. **Mindig van továbblépés:**
   - ha a mentett részekből folytatható → „Folytatás a megszakadt ponttól” (meglévő resume út);
   - különben → „Újragyártás ugyanabból a forrásból”, megerősítéssel (`remanufactureFromMap`, új job a belépett admin nevén; a régi piszkozat „újragyártva” lesz).
   - A gazdátlan piszkozat is látszik, „Gazdátlan” jelzéssel: törölhető és újragyártható, folytatni nem lehet (nincs workflow-napló).
4. **Folyamatjelző:**
   - a futó gyártások (saját, `pending`/`running`, 2 napon belül) a lista tetején, a három készítési szakasszal (`CreationProgress`) és az aktuális lépéssel;
   - folytatás vagy újragyártás után a lista 5 másodpercenként frissül, amíg van futó tétel;
   - megállt piszkozatnál a szakaszjelző a megállás helyét mutatja.
5. **Jelzés:** „Ebből a forrásból már van kész tananyag” jelvény a felesleges piszkozatokon.

## Nem-cél
- Végleges (fizikai) törlés.
- A nyilvános oldal változása.
- A tervező döntési lépcsőjének módosítása.

## Biztonság
- Csak admin (a router admin-védett).
- Saját vagy gazdátlan piszkozat törölhető és újragyártható; másik admin piszkozata nem.
- Publikált lecke nem érinthető.
- Futó job nem törölhető (409).

## Elfogadás (EARS)
- D1: HA a felhasználó megerősíti a törlést, AKKOR a piszkozat `discarded` lesz, eltűnik a listából, és sem a vezérlő, sem a feltöltési piszkozat-felismerés nem veszi fel.
- D2: A kötegelt törlés csak a kész párral rendelkező saját vagy gazdátlan piszkozatokat veti el.
- D3: Minden megállt piszkozaton pontosan egy továbblépő gomb van: Folytatás vagy Újragyártás.
- D4: Folytatás vagy újragyártás után a futó tétel a szakaszjelzővel látszik, és a lista frissül, amíg fut.
- D5: Másik admin piszkozata nem törölhető (404/409), futó job nem törölhető (409), publikált lecke nem érinthető.
- D6: Valódi böngészőben (390 és 1366 px) nincs átfedés, levágott szöveg vagy vízszintes görgetés.
