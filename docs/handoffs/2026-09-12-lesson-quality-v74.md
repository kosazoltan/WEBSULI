# WebSuli kötelező 7.4 minőség — munkanapló és kiadási evidencia

## Cél és azonosított tananyag

A tulajdonos engedélyezte a javítást, lintet, push/merge/deployt. Kötelező minimum a feltöltött v7.4: 45 szöveges feladat, 75 kvízkérdés, 15/25-ös kör, tíz módszer és két kapukérdés; teljes tanítás, tényleges forrásellenőrzés és évfolyam szerinti megjelenítés.

A kifogásolt nyilvános előnézet teljes, 57159 karakteres HTML-je beolvasva. Címe „Odysseus – Trója és a hosszú hazaút”. Öt fejezet, 17 feladat, 34 kvíz, tíz módszerelem kilenc típusból: sorting hiányzik, gate egyszer szerepel. A teljes öt fejezetet elolvastuk: a küklopsztól menekülés „ésszel, cselesen” összefoglalása például nem tanítja meg a cselekvéssort. A képernyőképből önmagában nem állapítható meg pontszámítási hiba: egy helyes válasz és négy kihagyás 1/5; a probléma a kihagyások előzetes jelzése és a használhatóság.

A korábbi lapozási elakadás tiszta Chrome-profillal nem reprodukálódott. Az eredeti teljes HTML az új megjelenítővel helyben kipróbálva: 17/17 feladat és 34/34 kvízkérdés sorban ténylegesen megnyitható, 390 px-en nincs vízszintes túlcsordulás vagy JavaScript-hiba. Ez helyi visszajátszás, nem korábbi böngészőhiba bizonyított gyökéroka és nem éles tartalmi javítás.

## Változások

- `shared/lesson-experience*`, `lesson-bank-plan`, bankgyártó: új fusion-7.4-4 szerződés, teljes minimum, módszerelosztás, verzióhoz kötött ellenőrzőpontok. Régi anyagok olvashatók maradnak.
- HTML minőségkapu: valódi, egyedi navigációs gombok és külön panelek; teljes fejezet/fogalom-kapcsolat, látható magyarázat, példa, összegzés és szemléltetés. A bankjelölő eltávolítása sem kerüli meg az alkalmazási kaput.
- Webes készítés: valódi szolgáltatói web_fetch szöveg, külön lektor öt kötelező ellenőrzéssel, konkrét hibákból legfeljebb két javítókör. A strukturális megfelelés és a szemantikai ellenőrzés külön bizonyíték.
- Közös HTML navigáció, módszer-, feladat- és kvízmegjelenítő. Hiányos körhöz látható darabszám és folytatás/lezárás választás. Studio-ban alapból a teljes tanítás látszik.
- Közös öt évfolyamsáv, csökkenő színintenzitás, nagyobb betűk a kicsiknek. A tárgyi ábrák és a témák finom eltérései megmaradnak.
- A két helyi skill és az alkalmazás futó tudástára frissült: websuli-runtime-2, teaching_depth szabály és forrás-/minőségi hibafelismerés. A tanult szabály nem módosíthat jogosultságot vagy minőségminimumot.

## Futtatott ellenőrzések

- PASS: teljes `npm.cmd run verify`, 1197/1197 unit teszt, típusok, teszttípusok, nulla lintfigyelmeztetés, build. Napló: `tmp/quality-verify.log`.
- PASS: `npm.cmd run test:learning-db`, 21/21 eldobható PostgreSQL-próba. A tényleges HTML-alkalmazásnál a bank nélküli jelölt elutasítása, frissesség, mentés, visszaolvasás és ismételt kérés is ellenőrzött; új mentett v4 kör 25 kérdés 1. és 7. évfolyamon, régi válaszok megőrzésével. Napló: `tmp/quality-db.log`.
- PASS: HTML 7 böngészőpróba: 320/390/844/1366 szélesség, 15/25 kérdés valódi lapozása, 45/75 teljes bank, mind a tíz módszer, régi pontozás és újratöltés. `tmp/quality-html-browser.log`.
- PASS: Studio/tanulási felület 17 böngészőpróba, további mentett kvíz/riport 5 próba, 320×568 képernyőn is látható és nem levágott vezérlők. `tmp/quality-learning-browser.log`, `tmp/quality-practice-browser.log`.
- PASS: külön 9 Studio-fúziós böngészőpróba, magyar fontok és témaváltozatok. Ezek a 17-es körrel részben átfednek, nem számoljuk össze egyedi tesztként.
- PASS: eredeti HTML 17/34 kérdésének teljes helyi visszajátszása. `tmp/quality-browser/original-navigation.json`. Korosztályos képernyőképek ugyanebben a mappában, vizuálisan is ellenőrizve.
- A böngésző- és DB-fixture-ök szintetikusak, nem pedagógiai minőségbizonyítékok. Két régi böngésző-fixture kétkérdéses kört feltételezett egy már 15 kérdéses bankból; ezt kifejezetten kétkérdéses történeti/szerveres körrel tettük következetessé, a pontozási és láthatósági követelmények megtartásával.

## Kiadási állapot és visszaállás

PR #61. Kiinduló éles revízió: 82a646621592a0d32a86c5728aad6d1b3d6e6b63. Előzetes éles olvasás: nincs aktív Studio-job vagy webes gyártás; nincs adatbázis-írás. Nincs sémamódosítás, authváltozás vagy tömeges tananyagátírás. Kódvisszaállási pont a kiinduló revízió.

Valódi webes próba: a 103001 karakteres, kilencfejezetes szerzői jelölt 1045,674 másodperc alatt készült el. Két hiányzó módszer miatt a régi javítás a teljes dokumentumot újrakezdte, majd a 20 perces keret lejárt. A program most a kész szolgáltatói kört és letöltött forrásait checkpointban őrzi, és két célzott bankjavítást végez teljes újragenerálás nélkül. A diagnózisban explicit sectionIndex szerepel; a fedettségi hiba nem rejti el a hibás mintaválaszokat.

A valódi jelölt célzott javítása PASS: 45 feladat, 75 kvíz, húsz módszerelem, mind a tíz típus; teljes strukturális kapu sikeres. 320/390/844/1366 px-en mind a 45/75 kérdés és a kapuk megoldásával az összes módszer ténylegesen elérhető, JS-hiba és vízszintes túlcsordulás nélkül. A rögzített, négyemeletes generált mobilmenü ráfedését a közös kétoszlopos, nem rögzített menü javítja. `tmp/quality-browser/generated-navigation.json`, `generated-*.png`.

A tanítás kilenc fejezete külön is végigolvasva. A szerzői jelöltben belső ellentmondások is vannak (például az Íliász időpontja és a szereplők térbeli csoportosításának képaláírása), ezért a gépi szerkezeti PASS nem pedagógiai elfogadás. A források újbóli letöltése során két Sulinet-kérés hozzáférési hibaoldalt adott; ilyen oldal többé nem lehet tanítási forrás. A többi négy oldal tényleges szövege 42552 karakter. A teljes lektori hívás szolgáltatói hibával megszakadt; a rövid szolgáltatói próba 3,645 s alatt sikeres volt, ezért nem állítunk általános szolgáltatáskiesést. A javító/lektor teljes hívási kerete most valóban három perc, az SDK automatikus újrapróbálkozásán át is; a felhasználói megszakítás továbbadódik. A teljes jelölt, diagnózis és lektori próba a `tmp/quality-live/` mappában maradt. Sikeres tartalmi ellenőrzés nélkül nincs tananyag-alkalmazás.

PASS: külön eldobható `research_test` PostgreSQL adatbázisban az új publikációs ellenőrzés, lektori bizonyíték hiányának elutasítása, tranzakció-visszagörgetés, párhuzamos/idempotens mentés és tulajdonosi elkülönítés. `tmp/quality-web-db.log`.

Kiadás előtt teljes adatbázismentés készült és visszaolvashatósága igazolt: `tmp/generation-diagnosis/backup-evidence.json`, 40 tábla, 6435690 bájt. Az eredeti tananyag tartalmi lenyomata és a 178 anyag előállapota: `tmp/quality-live/release-before.json`. Új v4 adatok megjelenése után visszaálláskor a v4 olvasót meg kell őrizni; pusztán a régi kódra váltás nem kompatibilis visszaállás. Éles merge/deploy és tartalomcsere ebben az állapotnaplóban még nincs igazolva.

A külső Sourcery review kvótahiányt jelzett. A Codex review ténylegesen talált hibákat: rövid szerveres kör, ismételt kapukérdés, hiányzó tartalomhoz kötött lektori bizonyíték, nem fejezetenkénti vizuális kapu. Ezek javítva és regressziókkal ellenőrizve. A nyers < karakter és a kommentbe rejtett bank új publikációkor elutasított; régi anyag olvasása megmarad. A külön helyi önellenőrzésben azonosított bankjelölő-megkerülést is javítottuk és adatbázison visszamértük. Az inline szerzői JSON.parse követelmény dokumentáltan megszűnt: a közös modul végzi a tényleges olvasást, ennek böngészőtesztje szerzői JavaScript nélküli HTML-lel fut.
