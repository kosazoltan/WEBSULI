# Tananyag-pipeline végső ellenőrzés — 2026-09-12

Állapot: NEM KÉSZRE JELENTHETŐ. A programkód változatlan; ez ellenőrzési jelentés.

## Futtatott ellenőrzések
- PASS: source/npm.cmd run verify, exit 0; típusellenőrzés, lint, teszttípusok, 1161/1161 teszt, build. Napló: tmp/final-pipeline-verify.log.
- PASS: npm.cmd run test:learning-db, exit 0; 16/16 izolált DB-teszt, saját eldobható adatbázis eltávolítva. Ez nem éles végrehajtó-újraindítás.
- PASS: git diff --check.
- PASS: éles adatbázis csak olvasási vizsgálata: tmp/final-pipeline/runs.json.

## Internetes útvonal
Odysseus, b1ba2127-76e3-48fe-bde3-797179f77d9f: web_research_done; workflow generate/gate/publish/readback mind done. A tárolt napló két hibajavító kört mutat (bankhiány, majd saját mintaválasz pontozása), utánuk sikeres publikáció.
Az API és a DB HTML pontosan egyezik, a szerkezeti kapu sikeres. 10 módszer, 17 feladat, ebből 8 szóbeli, 34 kvízkérdés. Most új kutatást nem indítottunk; a tényleges legutóbbi futás mentett állapotát ellenőriztük.

Valódi Chrome-próba: tanítás látható, feladatlap megnyílik, kvíz helyes és hibás válaszra külön visszajelez. Egy helyes, egy hibás és nyolc kihagyott válasz: 1/10, 10%, gyakorló elégtelen.
FAIL: újratöltés után az eredmény eltűnik és új kérdéssor keletkezik. A mentett HTML 295–300. sora bizonyítja: renderQuiz törli az eredménymezőt, induláskor feltétlenül új sorsolás fut; localStorage.setItem van, visszaolvasó getItem nincs. A gyártási szerkezeti kapu ezt átengedte. Ezt a hibát ebben az ellenőrzésben nem javítottuk.
Evidencia: tmp/acceptance-2026-09-12/published/published.html és readback.json.

## Feltöltött forrás
Az új verzió óta nincs sikeres új éles feltöltési futás. A legutóbbi szeptember 11-i futás author/unknown-concept hibás, lesson_id null; korábbi siker önmagában nem bizonyítja az új verziót.
NOT RUN: új teljes feltöltés → publikáció. A normál Chrome fájlválasztó vezérlése esemény-időtúllépéssel blokkolt, korábban setFiles Not allowed volt. Kézi fájlkiválasztást kértünk; automatizált auth-megkerülés vagy kézi készanyagpótlás nem történt.
NOT RUN: ebből új javítójelölt és éles alkalmazás; nincs új tesztlecke.

## Megszakítás, mobil
Izolált DB folyamatleállítás/checkpoint/lease/idempotencia tesztek PASS. Minden félbeszakadt éles AI-hívás önálló újraindítása nem bizonyított.
320 px mobil DOM betölt, de a képernyőkép eszköz kétszer időtúllépett; teljes mobil vizuális PASS nem adható. Fekvő mobil vizuális próba NOT RUN.

## Készre jelentés feltétele
1. HTML-kvíz futás/eredmény visszaállításának javítása és valódi újratöltéses regressziós ellenőrzése.
2. Új éles feltöltési próba végig publikációig és visszaolvasásig.
3. Ebből a kért javítás/alkalmazás mentéssel és visszaolvasással.
4. Mobil álló/fekvő képernyős ellenőrzés.
