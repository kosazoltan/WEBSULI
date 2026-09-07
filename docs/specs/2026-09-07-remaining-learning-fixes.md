# Hátralévő tanulási javítások

Tulajdonosi jóváhagyás: 2026-09-07, a felsorolt magyarázatok, G-4, meglévő címek és forrásalapú gyártás teljes befejezésére adott utasítás.

## Cél és szeletek
1. BlockCraft, Viharvadász és Aszteroida minden beégetett kérdéséhez tartalmas magyar magyarázat; Viharvadász material → kérdés → visszajelzés adatút megőrzése.
2. A közös adaptív szabály bekötése az öt hátralévő játékba. Egy elfogadott válasz egyszer számít; új futás visszaállít; korosztály és pontozás megmarad.
3. Meglévő HTML tananyagok címjavítása: száraz futás, visszaállítható előállapot és csak dokumentumból bizonyítható címcsere. Versengő szerkesztés esetén nincs felülírás.
4. OpenRouter elérhetőség ellenőrzése titok megjelenítése nélkül, majd a kijelölt valódi forrásból gyártás és minőségellenőrzés.

## Nem-cél
Új játék, jutalmazási szabály módosítása, kitalált forrásanyag, más repó módosítása. Push és deploy nincs külön kérés nélkül.

## Érintett fájlok
`source/client/src/pages/{BlockCraftQuiz,TornadoHunter200,SpaceAsteroidQuiz,WordLadderHuEn,TsunamiEscapeEnglish}.tsx`, `source/client/src/lib/tornado/questions.ts`, közös adaptív modul, magyarázat-adat és célzott tesztek. Címjavító segéd a `source/server/scripts/` alatt, tiszta döntési modul és teszt. Futási bizonyíték és állapot ebben a dokumentumban.

## Edge case-ek és EARS elfogadás
- Ha hibás válasz érkezik, a kártya a kérdéshez tartozó, sorrendtől független indoklást mutat.
- Ha régi material rekordban nincs magyarázat, a kompatibilis tartalék működik.
- Ha három helyes vagy két hibás válasz követi egymást, a közös szabály módosít tényleges játékparamétert a megengedett sávban.
- Ha ugyanarra a kérdésre gyorsan kétszer kattintanak, csak egy válasz számít.
- Ha a menet újraindul, a válaszelőzmény és nehézség is visszaáll.
- Ha a HTML nem tartalmaz használható címet, nincs automatikus címcsere; a dokumentum és a jelenlegi cím megőrzendő.
- Ha hiányzik valódi forrás vagy használható hozzáférés, a gyártás blokkolója konkrétan dokumentálandó.

## Ellenőrzés
Célzott unit tesztek → típusellenőrzés és lint → teljes verify; valódi böngészős asztali és mobil render, válasz és újraindítás ellenőrzés képpel. Címeknél dry-run és alkalmazás utáni visszaolvasás. Gyártásnál séma, fedettség és olvasható megjelenítés.

## Pontosítás: automatikus osztálybesorolás
A tulajdonos 30 képet adott, majd egyértelművé tette: az osztályt a program határozza meg a tananyagból. A korábban közölt 7. osztály ellenőrzési referencia, nem gyártási bemenet. Az egygombos gyártás mindig inferál, kézi scope nem írhatja felül; a felületen csak a cím és fájlok szükségesek. Érintett: SourceUploadForm, one-step, lesson-pipeline-routes és kapcsolódó tesztek. Ismételt képek összevetése, képlet- és mértékegységhibák jelölt helyesbítése; olvashatatlan feladat nem található ki.

A besorolási szabály a külön térképkészítő feltöltésre is vonatkozik (`studio/routes.ts`): szerzőtől kapott scope nem dönthet az évfolyamról. A meglévő térképek kurátori fogalomjavítása megmarad.

## Mért futási eredmények és gyártás közbeni javítások
- Git pull: 84219e7 → 08d7340, külön munkág: codex/remaining-game-learning-fixes. A meglévő .codex/ könyvtár érintetlen.
- Magyarázatok: BlockCraft 213, Aszteroida 38, Viharvadász 120 (a korábbi 121 helyett a tényleges bank mérete), összesen 371.
- Adaptív bekötés: mind az öt hátralévő játék, célzott szabály- és banktesztekkel. Szökőár időtúllépése is egyszer számít hibának, olvasható visszajelzést ad.
- Végállapot verify: 930/930 unit teszt PASS, lint, mindkét typecheck és build PASS (7,99 s). Napló: tmp/geometry-2026-09-07/verify.log.
- Valós Chrome: 390 px-en mind az öt játék elindul, nincs JS-hiba/vízszintes túlcsordulás. Feltöltés 390/1280 px: nincs osztálymező, a POST nem küld scope-ot. Aszteroida rossz válasz → tartós indoklás → következő kvíz PASS. Szökőár lejárt idő → indoklás → továbblépés PASS.
- 168 meglévő cím áttekintve; 15 bizonyítható javítás alkalmazva, tranzakción belüli visszaolvasással. Ismételt dry-run: 0 további változás. Visszaállítási terv: C:/Temp/websuli-title-repair-reviewed/before-apply.json. A jelentés megőrzi az eredeti/új címeket. Osztály- és fejezeteltéréseknél nincs automatikus átnevezés.
- Fotók: 30 kép, 20 különböző oldal; OCR és ellenőrzött átiratok: C:/Temp/websuli-geometry/. Az új leckék évfolyamot nem kapnak bemenetként.
- Éles kivonatolási hiba: a modell a lap nélküli szövegekhez szöveges page értéket adott, így minden fogalom elbukott. `parseExtractorConcept` a text/image források értelmetlen oldalszámát elhagyja; PDF oldalszám és minden tartalmi mező szigorú validációja változatlan. Első javított kivonat: 13 fogalom, 13 igazolt idézet, 0 eldobás.
- Az author katalógus csak stringként dokumentálta az animKind mezőt, a modell nem támogatott neveket talált ki. A katalógus most a séma tényleges nyolc értékét sorolja fel (`step-io.ts`).
- Az éles gyártás és az utóellenőrzés lezárult; az öt lecke végső állapotát adatbázis-visszaolvasás és valódi böngésző igazolja.

A valódi lecke ellenőrzésekor további konkrét szerződéshiány derült ki: a modellnek a try.spec és geometry.params futtató által olvasott mezőit is meg kell adni, a képaláírás nem ígérhet nem létező ábraelemeket. A grounding a try.spec ténylegesen látható szövegét eddig kihagyta; most a text/items/pairs mezőket is méri, a rejtett válaszokat és címkéket nem. Érintett: step-io, grounding és célzott tesztek. A már előállított lecke külön javítást és ismételt kapuellenőrzést kap. A következő gyártás a mentett jobtól folytatódik, új tudástár nem keletkezik ugyanabból a forrásból.
A besorolási bemenetnél a szöveg vége sem vágható le (a nehezebb fogalom később is szerepelhet), a DOCX-ből szöveg kerül a modellhez, a PDF pedig a dokumentált file/file_data formátumban érkezik. Forrás: https://openrouter.ai/docs/guides/overview/multimodal/pdfs . Célzott bemenetteszt ellenőrzi. A szerző által visszaadott metaadat nem írhatja felül a forrásból megállapított osztályt/tantárgyat és a valódi térképazonosítót. A kapu hibái korábban nem kerültek a szerző javító promptjába; a konkrét hibajegyzék és az előző lecke most visszakerül.
A DOCX tényleges visszaolvasásakor a korábbi Mammoth/XML adapter hibázott (hiányzó MIME típus). A besoroláshoz a már telepített JSZip + XML parser közvetlen használata oldja ki a szöveget; függőségeik most explicit szerepelnek. Valódi, minimális DOCX próba: PASS. Offline lockfile-frissítés, 0 audit jelzés.

## Lezárt állapot
- Forrásból automatikusan besorolt, éles tananyagok: háromszögek és négyszögek 7. osztály; körök, árnyékolt síkidomok és szögek 8. osztály. A készítő évfolyamot nem adott át. Adatbázisban a térkép, lecke és megjelenített anyag évfolyama egyezik.
- 90 fogalom (13+17+23+17+20), minden core és supporting fogalom lefedve; 0 megalapozatlan címke, 120 exportált kvíztétel visszaolvasva.
- A generált példákban a forrás számait, a kerület/terület egységeit, a kördarabok különböző sugarait, a szögfelezők 125°/55° esetét és két geometriailag össze nem illő adatsort javítottam. A kör alakú „szabályos sokszög” ábra helyett négyzet látható; a nem megrajzolt összetett ábrát ígérő képaláírásokat ténylegesen működő folyamatábrák váltják.
- A π önálló fogalomként korábban mérhetetlen volt, és a folyamatábra látható lépései kimaradtak a groundingból. Javítva, pozitív és negatív regressziós teszttel; a rejtett metaadat továbbra sem bizonyíték.
- Az árnyékolt alakzatok lencsefogalmának idézete nem összefüggő forrásszakasz volt. A teljes, szó szerinti bekezdés visszaállítva, előállapot mentve; a fogalom az aktív tudástárban és leckében is szerepel.
- A szöges lecke animátora szolgáltatói hibával megállt. Nem állítunk hibátlan automatikus futást: a javított változatot forrásellenőrzés, séma, fedettség és valós böngészős ellenőrzés után tranzakcióban publikáltam. A korábbi hiba megmaradt a job review.previousError mezőjében és a mentésben; minden érintett job végállapota done/ok.
- Chrome E2E: 4/4 PASS (forrás-only feltöltés mindkét úton, Aszteroida magyarázat, Szökőár időtúllépés). Az öt éles lecke 390 és 1280 px-en: 0 JS-hiba, 0 vízszintes túlcsordulás, 6-6 szakasz. Éles feladatpróba: 10 kitöltés, 3 párosító és 1 sorrendező gyakorlat PASS.
- A 168 korábbi cím közül 15 különböző anyag címe javult. A PDF-metaadatból igazolt ékezetjavítás ezek egyikét érintette másodszor (16 frissítési művelet, 15 különböző cím). Végső cím- és tartalomhash-visszaolvasás: PASS; a tartalmak változatlanok.
- Bizonyítékok, 20 eredeti forrásoldal, átiratok, böngészőképek, visszaállítási mentések és lecke-linkek: `tmp/geometry-2026-09-07/REPORT.md`. A helyi, gitből kizárt mappa nem tartalmaz API-kulcsot.
- Push/deploy NOT RUN: nem volt külön kérés rá. A kódváltozások helyi commitok; az öt lecke és a címjavítások az éles adatbázisban vannak. A feltöltőfelület és a játékok kódjavítása kiadást igényel.
- PDF/DOCX teljes gyártási végponttól végpontig teszt NOT RUN: a tényleges bemenet képekből ellenőrzött szöveg volt. A besorolási fájlformátumok célzott tesztje és valódi DOCX szövegkinyerése PASS. A gépi tartalomhoz további felhasználáskor is szükséges a meglévő minőségjelzések figyelembevétele.
