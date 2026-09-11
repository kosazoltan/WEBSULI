# Kiadás végrehajtása

1. Olvasd a gyártási módszert és az előző végrehajtás nyitott pontjait. Ellenőrizd Git/CI, éles szolgáltatások és hozzáférés állapotát értékek/titkok kiírása nélkül. Tartsd meg a jelenlegi feature ágat, nincs önkényes reset vagy force push.
2. Játékjutalom: a kuponhoz additív `quiz_snapshot` és `quiz_answers` JSON-oszlop. Indításkor zárolt tranzakcióban rögzítsd a lecke aktuális kérdésbankját és egyszer indítsd az órát. Bónuszkéréskor tulajdonos és lejárat ellenőrzés, aktuális tételverzió egyezése, első pickedIndex megőrzése; a rossz válasz 0 másodperc és felhasznált próbálkozás. Azonos ismételt kérés idempotens, eltérő 409. A kliens minden első választ küldjön, SHA-256 kanonikus azonosítót is elfogadva. Kapcsold a játék bankját és visszatérést a kupon leckéjéhez; ne torzuljon a téma angollá.
3. Dokumentumforrás: a meglévő PDF/DOCX adaptert és kivonatoló idézetellenőrzést közös tényleges szövegből vezesd. A besorolás indoklását, bizonytalanságát és vegyes tartalmát őrizd meg a forrásjegyzékben; nincs pusztán a legnehezebb szó alapján kötelező felülbesorolás. Szintetikus fájlokkal teszteld a teljes adatutat.
4. Döntési történet: kis validált adatmodell, elérhető csomópontok, végállapot és forráshivatkozás. Közös kattintható/érinthető/billentyűs renderer és egyező készítő/javító szerződés; szűk témában próba. Meglévő mini labor és négylapos működés nem romolhat.
5. A valós jelölt forrásellentmondását célzottan javítsd, majd kapuk és valós böngészőpróba. Csak ezután készíts éles mentést és feltételes tranzakciós alkalmazást, visszaolvasással. Írd meg a késleltetett pedagógiai próba mérhető protokollját.
6. Szeletenként célzott teszt és helyi commit. Teljes verify + DB + mobil/fekvő/asztali játék/tananyag próba után push és PR. Olvasd vissza a PR diffet és CI-t; csak zöld állapotban merge. A már engedélyezett deploy előtt a visszaállási pont és kockázat legyen rögzített. Kövesd a Vercel és Render kiadást, ellenőrizd a telepített commitot és éles adat/HTTP/böngésző útvonalat. Ha hiányzik külső hozzáférés, dokumentáld pontosan, de végezd el a független munkát.

## Állapot

- Kezdés: 20 helyi commit az origin/main előtt, nincs távoli eltérés, még nincs PR. Követett worktree tiszta; a korábbi négy ismeretlen untracked bejegyzés megőrizve. Kiadásra explicit tulajdonosi engedély van.
