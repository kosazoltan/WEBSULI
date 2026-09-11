# Éles tananyag átvételi próba — FAIL

2026-09-11. Tulajdonosi kérés: valódi feltöltés, javítás, közzététel és megszakítás utáni folytatás ellenőrzése.

## Éles eredmény

- Normál bejelentkezett adminfelületről feltöltött, saját magyar TXT-forrás. Cím: TESZT – Háromszög területe – teljes folyamatellenőrzés. Nincs kézzel létrehozott adminmunkamenet, kihagyott kapu vagy közvetlen adatbázis-írás.
- Futás: 84aadba8-6db4-4363-bae3-c7d6d9b63fec. Indult 19:18:34 UTC. Studio job: d672423e-c677-4c70-a170-d97fb8cdf217.
- PASS: fájlbeolvasás, tantárgy/évfolyam automatikus felismerése (Matematika, 7.), forrásjegyzék és forrásellenőrzés, tanulási terv.
- PASS: böngésző újratöltése közben a szerver tovább dolgozott; a Futások nézet ugyanazt a futást mutatta, az adatbázis ezt megerősítette.
- FAIL: tananyagszerző után nincs kész tananyag. A forrásjegyzék azonosítója `terulet-mertekegysege`, a modell két blokkban `terulet-mertekegyseg` azonosítót adott vissza. Teljes, lessonSchema szerint érvényes JSON; 6088 bemeneti és 4448 kimeneti token, a felület szerint 42,9 másodperces szerzőlépés. Nem hosszkorlát/elutasítás/üres vagy sérült JSON állította meg.
- A `source/server/studio/step-runner.ts` author ága sémahibánál kér egyszeri javítást, ismeretlen fogalomazonosítónál közvetlenül `fail` eredményt ad. A hiányzó azonosító-javítás megállítja ezt a valós futást. A forráshűségi kaput nem szabad fellazítani; korlátos, teljes hibás választ és pontos azonosítólistát kapó javítás indokolt.
- A workflow megőrzi a konkrét hibát; a one_step_runs összefoglaló viszont általános „Váratlan hiba történt. Próbáld újra.” szöveg lett. Ez a két felület diagnózisát eltérővé teszi.
- Katalógus: 177 → 177, nincs új publikált anyag, nincs módosított eredeti. A kész szerzői modellválasz checkpointban megmaradt.
- NOT RUN: ezen anyag teljes javítása/jelöltalkalmazása/publikált visszaolvasása és tanulói négylapos mobilpróbája. Blokkoló: a feltöltési gyártásnak nincs kész eredménye. Nem helyettesítettük kézi dokumentummal vagy másik tananyaggal.

Bizonyítékok (helyi, nem commitolt): tmp/workflow-acceptance/latest-status.json, failure-diagnosis.json, failed-author-and-source.json, teszt-haromszog-terulete.txt. A beépített böngészőben az éles admin Futások nézete maradt megnyitva.

## Izolált folyamatmegszakítás

A `source/tests/workflow-db.integration.ts` új tesztje saját Node-gyermekfolyamatot indít a valódi workflow engine/store réteggel és eldobható PostgreSQL-en. A kész első checkpoint mentése után, a második szintetikus válasz befejezése előtt ezt a saját folyamatot ténylegesen leállítja. A lease lejáratát a tesztadatbázisban előrehozza; nem valós 90 másodperces várakozás.

- PASS: kész válasz megmarad, befejezetlen válasz nincs a checkpointok közt.
- PASS: lejárt végrehajtó megszakadt állapotként olvasható.
- PASS: kifejezett új végrehajtás kész választ cache-ből veszi; befejezetlen művelet egyszer újrafut.
- PASS: ugyanazon kész kérés ismétlése nem hajt végre második befejezést.
- Korlát: szintetikus szolgáltató és motor-szintű folytatás, nem éles AI-számlázási próba, nem automatikus munkasor és nem admin folytatásgomb-végpont tesztje. Az éles szervert nem állítottuk le.

## Futtatott ellenőrzések és módosítások

- `npm.cmd run test:learning-db`: PASS 16/16, az új folyamatleállításos esettel. Napló: tmp/workflow-acceptance/database-tests-with-process-loss.log.
- `npm.cmd run check:test`: PASS. Napló: tmp/workflow-acceptance/test-typecheck.log.
- `git diff --check`: PASS.
- Módosított teszt: source/tests/workflow-db.integration.ts. Terv és végrehajtás: docs/specs/2026-09-11-live-workflow-acceptance*.md. Alkalmazáskódot nem módosítottunk és nem deployoltunk a vizsgálat során.

Következő javítás: a bizonyított fogalomazonosító-hibát teljes előző válasszal és forráslistával visszaadó korlátos javítókör; az eredeti konkrét hibát őrző összefoglaló. Ezután ismételhető az ugyanebből a forrásból induló teljes éles átvételi sor. Pusztán újabb véletlenszerű generálás nem bizonyítaná a gyökérok javítását.
