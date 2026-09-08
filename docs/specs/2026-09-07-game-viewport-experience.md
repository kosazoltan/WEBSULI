# Egyképernyős játékélmény

Tulajdonosi utasítás: az éles Chrome-próba alapján szüntessük meg a vezérlőkért történő görgetést, és korszerűsítsük mind a hét játék megjelenését, grafikáját és játékélményét.

## Cél és hatókör
- Egy képernyőn látható játéktér, állapot, kérdés és vezérlés; a grafika a maradó helyhez alkalmazkodik. Nem elegendő a túllógás elrejtése vagy a teljes oldal lekicsinyítése.
- Határozott kontraszt, saját témájú játékvilág, nagy gombok, egyértelmű következő cél és rövid visszajelzés. A részletes útmutató külön megnyitható; játék közben nem foglalja el a pályát.
- A Matek sprint nullaéletes újrapróbálási hibájának megszüntetése. A jutalmazás üzleti szabályai és a felhős jogosultságok nem változnak.
- Nem cél más játékok márkajelzéseinek vagy eszközeinek másolása, vásárlási mechanika vagy új adatgyűjtés.

## Szeletek / fájlok
1. Közös keret: index.css, GamePedagogyPanel, GameNextGoalBar; a hét játékoldal explicit állapot- és elrendezési jelölései.
2. Matek sprint és Szólétra: a feladat és a pálya együtt látható, újrapróbálási regresszió.
3. Kockavadász, Aszteroida, Brain Rot, Szökőár, Viharvadász és saját alkomponenseik: rugalmas pályaméret, állandó vezérlők, képernyőhöz igazított menük és kvízek.
4. Valódi Chrome-próbák, célzott E2E regresszió és teljes verify; állapotjelentés a ténylegesen ellenőrzött menetekről.

## Kutatási alap és tervezési következtetés
A Roblox 2025 Replay kiemeli a Grow a Garden és Steal a Brainrot népszerűségét: https://about.roblox.com/newsroom/2025/12/roblox-replay-decoded-search-style . Ez 2025-ös visszatekintés, nem 2026 szeptemberi gyerek-korcsoportos ranglista. Minecraft Education készülékhez igazított irányítási jelzései: https://edusupport.minecraft.net/hc/en-us/articles/360061503031-Accessibility-Features .
Saját tervezési következtetés: karakteres világok, látható fejlődés, térbeli/játékos pálya, rövid interakciók és jól elérhető kezelőszervek. A dekoráció nem csökkentheti az olvashatóságot vagy a feladat helyét.

## EARS / szélső esetek
- Ha aktív menet vagy kvíz látható 390×844, 360×640, 844×390 vagy 1366×768 nézetben, minden szükséges válasz és irányítógomb a viewporton belül, takarás nélkül elérhető; nincs belső panelgörgetés.
- Ha a tartalom hosszú, a grafika kap kevesebb helyet, a szöveg tördelődik; kérdés és válasz nem csonkolható. Nagyított szöveg esetén olvashatóság elsőbbsége és külön ellenőrzés szükséges.
- Ha nulla élet marad, a magyarázat elolvasható, de új próbával nem lehet új pontot szerezni. Új futam tiszta idő/élet/pont állapotot ad.
- Ha csökkentett mozgás aktív, a díszítő animáció nem kötelező a működéshez.
- Menük, kvíz, helyes/hibás válasz, vereség és újraindítás külön ellenőrizendő. A bejáratlan győzelmi/szintváltási út nem nevezhető PASS-nak.

## Éles kiinduló hibák (Computer Use, Chrome)
- Matek sprint: sötét idő-/pontfelirat és láthatatlan cím, válaszok belső görgetés alatt; nulla élet → Újrapróbálom → helyes válasz: 66→129 pont, továbbra is 0 élet.
- Szólétra: kezdés után a kérdés és válaszok a panel alá kerülnek; világos háttéren fehér szöveg. Helyes válasz és hibás válasz utáni visszacsúszás működött.
- Kockavadász: kezdőképernyő indítógombjához belső görgetés kell.

## Visszaállítás / ellenőrzés
Kiinduló commit: 5a947f9; külön codex/game-viewport-experience ág. Minden szelet külön ellenőrzés és commit. Nincs automatikus éles adatmódosítás. A módosított felületet helyi böngészőben vizsgáljuk; élesnek csak kiadás és visszaellenőrzés után nevezzük.

## Mért eredmény — 2026-09-08
- OpenRouter kulcs: betöltve a helyi `.env`-be a tulajdonosi titkos fájlból, a kulcsot a chat nem tartalmazza. `GET /api/v1/key` HTTP 200, authorized.
- Unit: `game-feedback` + `game-feedback-wiring-guard` 44/44 PASS. Nulla életnél `retryable === false`.
- Valós Chrome, 390×844: Matek sprint játék közben `scrollX/Y = 0`, belső panelgörgetés 0, a négy válasz gomb a viewporton belül (alsó él 829 px / 844). 0 életnél a magyarázat olvasható, Újrapróbálom nincs; Új futam 3 élettel, 110 s-mal indul.
- Szólétra 390×844: kérdés színe `rgb(241, 245, 249)` sötét lapon `rgba(7, 27, 45, 0.93)`, válasz gombok a viewporton belül, nincs görgetés.
- Kockavadász menü 390×844: `Indulhat a bányászat!` top 351 / bottom 403, panelgörgetés 0.
- Playwright `tests/game-viewport-experience.spec.ts` a három éles hibára. Teljes `npm run verify` és éles deploy: NOT RUN.

## Mért eredmény — 2026-09-08, második kör
- Szökőár menü 390×844: az Indítás gomb a viewport alatt volt (top 978, `scrollY` 242). Javítva: indítás felül, 3 oszlopos tantárgy-rács. Újramérés: start 352–404, `scrollY` 0. 360×640: start 241–293, `scrollY` 0. Játék közben a kvízválaszok a viewporton, `scrollY` 0.
- Brain Rot 390×844 játék: `scrollX/Y` 0, pálya a viewporton; rossz válaszra olvasható magyarázat.
- Aszteroida 390×844 kvíz: utolsó válasz alsó éle 814 / 844, `scrollY` 0.
- Viharvadász menü 390×844: start látható. Játék 390×844 és 360×640: Gáz/Fék a viewporton, `scrollY` 0. Fekvő 844×390: Gáz alsó éle 366 / 390, `scrollY` 0.
- Matek sprint 360×640: válaszok 523–625 / 640. Fekvő 844×390: kérdés és válaszok a viewporton, `scrollY` 0.
- Viharvadász szintérképező 390×844: 48 px függőleges oldalgörgetés; a 1. szint gombja ettől még látható. 200 szint listája szándékosan hosszú.
- 1366×768, győzelmi/szintváltási utak, Playwright E2E, teljes verify, deploy: NOT RUN.

## Mért eredmény - 2026-09-08, harmadik kör (a fenti NOT RUN tételek nagy része lezárva)
- Teljes `npm run verify`: PASS (tsc + eslint + tsc-test + 937 node:test pass / 0 fail + build).
- Playwright E2E teljes suite: PASS, `expected 63, unexpected 0, flaky 0` (saját prod szerver az 5000-en; a dev-szervert a futás idejére le kellett állítani, mert `reuseExistingServer: false`).
- 1366×768, mind a 7 játék menü + játék: nincs oldalgörgetés játék közben. Vászonméretek: Viharvadász 1168×658, Kockavadász 1166×440, Aszteroida 1166×455.
- Győzelmi út élesben (Szólétra, 16/16 fok, 43 mp): győzelmi képernyő 1366×768 és 390×844 esetén is görgetés nélkül fér ki, „Újra”/„Lista” 44 px. Zónaváltás (Rét → Felhők → Csillagok) renderelt.
- 0-életes szabály élesben (Matek sprint): 1-2. hibánál van „Újrapróbálom”, a 3.-nál (0 élet) nincs — csak „Értem, megyek tovább”; magyarázat mindháromnál.
- Viharvadász szintlista 1366×768: 367 px oldalgörgetés (390-en 48 px). Ok azonosítva: az egyképernyős CSS `data-playing="true"`-hoz kötött, a szintlista képernyőn a belső `overflow-y-auto` sosem aktiválódik. Javítási feladat: `docs/specs/2026-09-08-jatek-tananyag-javitasi-terv.md` C1.
- A további talált hibák és a végrehajtható javítási terv: `docs/specs/2026-09-08-jatek-tananyag-javitasi-terv.md`.
- Deploy: NOT RUN.
