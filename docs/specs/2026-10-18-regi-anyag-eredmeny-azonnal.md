# Régi anyag eredménye: ne vesszen el a gyors visszalépésnél — terv

**Tulajdonosi jelzés (2026-10-18 17:29):** „Nem kaptam e-mail-értesítést arról, hogy a tanuló megcsinálta a kvízeket.” A
képernyőképen egy régi HTML-anyag (4. osztály, „Cselekvés, Történés, Igék”) kvízeredménye: 23/25, 92%.

## Gyökérok (mérve)
- **Éles napló:** a telefon 17:25:39-kor nyitotta meg az anyagot, és 17:28:46-kor visszatöltötte a listát. `POST /api/material-result`
  nem érkezett, az `email_logs` táblában 07:16 óta nincs bejegyzés. A végpont működik: ma délelőtt négyszer is 200-zal fogadott.
- **A régi működés (`server/lib/material-capture.ts`):** a kiértékelés utáni eredmény a böngészőben 30 mp nyugalomig várakozik
  (`SETTLE_MS`). Csak ezután, vagy `pagehide` / rejtett lap esetén megy ki.
- **Mobil nézetben, a websuli.vip szülőoldallal (Playwright, Pixel 5):**
  - 30 mp várakozás: 1 beküldés;
  - a lap háttérbe kerül: 1 beküldés;
  - a keret eltávolítása (a tanuló visszalép a listára): **0 beküldés**.

  Ilyenkor a keretben se `pagehide`, se `unload` nem fut, és a `sendBeacon` sem megy ki. A már elindított `keepalive`
  kérés viszont túléli az eltávolítást.

## Döntés
Az összevárás a böngészőből a szerverre kerül.

1. **Kliens:** minden új, beküldendő eredményállapot azonnal megy (`keepalive`), az eddigi szűrés változatlan:
   - kiértékelő kattintás után, vagy osztályzatot tartalmazó szöveg;
   - az azonos állapot nem megy újra;
   - eredményhelyenként a legutolsó állapot számít;
   - a pillanatkép rögzíti a nevet és a válaszokat.

   A sikertelen küldés korlátozottan újrapróbálkozik. Oldalbetöltésenként legfeljebb 30 automatikus beküldés mehet ki.
2. **Szerver:** az `auto` beküldés nem küld azonnal levelet.
   - **Gyűjtés:** a beküldések anyag + kliensazonosító (hiányában IP) kulcsonként gyűlnek, mindig a legutolsó állapot marad.
   - **Küldés:** a levél 30 mp nyugalom után megy. Ha a tevékenység nem szűnik meg, legkésőbb 3 perccel az első beküldés után.
     Csak egy levél megy, a legutolsó állapottal, a meglévő kézbesítő úton (címzettenkénti ismétlésvédelem, pótlás).
   - **Közvetlen (mailto) beküldés:** változatlanul azonnal megy.
   - **Leállítás (deploy, `SIGTERM`):** a függő levelek azonnal kimennek.

## Nem-cél
- A tárolt anyagok átírása.
- A Stúdió-leckék és az új HTML-leckék (`sendResultEmail`) eredményküldése: azok azonnal küldenek.

## Elfogadás (EARS)
- HA a tanuló kiértékel, majd 30 mp-en belül visszalép a listára (a keret eltűnik), AKKOR az eredmény a szerverhez ér, és a levél
  kimegy.
- HA a feladatonkénti „Ellenőrzés” futó statisztikát küld, AKKOR egy sorozatból egy levél megy, a legfrissebb állapottal.
- HA a közvetlen (mailto) küldés sikerül, AKKOR nincs második, automatikus levél.
