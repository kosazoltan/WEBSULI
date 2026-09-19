# Valós tanulói tesztek — szerződés

## Cél
A tulajdonos kérésére tényleges Chrome → helyi alkalmazás → DEV PostgreSQL válaszadást, pontozást, mentést, újrapróbálást, újratöltést és tanári riportot vizsgálunk. Nem helyettesítjük a szerver válaszait mockkal. Külön eldobható PostgreSQL17 integráció vizsgálja a versenyhelyzeteket, lejáratot, bankcserét és jutalomduplázás védelmét.

## Nem-cél
Nincs fizetős AI-generálás, éles deploy, Google OAuth-konfiguráció módosítás, valódi tanulói adat átírása, tesztgyengítés. Az adminlap régi Vite WebSocket-eseménye önmagában nem friss reprodukció; új böngésző pageerror eseményeit külön gyűjtjük.

## Adatvédelem és visszaállítás
- A DEV környezet bizonyítása kötelező: NODE_ENV=development, explicit DEV_DATABASE_URL, helyi HTTP alkalmazás. Eltérő/hiányzó konfigurációnál stop.
- A már publikált Föld-lecke read-only JSON-jából új, QA-jelölt másolat és új, nem admin tesztfelhasználó készül. A jelszó futás közben véletlen, csak memóriában; normál /api/login session, nincs auth bypass.
- Előtte a forrás lecke és anyagrekord hash-e, a clone előállapota és saját azonosítók mentve a gitignored tmp/real-learning-tests alatt; nincs jelszó, hash vagy session a bizonyítékban. Kvízbankcsere csak a QA-másolaton megengedett.
- A teszt írásai csak saját user/lesson/material id-khez kapcsolódhatnak. A jutalomteszt kuponja csak a QA-useré. Takarításkor tranzakcióban ellenőrzött saját rekordok, sessionök, lesson_attempts, concept_results, coupons, lecke és anyag törölhetők; forrás és más tanuló érintetlen. Sikertelenségnél a mentett manifest megőrzi a célzott takarítás lehetőségét.

## Elfogadás
1. Valódi DB-harness PASS, saját konténer eltávolítva; nincs távoli adatbázis-fallback.
2. Normál login és CSRF mellett 25 tételes szerveres kör. Hibás első válasz 0; második eltérő válasz 409; azonos ismétlés nem dupláz.
3. Chrome hálózat offline-ra állítva válasznál: látható hiba, nincs hamis siker. Online helyreállítás + felületi újrapróbálás: valódi 200 és DB-ben egyszer mentett válasz.
4. Segítség visszavisz tanításhoz, a szerver őrzi a jelölést újratöltésen át. UsedHint=false nem törli a már rögzített segítséget.
5. 25 válasz után helyes mért pontszám, export és reload után ugyanaz az eredmény. Új kör külön azonosító és lehetőség szerint eddig nem látott tételek. Jutalom legfeljebb egyszer, korábbi kör megmarad.
6. Vendég/nyílt feladat helyi pontozás: üres/téves/részleges/helyes válasz és eredménymegőrzés, mintaválasz ugyanazzal a valódi értékelővel.
7. Mobil 320 px, fekvő 844×390 és asztali 1440 px valós nézet: látható vezérlők, nincs pageerror, overflow, levágás. Screenshotok megtekintése.
8. Tanári riport valódi admin sessionnel: lezárt körök és hibák/segítségek egyeznek DB-vel. Nem admin hozzáférés tiltott. Forrás lecke/hash változatlan. Saját tesztadatok takarítása után 0 saját maradék.

## Érintett fájlok
Ez tesztvégrehajtási feladat. Új helyi futtató: source/real-learning-tests.local.mts, a bizonyíték tmp/real-learning-tests alatt; meglévő scripts/run-learning-db-tests.ts és tests/learning-db.integration.ts változatlan. A programkód csak új, bizonyított hiba esetén külön terv alapján módosul.

## Biztonságos végrehajtási pontosítás
A DEV guard a seed előtt megállt: külön DEV_DATABASE_URL nincs. Nem került sor távoli írásra, a védelmet nem lazítjuk. A source/real-learning-harness.local.mts külön loopback PostgreSQL17 konténert és a teljes változatlan Express/Vite alkalmazást indít külön helyi porton. A lecke publikus localhost:5000 API-jából csak JSON-t másolunk a tesztadatbázisba. Környezeti titkok nem öröklődnek, dotenv útvonala üres nemlétező helyre mutat. A saját adatbázisban külön tanuló és tanár szerepkörű fixture normál jelszavas bejelentkezése tesztelhető. Az eredeti DEV fiók és tanári riport érintetlen. A teljes izolált adatbázis és szerver végül eltávolítandó. Ez valós teljes-stack teszt a publikált tartalom másolatával, nem éles felhasználói vagy Google OAuth-próba.

## Futtatott eredmények (2026-09-14)
Az alabbiak az elozo futas eredmenyei; a folytatas kulon eredmenyblokkban szerepel majd.

## Folytatas terve
- A meglevo izolalt harness es minden korabbi allitas valtozatlan megorzese. Nincs eles iras, fizetos generalas vagy deploy.
- Ures Chrome-contextben, login nelkul 15 nyilt feladat: ures, teves, reszleges es helyes valasz; UI-pontszam es reload ellenorzese. A vendeg ne inditson szerveres practice kort, a tanuloi korok szama maradjon ketto.
- Tanari riport vizualis elerese a rendes Studio feluleten, normal tanari fixture sessionnel; a megjelenitett kerdesek, lapozas es szamok egyezzenek a valodi API/SQL riporttal. A szukseges lezart job-fixture csak az eldobhato DB-ben johet letre; takaritasa kotelezo.
- Mindket uj folyamatnal 320x900 es 1440x900 kepernyokep, pageerror es vizszintes overflow ellenorzes. Screenshotok kezi megtekintese.
- Programkod csak ujonnan bizonyitott hiba es kulon javitasi terv utan valtozhat. A helyi tesztfuttato uj ellenorzesekkel bovitheto; korabbi teszt nem gyengitheto.

## Elozo futas meresei
- `npm.cmd run test:learning-db`: 21 PASS, 0 FAIL, 0 skip; PostgreSQL17 konténer eltávolítva.
- `node --import tsx real-learning-harness.local.mts`: végső futás 16:23Z PASS, normál Chrome + Express/Vite + PostgreSQL, nincs route.fulfill vagy auth-bypass.
- Két kör, 50 valódi UI-válasz: első 24/25=96%, 23 önálló helyes; második 25/25, 25 önálló. Első hibás válasz immutable (eltérő ismétlés409), azonos ismétlés200. Hamis score mező400, megválaszolatlan practice view-ban nincs correctIndex/feedbackPerOption.
- Valódi Chrome offline hálózatkimaradáskor hiba látható és DB-válaszszám változatlan; felületi retry után egyetlen mentés. Ez nem szerver503-teszt.
- Segítség tanításhoz vezet és reloadon át megmarad; usedHint=false ismétlés sem törli. Eredményexport, reload, új kör másik25 korábban nem látott kérdéssel PASS. Két kör után összesen1 kupon, második alreadyRewarded=true. Az izolált DB alapértelmezett jutalompolitikája tesztelt, nem a távoli admin által konfigurált policy.
- 15 helyi szöveges feladat a bejelentkezett tanuló böngészőjében: 0,0,0.5,12×1=12.5/15; reload és reset-megszakítás megőrzi. Külön vendégsession ebben a körben NOT RUN; a helyi feladat-komponens valódi UI-pontozása történt.
- Tanári fixture normál jelszavas login után HTTP-riport:2kör/50válasz/1hiba/1hint, közvetlen SQL-lel egyező; tanuló403, riport nem tartalmaz userID-t. A tanári riport vizuális adminpanelje ebben a futásban NOT RUN; a valódi riport API és jogosultság ellenőrzött.
-320×900,844×390,1440×900: vezérlők scroll utáni viewport/elementFromPoint/levágás ellenőrzése PASS, nincs vízszintes overflow, pageerror0; viewport és teljes oldalas képek megtekintve.
- Saját user/teacher/material/lesson/attempt/coupon/concept/session célzott törlés; táblákban saját maradék0; eldobható app és konténer leállítva. Saját startup QA-mentések eltávolítva. Eredeti publikus lecke előtte/utána SHA256 változatlan, eredeti DB-hez csak HTTP-olvasás történt.
- A próba külön valós ütemezőhibát talált (helyi PostgreSQL helyett Neon HTTP). Külön terv szerinti közös-db javítás és új valódi DB-regresszió1PASS; teljes tanulói kör utána ismét PASS.
- `npm.cmd run check`, `npm.cmd run lint`, `npm.cmd run build`, `git diff --check`: PASS. A teljes korábbi1257-es unit suite újrafuttatása NOT RUN ebben a körben: célzott DB-regresszió + teljes-stack próba és check/lint/build történt. Elkülönített review új finding nélkül.
- Megmaradó, nem elhallgatott build-warning: régi Browserslist-adat, pdfjs-dist eval, üres mammoth chunk. Izolált startupból szándékosan hiányoznak az AI/OAuth/VAPID kulcsok, ezért ezek warning/error jelzése elvárt. AI-generálás, Google OAuth, játék tényleges elindítása, távoli DB-terhelés és éles deploy NOT RUN; nincs push/merge/deploy. A localhost:5000 eredeti folyamat nem indult újra, az új ütemezőfix az izolált folyamatban és buildben ellenőrzött.

Bizonyítékok: tmp/real-learning-tests/evidence.json, cleanup.json, expected-report.json, server.log és screenshotok. A helyi futtatók gitignored *.local.mts fájlok; a reprodukcióhoz helyben megőrzöttek.

## Folytatás eredménye (2026-09-14 16:47Z)
- Első futás FAIL a seed előtt: localhost:5000 ECONNREFUSED, a korábbi alkalmazás már nem futott. Nem indítottuk újra. Az explicit --snapshot mód a korábban mentett publikus leckét használja; a régi mérések bizonyítékfájljait az új futás eredményei frissítették.
- `node --import ./source/node_modules/tsx/dist/loader.mjs ./source/real-learning-harness.local.mts --snapshot`: PASS, valódi Chrome + teljes Express/Vite + eldobható PostgreSQL17, külső adatbázis és API-kulcs nélkül. Az ütemező külön regressziója 1 PASS / 0 FAIL / 0 skip.
- Bejelentkezett tanuló: 50 UI-válasz, két mentett kör, 24/25 és 25/25 pont, pontosan 1 kupon. Offline hiba és felületi retry, első válasz változtathatatlansága, segítség, export, reload, új kérdések ismét PASS. További 15 nyílt feladat: 12.5/15 pont.
- ÚJ, külön vendég Chrome-context login nélkül: 15 nyílt feladat, üres és téves 0, részleges 0.5, 12 helyes válasz 1-1 pont; összesen 12.5/15. Minden megjelenített részpontszám ellenőrzött, reload megtartja az eredményt. Practice hálózati kérés0, DB-ben továbbra is csak a tanuló két köre.
- ÚJ, normál tanári login után valódi /admin?tab=lesson-studio: saját lezárt job-fixture sessionStorage-visszatöltése. Nincs generálás vagy auth-bypass. A riport 50 kérdésének promptja/hibája/válaszszáma/segítsége egyezik az SQL-lel ellenőrzött API-val; 3 lap előre és vissza, szélső gombok tiltása PASS. A tanári összesítés 2 kör, 50 válasz, 1 hiba, 1 segítség.
- Vendég és tanár: 320x900 és 1440x900 valódi nézet, viewport és teljes oldalas screenshotok mentve; mindkét szerepkör viewport-képei kézzel megtekintve. Vízszintes overflow0, pageerror0. Tanári lapozógombok viewport/hit-test/szövegszélesség PASS.
- `npm.cmd --prefix source run test:learning-db`: 21 PASS / 0 FAIL / 0 skip. A log PRODUCTION felirata a NODE_ENV=test naplózása, a harness loopback eldobható DB-t hozott létre és törölt.
- Saját tanuló/tanár/lecke/anyag/kör/kupon/fogalom/session takarítás PASS; külön saját studio_jobs count0 ellenőrzés. Saját szerver és két tesztkonténer eltávolítva, saját startup mentés eltávolítva. A helyi forrássnapshot hash-e változatlan; aktuális éles forrás visszaolvasása NOT RUN.
- Szerkesztői diagnosztika mindkét helyi futtatóra: nincs hiba. Ebben a körben alkalmazáskód nem változott; teljes check/lint/build/unit suite NOT RUN, helyettük a tényleges futtatók végrehajtása és a 21+1 célzott DB-teszt történt. Ez nem kiadásra kész vagy teljes alkalmazásra szóló minősítés.
- Napló: a szándékosan hiányzó AI/OAuth/VAPID konfiguráció jelzései és az elavult Browserslist-adat figyelmeztetése megmaradtak. Fizetős AI-generálás, Google OAuth, push, játék tényleges indítása, távoli aktuális tartalom és éles üzem NOT RUN, mert a kör izolált és titokmentes. Nincs commit/push/merge/deploy.
- Módosított fájlok: ez a spec, a társ végrehajtási dokumentum, source/real-learning-tests.local.mts és source/real-learning-harness.local.mts. Egyéb meglévő worktree-módosításhoz nem nyúltunk.