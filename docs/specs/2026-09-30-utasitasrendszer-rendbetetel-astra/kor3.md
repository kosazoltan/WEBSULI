# VERDIKT: JAVÍTANDÓ

**A fő irány már megfelelő, de a C13 kompatibilitása, az ellenőrzői leletek megőrzése és néhány új szabály még nincs lezárva.**

**Tervszinten rendben kezelt korábbi kifogások:** a hibás C9-heurisztikák törlése A3-ból is; a csoportduplázás elvetése; közös `questionKey`; H39 konkrét hatókörőrzése; csomagonkénti oral/written; H32 hibás `truths`-hosszának elkülönítése; H42 és H45–H47 felvétele; H37 kontextusfüggései; H40 megtakarításának kizárása; U0 előrehozása. **A `requiredDistinct`, B0, C13, C14 és H43 csak részben megoldott.**

## KRITIKUS HIÁNYOK

### 1. C13: a válaszmodell még nem határozza meg a helyes pontozást

**Hely:** B1, U1, F; korpusz `351e14cc`, `68a5b500`, `222202f1`; `openTaskSchema`.

- A `set` nem helyettesít részfeladathoz kötött eredménylistát. A négy művelet eredményeinek felcserélése ugyanazt a halmazt adhatja, mégis hibás válasz. Kell részfeladat-azonosító és eredményenkénti mértékegység.
- Az értékazonosság továbbra sem azonos az elvárt válaszalakkal: „egyszerűsített közönséges törtet” kérve a `0,5` nem teljesíti a formai követelményt, bár értékazonos az `1/2`-del. F jelenlegi általános szabálya ezt nem különíti el.
- A `requiredDistinct.from` elemeinek azonossága nincs meghatározva. Két szinonima nem két példa; a korpusz **két fás és két lágy szárú** példájához pedig külön kategóriakvóták szükségesek.
- **Új hibás heurisztika:** `minWords = a minta szószámának fele`. Egy magyarázó minta hosszából nem következik a legrövidebb teljes válasz hossza. Egy egyszavas mintánál a fél ráadásul nem felel meg a jelenlegi egész, legalább 1 értékű sémának.

A típusos érték és a régi `required/minWords/needsSentence` közötti elsőbbséget is rögzíteni kell. A típusos referencia **önmagában a referencia igazságát nem bizonyítja**.

### 2. A „teljes adatút” még nem kompatibilitási szerződés

**Hely:** U1–U2, B0; `openTaskSchema`, `evaluateOpenAnswer()`, `role-skills.ts`, `support-skills.ts`.

A már megnyitott régi kliens nem kapja meg automatikusan az új közös pontozót. A mellékelt régi séma nem kezeli az `answer` és `requiredDistinct` mezőt, a régi értékelő kizárólag a `required` alapján pontoz. **A toleráns beolvasás ezért nem elegendő: megjeleníthető tananyag mellett is elveszhet az új pontozási követelmény.**

Hiányzik:
- pontozási/adatformátum-verzió és a régi kliens kötelező frissítési vagy elutasítási szabálya;
- a régi és új normalizáló külön útja, ha a régi leckék pontozása valóban változatlan marad;
- az új futásban újrahasznosítható régi bankcsomagok feltétele.

**B0 javult, de részleges:** a szerepskill verziófeloldása konkrét, a támogató skilleké, javítóskillé és DB-s promptfelülírásoké nincs ugyanígy végigvezetve. A globális csomagverzió helyesen nem újragenerálási kulcs; ettől még az adott kimenet **séma- és pontozási szerződésének változása** nem lehet pusztán naplóadat.

### 3. H32 javítása után is eltűnhet bizonyított bankhiba; H24 bemeneti hiánya megmaradt

**Hely:** U5; `bank-verifier.ts/mergeBankVerifierNotes()`, `buildBankVerifierPrompt()`.

Két bizonyított, külön kezelendő ág:

```ts
const taken = new Set(lektorNotes.filter((n) => n.blockPath) ...)
```

Ez **nem csak a blokkoló** lektori jegyzetek útvonalát foglalja le. Egy ugyanarra az útvonalra mutató figyelmeztetés elnyomhatja a bank-ellenőr nem egyválasztós tartalmi hibáját.

Továbbá `blocking=false` esetén a nem egyválasztós hibát a függvény `bank_check_late` altípusra minősíti vissza. **A javítási keret elfogyása nem cáfolja a hibás mintát vagy rubrikát.** U5 ezt nem módosítja; a teljes publikálási következmény a mellékelt hívóhelyekből **NEM IGAZOLT**.

H24 második fele sincs lezárva: a bank-ellenőr továbbra is címet, évfolyamot, fejezetcímet, tételeket és vak megoldásokat kap, **a fejezet tanítását/forrásbizonyítékát nem**. A hiányzó kontextus hash-be vétele nem pótolja annak átadását.

### 4. U5-ben két bizonyítékmegőrzési rés maradt

**Hely:** `step-io.ts/lektorReportSchema`; U5/C5.

- **Újonnan kiemelendő:** a lektori `solutions` lista továbbra is némán `slice(0, 40)` csonkolást kap. H45 kötelező kulcsai és a `reviewedAll: true` ezt nem oldják meg. A csonkolás bizonyított; végső publikálási hatása **NEM IGAZOLT**.
- Az SVG feliratai, számai, elemszáma és képaláírása nem őrzik meg a nyilak irányát vagy a térbeli kapcsolatokat. U5 ezt egy „ábra-kapura” bízza, de annak szemantikai ellenőrzési szerződése nincs megadva. **A térbeli helyesség tényleges lefedése NEM IGAZOLT.**

Ez különösen fontos, mert F minden ábraváltozást kizárna a bankkulcsból. Ez csak akkor biztonságos, ha a bank nem függ az ábra megváltozott tanítási tartalmától.

### 5. H43: a szóhatár és a fogalomra szűkítés még mindig helyes mondatot tilthat

**Hely:** U6/C16; `repair-skill.ts/staleForms()`.

A függvény továbbra is az eltűnt **szót**, nem a hibás állítást azonosítja. A javított holdnaptár-fogalom szövegében például:

> „Nem a Föld változását, hanem a Hold változását figyelték.”

A `fold` szó mindkét szóhatárral, a megfelelő fogalom környezetében is jelen van. A tervezett feltétel tehát továbbra is blokkolhat helyes helyesbítő magyarázatot.

**A „földrajz” téves találatát kezeli; a kontextus nélküli szótiltás egész hibaosztályát nem.**

### 6. C14 és B1 között fennmaradt egy végrehajthatatlan követelmény

**Hely:** B1/author, U3, F; `instructionConceptsFrom()`.

B1 a pontjegyzék **minden pontjának kimondását** követeli, miközben U3 megengedi a forrásból nem igazolható pontokat is. Ezek tanítását nem szabad előírni.

A második kivonatolás jó ellenőrzés, de az eltérések feloldása nincs meghatározva. A „négy állapot” sincs felsorolva, és a csonkolásjelzés utáni eljárás sem egyértelmű. **A hosszabb keret nem garantál teljes feldolgozást.** A teljes eredeti kérés megőrzése és a feldolgozatlan rész külön állapota szükséges.

## TÉVES ÁLLÍTÁSOK / MOST ELDÖNTHETŐ TÉTELEK

- **Limitpolitika — IGAZOLT:** `core ≥ 0,95`, `supporting ≥ 0,8`; ismeretlen fogalomazonosító kizáró ok. A feloldható banktétel/check/ábra kivehető; a nem kivehető `coverage_gap` visszaminősíthető. **Ez nem általános 95%-os helyesség.** H42 pontosan igazolt. A 45/75 külön ellenőrzés; minden publikálási út együttműködése továbbra is **NEM IGAZOLT**.
- **Skill-teszt — IGAZOLT:** szerepskill eszközleírásokkal együtt **5200 karakternél rövidebb**, lélek **1800-nál rövidebb**. A **4800-as korlátot ez a fájl nem bizonyítja**. Tesztgyengítés módosítási különbség nélkül **NEM IGAZOLT**.
- **H4 megfogalmazása továbbra sem pontos mindhárom kulcsra:** a `normalizeAnswer()` eldobja a pluszt, megtartja a numerikus mínuszt; a másik két hely `[\p{P}\p{Z}]` szűrője megtartja a `+` jelet, viszont törli az ASCII `-` jelet. A közös kulcs jó javítás, az általánosított gyökérokleírás hibás.
- **H39 „nem nézi a címet”** csak fejezetcímként igaz: a `checkAnimatorResult()` a leckeszintű `title` mezőt már ellenőrzi.
- H8 lektorra bontott tokenértékei, H36/H41 regressziós lefedése, valamint A4 ár-, képesség- és élőpróba-állításai a mostani mellékletekkel sem váltak függetlenül igazolttá. A3 mintái elvként megfelelőek; a helyi minőségjavulást nem bizonyítják.

## KOCKÁZATOK

- U6 a limitdöntési táblára hivatkozik, de a tábla nincs a tervben. Az eltávolítás utáni ellenőrzésbe a **tíz módszertípus, két különböző kapukérdés, 15/25 kör és csomagonkénti fogalmi/recall/apply követelmények** is tartozzanak, ne csak 45/75 és oral/written.
- A szöveges válaszok globális tagadáskezelésének megtartása **ismert maradó pontozási hiba**, nem pusztán dokumentációs korlát. H1/H2 teljes lezárását erre nem szabad állítani.
- A `reviewedAll` önbevallás nem ellenőrzési teljességbizonyíték; legalább a kért és visszaadott ellenőrzési egységek egyezését a program mérje.

**A három legerősebb költségcsökkentő jelölt változatlan:**
1. Bank-újragyártások elkerülése — U2/U4 lefedi, B0 kompatibilitása még részleges.
2. Bukott csomagkísérletek és tartalékmodell-hívások csökkentése — C8/C13 jó irány, a fenti pontozási hiányok lezárásával.
3. Ismételt ellenőrzési bemenet és hívások csökkentése — U5/U6 lefedi, csak bizonyítékvesztés nélkül.

Az összegszerű sorrend **NEM IGAZOLT**.

## SORREND-MEGJEGYZÉS

**U0 előrehozása helyes; B megtervezése előbb, társ-kóddal közös aktiválása szakmailag megfelelő.**

Két függőség még átvágja az egységhatárokat:
- U2 új válaszszerződésével együtt kell aktiválni az azt értő bank-ellenőri és lektori utasításokat, nem csak U5-ben.
- U3 pontjegyzékével együtt kell aktiválni a hozzárendelést végző pedagógusi promptot, nem csak U4-ben.

Az ábratervező, kivonatoló, OCR és több támogató skill új változatának aktiválási helye sincs egyértelműen hozzárendelve.

## KONKRÉT MÓDOSÍTÁSI JAVASLATOK A TERVHEZ

- C13: részfeladathoz kötött válaszok, formai követelmény, kategóriakvótás különbözőség, egyértelmű pontozási elsőbbség; a fél mintahossz szabályának törlése.
- Kötelező pontozásverzió és régi kliensre vonatkozó elutasítás/frissítés; B0 teljes verziófeloldási és újrahasznosítási táblája.
- U5: figyelmeztetés ne nyomhasson el tényhibát; körlimit ne minősíthesse azt automatikusan ártalmatlanná; H24-hez tényleges bizonyítékbemenet.
- Lektori csonkolás helyett jelölt részlegesség; ábrákhoz konkrét kapcsolati vagy rendereltábra-ellenőrzés.
- H43-ban puszta szóelőfordulás helyett a hibás állítás fennmaradása legyen a javítás tárgya.
- C14 négy állapotának, eltérésfeloldásának és túlméretes kéréskezelésének meghatározása; csak igazolt pont tanítása legyen kötelező.
- A limitdöntési táblát és a B-tételek aktiválási függőségeit még a kódolás előtt mellékeljék.