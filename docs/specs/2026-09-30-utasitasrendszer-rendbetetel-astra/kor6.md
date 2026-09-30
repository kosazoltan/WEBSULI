# VERDIKT: ELFOGADHATÓ

**A v6 az ötödik kör megmaradt döntési hibáját, a H48 útvonalalapú leletelnyomását tervszinten kijavítja.** A mellékelt anyagban további, a végrehajtás előtt újratervezést igénylő döntési szabályhibát nem azonosítottam.

Az elfogadás **a tervre vonatkozik, a §C-V végrehajtási és aktiválási feltételeivel**. Nem jelenti a jelenlegi program helyességének vagy a tervezett javítások elkészültének igazolását.

A megállapítások a mellékelt kód, korpusz és bizonyítékfájlok statikus, illetve számtani ellenőrzéséből származnak. **Új modellhívást vagy tesztfuttatást nem végeztem.**

## KRITIKUS HIÁNYOK

**Új, igazolt, döntési szabály szintjén lefedetlen kritikus hiány nincs.** A korábbi kritikus pontok lezárása:

1. **H48: a kifogásazonosság váltja fel az útvonalegyezést.**  
   **Bizonyítékhely:** U5/H48; `bank-verifier.ts/mergeBankVerifierNotes()`; korpusz: `d6f5d4bc`, `experience.tasks.13`.

   A jelenlegi kód az útvonal alapján elhagyhat nem egyválasztós bank-ellenőri leletet. A v6 ezt már nem engedi: eltérő mezőre vagy állításra vonatkozó kifogás külön bizonyítékkal és lezárási kötelezettséggel megmarad. A stabil tételazonosító, a tartalomváltozat, a `cleared` kizáró feltétele és a két külön hibás regresszió együtt megfelelő döntési szerződést ad.

   **Tervszinten lezárható; a megvalósítás még nem igazolt.**

2. **H49/H50: a részlegesség és a pedagógusi csonkolás már kapott végrehajtási helyet.**  
   **Bizonyítékhely:** `step-io.ts/outlineSectionSchema`, `lektorReportSchema`; U4/H50, U5/H49, §C-V/6.

   A jelenlegi kódban valóban van karakter-, listahossz- és megoldáslista-csonkolás. A v6 az eredeti érték megőrzését, a módosítás jelzését és a részleges ellenőrzés megkülönböztetését előírja. A konkrét pótlási/elutasítási és jelentésmegőrzési eljárás végrehajtási feltétel marad; ehhez nem szükséges új architektúra.

3. **A bizonytalan megoldáseltérés már nem automatikusan tényhiba.**  
   **Bizonyítékhely:** §C-L külön sora; `blind-solver.ts/blindSolutionsPromptBlock()`; §C-V/9.

   A különbségtétel összhangban van a kódbeli újraszámolási utasítással. A H43 bizonytalansága pedig nem zárhat le korábban bizonyított hibát. A közös kapu elsőbbségével együtt ez megfelelő.

**A mellékelt kód és korpusz alapján további, külön döntési kezelést igénylő, tervből kimaradt hibaosztályt nem tudok igazolni.** Ez nem bizonyítja az A1 teljes forrásjegyzékének hiánytalan auditját.

## TÉVES ÁLLÍTÁSOK

### A korábban NEM IGAZOLT tételek új státusza

| Tétel | Döntés a mellékletek alapján |
|---|---|
| **H8: 731k / 830k / 765k bemeneti token** | **IGAZOLT, lektor-lépésenként összesítve.** A nyers látogatási sorok összege rendre **731 366**, **829 642**, **764 851**. |
| **A3: két hételemű sémateszt-kimenet** | **IGAZOLT.** Mindkét csatolt válasz hét elemet tartalmaz, `recall`/`apply` értékekkel. |
| **A3: a teljes szigorúséma-integráció működése** | **Csak részben igazolt.** A teljes elküldött kérés és séma nincs mellékelve; a fájl fejléce közli a beállítást. A tényleges bank- és javítósémák szolgáltatói elfogadása, valamint a tartalékág működése továbbra is **NEM IGAZOLT**. |
| **A4: katalógusbeli alapárak és kapacitások** | **IGAZOLT az OpenRouter mellékelt katalógusadataként**, a táblázat kerekítéseivel. |
| **A4: közvetlen OpenAI/Anthropic/xAI út pontos díjazása és képességei** | Az OpenRouter-katalógusból **NEM IGAZOLT**. Másik útvonal adata nem bizonyítja a közvetlen út szerződését. |
| **A4: OCR 95,4%; 6/900 hamis riasztás; ~14 tartalékhívás; további tesztarányok** | A mostani mellékletekből továbbra is **NEM IGAZOLT**. A korpusz egyes hibajelenségeket alátámaszt, nem valamennyi pontos gyakoriságot és hívásparamétert. |
| **H36/H41 regressziós lefedése** | Továbbra is **NEM IGAZOLT**. A `mapJson()` és az `AUTHOR_BLOCK_CATALOG` korrekciója kódból látható; ez nem helyettesíti a regressziós tesztet. |

**H8 fontos értelmezési korlátja:** ezek látogatásokon át összeadott **lépésszintű** tokenadatok, nem egyetlen kérés kontextusméretei, és nem bizonyítják önmagukban egy konkrét lektormodell számlázott költségét. A három bemutatott futás összes bemeneti tokenjének körülbelül **45,2%-a** tartozik a `lektor` lépéshez.

### A4 árprofilja hiányos: a hosszú bemenet felára kimaradt

**Bizonyítékhely:** `evidence-models-raw.json`, `pricing.overrides`.

A mellékelt katalógus az alábbi külön ársávokat tartalmazza:

| Modell | Bemeneti küszöb | Be / ki / cache-olvasás, USD/M |
|---|---:|---:|
| Luna | 272 000 token | 0,20 / 0,75 / 0,02 |
| Terra | 272 000 token | 4,00 / 18,00 / 0,40 |
| Grok | 200 000 token | 4,00 / 12,00 / 1,00 |

Az A4 számai tehát **alapárként helyesek, teljes árprofilként nem elégségesek**. A cache-írás költségét is kezelni kell. A küszöböt hívásonként kell vizsgálni, nem a `visits.tokensIn` összegére alkalmazni.

Hogy a bemutatott futásokban mely közvetlen hívásokra milyen felárat számláztak, **NEM IGAZOLT**.

### További, nem blokkoló pontatlanságok

- **H2 javított gyökérokleírását a kód alátámasztja.** Az ÉS/VAGY szerkezet szerepel az utasításokban; a sorrendfüggetlen illesztés és a globális tagadáskezelés a pontozókódból következik. H1(a) „a bank nem ismeri a pontozót” rövidítése helyett ott is **hiányos és ellentmondásos pontozási szerződés** szerepeljen.
- **A1 teljes bejárási állítása továbbra is NEM IGAZOLT.** A forrásjegyzék és az egyes hivatkozások nem bizonyítják minden felsorolt fájl teljes ellenőrzését. H11 az észlelt, ismeretlenként besorolt hibák emberi feldolgozását segíti; a némán elnézett hibák felismerését nem garantálja.
- A mellékelt `shared/lesson-skill.ts` **15 `SKILL_RULES` bejegyzést** tartalmaz, nem 14-et.
- H43-nál pontosabban **hiányzó jobb oldali szóhatárról** van szó: a `staleFormProblems()` reguláris kifejezésében bal oldali határvizsgálat van.

## KOCKÁZATOK

### A végrehajtási fájl kötelező feltételei

A **§C-V/1–13 kötelező**, és az ott kimondott elsőbbségek érvényesek. Ezeken belül különösen az alábbi megvalósítási részleteket kell rögzíteni:

1. **H48 bizonyítékmegőrzése a teljes adatútra vonatkozzon, ne csak az utolsó összefésülésre.**  
   **Bizonyítékhely:** `bank-verifier.ts/parseBankVerifierErrors()`.

   A jelenlegi parser:
   - a második, azonos útvonalú hibajegyet a `seen.has(e.path)` miatt eldobja;
   - a jegyzet szövegét 600 karakterre vágja.

   Ezért önmagában a `mergeBankVerifierNotes()` átírása nem elég. A kifogásoknak a parseren és a tároláson is veszteség nélkül át kell jutniuk; a megjelenítés lehet rövidebb.

   A stabil azonosítók kezelésénél figyelembe kell venni az `experience-builder.ts` jelenlegi, csomaghashből és sorszámból újraképzett azonosítóit is. Egy átazonosítás nem számíthat hibalezárásnak.

2. **A részlegességjelző mellé konkrét eljárás kell.**  
   **Bizonyítékhely:** U4/H50, U5/H49, §C-V/6.

   - A `solutionsTruncated` után legyen azonosító szerinti pótlás a közös kereten belül, vagy a teljes ellenőrzést igénylő jelölt elutasítása.
   - A pedagógusi `raw`/`clamped` adatok megőrzése mellett rögzíteni kell, mi kerül tovább a szerzőnek. A jelentésében megsérült kulcskifejezés nem használható pusztán azért, mert a csonkolás naplózott.
   - Egy díszítő mező elhagyása vagy biztonságos helyettesítése nem indokol automatikusan új modellhívást.

3. **A §C-L „figyelmeztetés” nem kerülheti meg a közös kaput.**  
   Egy eldöntetlen vakmegoldás-eltérés nem bizonyított hiba, de nem is igazolás. A végrehajtási állapotgépben különüljön el:
   - az ellenőrzés teljessége;
   - a tartalmi bizonytalanság;
   - a bizonyított, még nyitott kifogás.

   A kivételek utáni újramérés és a **95% fedettség ≠ 95% tényhelyesség** megkülönböztetés maradjon változatlan.

4. **A pontozási, kompatibilitási és gyorsítótár-feltételeket valódi viselkedési tesztek igazolják.**  
   A §C-V szerinti pontos törtkezelés, műveleti állapot, részfeladat-hozzárendelés, szinonimánkénti egyszeres számlálás, régi kliens és archivált prompt tesztelendő. A teljes DB-prompt pillanatképe és a régi futás explicit migrációja nem helyettesíthető verziószám-ellenőrzéssel.

5. **A szigorú séma és az új ellenőrzők nem igazolhatják önmagukat.**  
   A sémateszt két válasza egyenként **három különböző kérdést ismétel hét elemre**. Ez közvetlen bizonyíték arra, hogy a darabszám teljesülése nem jelent megfelelő bankcsomagot. A helyi duplikátum-, tartalmi és pontozási ellenőrzés maradjon meg.

   A rendereltábra-ellenőrző külön hívása sem bizonyít független hibázást; a §C-V/12 szerinti felismerési mérés szükséges.

### A három legerősebb várható költségcsökkentő lépés

| Lépés | Bizonyíték | Tervbeli lefedés |
|---|---|---|
| **Változatlan bankcsomagok megőrzése** | `unitTeaching()` teljes fejezetet hashel; célzott szerzői módban a jelenlegi kód teljes leckét is elfogad | U2/H19, U4/H20/H39, B0 külön kulcsai |
| **Bukott bankkísérletek és tartalékhívások csökkentése** | Korpusz: `sample_score`, `bank_cardinality`, `duplicate_question`, javítási hatókörhibák | U1/U2: pontozási szerződés, szigorú séma, egységes kérdéskulcs, hibakódhoz kötött javítás |
| **Ismételt ellenőrzések és ellenőrzői bemenet csökkentése** | H8 most igazolt tokenösszegei; `buildLektorPrompt()` teljes leckét és térképet küld | U5/C5/H37, U6/C10 |

**Az összegszerű sorrend és a nettó megtakarítás NEM IGAZOLT.** A mérésbe bele kell számítani az új kéréskivonatolást, a képi ellenőrzést, a cache-írást és a bukott próbákat is. H40 megtakarítása helyesen külön marad.

### A3 és A4 szakmai értékelése

- **A3 mintái helyes irányúak, de nem elégségesek önmagukban.** A szolgáltatói séma alakot korlátoz; a referencia igazságát, a kérdések különbözőségét és a rubrika igazságosságát nem bizonyítja.
- **A4 útvonalankénti kezelése és korlátozott újrapróbája megfelelő.** A profilok optimális volta és bármely modellcsere előnye továbbra is **NEM IGAZOLT**.
- A formalizálható aritmetikánál a megengedett kifejezésnyelv **pontos determinisztikus kiértékelése** erősebb ellenőrzés, mint további modellvélemény. U1 ezt a referenciára is előírja. Szöveges értelmezést és a kért köztes állapot azonosítását ez önmagában nem old meg.
- H1/H2 teljes lezárása a megmaradó globális tagadásheurisztika miatt nem állítható; ezt a terv helyesen dokumentálja.

## SORREND-MEGJEGYZÉS

**B megírása és lektorálása előbb, majd a működésváltozó szövegek és társ-kódjuk közös aktiválása szakmailag helyes.**

Különösen csak társ-kóddal működik:

- a típusos válasz és a generált pontozási szerződés — **U1/U2**;
- a tanári pontjegyzék és a `gaps` adatút — **U3**;
- a módhelyes szerzői javítás és csonkoláskezelés — **U4**;
- a teljes ellenőrzési állapot, kifogásmegőrzés és képi ellenőrző — **U5**;
- H43 új szemantikai szabálya — **U6**.

A §C-V/8 elsőbbségi szabályai feloldják az U0 szerepképzésének, az U3/U4 `gaps`-függőségének és H53 aktiválásának korábbi rövidítéseit. B6–B8 tényleges működéshez igazított véglegesítése helyes.

## KONKRÉT MÓDOSÍTÁSI JAVASLATOK A TERVHEZ

**Újabb teljes tervváltozat nem szükséges.** A következők szerkesztési pontosításként, illetve a végrehajtási fájl kötelező tartalmaként rendezhetők:

- H8 kapjon pontos futásazonosítókat, egész tokenértékeket és **„lektor-lépés összesített bemenete”** megnevezést.
- A3 különítse el a bemutatott hételemű próbát a tényleges bank- és javítósémák még igazolandó integrációjától; a duplikált próbakimenet kerüljön regressziós példának.
- A4 tartalmazzon **útvonalhoz kötött, sávos díjazást**, cache-írási költséget és külön jelölést a katalógusadatokra, illetve saját mérésekre.
- A H48-regresszió fedje a **parser → tárolás → összefésülés → újrahívás → `cleared` → kapu** teljes adatutat, azonos ellenőr két külön kifogásával és tételátrendezéssel is.
- H49/H50 esetén legyen konkrét pótlási/elutasítási, illetve jelentésmegőrzési eljárás.
- A1 bejárási állítása kapjon ellenőrizhető auditnyilvántartást, vagy maradjon **NEM IGAZOLT**; a `SKILL_RULES` darabszámát és a fenti kisebb megfogalmazásokat javítsák.
- A végrehajtási fájl őrizze meg a nyitott és részlegesen javított hibák státuszát; teszt, kapu vagy minimum gyengítése nem használható lezárásként.

**Összegzés: a v6 végrehajtásra elfogadható. H48 már megfelelő döntési szabályt tartalmaz; a fennmaradó pontok bizonyítékkezelési, megvalósítási, mérési és aktiválási feltételek, nem újabb áttervezési indokok.**