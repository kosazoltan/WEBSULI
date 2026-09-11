# Tanulási termék – kiadási ellenőrzés

## Megvalósított működés

A korábbi négylapos fúzió, helyi magyar betűkészlet és mentett gyakorlás kiegészült a szerver által ellenőrzött játékbónusszal, a konkrét lecke bankjával, tényleges PDF/DOCX szövegfeldolgozással, indokolt évfolyambesorolással és döntési történettel. A HTML és a Studio ugyanazt a két interaktív labor-komponenst használhatja; a modell csak adatot szolgáltat. A készítő/javító szerződésben mindkettő szerepel.

Az új feltöltés teljes forrását egy független kivonatolási összevetés ellenőrzi. A kimaradt fogalmak csak ellenőrizhető forráshellyel kerülnek a jegyzékhez; az eredeti fogalmakat a pótlás nem írja felül. A teljes sikeres eredmény gyorsítótárazott. Ez egy további modellhívás új forrásonként, nem további emberi munkalépés, és nem matematikai bizonyíték a modell tévedhetetlenségére. Az ismételt kép/PDF OCR a tartalom és beállítás alapján újrahasználható.

## Futtatott ellenőrzések

- PASS: teljes `npm.cmd run verify`: 1096 teszt, 0 hiba; típusellenőrzés, teszt-típusellenőrzés, lint, frontend- és szerverbuild.
- PASS: 8 tényleges PostgreSQL/HTTP integrációs teszt. Első rossz válasz, párhuzamos jó válaszok, idegen kupon, lejárat, bankcsere, mentett segítség és ismételt kérés. Az 0016–0018 additív változások eldobható adatbázison; a két új oszlopmigráció kétszeri végrehajtása is sikeres.
- PASS: 36 célzott forrás-, besorolás-, OCR-, gráf- és HTML-adapterteszt.
- PASS: 4 Chrome-próba a produkciós HTML-interakcióval, tényleges CSP mellett: 320×740, 390×844, 844×390, 1366×768. Mozgó geometria, mindkét történeti ág, magyarázat, bezárás, érintési cél és túlcsordulás.
- PASS: 45 játékpróba Chrome-ban: hét játék menüi, vezérlői, lezáró képernyői; három méretben tényleges kuponos kérdés–válasz–visszatérés. A determinisztikus győzelmi próbák teszthorgot használnak; ezek nem teljes, ember által végigjátszott menetek.
- PASS: 5 mentett gyakorlás/riport és 4 geometriai labor Chrome-próba; valós válasz, újratöltés, hibából újrapróbálás, jutalom, mozgó ábra és billentyűzet.
- PASS: a tényleges, 13 fogalmas háromszöglecke négy lapja 390×844, 844×390 és 1440×900 méretben. 12 módszer, 15 nyílt feladat (8 szóbeli), 28 kvíz. A független lektor 0 blokkoló hibát talált, a füzet geometriai ellentmondását helyesen elkülönítette.

Az első teljes futás három bukását javítottuk: a komponens CSS-importja átkerült az alkalmazás belépési rétegébe; az új döntési történet séma-próbája érvényes adatot kapott; a régi „mindig a legnehezebb fogalom/magasabb osztály” elvárást a jóváhagyott, indokolt besorolás váltotta. Teszt nem lett kikapcsolva vagy gyengítve.

## Kiadás előtti visszaállási pont

Az éles Neon adatbázis teljes, csak olvasással készített archívuma helyileg a figyelmen kívül hagyott `tmp/release/` alatt található. 6 022 034 bájt, 36 TABLE DATA bejegyzés, sikeres archívum-visszaolvasás. Titkos kapcsolat és adatmentés nem kerül Gitbe.

A GitHub által igazolt utolsó sikeres Vercel Production commit a kiadás előtt: `c15a31225d9f0bf97a4f1111cc8306482405aa6d`. Az új migrációk additívak, a korábbi kód visszaállításakor megmaradhatnak. Tartalomalkalmazás külön mentést és előállapot-ellenőrzést használ. Egy későbbi szerkesztést rollback nem írhat felül.

## CI-környezet egyezése

A PR #45 első általános CI-futásában a két mockolt hálózati csomagból négy lista-próba hibázott, a szószedet bizonytalan volt (119 másik sikeres). A riport tényleges seed listát, illetve a lokálisan befogott jelölt helyett 404-et mutatott. A célzott konfigurációkban már alkalmazott `serviceWorkers: block` beállítás a két tesztfájlba került, így az általános konfigurációban sem kerüli meg a service worker a hibaszimulációt. Egyetlen elvárás vagy próbálkozásszám sem csökkent. A [Playwright dokumentáció](https://playwright.dev/docs/network#missing-network-events-and-service-workers) ezt a hálózati mockokhoz írja elő. PASS: mind a 14 érintett böngészőteszt az általános CI-konfigurációval, saját eldobható PostgreSQL 17 adatbázissal, 52,1 másodperc alatt; teszt-típusellenőrzés és lint is sikeres.

A négy betűkészlet-próba ismételt futása is sikeres: valódi Chrome-ban a magyar kettős ékezetek, kis- és nagybetűk, normál/dőlt változatok, a ténylegesen használt font és a különböző képernyőméretek ellenőrzése.

## Mérés határai és kiadás

Az indítókra külön, görgetés előtti mérést végeztünk. Ez négy korábbi fekvő menühibát tárt fel. A rövid fekvő kétoszlopos javítás után mind a 45 játékpróba ismét PASS (33,3 másodperc), immár a hét játék indítóit mind a négy méretben előzetes görgetés nélkül és legalább 44 px magassággal ellenőrizve. A típusellenőrzés, teszt-típusellenőrzés és lint szintén PASS. A változás kizárólag menüjelölést és szűk médiatartományú CSS-t érint; nem ad állapotot, hálózati hívást vagy új eseményfigyelőt.

A telefonméretek asztali Chrome-ban emulált viewportok; fizikai iOS/Android készüléken nem futott próba. A hosszabb szabálymagyarázat külön megnyitható; az indítás és a játék fő vezérlői a vizsgált méretekben görgetés nélkül elérhetők. Gyermekrésztvevős tanulási hatásvizsgálat még nem történt. A hozzá tartozó, mérhető próbaterv külön dokumentum.

A teljes képernyős képi visszaellenőrzés az űrjáték rejtett, de inicializálás miatt felszerelt játékterének fekvő CSS-felülírását is feltárta. A rácselrendezés most csak a nem rejtett játékteret érinti; a teszt külön ellenőrzi az inaktív játékterek rejtettségét. A javított űr-, szólétra- és matekmenü képi ellenőrzése sikeres.

## Éles kiadás és előnézeti korrekció

PR #45 összeolvasztva, telepített frontend/backend: `a5c2d267c6948a48963479df89e0de2ba84b03ee`. A teljes CI sikeres; a 124 böngészőpróbából egy korábbi főoldali CTA-mérés újrapróbálást igényelt (43,999996185 px a 44 px határnál), 123 elsőre átment. Nem csökkentettük a mércét.

A mentést külön PostgreSQL 17 példányba ténylegesen visszaállítottuk: 176 anyag, 12 lecke, 0 éles írás. A háromszöges mintalecke külön mentés után a 2. verzióra váltott; a teljes JSON és a 28 kérdés visszaolvasása sikeres. Az éles frontend és backend mind a hat fontfájljának SHA-256 lenyomata egyezik a mért készlettel. A service workerrel végzett újratöltés is a 2. verziót adta.

Az éles megjelenítési vizsgálat adat-, betű-, kvíz- és játékellenőrzése sikeres volt, de a képek külön ellenőrzése feltárta, hogy a /preview fix eszközsávja eltakarja a fúziós lapfüleket. Ezt a puszta DOM-láthatóság nem mutatta ki. Az új, valós előnézeti útvonalas takarásvizsgálat mindhárom méretben bukott a javítás előtt; a normál dokumentumfolyamba helyezett strukturált előnézettel 3/3 PASS (5,2 s), képi ellenőrzéssel együtt. Típusellenőrzés, teszt-típusellenőrzés és lint PASS. A korrekció terve: `2026-09-11-preview-navigation.md`; a végső éles próba már a lapfülek tényleges érinthetőségét is vizsgálja.

Az előnézet műveleteinek próbája is bekerült: az újratöltés ténylegesen új lecke-JSON-t kér, az új lap a strukturált előnézetet nyitja. Az abszolút render-origin elé nem kerül még egy origin. Mind a négy célzott Chrome-próba PASS (5,8 s), két típusellenőrzés és lint PASS. A korábban alkalmazott 2. leckeverzió változatlan.
