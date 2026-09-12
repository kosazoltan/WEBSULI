# Futásból tanuló módszer — ellenőrzési bizonyíték

## Megvalósítás

A közös workflow auditot készít, a közben kijavított hibákat is menti. Ismert hibafajta a következő tényleges modellhívásban karbantartott megelőzési utasítást aktivál; ismeretlen hiba megfigyelés marad. Tulajdonosi és módszerverziós elkülönítés, tartós DB, egyszeri tranzakciós számlálás, stabil folytatás, admin export/kikapcsolás és auditpótló háttérmunka készült.

Terv és végrehajtás: `docs/specs/2026-09-12-runtime-skill-learning*.md`. Működés: `docs/runtime-skill-learning.md`. Alap: `ffffaff7737c38d50c08edd8bf3ace12f3eb9aba`; az új két tábla régi kódra visszaálláskor megőrizhető.

## Futtatott ellenőrzések

- PASS `npm.cmd run verify`: alkalmazás- és teszttípusok, lint, 1172/1172 unit teszt, build.
- PASS `npm.cmd run test:learning-db`: 20/20 valódi PostgreSQL-teszt. Kétszeri migráció, dupla audit kizárása, izoláció, kikapcsolás megőrzése, hibás audit atomikus visszagörgetése, aktív lease védelme, megszakadt audit pótlása, admin HTTP-hozzáférések. Saját eldobható adatbázis, éles írás nélkül.
- PASS `npx.cmd playwright test --config=playwright.workflow.config.ts`: 9/9, hét mód, 320×740, 390×844, 844×390 és 1440×900; valódi felület, API-fixture. Nyitott tanulási panel, olvasható szöveg, nincs vízszintes túlcsordulás. Teljes képernyőképek vizuálisan ellenőrizve.
- PASS `git diff --check` és külön önreview: kapuk változatlanok, tényleges promptbekötés, nincs nyers forrásból rendszerutasítás, folytatáskor rögzített verzió, audit és számláló atomikus mentése.
- Éles kiadás előtti read-only lekérdezés: nincs befejezetlen Studio job vagy aktív webes generálás. Meglévő tananyag nincs átírva.

## Korlátok

A tesztelt szabály-visszacsatolás nem mérés a tanulói eredményességről vagy a modellek hibaarányának csökkenéséről. Nincs autonóm új kód/kapulazítás. A külön kért friss feltöltéses éles végigpróba korábbi böngésző-fájlválasztási engedélyhibáját ez a fejlesztés nem oldja fel; azt nem jelöljük elvégzettnek.
