# HTML-okosítás: a záró kapun bukott jelölt megőrzése diagnosztikának

Állapot: tulajdonosi kérés 2026-10-20 („fejezd be autonóm módon … minden nyitott pontot”). Előzmény: az okosítás gyökérok-elemzése
(2026-10-19) és a mély elemzés (`docs/specs/2026-10-20-elakadas-gyokerok-elemzes.md`).

## Mérés / gyökérok
- **Az elveszett jelöltek:** a 1e169ace, a0d16870 és f2c2f102 okosítás a záró kapun bukott. Mindhárom után az `improved_html_files`
  rekord tartalma a 29 bájtos helyőrző maradt (`<!-- Feldolgozás alatt... -->`), a bukott, generált HTML elveszett.
- **A következmény:** utólag nem lehetett megnézni, mely feladatok és miért buktak; a gyökérok egy része csak következtetés maradt
  (az elemzés „NOT RUN”-ként jelölte).
- **Ok:** `server/improveAsync.ts` hibaágában az `updateImprovedHtmlFileStatus(id, 'error', …, üzenet)` csak az állapotot és az
  üzenetet írja.

## Cél
- **A bukott jelölt mentése:** ha a futás a záró kapun (vagy más kimeneti hibán, amelynek van jelöltje) bukik, a bukott HTML az
  `error` állapotú rekord `content` mezőjébe kerül.
  - Az admin az előnézetben megnézheti, de **alkalmazni nem lehet**: az alkalmazás csak `pending` / `approved` / `applied`
    állapotot enged (`storage.applyImprovedFileToOriginal`, változatlan).
- **Hordozás:** az `ImproveOutputError` hordozza a jelöltet (`candidate`). A tartalék próba bukásakor az utolsó (a tartalék
  modell) jelöltje marad meg.

## Nem-cél
- **Új tábla vagy migráció:** nem kell. A meglévő `content` mező a helyőrző helyett a jelöltet kapja.
- **A hibás jelölt alkalmazhatósága:** nem változik (továbbra is tiltott).

## Elfogadás (EARS)
- **Mentés:** HA az okosítás a záró kapun bukik, AKKOR a rekord `error` állapotú, a `content` a bukott jelölt, az
  `improvementNotes` a hibalista.
- **Tiltás:** HA valaki egy `error` állapotú jelöltet próbál alkalmazni, AKKOR az elutasítás változatlan.
