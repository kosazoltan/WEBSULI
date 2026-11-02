# Internetes készítés — új készítés indítható egy korábbi futás után

Állapot: tulajdonosi hibajelzés 2026-10-19 (képernyőkép):
> „Nem tudok új, internetes keresésen alapuló tananyagkészítést indítani, mert az előző elkészült tananyag foglalja a rendszert,
> és nem enged újat generálni.”

## Probléma
- **Tartós követés:** a `client/src/components/studio/WebResearchAgentPanel.tsx` a követett futás azonosítóját a böngésző
  `localStorage`-ában tartja (`websuli:web-research:pending`).
  - A panel minden megnyitáskor ezt követi.
  - Kész futás után sem felejti el; a képen egy 2026-09-25-i futás látszik.
- **Végtelen követés:** ha a szerver a régi futást nem végállapotban adja vissza (pl. a korábbi gyártási útvonal S4b-beli
  átalakítása után beragadt `running`), a panel végtelenül követi, és az `isLoading` miatt a beviteli mező tiltott.
- **Nincs kilépés:** egyik esetben sincs „Új készítés” gomb.

## Cél
1. **„Új készítés” gomb** (`web-research-new`), valahányszor van követett vagy korábbi futás a panelen.
   - Elengedi a követett futást: törli a tárolt azonosítót, és alaphelyzetbe állítja a panelt.
   - Folyamatban lévő futásnál előbb megerősítést kér („a futás a szerveren tovább megy, a kész anyag a tananyagok közé
     kerül”).
   - A szerveren futó munkát nem állítja le.
2. **Végállapot után** (`done`, illetve `error` folytatási lehetőség nélkül) a böngésző elfelejti a tárolt azonosítót.
   - Újratöltéskor a panel üres, nem a régi futással indul.
   - A `ready` (mentésre vár) és a folytatható `error` megmarad: ott a „Folytatás / Mentés” gomb értelmes.

## Nem-cél
- Szerveroldali változás; a beragadt régi futások adatbázisos takarítása.

## Elfogadás (EARS)
- **Beragadt futás:** HA a követett futás a szerveren `running` marad, AKKOR az „Új készítés” engedélyezett; megerősítés után
  a beviteli mező szabad, és új kérés új azonosítóval indul.
- **Kész futás:** HA a futás `done`, AKKOR újratöltés után a panel üres (nincs régi futás, nincs „Megnyitás” gomb).
- **Mentésre váró futás:** HA a futás `ready` (mentésre vár), AKKOR újratöltés után is követhető (a meglévő viselkedés marad).
- **Valós render:** 390 és 1440 px; nincs kilógás.
