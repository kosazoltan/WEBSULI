# Pontozott bankok, minimum 15/15

Tulajdonosi követelmény: minden új/felújított teljes tananyag legalább 15 különböző szöveges feladatot és 15 kvízkérdést tartalmazzon, mindkettő pontozva. A rövid kör külön fogalom: alsó évfolyamokon 3/5, később 5/10.

Megvalósítás: fusion-7.4-3 séma és prompt; fejezeti csomagokra elosztott minimum; részcsomag és teljes bank külön ellenőrzése. HTML közzétételnél a régi verziójelölés sem kerüli meg a minimumot. Régi tárolt anyagok olvashatók, automatikus tömeges átírás nincs.

A JSON-bankot tartalmazó HTML feladat- és kvízpaneljét közös React megjelenítő váltja fel. Egyenként lapozás és teljes áttekintés; rövid vagy teljes bankból álló kör; első kvízválasz rögzítve; szöveges szabályalapú részpont; pont/százalék/gyakorló osztályzat/idő/export. Banktartalomhoz kötött helyi tárolás, újratöltéskor visszaállítás, új kör előtt megerősítés, tárolási hiba látható. Ez helyi gyakorló önellenőrzés, nem szerveres tanári mérés.

Ellenőrzés:
- PASS: `npm.cmd run verify`: típusok, lint, teszttípusok, 1163/1163 teszt, build. Napló: `tmp/closure-final-verify4.log`.
- PASS: valódi Chrome 320×740, 844×390, 1366×768: mindkét pontozás és reload, első válasz zárolása, teljes 15-ös körök pontozása és reload, sérült tárolás, megváltozott kvízbank mellett feladateredmény megőrzése, tiltott tárolás jelzése. `tmp/closure-browser4.log`, képek `tmp/closure-browser/`.
- PASS: `git diff --check`; önreview a megőrzés és minimum megkerülhetősége alapján.
- PASS: kiadás előtti csak olvasási vizsgálat: 2026-09-12 07:15 UTC nincs folyamatban Studio/webes gyártás, adatbázisírás 0.

Kiadási kockázat: megváltozik a bankos HTML két gyakorlópaneljének megjelenítése. Visszaállási alap: `50c886d073b346ac7dfb4f326ae8f20ce04d62a2`; mentett tananyag és adatbázisséma változatlan. A Git/CI/deploy állapotot a kiadás után külön kell igazolni.

Teljes terméklezárás még külön feladat: új normál éles feltöltés → kész lecke → javítójelölt → mentett alkalmazás → visszaolvasás. Korábbi fájlválasztó-hozzáférési akadályt ez a változtatás nem oldja meg. Az összes éles AI-hívás önálló újraindítása nem bizonyított.
