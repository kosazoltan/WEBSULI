# Tananyagkészítés: egyszerűsítés a tudás és a játékos tanulás megtartásával

Állapot: **döntés-előkészítés, még nem végrehajtási utasítás**. Dátum: 2026-09-10.
Vizsgált helyi ág: `codex/lesson-method-fusion`. A megállapítások forráskód-olvasásból, csak olvasási adatbázis-lekérdezésekből, nyilvános API-próbából és az alább hivatkozott szakmai forrásokból származnak.

## 1. Döntési javaslat

**A forráshoz kötött fogalomjegyzéket megtartanám. A külön tudástérkép-kezelést háttérfunkcióvá tenném. A kapcsolati gráfot csak igazolt felhasználási cél esetén bővíteném. A bankokat megtartanám, de a méretüket és a kérdések kiválasztását a tanítási célhoz igazítanám.**

A jelenlegi rendszer nem egészében fölösleges: a forrásnyilvántartás és az ellenőrzések valós védelmet adnak. Viszont a minden leckére előírt 45 nyílt feladat, 75 kvíz és mind a tíz módszertípus túl merev alapértelmezés. Ezek a régi skill termékdöntései; az áttekintett pedagógiai források nem igazolnak ilyen általánosan kötelező darabszámokat.

A korábbi fúzió visszaadta a régi képességeket, de a mennyiségi előírásokat is átvette. Ezt a kompromisszumot most érdemes javítani: az eszköztár legyen gazdag, az egyes lecke pedig célszerűen válogasson belőle.

Nem javaslok új tanulásmenedzsment-rendszert, gráfadatbázist, korlátlan AI-tutort vagy minden válaszhoz új modellhívást. A következő fejlesztés értéke a meglévő részek összekötése és a szükségtelen újragenerálás csökkentése legyen.

## 2. Ellenőrzött helyzetkép

### 2.1. Tudástérkép, fogalomjegyzék és forrásvédelem

- A `knowledge_maps` tárolja a forrásszöveget, tárgyat, évfolyamot és a feltöltés azonosítását. A `km_concepts` tartalmazza a fogalmat, definíciót, forrásidézetet, forráshelyet és fontosságot. Ez használható tartalmi szerződés, nem puszta grafika. Forrás: `source/shared/schema.ts:587`, `source/shared/knowledge-map-schema.ts:50`.
- A lecke és a játékbank fogalomhivatkozásai ehhez kapcsolódnak. A térkép törlését a lecke idegen kulcsa is korlátozza. Egy meglévő térkép törlése ezért nem ártalmatlan listatisztítás. Forrás: `source/shared/schema.ts:679`, `source/server/studio/quiz-export.ts:65`.
- A `relatedIds` kapcsolatokat a rendszer tárolja és API-ban továbbadja. A `source` teljes keresésében nem találtam olyan tanulói megjelenítést, tanítási sorrendet vagy feladatválasztót, amely ezeket feldolgozná. A szerzőnek átadott fogalomlista sem tartalmazza ezt a mezőt. Forrás: `source/server/studio/step-runner.ts:944`, keresés: `rg -n 'relatedIds|related_ids' source`.
- A kapcsolatok a fogalomkinyerés válaszának részei. Nem találtam külön, csak gráféleket gyártó modellhívást. Emiatt a kapcsolatok elhagyása önmagában nem szüntetné meg a fő időigényt.
- Az egylépéses útvonal már automatikusan kezeli a térkép és a vázlat jóváhagyását. Nem volna pontos új fejlesztésként ígérni az egygombos indítást. Forrás: `source/server/studio/one-step.ts:1`, `source/server/studio/lesson-pipeline-routes.ts:317`.
- Már létezik OCR-cache és feltöltésazonosítás. A térkép hash-e a fájlnevet, tartalmat és hatókört is tartalmazza: ugyanannak az oldalnak más fájlnéven vagy más fotóként feltöltése nem feltétlenül találja el a korábbi térképet. Forrás: `source/server/studio/extractor.ts:63`, `source/server/studio/run-extraction.ts:149`.

**Forrásvédelmi korlát:** a szó szerinti idézet egyezése azt bizonyítja, hogy a szöveg szerepel a forrásban; nem bizonyítja, hogy az állítás igaz, illetve hogy a kivonatból semmi nem maradt ki. A gépi kurálás az igazolatlan kulcsfogalmat elutasíthatja, majd a fedettségvizsgálat már nem követeli azt. Forrás: `source/server/studio/auto-approve.ts:29`, `source/server/studio/extractor.ts:195`, `source/server/studio/step-runner.ts:957`. Ez indokolja a kinyerés teljességének külön ellenőrzését és az olvashatatlan kulcsrész látható jelzését; nem indokolja a hibás tartalom automatikus visszaemelését.

### 2.2. Mit mutatott az adatbázis?

A repo `source/.env` fájljában konfigurált adatbázison két `BEGIN READ ONLY` tranzakció futott, lezárásuk `ROLLBACK`. Csak összesített adatokat kérdeztem le, személyes adatot és titkot nem írtam ki. Pillanatkép: 2026-09-10, körülbelül 20:50 CEST.

| Mérés | Eredmény | Értelmezés |
|---|---:|---|
| Jóváhagyott térképek | 13 | A képernyőképen látható lista nem önmagában bizonyít fölöslegességet. |
| Leckéhez kapcsolódó térképek | 10 | Három térképhez jelenleg nincs lecke; ezekről nem bizonyított, hogy törlendők. |
| Fogalmak / kapcsolati mezővel rendelkezők | 255 / 249 | Sok kapcsolat tárolódik, de aktív gráffelhasználót nem találtam. |
| Nem igazolt kulcsfogalmak / elutasított kulcsfogalmak | 27 / 27 | Az elutasítás oka és eredeti forrása külön mintavételt igényel. Nem állítom, hogy mind a 27 tévesen lett kizárva. |
| Studio-leckék / publikált Studio-leckék | 12 / 7 | Ez nem az összes HTML-tananyag darabszáma. |
| Új `experience` adatcsomagot tartalmazó Studio-leckék | 0 | A helyi fúziós fejlesztés és a tárolt tananyagállomány még eltérő állapot. |
| Aktív játékbankrekord / eltérő kérdésszöveg | 183 / 48 | A játékok közötti másolatok nem jelentenek 183 különböző kérdést. |
| Leckéhez és tananyagrekordhoz kapcsolt aktív játékbankrekord | 170 | Létezik tényleges adatkapcsolat, nem csak bankgyártási terv. |
| Mentett fogalmi válaszeredmény | 2 sor, 2 leckénél | Kevés az adat tanulási hatás megállapításához; az eredete lehet teszt is. |
| Pontosan azonos, normalizált című térképcsoport | 0 | A hasonló címekből nem következik tartalmi azonosság. |

### 2.3. Igazolt hiba: tárolt kérdésből nem mindig lesz játszható kérdés

A fúziós kvízséma pontosan három választ kér. A játékbank kiszolgálója pontosan négyet fogad el, más esetben kihagyja a rekordot. Forrás: `source/shared/lesson-experience.ts:18`, `source/server/gameQuizBankService.ts:39`.

| Nyilvános lekérdezés | Aktív DB-rekord | Ebből háromválaszos | HTTP / visszaadott elemszám |
|---|---:|---:|---|
| `/api/games/quiz-bank/block-craft-quiz` | 35 | 9 | 200 / 26 |
| `/api/games/quiz-bank/tsunami-english` | 44 | 9 | 200 / 35 |
| `/api/games/quiz-bank/brain-rot-steal` | 35 | 9 | 200 / 0 |

Az első két éles válasz pontosan megfelel a négyválaszos szűrésnek. A harmadik játék nincs a szolgáltatás engedélyezett játéklistájában; ebből önmagában nem következik, hogy a játék minden adatbázisos kérdése elérhetetlen: a Brain Rot a tananyagok szerinti másik lekérdezést használja. Viszont az is ugyanazt a négyválaszos szűrőt használja, és a Brain Rot kliensében is van ilyen ellenőrzés (`source/client/src/pages/BrainRotSteal.tsx:336`).

A következő javításnak a teljes adatút egyezését kell bizonyítania: **előállítás → tárolás → lekérdezés → játékbeli megjelenítés → válasz → magyarázat → eredmény/jutalom**. Egy kitalált negyedik rossz válasz hozzáfűzése nem elfogadható javítás. A játékoknak közös, ellenőrzött 3–4 válaszos szerződésre vagy a tartalomtípushoz illő megjelenítőre van szükségük.

### 2.4. Merev bankméret, különálló mérés és díszítés

- A régi v7.4 skill 45/15 és 75/25 darabszámot írt elő; a helyi fúziós séma ezt kötelezővé tette. Mind a tíz módszertípus és legalább 11 módszerelem is kötelező. Forrás: `docs/specs/tananyag-keszito-SKILL-v7_4.md:60`, `source/shared/lesson-experience.ts:5`.
- A banképítő hét egymás utáni részt készít: módszerek, három feladatcsomag és három kvízcsomag. Van részenkénti mentés és korlátozott újrapróbálás: ezt meg kell tartani. Forrás: `source/server/studio/experience-builder.ts:25`.
- A korábbi, dokumentált 13 fogalmas próba banképítése és első lektorálása **9 hívást, 566 másodpercet, 106 691 bemeneti és 41 060 kimeneti tokent** igényelt. Ez korábbi mért részfutás, most nem futtattam újra; nem teljes gyártási idő és nem éles átlag. A tanítás előállítása, előző sikertelen próbák és későbbi lektori körök nincsenek benne. Bizonyíték: [korábbi mérési jegyzőkönyv](2026-09-10-lesson-method-fusion-evidence.md).
- A javító az új tanításhoz ismét meghívja a teljes banképítőt. A bank mentésének hash-e az egész tanítási bemenettől függ; egy módosítás szélesebb újragenerálást okozhat, mint amennyit a tartalmi hatása indokol. Forrás: `source/server/studio/structured-improvement.ts:73`, `source/server/studio/experience-builder.ts:27`.
- Az új gyakorlókör véletlenszerűen választ, a szóbeli jelenlétet biztosítja, és helyi böngészőtárba ment. Nem találtam benne korábbi fogalmi teljesítményen alapuló, napok közötti ismétlésütemezést. Forrás: `source/shared/lesson-experience-score.ts`, `source/client/src/lesson-runtime/useExperienceRound.ts:19`.
- Az új nyílt/kvíz kör eredménye nem jut el a régi jutalomvégpontra. A szerveres `gradeProba` a fejezet `check` blokkjait méri, nem az új bankot. Forrás: `source/client/src/lesson-runtime/LessonExperienceView.tsx:34`, `source/server/rewards/grade.ts:47`, `source/server/studio/lesson-routes.ts:147`.
- A hat paletta cím/tantárgy szerinti hash alapján választódik. Ez színváltozatosság, nem önmagában életkori vagy tantárgyi megjelenítési stratégia. Forrás: `source/shared/lesson-experience.ts:66`, `source/server/studio/experience-builder.ts`.

## 3. Mit támasztanak alá a szakmai források?

Az IES gyakorlati útmutatója erős bizonyítékot jelez a kulcstartalom aktív felidéztetésére és a mély magyarázatot kérő feladatokra; mérsékeltet az időben elosztott tanulásra, a kidolgozott példák és önálló feladatok váltakozására, valamint az ábrák és szöveges magyarázat összekapcsolására. Ebből gazdag feladatkészlet és célszerű ismétlés következik, nem minden témánál azonos darabszám. [IES, 2007](https://ies.ed.gov/ncee/wwc/PracticeGuide/1).

Az EEF útmutatójának központi kérdése az, hogyan javítja a technológia a tanítást, a gyakorlást és az értékelést. A több technikai réteg önmagában nem minőségi mutató. [EEF, 2019](https://educationendowmentfoundation.org.uk/education-evidence/guidance-reports/digital).

A gamifikáció metaanalízise átlagosan kedvező tanulási eredményt talált, de a motivációs és viselkedési hatások kevésbé stabilak a szigorúbb vizsgálatokban. Ez indokolja a játékos keret kipróbálását, de nem garantál hatást a WEBSULI-n, és nem igazolja a puszta pontgyűjtésre építést. [Sailer–Homner, 2019/2020](https://link.springer.com/article/10.1007/s10648-019-09498-w).

A PhET általános és középiskolai tervezési útmutatója kevés, mérhető célt, rövid instrukciókat, felfedezést és a megfigyelések megmagyarázását javasolja. Ezt követné a „jósolj → változtass → figyelj → magyarázd el” feladat. [PhET tervezési útmutató](https://phet.colorado.edu/files/guides/TeacherGuide_ActivityDesign_en.pdf).

Ezek stabil, részben régebbi szakmai források. A termékötletek alább tervezési javaslatok; nem ellenőrzött állítások a mai magyar gyermekek egységes ízléséről. A forrásvédelmi adatmodell szükségességét a kód függőségeiből vezettem le; a tanulók által rajzolt fogalomtérképek pedagógiai kutatását nem keverem össze egy háttér-adatmodell értékével.

## 4. Az ajánlott egyszerűbb működés

### Három érthető gyártási fázis

**Forrás megértése → tananyag és szükséges gyakorlatok → ellenőrzött előnézet.**

Ez három felhasználó számára érthető állapot, nem háromra garantált modellhívás. A minőségkapuk maradnak, a modellhívások a feladat mérete szerint alakulnak.

1. **Forrás egyszeri feldolgozása.** Közös forráscsomag: eredeti részletek, fogalmak, bizonyítékok, automatikusan indokolt évfolyam, bizonytalan/kizárt kulcsrész. A meglévő táblák maradhatnak. A teljes kapcsolati gráf opcionális. A kézi térképszerkesztő a részletek közé kerül; az admin alapból a tananyagot és az esetleges tartalmi problémát látja.
2. **A tanítás és a pedagógiai terv összehangolt előállítása.** Rövid anyagnál közös előállítási kör vizsgálandó; hosszú vagy több témájú forrásnál fejezetenkénti bontás. Előbb megfelelő magyarázat és példa, utána a szükséges bank. Külön animációs modellkör csak valódi, tartalmi ábraigénynél. A megbízható megjelenítést újrafelhasználható komponensek adják.
3. **Független tartalmi ellenőrzés és automatikus műszaki próba.** Forrás teljessége, számítások, tanított–kérdezett összhang, válaszmagyarázatok, megjelenítés és bankbekötés. Csak a hibás rész javuljon. A forrás hibáját/hiányát külön jelezze az adminnak. Az előnézet és a visszaállítható alkalmazás maradjon meg.

### Ugyanaz a módszer a három bemeneti úton

| Útvonal | Közös alap | Elkerülhető többlet |
|---|---|---|
| Feltöltés | OCR/dokumentumszöveg, forráshelyek, fogalmi és tanítási ellenőrzés | Már feldolgozott oldal újraolvasása; ugyanazon tanítás teljes újragyártása |
| Javítás | Mentett eredeti és forrás, módosítás hatásának vizsgálata | Változatlan feladatcsaládok, bankok és ábrák újragenerálása |
| Internetes készítés | Kiválasztott forrás URL-je, dátuma, releváns részlete, ellentmondások | Ugyanazon forrás keresése minden egyes szerzői lépésben; forrás nélküli kiegészítés |

A forrásfeldolgozás azonosságát tartalom alapján kell javítani, de a hozzáférési határokat, dokumentumverziókat és módszerverziókat meg kell őrizni. Közel azonos fotó vagy hasonló cím nem jogosít automatikus összevonásra. Új módszerverzió ellenőrizze újra a régi cache felhasználhatóságát.

Az évfolyamot továbbra is a program állapítja meg. Vegyes forrásnál fejezetenként indokolt besorolás/bontás kell; egyetlen nehezebb mellékfogalom ne emelje indokolatlanul az egész anyag nehézségét. Az admin a döntés indokát lássa, ne neki kelljen minden gyártás előtt számot megadnia.

## 5. A bank akkor érték, ha valóban tanít

**Megtartanám a nagy bank lehetőségét, de a teljes bankméret ne legyen minden új lecke megjelenésének előfeltétele.** Egy nagyobb témakörnél a 45/75 is indokolt lehet; egy rövid fogalommagyarázatnál gyakran mesterséges mennyiséget jelentene. Az átállás külön, verziózott módszerdöntés legyen, a régi tartalom olvashatóságának megtartásával.

Az induló készlet méretét fedettségi terv adja: minden lényegi fogalmat tanítsunk, gyakoroltassunk és ellenőrizzünk; a témának megfelelően legyen felidézés és alkalmazás/indoklás is. A fontos tételekhez legyenek valóban eltérő helyzeteket mérő változatok. A kiegészítő készlet akkor bővüljön, amikor ismétléshez vagy új nehézségi szinthez szükséges. Bővítés ellenőrzött háttérgyártásban történjen, ne a gyermek következő kattintása várjon AI-válaszra.

Egy közös, verziózott kérdés ugyanazzal az azonosítóval szolgálhatja a fejezeti gyakorlást, a külön kvízt és a kompatibilis játékokat. A játékok megjelenítési módot adjanak, ne tartalmi másolatot. Külön kezelendő a felismerés, az önálló felidézés, az alkalmazás és a szóbeli indoklás: nem válthatók át automatikusan egymásra.

**Minőségfeltételek minden tételnél:**

- Azonosítható tanítási cél és forrás; a szükséges tudást a lecke előtte ténylegesen megtanítja.
- Egyértelmű feladat, helyes megoldás, indokolt téves válaszok és hozzájuk tartozó érdemi magyarázat.
- A számszerű és tárgyi megvalósíthatóság vizsgálata; hibás forrásból ne készüljön észrevétlenül hibás feladat.
- Szöveges és tartalmi ismétlődések ellenőrzése. A puszta átfogalmazás ugyanahhoz a feladatcsaládhoz számítson.
- Korosztályhoz illő olvasási és kezelési nehézség. Egy értelmezést mérő feladat ne gépelési gyorsaságot mérjen.
- Tényleges elérhetőség és működés a felhasználó játékában, mobilon is.
- Verzióhoz kötött próbálkozási eredmény, segítségkérés és hibaminta. Először a meglévő eredményrendszert bővítsük, ne építsünk külön analitikai platformot.

A következő feladat kiválasztásánál előbb a még nem ellenőrzött kulcsfogalom, utána a korábbi hiba és az esedékes ismétlés számítson; ezek között legyen véletlen változatosság. Egy egyszerű szabályalapú ütemezővel érdemes indulni. Az FSRS későbbi opció a tények/szókincs ismétlésére, nem önmagában logikai tudásmérés.

A nyílt és szóbeli válasz heurisztikus értékelése gyakorló visszajelzés. Ne ezen múljon egyedül a játékhoz jutás, és ne legyen belőle automatikusan hivatalos jegy. A pontozás, a tanulási eredmény és a játékjutalom legyen megkülönböztethető. A fiókos szervermentés és vendégként a helyi folytathatóság külön kezelendő.

## 6. Változatos megjelenés, áttekinthető tanulási út

A Tananyag / Módszerek / Feladatok / Kvíz négy elérési lehetőségét megtartanám. Melléjük nem új kötelező ötödik lapot tennék: a Tananyag lapon lehet vezetett tanulás és teljes áttekintés. A pedagógiai módszerek a megfelelő magyarázat mellett is megjelenhetnek, ugyanabból az adatból; ne kelljen a gyereknek állandóan fülek között keresgélnie.

Téma szerint különbözzön az ábra, az elrendezés és az interakció: geometria — szerkeszthető alakzat; természetismeret — folyamat/felfedező kép; történelem — forrással alátámasztott időrend; nyelv — rövid párbeszéd és hallgatás. A teljes képernyős díszanimáció ne versenyezzen a feladattal. Egy fejezetbe a célhoz illő néhány módszert válasszuk, ne a teljes tízes listát.

Az alábbiak tervezési kiindulópontok, gyermekekkel kipróbálandók; az évfolyam nem azonos az olvasási készséggel, az ízlés pedig nem egységes.

| Korosztály | Javasolt alapmegjelenés | Kis, hasznos interakció |
|---|---|---|
| 1–2. osztály | Rövid képes jelenetek, nagy betűk, egyszerre egy feladat, felolvasás | Mutasd meg, párosítsd, mondd el; opcionális segítő figura |
| 3–4. osztály | Felfedező oldalak, gyűjthető tudáselemek, áttekinthető folyamat | Jósolj és próbáld ki; képes hibakeresés |
| 5–6. osztály | Küldetés vagy műhely, tárgyi ábrák, világos haladás | Paraméter változtatása, magyarázd el a döntésed |
| 7–8. osztály | Érettebb szerkesztés, labor/jegyzet nézet, források és modellek | Érvelés, forrás-összevetés, több lépéses alkalmazás |

A gyerek választhasson visszafogottabb megjelenést és kikapcsolható hangot/mozgást. Ez személyes preferencia, nem feltételezett „tanulási stílus”.

Mobilon a vezetett feladatot kisebb lépésekben kell elrendezni, könnyen elérhető vezérlőkkel, álló és fekvő nézetben. A teljes tudásanyag egyszerre egy telefonképernyőre zsúfolása és az olvashatóság nem teljesíthető együtt. A megoldás a lapozható feladat és a teljes anyag megőrzött áttekintése. Nagyított betűnél vagy nyitott billentyűzetnél a szükséges görgetés megengedhető; tartalom és gomb nem vágható le a görgetésmentesség kedvéért.

## 7. Választható ötletek külső mintákból

| Ötlet | Mit adna a WEBSULI-ban? | Minta és korlát |
|---|---|---|
| E1. Vezetett, interaktív könyv | Magyarázat–példa–rövid próba együtt, teljes áttekintéssel | A [H5P Interactive Book](https://h5p.org/content-types/interactive-book) többoldalas interaktív tananyagot mutat. Tervezési minta; nem javaslok automatikus platformcserét. |
| E2. „Jósolj és próbáld ki” mini labor | Például a háromszög csúcsát mozgatva összehasonlítható a terület; a gyerek indokolja a megfigyelést | [PhET](https://phet.colorado.edu/files/guides/TeacherGuide_ActivityDesign_en.pdf). A mi ábránkat, érintéses és billentyűs kezelését külön kell tesztelni. |
| E3. Döntési történet | Választás után következmény és magyarázat; szövegértéshez, környezeti témákhoz | [H5P Branching Scenario](https://h5p.org/branching-scenario) támogat elágazást, eltérő visszajelzést és pontozást. Csak olyan témában hasznos, ahol a döntés tartalmilag értelmes. |
| E4. Emlékeztető gyakorlás | A korábbi hibák és később esedékes tények/szavak rövid visszakérdezése | [ts-fsrs GitHub](https://github.com/open-spaced-repetition/ts-fsrs), MIT licencű TypeScript eszköz. Nem kell rögtön bevezetni; a helyes bemeneti eredményadat és a fogalmi kötés előbb szükséges. |
| E5. „Itt akadtunk el” tanári nézet | Ne csak összpontot mutasson, hanem problémás fogalmat/kérdést és következő segítséget | [Kolibri kvízriport](https://kolibri.readthedocs.io/en/latest/coach/quizzes.html), [GitHub](https://github.com/learningequality/kolibri). Kérdésenkénti hibákat és próbálkozásokat tesz áttekinthetővé; ötletforrás, nem bevezetendő új rendszer. |

A kész megoldások és a szakmai közösségek működési mintákat adnak. Az általános mobilbarát ígéret nem helyettesíti az adott komponens tesztjét: a [H5P saját ajánlása](https://help.h5p.com/hc/en-us/articles/7505649072797-Content-types-recommendations) is külön kezeli az egyes tartalomtípusok korlátait és a szerzői tartalomból eredő hibákat.

### Játékjutalom

Elsőként a meglévő kuponrendszert kapcsolnám a megbízható új méréshez. Egy elért tanulási cél után a rendszer ajánljon választható, rövid játékszakaszt; a gyerek folytathassa a tanulást is. A jutalmat a szerver a tényleges válaszokból ellenőrizze. A jelenlegi újrajátszási és időkorlátokat meg kell tartani, és legyen visszatérés a leckéhez.

A játék kérdései a tanult fogalmakat gyakoroltassák, a véletlen ügyességi eredmény ne minősítse a tárgyi tudást. A visszajelzés a haladást és a jó stratégiát emelje ki. Alapból nem javaslok kötelező versenyt, sürgető visszaszámlálást vagy megszakított sorozat miatti büntetést. Az eltöltött idő önmagában nem tanulási eredmény.

## 8. Választható megvalósítási csomagok

A bizonyított bankformátum-hibát és a valótlan teljességjelzés kockázatát mindegyik iránynál rendezni kell.

| Csomag | Tartalom | Előny / határ |
|---|---|---|
| A — Kisebb rendbetétel | Bank adatút javítása, háttérbe tett térképlista, látható forráshiány; a jelenlegi darabszámok és tanulási szerkezet maradnak | Kisebb változás. A nagy bankok gyártási idejét és az életkori egyformaságot kevésbé kezeli. |
| **B — Egyszerűbb, egységes tanulási folyamat (ajánlott)** | A + forrásonként újrahasznosítás, hatás szerinti javítás, fedettséghez igazodó bank, tanulási cél alapján kiválasztott módszerek, életkori/tantárgyi megjelenítés, közös mérés és játékjutalom; E1, egyszerű E4, alap E5 | A legtöbb meglévő képesség megmarad; a tényleges használat és a fölösleges generálás a fejlesztés központja. Verziózott szerződésváltást és fokozatos bevezetést igényel. |
| C — B + kísérleti élménymodulok | B, majd E2 mini labor és/vagy E3 döntési történet egy-egy alkalmas témában | Több tartalmi interakció. Több tervezés és böngészős/pedagógiai ellenőrzés, ezért először szűk próba. |

Saját ajánlás: **B**, utána a háromszögek témáján egy **E2 mini labor** kipróbálása. Az E3 későbbi, tantárgyhoz kötött lehetőség. A működő alapokat előbb egységesítsük, és a mért eredmény alapján bővítsünk.

## 9. Hogyan bizonyítjuk, hogy jobb lett?

Választás után külön megvalósítási spec és végrehajtási fájl következik, a repo háromfázisú szabálya szerint. Ezek készítése és a kiválasztott munka végrehajtása közé nem kell újabb általános „mehet”. A mostani dokumentum az irány kiválasztására szolgál.

Kis összehasonlító próba: azonos forrásokból régi/új módszer, több témával és életkori csoporttal. A gyártási összehasonlításnál rögzítendő a cache hideg/meleg állapota, a modellbeállítás, az összes hívás és javító kör; egy szerencsés részfutás nem elég.

Elfogadási célok, még nem teljesített eredmények:

1. A forrás minden tanítható lényegi fogalma megmarad; a vitás/kizárt kulcsrész indoklással látható. Az önkényesen leszűkített fogalomlistára számolt 100% nem teljes forrásfedettség.
2. Minden kérdéshez elérhető a szükséges tanítás és helyes, ellenőrzött visszajelzés. A gyakoroltatott fogalmak és a mért célok egyeznek.
3. Újraindulás, ismételt feltöltés és célzott javítás esetén igazolható, mely kész részeket használta újra a rendszer. A teljes újragyártásnak legyen tartalmi oka.
4. A gyártásnál mérjük az összes időt, hívást, tokenfelhasználást, hibát és adminbeavatkozást. Megtakarítási százalék csak összehasonlító mérés után állítható.
5. A 3 és 4 választ tartalmazó kérdés végigjátszható a kijelölt játékokban; a válasz, magyarázat, fogalmi eredmény és jutalom ugyanahhoz a tételverzióhoz kötődik.
6. Valódi böngészőpróba: mobil álló/fekvő és asztali nézet; hosszú szöveg, nagyítás, képernyő-billentyűzet, hang/mikrofon nélkül is elérhető tartalom. Vezérlő nem kerülhet elérhetetlen helyre.
7. Gyermekekkel végzett, előre meghatározott próba: segítségigény, félreértések és befejezhetőség; majd késleltetett felidézés és új helyzetben alkalmazás. A visszatérés/aktív idő másodlagos adat, nem önmagában pedagógiai siker. A kis próba nem bizonyít univerzális hatásosságot.

Bevezetés: visszaállítható verziók, a régi leckék olvashatósága, először izolált próba. Adatbázis-migráció, tömeges tartalomátírás és éles kiadás nem része ennek a döntés-előkészítésnek.

## 10. Ennek a vizsgálatnak a lezárása

- PASS: célzott forráskód-ellenőrzés, két csak olvasási adatbázis-tranzakció, három nyilvános játékbank-lekérdezés, elsődleges szakmai/termékforrások ellenőrzése.
- FAIL: a bankban tárolt háromválaszos tételek teljes kiszolgálása az ellenőrzött játékbank-adatúton.
- Nem futott új generálás, tanulói hatásvizsgálat vagy új böngészős UI-teszt. Ebben a körben nem változott alkalmazáskód vagy megjelenítés, ezért új lint/build/tesztcsomag nem indokolt; a korábbi eredményeket nem számítom új futásnak.
- Módosított fájl: ez a döntés-előkészítő dokumentum. Éles adatírás, törlés, push, merge és deploy: nincs.

