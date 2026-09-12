# Régi HTML tanítás teljes áttekintése

Cél: a 7.4 kiadás éles visszamérésében a kifogásolt régi HTML öt fejezetéből alapból továbbra is csak egy látható. A régi `#pg-chapters > .pg-ch` lapozó inline display stílust ír, a közös modul csak az új data-teaching-section fejezeteket tartja láthatóan. A teljes tanítás követelménye a régi tananyag megjelenítésében is teljesüljön.

Nem-cél: tartalomcsere, kérdésbank/eredmény módosítása, általános rejtett felületek feltárása. A módszerek kapui és a kérdések lapozása megmaradnak.

Érintett: `source/client/src/lesson-runtime/lesson-grade.css`, `source/tests/html-lesson-quality.browser.ts`. A már felismert pg formátum tanítópaneljén belüli fejezetek legyenek mind láthatók; a hozzájuk tartozó, ellentmondó lapozókártya tűnjön el. Más panelek hasonló elemeihez ne nyúljunk.

Elfogadás: ha egy régi tanítópanel több pg-ch fejezetből áll és a régi script elrejti a továbbiakat, mindegyik egyszerre olvasható marad. A régi lapozó nincs jelen a használható UI-ban; fülváltás és újratöltés után is teljes tanítás látszik. Az éles, tényleges anyag mind az öt fejezete látható 320/390/844/1366 px-en, túlcsordulás és JS-hiba nélkül; eredeti tartalom és meglévő válasz változatlan.

Tulajdonosi lint/push/merge/deploy engedély továbbra is érvényes. Nincs adatbázis-írás vagy sémaeltérés. Visszaállási kódpont: 23d2e34c506637cabad4f42b716ce722b607bb91, amely már olvassa a v4 bankokat. Éles mentés és tartalmi lenyomatok a 7.4 kiadási evidenciában rendelkezésre állnak.

## Éles, meglévő böngészőben mért gyorsítótárhiba

A friss, izolált böngésző már az új hiányos-kör megerősítést kapta, a felhasználó normál Chrome-ja újratöltés után is a régi vezérlőt. Az éles Render `/lesson-interactions.js` válasza `public, max-age=31536000, immutable`; ez stabil fájlnév, nem tartalomhash. A régi cached URL egyszeri megváltoztatása és ettől kezdve kötelező újraellenőrzése szükséges.

További hatókör: `shared/lesson-interactions.ts`, `server/index.ts`, `vercel.json`, `tests/lesson-typography.test.ts`. Az adapter a saját scriptet új, v=2 URL-re frissítse, duplázás és más szerzői script módosítása nélkül. A stabil modul Renderen és Vercelen no-cache,must-revalidate fejlécet kapjon. A hashelt assets gyorsítótárazása megmarad. Elfogadás: valódi normál Chrome-frissítés után új vezérlő, megőrzött válasz; meglévő adaptertag frissítése és idempotencia; éles HTTP-fejléc ellenőrzése mindkét originon.

## Helyi ellenőrzés

PASS: teljes verify, 1200/1200 unit, típusok, lint, build. PASS: 8 HTML böngészőteszt, régi fejezetláthatóság, fülváltás és újratöltés is. A tényleges eredeti HTML helyi visszajátszásában 320/390/844/1366 szélességen öt látható fejezet, 17/17 feladat, 34/34 kvízkérdés, kihagyási megerősítés, nulla JS-hiba és túlcsordulás; 390 px-es képernyőkép vizuálisan is ellenőrizve. Naplók: `tmp/quality-legacy-verify.log`, `tmp/quality-legacy-browser.log`, `tmp/quality-legacy-original.log`. Az éles rendes Chrome 23d2e34 kiadáson még a korábbi cache-elt modult futtatta; ez a kiegészítő javítás végső éles elfogadási pontja.
