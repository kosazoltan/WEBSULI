# VERDIKT: JAVÍTANDÓ

**Lényegesen javult, de a C9 továbbra is helyes rubrikákat utasíthat el, a B1 új pontozási hibát ír elő, és a most mellékelt limitpolitika új, lefedetlen hibát mutat.**

**Tervszinten megfelelően kezelt korábbi kifogások:** a jelentésmegőrző szövegjavítás; külön teljes- és javítóséma; hibakódhoz kötött javítási jogosultság; a vakmegoldás részlegességének megőrzése; kötelező tételes bankítélet; új, bizonyított tényhiba jelenthetősége; az `unknown` megfigyelések megtartása; közös B+C élesítés; szélesebb mérőkészlet és költségmérés.

**Csak részben kezelt:** C9, típusos pontozás, tanári pontjegyzék, verziókompatibilitás, ellenőrzési függőségek, hatókörőrzés és ábraellenőrzés. A H40 külön tervbe helyezése hatókördöntés, **nem a korábbi megbízhatósági kifogás megoldása**.

## KRITIKUS HIÁNYOK

### 1. A „C9 újratervezve” továbbra sem helyes determinisztikus hibafeltétel

**Hely:** U2/C9; A3 rubrika-sora; korpusz `job 5e6384cd`.

Az új számfeltétel szerint hibás az alternatíva, ha száma sem a kérdésben, sem a mintában nem szerepel, és nem értékazonos. Ez továbbra is kizárhat más helyes válaszokat.

**Ellenpélda:** „Mondj egy 10-nél kisebb pozitív páros számot!” Minta: `2`; elfogadható alternatívák: `2, 4, 6, 8`. A `4, 6, 8` helyes, mégis fennakadna. Ugyanez a hibaosztály látszik a korpusz több megengedett négyjegyű számánál.

A „helyes kifejezés csonkja” sem egzakt hibakritérium: a `Nílus` és `Nílus folyó` nem ellentétes állítás. A jelentést megfordító elhagyás és az ártalmatlan rövidítés megkülönböztetése nincs specifikálva.

**Ráadásul A3-ban szó szerint megmaradt mindkét elvetett általános szabály.** A javítási jogosultság rendben van; az azt kiváltó hibadetektor nincs.

### 2. A B1 új szabálya egyetlen példát kettőnek pontozna

**Hely:** B1/bank; `lesson-experience-score.ts`, `conceptHit()`, `evaluateOpenAnswer()`.

> „ha a kérdés 2 példát kér: egy csoport az összes elfogadható példával, kétszer”

A pontozó nem fogyasztja el az egyszer már felhasznált találatot. Például:

```ts
required: [["alma", "körte"], ["alma", "körte"]]
sample: "alma körte"
minWords: 1
needsSentence: false
```

Az **„alma” önmagában teljes pontot kap**: ugyanaz a találat mindkét csoportot teljesíti.

Ehhez különböző elemek számát mérő válaszszerződés kell, nem csoportduplázás.

A C13 a törthibára jó irány, de nem zárja le:

- a több eredményt és mértékegységet kérő feladatokat — például `job 351e14cc`, `68a5b500`;
- a szöveges válaszok globális tagadáskezelését — `hasUnexpectedNegation`;
- az `expression` értékazonosságának és az elvárt megoldásalaknak a különbségét.

Ezek kezelését a `number/fraction/expression, value` felsorolás önmagában nem határozza meg.

### 3. A limitpolitika most eldönthető — és van benne új hiba

**Hely:** `limit-policy.ts`, különösen `limitAcceptance()`.

**Most igazolt:**

| Döntés | Tényleges szabály |
|---|---|
| Körlimites fedettség | core ≥ **95%**, supporting ≥ **80%** |
| Tanítási `coverage_gap` | Nem kivehető elemre mutatva visszaminősíthető |
| Más, nem kivehető blokkoló | A `splitLimitBlockers()` ténybeli csoportjába kerül |
| Banktétel, check, ábra | Létező, feloldható útvonallal kivehetőnek minősül |
| Ismeretlen fogalomazonosító | A `limitAcceptance()` elutasítja |

Ez **nem 95%-os általános helyességmérés**, és nem 5%-os bankhiba-engedmény. A 45/75 minimum külön követelmény a `publicationBankProblems()` szerint. Az összes publikálási hívóhely helyes együttműködése továbbra is **NEM IGAZOLT**.

**Új konkrét hiba:**

```ts
if (keep.length === block.coversConceptIds.length || !keep.length) return block;
```

Ha egy blokk valamennyi címkéje megalapozatlan, a függvény **változatlanul meghagyja mindet**. Például 20 core fogalomból 19 megalapozottan fedett, a huszadik kizárólag megalapozatlan címkeként szerepel: a core arány 95%, az elfogadás sikerülhet, miközben a hibás címke bennmarad.

Nem elegendő a fedettségi számlálóból kihagyni: a visszaadott lecke címkézése továbbra is valótlan. A blokk megtartását, javítását vagy kivételét külön kell eldönteni, majd a következményeket újramérni.

### 4. A B0 azonosítója még nem teljes kompatibilitási terv

**Hely:** B0, U1–U3, F; `role-skills.ts`, `support-skills.ts`, `runtime-knowledge.ts`.

A régi runbook és szabályszöveg archiválása helyes. A többi felsorolt összetevőre azonban nincs ugyanolyan konkrét verziófeloldás megtervezve. A jelenlegi szerep- és támogatóskill-függvények pillanatnyi globális szövegekből dolgoznak; a runbook folyamatsora is a jelenlegi `workflowDefinition()` eredménye.

Különösen hiányzik a **C13 adatformátumának végigvezetése**:

- szerveres séma és mentés;
- kliensoldali pontozás, exportált tananyag;
- régi leckék és már megnyitott kliensek;
- régi futások régi formátumú kimenetének feldolgozása.

A jelenlegi `openTaskSchema` nem tartalmaz típusos választ, és az értékelő a `required` mezőt használja. A generátor utasításának és egy szerveres pontozófüggvénynek az átállítása ezért nem elég.

**A B0 csomagverzió legyen származási azonosító; ne váljon automatikusan minden tartalom újragenerálási kulcsává.** Ellenkező esetben az U1–U6 kiadások visszahozhatják a többszörös teljes érvénytelenítést.

### 5. A C14 a visszaadás teljességét megoldja, a kiinduló jegyzék helyességét még nem

**Hely:** C14; `owner-instruction.ts/normalizeOwnerInstruction()`; `instruction-check.ts/instructionConceptsFrom()`.

A stabil jegyzék és a fejezethez kötött bizonyíték megfelelő javítás. Marad azonban két külön ellenőrzési feladat:

- A jegyzék valóban tartalmazza-e az eredeti kérés valamennyi tartalmi pontját? A későbbi „minden azonosító visszajött” ellenőrzés az első kivonatoláskor kihagyott pontot nem találja meg.
- A forrásidézet **igazolja-e** a hozzá rendelt állítást? Az idézet előfordulása és egy fogalom hozzárendelése nem helyettesíti ezt. A jelenlegi kód a kérés szövegét teszi definícióvá.

Újonnan figyelembe veendő: a kérés a `normalizeOwnerInstruction()` függvényben **némán 2000 karakterre csonkolódik**. Az ebből készült hiánytalan jegyzék még nem igazolja az eredeti kérés teljes feldolgozását.

Az F-ben a „minden pont fejezetre szűkített bizonyítékkal” csak a **tanítva** állapotra alkalmazható általánosan; a nem igazolható és nem eldönthető pontnál bizonyítékhiány és annak oka szükséges.

### 6. Több felvett hiba mellől továbbra is hiányzik a konkrét programfeladat

| Hiány | Bizonyíték és eltérés |
|---|---|
| **H39 teljes hatókörőrzése** | U3 csak a célzott szerzői válasz alakját javítja. A `checkAnimatorResult()` és `checkConceptFixResult()` változtathatatlan leckeburkának ellenőrzése nincs hozzárendelve. |
| **Szóbeli/írásbeli hibaosztály** | `17x oral_written@animator`, továbbá `run 767d9813`. Nincs külön lezárási tétel, pedig az `experiencePacketSchema` csomagonként követeli mindkét módot. |
| **Hiányzó térkép** | `run 98b1a526`: „A térkép nem található.” A H41 felsorolásából is hiányzik. |
| **Eltérő duplikátumkulcsok** | C2 mellett a `experiencePacketSchema` és `gateQuestionProblems()` is saját, írásjeleket törlő kulcsot használ. Például `8:2` és `8·2` ezekben azonosra esik. Nem elég csak a banképítő kulcsát javítani. |
| **Üres lektori jelentés** | `step-io.ts/lektorReportSchema`: a `{}` alakilag érvényes, mert a `notes` alapértéke `[]`. U5 csak a bank-ellenőr tételes teljességét rendezi. A teljes publikálási következmény **NEM IGAZOLT**, a parser hiánya bizonyított. |

### 7. Újonnan azonosított, tervből hiányzó javítószabály-hiba

**Hely:** `repair-skill.ts`, `staleForms()`, `staleFormProblems()`.

A helyesbítésből eltűnt szavakat a kód globálisan tiltja, ráadásul szóvégi határ nélkül.

A „föld-változása” → „Hold változása” helyesbítés után a tiltott alak `fold`. Ez **a Föld helyes említésére és a „földrajz” szóra is találatot adhat**, nem csak a javítandó kifejezésre.

Ez kontextus nélküli tiltásból eredő téves blokkolás. Fogalomhoz vagy konkrét állításhoz kötött helyesbítés kell; a javító skill „régi alak sehol” előírását is szűkíteni szükséges.

## TÉVES ÁLLÍTÁSOK

- **A3–A4 nincs összhangban az új C-résszel.** A3 megtartotta a hibás C9-et és a „71” összevont hibaszámot. A4 továbbra is minden modellre szigorú sémát ígér, miközben C8 csak igazolt útvonalra vonatkozik.
- **A4 lektori és OpenRouteres témafókusz-sémája továbbra sincs megtervezve C8-ban.**
- **A `length` nem bizonyítja, hogy pusztán kerethiba történt.** Csak a keret elérését igazolja, nem a hosszabb válasz várható helyességét.
- **H36/H41 „javított” státuszai részben NEM IGAZOLTAK.** A mellékelt `mapJson()` és blokkkatalógus az azonosító- és blokkhibát kezeli; sérült PDF kezelését, parkolási kompatibilitást és a hivatkozott Próba-javítást nem bizonyítja. Régi rekord lezárása nem kompatibilitási javítás.
- A helyesbítések ellenére az eredeti H2/H4/H22/H23 sorok hibás megfogalmazásai, valamint H30 „unknown zaj” minősítése megmaradtak.
- A modellárak, útvonalképességek, H8 lektorra bontott tokenadata és H20 minden körre vonatkozó állítása az új mellékletekkel sem vált igazolttá.

## KOCKÁZATOK

- **Skill-tesztek — most eldönthető:** a mellékelt teszt ténylegesen rögzíti az 5200-as szerepskill- és 1800-as lélekhatárt, kulcsmondatokat és néhány bekötést. A 4800-as korlátot ez a fájl nem bizonyítja. A tesztek átírásának tényleges gyengítő hatása módosítási különbség nélkül **NEM IGAZOLT**; a kulcsmondatok megtartása pedig nem viselkedési minőségbizonyíték.
- **H32 részleges:** a kötelező ítélet jó, de a hibás hosszúságú `truths` továbbra is külön kezelendő ellenőrzőhiba. A jelenlegi `choiceVerdictProblem()` tartalmi kifogást készít belőle; körlimiten ez akár helyes tétel kivételéhez vezethet.
- **Ábraellenőrzés:** az `illustration` példában a teljes adat `params.svg` alatt van. Az SVG elhagyása mellett „params számai és feliratai” nem garantálja a térbeli és kapcsolati állítások megőrzését. Ehhez konkrét kinyerési vagy rendereltábra-ellenőrzési szerződés kell.
- **H37 részleges:** a skill- és vakmegoldás-függés mellett a bemenetben szereplő cím, évfolyam és fejezetkontextus függése sincs teljesen rendezve.
- **H40:** külön specifikáció elfogadható, de a jelen terv költségjavulási ígéretébe ne számítsák bele az ellenőrzőpontból történő helyreállítás megtakarítását.

## SORREND-MEGJEGYZÉS

**Az új alapelv megfelelő: B megtervezése előbb, B+C közös aktiválása utána.**

Az U1–U6 azonban még nem végrehajtható kiadási sorrend:

- B0 tárolása és verziófeloldása **U1 előtt** szükséges; C1 jelenleg U3-ban van.
- A típusos választ előíró bankskill csak a teljes adatút átállításával aktiválható.
- A tanári pontjegyzékre hivatkozó szerzői/pedagógusi utasítások U4 nélkül nem működnek.
- A `gaps`, checker és támogató skillek közös függőségeit ne a PR-határ válassza szét.

A ~400 soros PR-cél nem lehet erősebb az atomi működési egységnél.

## KONKRÉT MÓDOSÍTÁSI JAVASLATOK A TERVHEZ

- Töröljék A3 régi C9-szabályait; az alternatíva igazságát ne szövegbeli előfordulásából vezessék le.
- Vegyék ki B1-ből a megismételt csoportos példaszámlálást; legyen különböző válaszelemeket számláló szerződés.
- Egészítsék ki C13-at több eredménnyel, szükség szerinti mértékegységgel és teljes kliens-/sémakompatibilitási tervvel.
- Vegyék fel a `limitAcceptance()` bennhagyott megalapozatlan címkéit, a lektori üres jelentést és a globális régi-alak-tiltást új hibajegyként.
- Adjanak tényleges limitdöntési táblát és eltávolítás utáni újraellenőrzést: fedettség, bankminimum, szóbeli/írásbeli követelmény, Próba, hivatkozások.
- A C14 kapjon eredeti kéréshez visszakövethető pontleltárt, csonkolásjelzést és állítás–idézet szemantikai ellenőrzést.
- B0-hoz készítsenek teljes összetevőjegyzéket, verziófeloldást és külön tartalom-/ellenőrzési függőségi kulcsokat.

**A három legerősebb költségcsökkentő jelölt sorrendje nem változott; összegszerű rangsoruk NEM IGAZOLT:**

| Lépés | Javított terv lefedése |
|---|---|
| Felesleges bank-újragyártások megszüntetése | C2–C4 jól célozza; B0 és H40 miatt még részleges |
| Bukott csomagkísérletek és tartalékmodell-hívások csökkentése | C8 jó; a jelenlegi C9 és B1 viszont új hibaköröket okozhat |
| Ismételt ellenőrzési bemenet és hívásszám csökkentése | C5/C10/H37 jó irány; bizonyítékmegőrzés és teljes függőségi kulcs kell |

**A3 külső mintái elvként használhatók, de nem igazolják a helyi heurisztikákat. A formalizálható válaszok determinisztikus ellenőrzése, az ID-alapú foltozás és a tételes ellenőrzési állapot továbbra is erősebben alátámasztott megoldás, mint további általános promptszigorítás.**