# Új feltöltés végigellenőrzése — folyamatban, kézi lépés szükséges

- PASS: normál Chrome-admin bejelentkezés; Tananyag készítése / Feltöltés felület elérhető.
- PASS: csak olvasási adatbázis-ellenőrzés 2026-09-12 08:17 UTC: nincs aktív Studio- vagy webes gyártás. Nem történt adatbázisírás.
- Előkészítve: TESZT – Új feltöltés és 15/15 pontozás cím; tmp/workflow-acceptance/teszt-haromszog-terulete.txt ellenőrzött forrás.
- BLOCKED: a dokumentált filechooser esemény létrejött, de setFiles a fájl átadásakor `code -32000, Not allowed` hibát adott. A fájl nem jelent meg a felületen; a készítés gomb tiltott maradt.
- A Chrome bővítménybeállítások megnyitását a böngészőeszköz URL-biztonsági szabálya elutasította. A beállítás állapotát ezért nem ellenőriztük és nem változtattuk meg. Tiltás megkerülése nem történt.
- NOT RUN: új feltöltés szerveroldali feldolgozása, besorolás, gyártás, közzététel, új lecke javítása/mentése/visszaolvasása. Az automatizálás blokkolása nem bizonyít alkalmazáshibát és nem bizonyít sikeres pipeline-t sem.

A Chrome próbalap átadásra megjelölve, címe előkészítve. Folytatás: a felhasználó kézzel kiválasztja a forrásfájlt, vagy a Chrome ChatGPT bővítménynél engedélyezi a fájl-URL hozzáférést. Utána friss DOM-ból ellenőrizni kell a fájlt, a normál Tananyag készítése gombbal indítani, majd a specifikáció szerint végigmenni. Más munkamenet adatait vagy korábbi sikeres leckét nem lehet új próbának feltüntetni.

Programkód, tananyag és szerverkonfiguráció ebben a próbában nem változott. Módosítás: két ellenőrzési tervfájl és ez a jelentés. További tesztfuttatás a blokkolt fájlátadást nem helyettesíti.
