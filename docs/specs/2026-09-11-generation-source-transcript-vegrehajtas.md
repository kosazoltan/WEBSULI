# Végrehajtás

1. `source/server/studio/source-transcript.ts`: tiszta átirat-illesztés és legfeljebb két, pontos idézetet javító kör; külön teszt a hiányzó OCR-re, másik fájlból vett/kitalált idézetre, javított és megmaradó hibára.
2. `source/server/studio/run-extraction.ts`: egységes szöveg átadása a kivonatoló és fedettségi hívásoknak, ellenőrzött idézetjavítás a tranzakció előtt. `extractor.ts`: cache-verzióváltás. Futtatás: `node --import tsx --test tests/studio-source-transcript.test.ts tests/studio-extractor.test.ts tests/studio-verbatim.test.ts` a source mappában. Elvárt: PASS, zárt kapu bizonyíték nélkül.
3. `SourceUploadForm.tsx` és `LessonStudioPanel.tsx`: tartós session futásazonosító, polling-hiba és újrapróbálás, megállt jegyzék megnyitása, csak publikálás utáni listafrissítés és fájlürítés. Valódi Playwright próba navigálással, parked/error/success állapotokkal, desktop és mobil nézetben. Nincs vízszintes túlcsordulás vagy hiányzó vezérlő.
4. Külön diff-review a specifikációhoz. `npm.cmd run verify`, szükség szerint `npm.cmd run test:learning-db`, teljes PR CI. Nem gyengíthető teszt.
5. `docs/lesson-improvement.md`: az átirat és automatikus idézetjavítás dokumentálása. Atomi commit, feature branch push, PR, zöld CI, merge.
6. Éles kiadás előtt friss adatmentés, utána Vercel és Render revízió visszaolvasása. Eredeti négy növényes fotó beadása, a futás aktív követése. Lecke/publikált fájl/kvízadatok visszaolvasása, négy lap és pontozás valódi böngészős ellenőrzése; a régi lecke megőrzésének bizonyítása. Az eredményeket ebben a fájlban rögzíteni.

## Állapot
- Kiinduló futási és forrásbizonyíték: helyi, figyelmen kívül hagyott `tmp/generation-diagnosis/runtime.json`.
- Megvalósítás: közös átirat, két szigorú idézetjavító kör, verziózott cache, sessionben tárolt futásjelző, elérhető forrásellenőrzés, siker utáni anyaglista-frissítés.
- `npm.cmd run verify`: PASS, 1101 unit teszt, mindkét típusellenőrzés, lint és build.
- Célzott forrásteszt: 37 PASS. Chrome: 5 PASS (360×800, 844×390, 1280×900; állapot visszatérés után, hiba és siker, nincs vízszintes túlcsordulás). A próba első hibája hiányos API-fixture volt (`sourceFiles` hiányzott), javítva, az elvárások változatlanok.
- Önálló diff-review: nincs forráskapu-lazítás, új függőség, migráció vagy régi leckeírás. A valódi modell tartalmi minősége és éles automatikus közzététel még ellenőrzésre vár.
