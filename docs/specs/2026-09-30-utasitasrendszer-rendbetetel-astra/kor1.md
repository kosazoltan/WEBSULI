# VERDIKT: JAVÍTANDÓ

A terv jó irányú elemeket tartalmaz, de jelenleg **hibás gyökérok-állításokat, újabb javítási hurkot előidéző ellenőrzéseket és régi futásokat megszakító verzióváltást is előír**. Több fontos hibát nem fed le, az A3–A4 következtetései pedig erősebbek a bemutatott bizonyítékoknál.

**Bizonyítéki korlát:** az értékelés a mellékelt korpuszra és kódrészletekre vonatkozik. A hivatkozott élő naplók, modelljegyzék-válaszok, `so-probe.local.mts` eredményei, tesztek és a `limit-policy.ts` nem szerepelnek a bizonyítékcsomagban. Ezek tartalma és a teljes rendszer „100%-os” feltárása **NEM IGAZOLT**.

## KRITIKUS HIÁNYOK

### 1. A pontozó saját téves elfogadásai nem oldhatók meg a rubrikaprompt rendbetételével

**Bizonyíték:** `shared/lesson-experience-score.ts`, `normalizeAnswer()`, `conceptHit()`, `evaluateOpenAnswer()`.

A normalizálás eldobja a törtvonalat, az illesztés pedig sorrendtől független szóhalmazként vizsgálja az alternatívát:

```ts
tokensOf(phrase).every(word => tokens.some(token => wordHit(token, word)))
```

A kód alapján:

- `sample: "1/2"`
- `required: [["1/2"]]`
- `minWords: 1`
- `needsSentence: false`

esetén a **„2/1” válasz is teljes pontot kap**. Mindkét válaszban megtalálható az `1` és a `2`.

Ez nem hibás modellutasítás, hanem **pontozási reprezentációs hiba**. A C9 mindkét tervezett ellenőrzésén átmehet egy ilyen rubrika.

A tagadáskezelés is csak globális heurisztika: ha a mintában bárhol szerepel `nem`, a válasz más állítására tett hibás tagadást a `hasUnexpectedNegation` már nem észleli. A „nem legyen a csoportban” utasítás nem teremt mondatrészhez kötött logikai ellenőrzést.

**Hiányzó tervtétel:** típusos számeredmény-, tört-, előjel- és szükség esetén mértékegység-ellenőrzés; pozitív és negatív válaszpéldákkal tesztelt szöveges rubrika. A teljes szemantikai helyesség pusztán kulcsszóillesztéssel történő biztosítása **NEM IGAZOLT**.

---

### 2. A C9 szabályai helyes rubrikákat is elutasítanak, és a javításukat a jelenlegi javítómód megtilthatja

**Bizonyítékek:**

- terv A3/C9: minden rubrikaszám szerepeljen a mintában;
- korpusz, `job 5e6384cd`: több elfogadható szám, például `2123`, `2321`, `2120`;
- `experience-builder.ts`, 225–435: normál javításkor minden korábbi alternatívát meg kell őrizni; tartalmi cserére a lektori javítómód és a csomaghatársértési kivétel ad lehetőséget.

A következő szabály hibás általános invariáns:

> „a `required` csoport minden SZÁMA szerepeljen a mintában”

Ha több helyes válasz engedélyezett, a mintának nem kell mindegyiket felsorolnia. Ugyanez vonatkozik az azonos érték különböző alakjaira, például `0,5` és `1/2`.

A részhalmaz-alternatíva általános tiltása sem helyes: a `["Nílus", "Nílus folyó"]` alternatívák nem ellentétes jelentésűek.

**További hurokkockázat:** ha a C9 talál egy hibás alternatívát az első, alakilag érvényes csomagban, a következő próbálkozás `repairBase`-ből indulhat. A normál javítás ekkor tiltja az alternatíva törlését. A validátor tehát olyasmit követelhet, amit a javítási szerződés nem enged.

**Hiányzó tervtétel:** hibakódhoz kötött javítási jogosultság, amely a bizonyítottan hibás rubrikarészt módosíthatóvá teszi; több helyes válasz és értékazonos számalak kezelésével.

---

### 3. A tanári kérés ellenőrzője nem garantálja sem a pontlista teljességét, sem a bizonyíték megfelelő hozzárendelését

**Bizonyíték:** `server/studio/instruction-check.ts`.

Konkrét problémák:

- `parseInstructionCheck()` elfogadja a `{"points":[]}` választ akkor is, ha a kérés tartalmi pontokat tartalmaz.
- A hibás vagy üres `point` mezőjű elemeket csendben eldobja.
- A bizonyítékot az **egész lecke szövegében**, nem a megadott fejezetben keresi.
- Érvénytelen `section` mellett is lehet `taught: true`.
- A `teachingText()` a fejezetcímet is tartalmazza: egy megfelelő hosszúságú cím puszta megismétlése is átmehet a mechanikai bizonyítékvizsgálaton.
- A modell csak `sourceText.slice(0, 60_000)` forrást kap; a későbbi tartalomról nem tud megalapozottan nyilatkozni.
- Az `instructionConceptsFrom()` a kérés pontját teszi meg definíciónak. Az idézet szövegbeli előfordulása önmagában nem ellenőrzi, hogy az idézet valóban igazolja ezt az állítást.

A fájl kommentje külön azonosítja az upstream hibát:

> „a kivonatolás viszont ezekre a pontokra nem készített fogalmat”

Ez több annál, hogy a szerző nem kapott elég egyértelmű utasítást.

**Hiányzó tervtétel:** egyszer létrehozott, stabil azonosítós tanáripont-jegyzék; pontonkénti forrás-, fogalom- és fejezethozzárendelés; a várt pontok teljes visszaadásának ellenőrzése. A C12 `gaps` mezője ezt nem helyettesíti.

---

### 4. A B2 „kid-text-fixer változatlan” döntése bizonyíthatóan hibás

**Bizonyíték:** `server/studio/support-skills.ts`, `kid-text-fixer`.

A skill példája:

> „Babilon városa Kr. e. 2500 körül szerepel a füzetben”  
> → „Babilon városa Kr. e. 2500 körül jött létre”

Ez nem egyszerű hivatkozáseltávolítás: **a létrejött időpontját állító új tartalmat vezet be**.

Ugyanebben a skillben:

- a 4. lépés megőriztetné például „a Duna forrása” és „írd a füzetedbe” szövegét;
- a tilalom és az önellenőrzés minden `forrás`/`füzet` előfordulást tilt.

**Következmény:** a C3 korábbra helyezhet egy jelentésmódosító javítót, amelynek utasítása önellentmondó marad.

**Hiányzó tervtétel:** jelentésmegőrző átfogalmazási szerződés, forrásellenőrzést igénylő esetek külön jelzése, valamint az ártalmatlan szóelőfordulások kivétele.

---

### 5. A bank-ellenőr nyílt tételeknél nem különbözteti meg az „ellenőriztem” és a „nem jelentettem hibát” állapotot

**Bizonyíték:** `server/studio/bank-verifier.ts`, `errorsSchema`, `runBankVerifier()`.

Az `errors` és `choices` mezőnek is van üres alapértéke. A `{}` válasz ezért alakilag elfogadható.

Nem egyválasztós tételnél:

```ts
let verified = true;
...
if (!message && verified) result.cleared.push(item.hash);
```

Vagyis egy nyílt feladat vagy nem választós módszer **tételes ellenőrzési visszaigazolás nélkül is `cleared` lehet**.

Egyválasztós tételnél van teljességkövetés, de a hibás hosszúságú `truths` listát a `choiceVerdictProblem()` tartalmi problémaként adja vissza. Ez az ellenőrző hibáját a feladat hibájával keveri.

**Hiányzó tervtétel:** minden tételhez kötelező `ellenőrzött / hibás / nem eldönthető` eredmény; a hiányos vagy hibás ellenőrzőválasz ne legyen sem hibátlansági igazolás, sem bizonyított feladathiba.

---

### 6. Az ellenőrzési gyorsítótárak érvénytelenítése hiányos

**Bizonyítékek:**

- `bank-verifier.ts`, `bankItemHash()`: `VERDICT_VERSION` és a tétel tartalma; a kötési metaadatokat eltávolítja.
- `buildBankVerifierPrompt()`: a hívás függ a vak megoldásoktól, a fejezetcímtől, az évfolyamtól és a támogató skilltől is.
- `instruction-check.ts`, `instructionCheckHash()`: nincs benne a támogató skill verziója.
- `blind-solver.ts`, `sourceHashOf()`, valamint `step-runner.ts` vakmegoldási kommentje: forráshashhez kötött újrahasználat.

A B2 megváltoztatja az ellenőrzők működését, de a terv nem rendeli hozzá következetesen az ellenőrzési verziók emelését. Ugyanígy a vak megoldások változásakor is maradhat korábban megszerzett banktétel-igazolás.

**Hiányzó tervtétel:** külön verziózott **tartalom- és ellenőrzési függőségek**. Ne kelljen újragenerálni egy jó tételt pusztán az ellenőrző változása miatt, de a régi igazolás se maradjon automatikusan érvényes.

---

### 7. Több korpuszbeli hibaosztály nincs külön felvéve és lezárva

| Hiányzó vagy elégtelenül elkülönített osztály | Bizonyíték |
|---|---|
| A Próba jutalma elérhetetlen a kérdésszám miatt | `job e880571c`: 1 kérdés mellett 5 helyes válasz szükséges |
| Több helyes párosítást engedő `match` feladat | `job 986b7f82`: `1/2`, `2/4`, `3/6` miatt több megoldás |
| Szóbeli/írásbeli követelmények megsértése | `SKILL LESSONS`: `17x oral_written@animator`; több workflow ugyanezzel |
| Sérült bemeneti dokumentum | `run a1707ade`: `Invalid PDF structure` |
| Hiányzó térkép, megszűnt folytatási állapot | `run 98b1a526`; `6df4acbe`, `6b243d53`, `15919f77` |
| Azonosítónévterek összekeverése | `job 22b397c4`: helyi azonosítók helyett UUID-k |
| A teljes lecke blokk-diszkriminátorának hibája | `job 0e7674bb`, `b2d768ef` |

**Fontos különbség:** az utolsó két osztályhoz már látható javítás: `step-io.ts/mapJson()` csak `localId`-t ad át, az `AUTHOR_BLOCK_CATALOG` felsorolja az engedélyezett blokkokat. Ezeket **„javított, regresszióval őrzendő”** státuszban kell nyilvántartani, nem újra megjavítani.

Az egyválasztós ellenőrzés nem fedi le a párosító feladat többértelműségét.

---

### 8. A megszakítások és javítási keretek problémájára nincs végrehajtható megbízhatósági terv

**Bizonyítékek:**

- `job 0fb4afeb`, `e79ab9da`, `e880571c`: szerverújraindulás;
- `run 86f264f5`: megszakadás 1 136 779 bemeneti token után;
- `run 2b7a38bb`: elfogyott a szerző javítási kerete;
- `job 29a13b45`: a workflow látogatási kerete és a futtató javítási körei eltértek;
- `experience-builder.ts`: a szolgáltatói hiba kilép a csomagpróbálkozási ciklusból.

Az A4 említ szolgáltatói hibát és tartalékmodellt, de nem ír le egységes hibapolitikát.

**Hiányzó tervtétel:** ellenőrzőpontból folytatás, idempotens mentés/közzététel, hibafajta szerinti újrapróbálkozás, valamint a beágyazott javítási és látogatási keretek közös számítása.

A jelenlegi rendszer pontos folytatási garanciái a mellékelt részletekből **NEM IGAZOLTAK**.

---

### 9. A B5 verzióemelés önmagában megszakítaná a jelenlegi verziójú régi futásokat

**Bizonyíték:** `shared/runtime-knowledge.ts`, `runtimePrompt()`:

```ts
["websuli-runtime-1", RUNTIME_KNOWLEDGE_VERSION]
```

A jelenlegi verzió `websuli-runtime-2`. Ha a konstans új értékre változik, a fenti engedélyezésből a `websuli-runtime-2` kiesik, és a függvény kivételt dob.

Továbbá:

- a `soul`, `iam`, `recovery` szöveg nincs verziónként archiválva;
- a `skillRuleText()` a pillanatnyi `SKILL_RULES` szövegét használja;
- a `SkillSnapshot` szabálykódokat tárol, nem a régi szabályszövegeket.

**Hiányzó tervtétel:** ténylegesen változatlan, verziónként visszakereshető utasításcsomag, vagy dokumentált migráció. A „régi futás a régit kapja” ígéretet a jelenlegi kód nem teljesíti.

---

### 10. A módosítási hatókört ellenőrző kódoknak is vannak lefedetlen mezői

**Bizonyíték:** `server/studio/step-io.ts`.

- `checkAnimatorResult()` összeveti a nem-animate blokkokat, de nem hasonlítja össze például a fejezetcímeket, `probaEnabled` értékeket és a `misconceptions` tartalmát.
- `checkConceptFixResult()` sem ellenőrzi a teljes, nem módosítható leckeburkot; például az `experience` nincs az azonosítómezők között.
- `step-runner.ts`, szerzői ág: célzott javítás helyett teljes lecke esetén csak figyelmeztetést naplóz, és továbbengedi a teljes választ.

Ez a hatókörőrzés hiányossága, nem pusztán promptprobléma. A régi animátorút aktuális éles használata **NEM IGAZOLT**, de a bemutatott ellenőrző függvények szerződése és implementációja eltér.

## TÉVES ÁLLÍTÁSOK

| Tervbeli állítás | Értékelés a kód alapján |
|---|---|
| **H11: a számjegyek miatt nem csoportosulnak az ismeretlen hibák.** | **Cáfolt.** A `learning.ts/findingsFromError()` már tartalmazza a `.replace(/\d+/g, "#")` normalizálást, továbbá UUID- és idézetszűrést. A C6 ezt lényegében újra előírja. |
| **H11: csoportosulás után szabály lesz az ismeretlen hibából.** | **Cáfolt mint automatikus működés.** Az `unknown` nem `SkillCode`; a `skillSnapshot()` csak a karbantartott `SKILL_RULES` kulcsait aktiválja. Ismétlődésből nem keletkezik új utasítás. |
| **H2: legalább öt betűnél egy elütés engedett.** | **Pontatlan.** A `wordHit()` két eltérést is enged, ha a hosszabb szó nyolc karakternél hosszabb. |
| **H4: a kulcs eldobja a mínuszjelet.** | **Csak részben igaz.** A `normalizeAnswer()` az U+2212 mínuszt `-` jelre alakítja, és a számhoz kapcsolódó előjelet megőrzi. Más elrendezésekben a műveleti jel elveszhet. A hibát konkrét alakokkal kell leírni. |
| **H22: a `classroom ∈ gradeRange` nincs a promptban.** | **A bemutatott skillre cáfolt.** A `support-skills.ts/scope` önellenőrzése ezt már kimondja. Hogy minden tényleges hívás megkapja-e, **NEM IGAZOLT**. |
| **H23: a `web-author` skill `bankPlan`-t említ.** | **A bemutatott skillre cáfolt.** Ott nincs ilyen szó. A `HTML_TEACHING_CONTRACT` viszont tartalmazza: más helyen kell vizsgálni. |
| **H3/C8: a jelenlegi csomagséma pontos céldarabszámot követel.** | **Cáfolt a bemutatott kódra.** A `packetSchema` minimumot és felső korlátot használ; például `tasks.min(taskCount).max(Math.max(taskTarget,45))`. A pontos cél új specifikáció lenne, nem a jelenlegi szabály egyszerű leképezése. |
| **A2: 34+37 = 71 külön formai/darabszámhiba.** | **NEM IGAZOLT.** A regexdetektorok átfedhetnek; ugyanaz a futás több hibakódot kap. A `bank_cardinality` detektor ráadásul általános `Array must contain` és bankcsomag-szövegeket is felismer. |
| **A2 H1: az 50 `source_fidelity@lektor` megfigyelés 50 banktényhiba.** | **NEM IGAZOLT.** A `lektorSkillCodes()` a blokkoló `source_conflict` jegyzeteket a tanítás/bank megkülönböztetése nélkül sorolja ide. |
| **A4: minden modellnél megszüntethető a formai hiba szolgáltatói szigorú sémával.** | **NEM IGAZOLT**, és ellentétes az A3 OpenRouter-korlátozásával. A két megnevezett modell egy darabszámpróbája nem bizonyítja az összes útvonal és sémakulcsszó támogatását. |
| **H20: minden körben szövegjavító fut, és minden kör újraépítést okoz.** | **NEM IGAZOLT.** A hivatkozott `step-runner.ts:975–990` nincs mellékelve. |
| **H8: leckénként 730–830 ezer token kizárólag a lektoré.** | **NEM IGAZOLT** a mellékelt szerepenkénti elszámolás hiányában. A teljes workflow nagy tokenfogyasztása igazolt. |

**Megerősített gyökérokok:**

- **H5:** a szerzői újrakérés teljes leckét kér, és a visszakapott javítás nem kerül újra a foltegyesítő ágon feldolgozásra.
- **H19:** az `unitTeaching()` a teljes fejezetet beteszi a bemenetbe és az ujjlenyomatba.
- **H10 lényegi része:** a `runtimePrompt()` és `skillRuleText()` jelenleg nem fogad szerepet.
- **H24:** a bank-ellenőr egyválasztós tételeinél a `promptView()` eltávolítja a visszajelzést, miközben a skill annak átszámolását is kéri.
- **H15:** a vak megoldó teljes listája `[]` lesz bármilyen sémabukáskor.

## KOCKÁZATOK

### 1. A szigorú csomagséma összeütközhet a javítólista formátumával

A C8 csak a teljes `packetSchema` átadását részletezi. A tényleges javítómód azonban részleges `methods/tasks/quiz` listákat, üres vagy elhagyott tömböket enged.

**Követelmény:** külön séma kell a teljes generáláshoz és az ID-alapú javításhoz. Ellenkező esetben a szolgáltató olyan teljes csomagot kényszeríthet ki, amelyet a foltkezelő jogosan visszautasít.

A pontos céldarabszámra szigorítás a `salvagePacket()` mozgásterét is csökkentheti, mert az eltávolítás utáni csomagot ismét a csomagkvótával ellenőrzik.

### 2. A C6 csonkolása részleges ellenőrzést tüntethet fel sikeresként

A túlméretes vakmegoldás-lista levágása jobb adatmegőrzés lehet, mint az egész lista eldobása, de **nem jelent teljes ellenőrzést**.

Emellett egyetlen túl hosszú vagy hibás elem továbbra is elbuktathatja az egész `solutionsSchema` feldolgozását. A `NINCS ELÉG ADAT` tételek jelenleg eltűnnek a tárolt megoldáslistából.

Kell külön teljes/részleges/sikertelen/nincs feladat állapot és a kimaradt tételek nyilvántartása.

### 3. A B1 „változatlan, igazolt részre nincs új blokkoló” szabály túl erős

A változatlanság nem bizonyítja a hibátlanságot. Később helyesbített forrás vagy új vak megoldás cáfolhat korábbi ítéletet.

A `bank-verifier.ts` fejlécében szereplő mért eset szerint a lektor nulla bankhibát jelzett, míg további ellenőrök több hibát találtak.

**Helyes korlát:** ismételt, megcáfolt kifogást ne nyisson újra; új, ellenőrizhető tényhibát viszont jelenthessen. A javítási költséget a futtató korlátozza, ne a hiba felismerését tiltsa meg.

### 4. A C5 SVG-elhagyása ellenőrzési vakfoltot hozhat létre

A felirat és fajta nem írja le feltétlenül az ábra mennyiségi, térbeli és kapcsolati állításait. A korpuszban ábrafelirat-hiba is szerepel: `job 1d5ee08b`.

Az SVG-törzs kivétele indokolt költségcsökkentés, de kell helyette ellenőrizhető ábraadat vagy külön rendereltábra-ellenőrzés. A „nincs SVG a lektornál” önmagában nem minőségjavítás.

### 5. A B-PR-ek külön élesítése többszörös gyorsítótár-vesztést okozhat

A `roleSkillVersion()` a skill és az eszközleírások szövegétől függ; a bank ujjlenyomata tartalmazza ezt a verziót.

Ezért B1–B3 már programlogikai javítás nélkül is megszüntethet korábbi csomagtalálatokat. A későbbi B/C kiadások újabb hideg futásokat indíthatnak. A pontos többletköltség **NEM IGAZOLT**, de az érvénytelenítés mechanizmusa látható.

### 6. A C11 általános keretnövelése korlátlanul drágíthatja a beágyazott újrapróbálkozásokat

A `length` azt bizonyítja, hogy a válasz nem fért el; nem bizonyítja, hogy a modell egyébként helyes, befejezhető megoldást készített.

Kell:

- modellenként és útvonalanként értelmezett kimeneti/gondolkodási keret;
- kontextus- és költségplafon;
- közös próbálkozásszámlálás a szolgáltatói, séma-, tartalmi és tartalékmodell-körökön át.

### 7. A 95%-os szabály teljesülése nem ellenőrizhető a tervből

A konkrét szabály és a `limit-policy.ts` nélkül nem állapítható meg, mely hibák minősíthetők vissza és mely kapuk maradnak kötelezők.

A korpuszban van `done` állapot hiányzó tanári pontokkal és `LIMITDOWN: true` jelzéssel: például `job 5ca6ab42`, `d76548dd`.

Ezért a D/F szerinti „publikálódott” **nem önmagában minőségbizonyíték**. A tolerancia alkalmazását és a fennmaradó hibákat külön kell mérni. A 90%-os supporting-fedettséget, a mentéskor megengedett tételkivételt és a 95%-os szabályt nem szabad azonos mérőszámként kezelni.

### 8. A teszt- és mérési terv nem elégséges

- A PR-felsorolásból **C8–C12 hiányzik**.
- Egyetlen Egyiptom-futás nem vizsgálja a matematikai pontozást, a párosítást, a régi futások folytatását vagy a tartalék szolgáltatókat.
- A kulcsmondat-tesztek átírása nem bizonyít működési javulást.
- A tesztek tényleges gyengítése **NEM IGAZOLT**, mert a tesztkód nincs mellékelve; a terv azonban nem rögzít elég erős viselkedési védelmet.

## SORREND-MEGJEGYZÉS

**A specifikáció és az utasítások megtervezése helyesen előzi meg a programjavítást. Az összes B-tétel önálló élesítése viszont szakmailag nem helyes.**

| B-tétel | Szükséges programoldali társ |
|---|---|
| B1: teljes/folt mód szerinti szerzői kimenet | C4: módhelyes újrakérés és egyesítés |
| B1: kiírt lektori útvonal másolása | C5: a kiírt útvonalakat ténylegesen tartalmazó bemenet |
| B2: új `blind-solver`, külön `web-extract` skill | Hívási pontok és ellenőrzési verziók bekötése; nincs külön részletezve |
| B4: szerepszeletek, generált pontozási szerződés | C1 és közös, valóban exportált szabályforrás |
| B5: szerepre szűrt `runtimePrompt(..., role)` | C1, minden hívó módosítása és régi verziók kezelése |
| B8: normalizálás utáni DB-rendezés | Az új normalizálás/migráció után; a jelenlegi C6 ezt nem oldja meg |
| A3/C12: `gaps` kommunikáció | Séma, parser, tárolás és megjelenítés együttes módosítása |

Külön probléma: az ismeretlen leletekben a kód **csak lenyomatot tárol**. A korábbi lenyomatból nem lehet visszaállítani a normalizálandó hibaüzenetet. Visszamenőleges újracsoportosításhoz az eredeti futási bizonyítékokat kell visszakeresni.

**Javasolt sorrend:**

1. Hibajegyzék, specifikáció és regressziós példák lezárása.
2. A B-szövegek jóváhagyása, még nem feltétlenül éles aktiválása.
3. Függőségi egységenként közös B+C megvalósítás.
4. Verziózott, fokozatos kiadás.
5. Csak ezután DB-állapotrendezés és a végleges működéshez igazított dokumentáció.

## KONKRÉT MÓDOSÍTÁSI JAVASLATOK A TERVHEZ

### A. Az A2 legyen bizonyítékhoz kötött hibajegyzék

Minden osztályhoz szerepeljen:

- konkrét korpusz- vagy kódhely;
- jelenlegi vagy történeti hiba;
- bizonyított gyökérok vagy **NEM IGAZOLT** hipotézis;
- javítási pont;
- regressziós teszt;
- költség- és minőségi mérőszám.

A számlálókat ne nevezzék automatikusan különálló hibák számának. Az `unknown` megfigyeléseket ne minősítsék zajnak pusztán azért, mert nincs hozzájuk regexszabály.

### B. A C9-et tervezzék újra

- Ne legyen általános követelmény, hogy minden elfogadható alternatíva minden száma megjelenjen egyetlen mintában.
- Ne legyen általános tiltás minden valódi szóhalmaz-részhalmazra.
- Legyen típusos ellenőrzés a zárt matematikai feladatokra.
- A rubrikákat helyes **és szándékosan hibás** válaszokkal is próbálják.
- A determinisztikus rubrikahiba adjon szűk, explicit jogosultságot az érintett követelmény javítására.

### C. A tanári kérés teljesítését külön adatfolyamként kezeljék

A pontjegyzék már a kivonatolás/tervezés előtt létezzen. Külön állapot legyen:

- forrásban megtalálható és megtanított;
- forrásban megtalálható, de kimaradt;
- forrásból nem igazolható;
- ellenőrizetlen vagy csonkolt bemenet miatt nem eldönthető.

A `gaps` ne csökkentse csendben a teljesítendő pontok körét, és ne jelentsen automatikusan felmentést a javítás alól.

### D. Vezessenek be verziózott utasítás- és ellenőrzési csomagot

A rögzített csomag tartalmazza legalább:

- szerep- és támogató skillek;
- runbook és tanult szabályszövegek;
- kimeneti séma;
- ellenőrzőszabályok;
- szolgáltatói útvonal és releváns modellbeállítások.

A korábbi tartalom újrahasználhatóságát és a korábbi **ellenőrzés** érvényességét külön kezeljék.

### E. A három legnagyobb várható költségcsökkentő beavatkozás

**A pontos sorrend megtakarítási összegekkel NEM IGAZOLT**, mert nincs teljes, szerepenkénti költségelszámolás. A bemutatott kód és futások alapján ezek a legerősebb jelöltek:

| Prioritás | Beavatkozás | A terv lefedi? |
|---|---|---|
| **1. Felesleges újragyártási láncok megszüntetése** | Ábra nélküli bankfüggőség; tanítási szöveg véglegesítése a bank előtt; célzott, változatlan részeket megőrző javítás; ellenőrzőpontból folytatás. | **Részben:** C2–C4 jó irány. A folytatás, a teljes függőségi modell és a kiadási érvénytelenítés hiányos. |
| **2. Bukott bankkísérletek és drága tartalékmodell-hívások csökkentése** | Módhelyes szigorú séma; korrekt rubrikaellenőrzés; javítható hibaszerződés; párhuzamos csomagok ütközéseinek megelőzése. | **Részben:** B1/C2/C8/C9. A jelenlegi C9 növelheti a körök számát. A „korábbi kérdések” átadása nem ad közös tudást az egyszerre készülő társcsomagoknak. |
| **3. Ismételt ellenőrzési bemenet csökkentése és gyorsítótárazása** | C5/C10; változásfüggő újraellenőrzés; ismételt szabályok és korábbi leckeadatok eltávolítása. | **Részben:** az irány helyes, de a bizonyítékmegőrzés és az ellenőrzési verziók hiányoznak. |

Külön mérendő: teljes költség használható leckénként, bukott próbák költsége, elsőre elfogadott csomagok aránya, újragenerált tételek száma, gyorsítótár-olvasás/-írás, késleltetés és végső hibaarány. A nyers bemeneti tokenszám önmagában nem elég.

### F. A3: megtartandó minták, de szűkebb állításokkal

- **Szigorú séma:** megfelelő megoldás a támogatott szerkezeti hibákra, de nem bizonyít tartalmi helyességet. Külön teljes- és javítóséma kell; a helyi szemantikai validátorok maradjanak.
- **Zod-származtatás:** jó irány, de a `.transform()`, `.preprocess()` és tetszőleges `.refine()` működését nem szabad automatikusan szolgáltatói JSON-séma-kényszernek tekinteni.
- **Pontos validációs visszajelzés:** már létezik, de a H5 és a C9-javítási konfliktus mutatja, hogy a visszajelzés önmagában kevés; a válaszformátumnak és a javítási jogosultságnak is egyeznie kell.
- **Opciónkénti független ítélet:** indokolt, és a mellékelt kódban valóban szerepel. Minden tételtípusra ki kell egészíteni teljességellenőrzéssel.
- **Referenciaalapú rubrika:** használható elv; a hivatkozott irodalom azonban a bemutatott anyagban nem igazolja a C9 két konkrét heurisztikáját.
- **`bail`/`gaps`:** hasznos bizonytalanságjelzés, nem garancia arra, hogy a modell nem talál ki tartalmat.
- **Promptgyorsítótár:** indokolt, de a szolgáltatói útvonal, a találati arány, az élettartam és az írási költség mérendő.

**Jobban alátámasztott megoldások a helyi rendszerben:** determinisztikus matematikai ellenőrzés ott, ahol a feladat formalizálható; ID-alapú foltozás teljes újraírás helyett; feladatonként követett ellenőrzési állapot; bizonytalanság explicit megőrzése. Ezeket a bemutatott kód már részben alkalmazza, így nem szükséges új keretrendszerre építeni.

### G. A4: modellprofil helyett modell–útvonal–feladat profil szükséges

A táblázatban szereplő konkrét árak, kontextusméretek és támogatott paraméterek helyessége a nyers lekérdezések nélkül **NEM IGAZOLT**. Nem állítható a mellékelt anyag alapján az ellenkezőjük sem.

Minden profilhoz kerüljön:

- pontos modellazonosító és szolgáltatói útvonal;
- sikeres tényleges hívás és képességpróba;
- támogatott sémarészhalmaz;
- gondolkodási/kimeneti keret kezelése;
- elsődleges és tartalék út külön eredménye;
- feladatonkénti hibaarány, késleltetés és teljes költség;
- mérési mintanagyság és tesztkészlet.

Belső eltéréseket is javítani kell:

- az A4 lektori szigorú sémát és OpenRouteres témafókusz-sémát ígér, miközben a C8 csak közvetlen OpenAI bankcsomagot ír le;
- az A4 a terrát kivonatolóként és „csak tartalék/mentő” modellként is megnevezi;
- a prózai OCR-feladatra nem a JSON-séma a releváns minőségbiztosítás;
- a „kisebb bemenet megszünteti a csonka kimenetet” hatás **NEM IGAZOLT**: a kimeneti terjedelmet külön is korlátozni és mérni kell.

### H. A D/F elfogadást egészítsék ki működési feltételekkel

- A teljes korpuszból összeállított, hibaosztályonként címkézett visszajátszható tesztkészlet.
- Matematikai, történelmi, nyelvi, OCR-es, rövid és hosszú források.
- Régi futás folytatása új kiadás után.
- Teljes válasz és folt külön tesztje.
- Szolgáltatói hiba, `length`, hiányos ellenőrzőválasz és sérült bemenet.
- Pontozási ellenpéldák, több helyes párosítás és elérhetetlen Próba-jutalom.
- A 95%-os szabály konkrét döntési táblája.
- Több ismételt futásból mért minőség és tényleges költség.

**Elfogadási feltételként ne csak az szerepeljen, hogy kevesebb körből publikálódik a lecke. Az is legyen feltétel, hogy ezt nem hibás válaszok elfogadásával, ellenőrzések csendes kihagyásával vagy a fennmaradó hiányok láthatatlanná tételével éri el.**