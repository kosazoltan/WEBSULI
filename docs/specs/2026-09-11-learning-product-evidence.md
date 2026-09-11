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

## Mérés határai

A telefonméretek asztali Chrome-ban emulált viewportok; fizikai iOS/Android készüléken nem futott próba. A játékok rövid fekvő menüiben egyes másodlagos tartalmak belső görgetést igényelhetnek; a fő vezérlők elérését a tesztek külön ellenőrzik. Gyermekrésztvevős tanulási hatásvizsgálat még nem történt. A hozzá tartozó, mérhető próbaterv külön dokumentum.
