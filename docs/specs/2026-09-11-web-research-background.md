# Internetes tananyagkészítés: háttérfutás és pontos javítás

## Bizonyíték és cél
A PR54 éles Chrome-próbája 17 forrást talált, két automatikus javító körbe lépett, majd kb. 15 perc után terminális esemény nélkül megszakadt. A szerver uptime folyamatos maradt; a kapcsolatot lezáró infrastruktúra pontos komponense nem bizonyított. A kliens helyesen hibát jelzett, de tananyag nem született. A minőségkapu JSON-kivételét általános mondattá alakította, ezért a javító nem kapott mezőszintű diagnózist.

## Szerződés
- Az admin indítása azonnali 202 + azonosító. A meglévő ai_generation_requests táblában, elkülönített web-research állapotokkal tároljuk a futást, forrásokat, jelöltet, diagnosztikát és eredményt; nincs sémamigráció.
- A HTTP kapcsolat/lap bezárása nem szakítja meg a szerver munkáját. Rövid, adminnak és tulajdonosnak engedélyezett lekérdezések követik. Újranyitáskor a tárolt azonosítóval folytatódik a követés.
- Az indítás idempotens. Azonos kérésazonosító nem indít új AI-hívást. Más tulajdonos vagy eltérő bemenet nem vehet át futást.
- Csak a változatlan szigorú kapun átment HTML publikálható. A tananyag és a sikeres állapot egy tranzakcióban készül; ismétlés nem hoz létre dupla anyagot.
- Pontos JSON-sémahibák és hibás mintaválaszok kerülnek a javítóhoz. Teljes kimenet és diagnózis az admin által visszaolvasható, naplóba titok nem kerül.
- Megszakadt szerverfolyamatot a követés nem mutathat végtelenül futónak: 25 perces korlát után explicit újraindítási hiba. Automatikus újragenerálás és dupla költség nincs.
- Nem cél: feltöltéses pipeline, régi tananyag módosítása, modellcsere, kapulazítás, általános sor-rendszer.

## Érintett részek és elfogadás
web-research route/runner/job-store, közös kliensprotokoll, WebResearchAgentPanel, verify-lesson-method, célzott tesztek és folyamatleírás. Unit: megszakadt kliens, idempotencia, izoláció, hibás bank diagnosztika, atomikus publikálás; Chrome: újratöltés utáni követés, siker/hiba, mobil. Teljes CI után merge/deploy, majd valódi internetes készítés, adatbázis-visszaolvasás és négy lap/pontozás/render próba.

## Kockázat és visszaállítás
Csak új, azonosított AI-futásokat és új tananyagokat írunk. Előző release fb435f24a2a7b22a841892f5e2393b96dace78e9; mentés/restore a korábbi kiadás előtt igazolt. Kiadás előtt aktív készítés ellenőrzése. Visszaállás előző commit; folyamatban levő új futás mellett kiadás nem végezhető. Nincs tömeges adatjavítás.

Pontozási konzisztencia: a HTML-promptba másolt régi értékelőből kikerül a már javított közös értékelőben sem szereplő saját-szó kényszer; a helyes rövid mintaválasz teljes pontot érjen a böngészőben is. Érintett: server/ai/lesson-html-spec.ts.

## Végrehajtási evidencia
- Helyi verify: típusellenőrzés, lint, teszttípusok, 1139 unit, build PASS.
- Chrome: 5 célzott UI-próba PASS, 390×844 / 844×390 / 1440×900 hibaállapot; újratöltés és átmeneti hálózati hiba után ugyanaz a futás.
- Izolált PostgreSQL 17: egyedi indítás, tulajdonosi izoláció, beszúrás utáni kényszerített hiba teljes rollbackje, párhuzamos publikálás egyetlen anyaggal, 7. osztály visszaolvasása, lezárt állapot megőrzése PASS. A teszt kezdeti sorrend-feltételezését és Drizzle-kivételcsomagolásra vonatkozó ellenőrzését javítottuk; az adatbázis-viselkedési mérce nem változott.
- Önreview: késői állapotírás nem írhat felül kész eredményt; ready újramenthető szerver-újraindulás után; done csak HTML+azonosítóval jelenhet meg. A régi SSE-kliensek ugyanazt a generálót használják.
- A HTTP-től leválasztás miatt a generáló ciklus külön fájlba került; a diff nagyobb része áthelyezés.
- Következő: PR/CI, kiadás után tényleges forráskeresés és új tananyag visszaolvasás/render.
