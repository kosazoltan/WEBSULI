# Végrehajtás

1. `source/server/studio/source-transcript.ts`: tiszta átirat-illesztés és legfeljebb két, pontos idézetet javító kör; külön teszt a hiányzó OCR-re, másik fájlból vett/kitalált idézetre, javított és megmaradó hibára.
2. `source/server/studio/run-extraction.ts`: egységes szöveg átadása a kivonatoló és fedettségi hívásoknak, ellenőrzött idézetjavítás a tranzakció előtt. `extractor.ts`: cache-verzióváltás. Futtatás: `node --import tsx --test tests/studio-source-transcript.test.ts tests/studio-extractor.test.ts tests/studio-verbatim.test.ts` a source mappában. Elvárt: PASS, zárt kapu bizonyíték nélkül.
3. `SourceUploadForm.tsx` és `LessonStudioPanel.tsx`: tartós session futásazonosító, polling-hiba és újrapróbálás, megállt jegyzék megnyitása, csak publikálás utáni listafrissítés és fájlürítés. Valódi Playwright próba navigálással, parked/error/success állapotokkal, desktop és mobil nézetben. Nincs vízszintes túlcsordulás vagy hiányzó vezérlő.
4. Külön diff-review a specifikációhoz. `npm.cmd run verify`, szükség szerint `npm.cmd run test:learning-db`, teljes PR CI. Nem gyengíthető teszt.
5. `docs/lesson-improvement.md`: az átirat és automatikus idézetjavítás dokumentálása. Atomi commit, feature branch push, PR, zöld CI, merge.
6. Éles kiadás előtt friss adatmentés, utána Vercel és Render revízió visszaolvasása. Eredeti négy növényes fotó beadása, a futás aktív követése. Lecke/publikált fájl/kvízadatok visszaolvasása, négy lap és pontozás valódi böngészős ellenőrzése; a régi lecke megőrzésének bizonyítása. Az eredményeket ebben a fájlban rögzíteni.

## Állapot
- Review-javítások után: 45 célzott unit PASS; teljes verify 1103 unit PASS, lint/típus/build PASS; 6 fejlesztői Chrome-próba és 4 kiadási builden végzett Chrome-próba PASS. A kiadási próba az éles szerver/adatbázis indítása nélkül, a valódi böngészős csomagon futott.
- Kiadás előtti adatmentés: 37 tábla, 6 060 369 bájt; elkülönített PostgreSQL 17 visszaállítás PASS, 176 tananyag, 12 Studio-lecke, éles írás nélkül. A régi növényes lecke változatlanságának lenyomata elmentve a helyi visszaolvasási bizonyítékban.
CI-diagnózis: a produkciós build service workere megkerülte az új route-fixture-öket; ezeknél a teszteknél tiltjuk a service workert (a tényleges éles próbán engedélyezett marad). A `remaining-learning.spec.ts` kész futást utánzó fixture-je megkapja a kötelező publikált fájlhivatkozást; az évfolyam- és feltöltési elvárások változatlanok.
Review utáni végrehajtás: először fájlhivatkozás szerinti átiratfeloldó helper és regresszió (másik fájl, régi egy-/többfájlos adat), utána JSON-perzisztencia és mindkét kézi ellenőrzési route bekötése. Duplikált fájlnév elutasítása a közös kérési sémában. `persistRun` csak a fő űrlapon; böngészős próba a haladó panel egyidejű megnyitására és a hibás futásból elérhető forrásra. Ezután szűk tesztek, teljes verify, Chrome és új commit CI, csak ezután merge/deploy.

- Kiinduló futási és forrásbizonyíték: helyi, figyelmen kívül hagyott `tmp/generation-diagnosis/runtime.json`.
- Megvalósítás: közös átirat, két szigorú idézetjavító kör, verziózott cache, sessionben tárolt futásjelző, elérhető forrásellenőrzés, siker utáni anyaglista-frissítés.
- `npm.cmd run verify`: PASS, 1101 unit teszt, mindkét típusellenőrzés, lint és build.
- Célzott forrásteszt: 37 PASS. Chrome: 5 PASS (360×800, 844×390, 1280×900; állapot visszatérés után, hiba és siker, nincs vízszintes túlcsordulás). A próba első hibája hiányos API-fixture volt (`sourceFiles` hiányzott), javítva, az elvárások változatlanok.
- Önálló diff-review: nincs forráskapu-lazítás, új függőség, migráció vagy régi leckeírás. A valódi modell tartalmi minősége és éles automatikus közzététel még ellenőrzésre vár.
