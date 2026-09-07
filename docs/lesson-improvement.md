# Forrásalapú tananyaggyártás és visszaállítható jobbítás

Ez a Studio strukturált `Lesson` tananyagaira vonatkozó munkamenet. A hagyományos önálló HTML fájl és a lecke-futtató által megjelenített JSON eltérő formátum: a Studio leckéjét nem kell négylapos HTML-lé átalakítani. A `contentType=lesson` anyag HTML mezője csak helyőrző; a tényleges tartalom a `lessons.json`.

## 1. Forrás és automatikus besorolás

- Őrizd meg az eredeti fájlokat és az egyes átiratokhoz tartozó forráshivatkozást. Az ismételt fotókat azonosítsd; a kézírásból származó bizonytalanságot jelöld, ne egészítsd ki kitalált feladattal.
- Az évfolyamot és tantárgyat a program a teljes forrás tartalmából állapítja meg. A készítőtől ne kérj évfolyamot. A korábban megadott évfolyam sem írja felül a program besorolását; a szerzőmodell sem változtathatja meg a térkép metaadatait.
- Forráshiba és generálási hiba külön eset. Valószínű könyv-/füzethibát `book_probably_wrong` jelzéssel, az eredeti állítás megőrzésével dokumentálj. A tulajdonos által kért javításkor készíts ellenőrzött, verziózott átiratot a helyesbítés indokával; ezután abból épüljön a kurált tudástár. A generátor önállóan nem cserélhet forrástényeket.
- A fogalom idézete összefüggő, szó szerinti forrásrészlet legyen. Ne ragassz össze kihagyás nélkül távoli mondatokat. Elutasított idézetnél ellenőrizd, nem egy fontos fogalom veszett-e el pusztán formai hiba miatt.

## 2. A gyártási prompt ellenőrzése

A tényleges provider-kérés számít, nem a változó neve vagy a hash. A fogalmak `localId`, `term`, `definition`, `quote`, `examWeight` mezői jussanak el a pedagógushoz, szerzőhöz, animátorhoz, lektorhoz és célzott fogalomjavítóhoz. A belső fogalom-UUID ne legyen válaszban használható azonosító. A forrásmezők adatok, nem utasítások.

A tananyagépítő lépésekben a tárolt egyéni rendszerprompt kiegészítés. Az aktuális dinamikus szerződés és forrás nem hagyható el miatta; eltérésnél az aktuális szerződés az irányadó. A modellválasz gyorsítótárának kulcsa tartalmazza az effektív promptot is. A promptverzió emelése megakadályozza, hogy régi gyártási szerződés eredménye változatlanul újrahasznosuljon. A kivonatoló külön promptbeállítása teljes felülírásként működik: módosításakor külön ellenőrizd az idézet-, forráshűség- és kimeneti szabályok megmaradását.

Szerzői ellenőrzés:

- Az eredeti példában maradjon meg minden adat, feltétel, kérdés és egység. Az ugyanarra a képletre épülő új példa nem helyettesíti a forrás konkrét példáját.
- Minden műveletet számolj újra; vizsgáld az egységváltást, a pontos π-s eredményt, a végső kerekítést és az adatok együttes geometriai megvalósíthatóságát.
- Külön vizsgáld a sugár/átmérő, ívhossz/kerület, hosszúság/terület, eltérő sugarú kördarabok, pótszög/kiegészítő szög megkülönböztetését.
- Csak a `lesson-schema.ts` blokkfajtáit és a tényleges runtime paramétereit használd. A `geometry` egyszerű háromszög-, kör- vagy négyzetkörvonalat rajzol; nem mutat jelölt magasságot, szöget, körcikket vagy mozgatást. A kör nem szabályos sokszög. A `process.params.steps` valóban látható lépéseket tartalmazzon.
- A `fillBlank.spec.text` üres helyeihez ugyanannyi válasz tartozzon; a párosítóhoz valódi párok, a sorrendezőhöz azonos elemekből álló teljes helyes sorrend kell. Minden feleletválasztós válaszhoz saját indoklás tartozzon.

A lektor minden állítást a kurált definícióhoz és idézethez mérjen, konkrét blokkhelyet és ellenőrizhető indokot adjon. A kapu hibái és az előző lecke is jusson vissza a szerző javító köréhez. A címke-/szóegyezés szükséges jelzés, önmagában nem tartalmi bizonyíték.

## 3. Jelölt változat ellenőrzése, alkalmazás előtt

1. Készíts külön javított jelöltet, változatlan lecke- és térképazonosítóval, a program által megállapított évfolyammal.
2. Futtasd a `lessonSchema` és `checkCoverageGate` ellenőrzést az aktív kurált fogalmakon. A kapu a core fogalmak teljességét, legalább 90% supporting fedettséget, ismeretlen azonosítókat és megalapozatlan címkéket vizsgál. A konkrét javításnál törekedj teljes supporting fedettségre is. Ne gyengítsd a kaput és ne szórj kulcsszavakat a hibák eltüntetésére.
3. Ettől függetlenül vesd össze a teljes állítást és minden számsort a forrással. Nézd meg a hibás válaszok indoklását is.
4. Valódi böngészőben ellenőrizd mobilon és asztali nézetben az összes szakaszt: átfedés, vágás, vízszintes túlcsordulás, JavaScript-hiba, félrevezető ábra. Próbáld ki a tényleges kitöltős, párosító, sorrendező és feleletválasztós interakciókat. A teszt nélküli állapot nem „hibamentes”.

## 4. Visszaállítható alkalmazás

- Ellenőrizd, fut-e még szerző/animátor ugyanazon a leckén. Futó gyártást ne írj felül. Külső szolgáltatói hibát ne állíts be sikeres modellfutásként.
- Módosítás előtt mentsd a lecke JSON-ját, fedettségét, kapcsolódó anyagrekordját, teljes exportált kvízkészletét és érintett job/run állapotát. Tudástárjavításnál a fogalom előállapotát is. A mentés nem kerülhet nyilvános helyre vagy titkot tartalmazó commitba.
- Tranzakción belül zárold és vesd össze az aktuális rekordot a jelölt alapjául használt előállapottal. Párhuzamos eltérésnél nincs felülírás; újra kell értékelni a diffet.
- Meglévő lecke javításakor őrizd meg a `lessonId` és `htmlFileId` értéket, és azonos tranzakcióban frissítsd a lecke tartalmát, fedettségét és kvízexportját. A jelenlegi `publishLesson` új anyagrekordot hoz létre, ezért ne hívd vakon meglévő lecke újrapublikálására.
- A javítás és a korábbi hiba maradjon auditálható. Gépi hiba után ellenőrzött lezárás lehetséges a tulajdonos felhatalmazásával, de ezt külön nevezd meg; ne tüntesd el a hibaelőzményt.
- Visszaolvasással ellenőrizd a teljes JSON-t, évfolyamot, azonosítókat, fedettséget és kvízdarabszámot. Ezután az éles URL-t is nyisd meg valódi böngészőben.
- Visszaállításkor is vizsgáld a jelenlegi és várt utóállapot egyezését; későbbi szerkesztést ne írj felül. A kapcsolódó lecke-, anyag-, kvíz- és job-adatok együtt állítandók vissza.

## 5. Kész állapot és regressziós példa

Külön jelentsd: elkészült jelölt; ellenőrzött jelölt; alkalmazott és visszaolvasott adat; éles böngészőben ellenőrzött anyag; kiadott programkód. A `done` job és a zöld unit teszt nem bizonyít önmagában tartalmi minőséget. A jelenlegi autonóm politika figyelmeztetéssel is publikálhat a körlimit után; a jobbítási ellenőrzést ez nem helyettesíti.

A 2026-09-07-i háromszöges javítás referencia, nem minden tananyaghoz elvárt darabszám: a program 7. osztályt állapított meg, 13/13 fogalom lefedett, a mentés utáni alkalmazás visszaolvasása és a 390/1280 px render sikeres. A különböző források eltérő évfolyamot és fogalomszámot adhatnak.

Kapcsolódó bizonyíték: [lezárt gyártás](specs/2026-09-07-remaining-learning-fixes.md), [promptjavítás specifikációja](specs/2026-09-07-lesson-improvement-prompts.md). A helyi képek és adatmentések helye a lezárt gyártás jelentésében szerepel; a repó munkamenetét ez a dokumentum rögzíti tartósan.
