# VERDIKT: JAVÍTANDÓ

**A v4 jelentősen javult, de a maradó kifogások nem mind megvalósítási részletek.** H43 továbbra is hibás szemantikai heurisztikát ír elő; C14 tévesen ártalmatlannak tekinti a többletpontokat; az ellenőrzői bizonyítékmegőrzésnek további, konkrét kódágai maradtak kezeletlenül. Egy bizonyított hibát leminősítő lektori utasítás sincs célzottan felszámolva.

**Tervszinten elfogadható előrelépések:** részfeladatos válaszmodell, kategóriakvóták, törtalak-követelmény, a fél-minWords szabály törlése; tartalom- és ellenőrzéskulcs szétválasztása; H24 tényleges kontextusbemenete; H48 megnevezett két ágának javítása; H49 részlegességjelzése; renderelt ábra ellenőrzése; limit- és aktiválási táblák.

Az alábbi ellenpéldák a mellékelt kódból és tervből következnek; **nem újonnan lefuttatott mérések**.

## KRITIKUS HIÁNYOK

### 1. H43: az új szabály még mindig szóegyüttállást mér, nem hibás állítást

**Hely:** U6/C16; B2; `repair-skill.ts/staleForms()`, `staleFormProblems()`.

U6 ezt írja elő:

> „régi alak + a fogalom másik kulcsszava ugyanabban a mondatban, tagadás nélkül”

Ez helyes mondatot is hibásnak minősíthet. A holdnaptár-fogalom helyesbítése után például:

> „A Föld lakói számára a Hold változása volt a holdnaptár alapja.”

A mondatban szerepel a régi `fold` szó, a fogalom további kulcsszavai és nincs tagadás. **Mégsem állítja, hogy a holdnaptár a Föld változásán alapul.**

A mondathatárra szűkítés nem oldja meg az alany–állítmány–tárgy, a viszonyok és az idézett téves állítás megkülönböztetését. B2 ráadásul továbbra is a régi **alak** fogalomkörnyezetre szűkített tiltását írja, nem az U6-ban célul kitűzött állításellenőrzést.

**Szükséges tervmódosítás:** a szóegyüttállás legfeljebb ellenőrzési jelöltet képezhet. Önmagában nem lehet blokkoló bizonyíték. A régi állítás fennmaradását külön kell igazolni; a bizonytalan eset nem nevezhető bizonyított sikertelen javításnak.

### 2. Az ellenőrzési bizonyíték még két kódágon elveszhet

#### 2/a. Az újraellenőrzés összefésülése feltétel nélkül törli a korábbi hibajegyet

**Hely:** `bank-verifier.ts/runBankVerifier()`, `mergeVerifierRetry()`.

A jelenlegi kód megengedi, hogy ugyanahhoz a választós tételhez egyszerre legyen:
- szöveges tartalmi hiba az `errors` listában;
- hiányzó opciónkénti ítélet az `unverifiedChoices` listában.

Ezután:

```ts
const retried = new Set(first.unverifiedChoices.map((u) => u.path));
notes: [...first.notes.filter((n) => !retried.has(n.blockPath ?? "")), ...retry.notes]
```

**Minden korábbi jegyzet eltűnik az újraellenőrzött útvonalról**, nem csak az ítélethiány. Akkor is, ha az újrahívás elbukik; és akkor is, ha csak a választási kulcsot igazolja, de a korábbi, más természetű hibáról nem ad indokolt döntést.

H48 a `mergeBankVerifierNotes()` működését módosítja, **ezt az eltérő összefésülési hibát nem kezeli**.

A bizonyítékvesztés a kódból igazolt. Az így elveszett jegyzet végső publikálási következménye a mellékelt hívóhelyekből **NEM IGAZOLT**.

#### 2/b. Az utolsó bankkísérlet aritmetikai hibajelzés mellett is elfogadható

**Hely:** `experience-builder.ts/buildUnit()`, `lastAttempt`–`arithmeticOnly` ág; korpusz `60834b15`, run `94a5ccf9`.

```ts
if (parsed.success && (!issues.length || (lastAttempt && arithmeticOnly)))
  packet = parsed.data;
```

Az aritmetikai jelzés ilyenkor `onToolFix` figyelmeztetésként kerül tovább, de a bemutatott ág nem teszi kötelezővé annak bizonyítékalapú feloldását. A kód megjegyzése a későbbi lektor észlelésére hagyatkozik.

**Nem állítom, hogy az aritmetikai detektor minden találata helyes.** Éppen ezért a helyes megoldás nem feltétlenül az azonnali bukás, hanem a nyitott jelzés megőrzése és célzott eldöntése. A körlimit önmagában itt sem cáfolat.

**Szükséges tervmódosítás:** mindkét ág kerüljön a hibajegyzékbe és U5/U6 hatókörébe. Egy tartalmi leletet csak:
- az érintett tartalom ellenőrzött javítása;
- indokolt cáfolat;
- vagy az érintett elem eltávolítása

zárhasson le. Az újrahívás, az üres hibalista és a próbálkozási keret elfogyása önmagában ne.

### 3. C14: a két kivonat uniójának minden többletpontja nem ártalmatlan

**Hely:** U3/C14; `instruction-check.ts/instructionConceptsFrom()`; `support-skills.ts/instruction-checker`.

A terv állítása:

> „az eltérő pontok UNIÓJA kerül a jegyzékbe (többlet pont ártalmatlan, hiány nem)”

A forrásból igazolható többletpont is lehet:
- a tanár által nem kért tartalom;
- kifejezetten kizárt tartalom;
- egy kérés hibás felbontásából származó ismétlés vagy félreértelmezés.

A **forrás alátámasztja-e** és a **tanár ezt kérte-e** két külön ellenőrzés. A terv csak az elsőt konkretizálja.

Ez a rendszerben nem pusztán listadíszítés: a jelenlegi `instructionConceptsFrom()` a pontból `supporting` fogalmat képez. U3 pedig az igazolt pontokhoz tanítási kötelezettséget rendel. A hibás többlet így terjedelmet, fedettségi nevezőt és javítási munkát is változtathat.

**Szükséges tervmódosítás:** az unió legyen **jelöltlista**, ne automatikusan végleges követelményjegyzék. Minden végleges pontnak legyen visszakötése az eredeti kérés megfelelő részéhez; az ismétléseket, kizárásokat és egymásnak ellentmondó értelmezéseket fel kell oldani vagy bizonytalanként jelölni.

A `unprocessed` és a négy tartalmi állapot együttélése már rendezhető a végrehajtási fájlban: például külön feldolgozottsági és tartalmi állapotként.

### 4. A lektor promptjában konkrét utasítás minősít vissza egy bizonyított hibát

**Hely:** `step-io.ts/buildLektorPrompt()`, „Kalibráló példák”; korpusz `c3a878a5`, run `525b2797`.

A prompt szerint:

> „az első menetben elvégezzük a szorzást és osztást” … „a jelölt köztes sor helyes → language, nem blokkoló”

A korpuszbeli esetben azonban a kérdés **az első menet eredményét** kérte. A tanított első menet eredménye:

```text
35 + 64 – 12
```

A kijelölt opció:

```text
35 + 8 · 8 – 12
```

Ez még nem fejezte be a szorzás–osztás menetét. A visszajelzés is a másik alakot adta. **Egy köztes sor matematikai értékhelyessége nem bizonyítja, hogy válaszol a feltett kérdésre.**

A v4 általános lektori rendbetételt tervez, de ennek a hibás kalibráló szabálynak a törlését vagy feltételesítését nem nevezi meg. Ez önálló, bizonyított utasítási hiba, nem pusztán bankgenerálási probléma.

C13-ra is következménye van: az `expression` értékegyezése nem ellenőrzi automatikusan az előírt **műveleti állapotot**. A `form` felsorolt értékei ezt jelenleg nem fejezik ki.

**Szükséges tervmódosítás:** a kalibráló példa javítása és regresszió az eredeti esetre. Az előírt köztes alakot megkövetelő feladatot vagy külön szerződés értékelje, vagy ne tekintsék a puszta érték-összehasonlítással lefedettnek.

## TÉVES ÁLLÍTÁSOK

- **H1 gyökérokleírása túláltalánosít.** A típusos válasz hiánya pontozási hibákat magyaráz, de nem bizonyított oka a hibás szöveges következtetésnek vagy számításnak. A `5e9e2a84` hibás `111` eredménye típusos mezőben is hibás maradna. U1 ezt már helyesen elismeri; A2 megfogalmazását hozzá kell igazítani.

- **§C-L: „forrás-hivatkozás … átírás → tartalom-kulcs változatlan” nem következik a kulcsszerződésből.** A jelenlegi `unitTeaching()` a tanítás tartalmából képez hash-t; B0 is tanításalapú kulcsot tervez. Az átírt szöveg megváltoztatja ezt a bemenetet. A bank **előtti** tisztítás a felesleges újragyártást előzi meg, nem a szövegváltozás hash-hatását szünteti meg.

- **H50-ben az `animationSuggestions` nem lektori mező.** A mellékelt `step-io.ts` az `outlineSectionSchema` alatt, tehát a pedagógusi vázlaton csonkolja. U3 tanárikérés-kezelése önmagában nem zárja a vázlatmezők csonkolásának teljes hibaosztályát.

- **A 4800 karakteres tesztkorlát továbbra is NEM IGAZOLT.** A mellékelt teszt a szerepskillre, eszközleírásokkal együtt `< 5200`, a lélekre `< 1800` feltételt ellenőriz.

- **H8 lektorra bontott tokenértékei, A4 árai és képességadatai, az A3 élő sématesztje és H36/H41 regressziós lefedése e mellékletből továbbra is NEM IGAZOLT.** A korpusz összesített futási tokenértékei nem helyettesítik a lépésenkénti mérést.

## KOCKÁZATOK

### Végrehajtási fájlban lezárható, de kötelező feltételek

1. **A régi kliensre vonatkozó verziószabályhoz kiadási mechanizmus kell.**  
   A mellékelt `openTaskSchema` és `evaluateOpenAnswer()` nem ismeri az új mezőket vagy a `LESSON_SCORING_VERSION` szabályát. Egy már megnyitott régi kliens az új frissítéskérő kódot sem futtatja. Kell képességegyeztetés/verziózott kiszolgálás vagy más kikényszerített elutasítás. Az új pontozó tesztje önmagában ezt nem igazolja.

2. **A DB-s prompt törzsét is rögzíteni kell, nem csak a hozzáadott skillt.**  
   A jelenlegi `skilledPromptLookup()` az aktuális lookup eredményére teszi rá a skillt. Az archivált skill mellett megváltozó DB-prompt továbbra is megváltoztatná a régi futás utasítását. A teljes feloldott promptanyag változatlanságára kell teszt.

3. **Ábrát csak bizonyított függőségmentesség mellett szabad teljesen kihagyni a bankkulcsból.**  
   A rendereltábra-ellenőrzés önmagában nem bizonyítja, hogy egy banktétel nem hivatkozik az ábra sorszámozására vagy kizárólagos tartalmára. Az F feltétlen állítása helyett ez legyen előfeltétel; ellenkező esetben a releváns ábraszemantika függőség.

4. **H35 tényleges adatútja a szerzői `try.match` is.**  
   Bizonyíték: `AUTHOR_BLOCK_CATALOG`, korpusz `986b7f82`. A `bankVerifierChunks()` a tanításból csak `check` blokkokat vesz át, a `try` blokkokat nem. U2 „match egyértelműség” feladatához ezért kifejezetten hozzá kell rendelni a szerzői párosítókat is.

5. **Teljességhez azonosító-egyezés kell, nem csak darabszám-egyezés.**  
   A kért és visszaadott ellenőrzési egységek egyedi azonosítóit kell összevetni. A `solutionsTruncated` jelzés utáni pótlás vagy elutasítás legyen konkrét; részleges jelentés ne váljon teljes igazolássá.

6. **A limit-tábla minden sora fölött maradjon közös publikálási kapu.**  
   A `coverage_gap → quality` nem kerülheti meg a core/supporting minimumokat. Eltávolítás és javítás után az új jelöltre kell érvényes ellenőrzési állapot. A 95% fedettségi küszöb, nem megengedett tényhibaarány.

### A három legerősebb költségcsökkentő jelölt

| Lépés | Bizonyíték és lefedés |
|---|---|
| **Változatlan bankcsomagok megőrzése** | `unitTeaching()` teljes fejezetet hash-el; a célzott szerzői kör jelenleg teljes leckét is elfogad. U2/U4 lefedi a fő okokat. A tartalomkulcs helyessége fontosabb, mint a cache-találatok száma. |
| **Bukott bankkísérletek és tartalékhívások csökkentése** | A korpuszban gyakori `sample_score`, darabszám-, duplikáció- és rubrikahiba. C8/C13 és a hibakódhoz kötött javítás jó irány. |
| **Ismételt ellenőrzés és nagy ellenőrzői bemenet csökkentése** | A teljes lecke újraküldése és a részleges cache-kulcsok kódból láthatók. U5/C10 lefedi, a bizonyítékmegőrzési javításokkal együtt. |

**Az összegszerű sorrend NEM IGAZOLT.** Az új pontjegyzék-kivonatolás és képi ellenőrzés költségét is bele kell számítani a nettó eredménybe. H40 helyesen kívül marad.

### A3 és A4 értékelése

- **A3 iránya szakmailag megfelelő**, de a külső minták nem helyettesítik a helyi ellenpéldás teszteket. A szigorú JSON-séma alakot garantálhat, tartalmi igazságot nem.
- **A4 útvonalankénti kezelése és a korlátozott újrapróba helyes megközelítés.** A konkrét profilok hitelesítéséhez hiányoznak a lekérdezések és élőpróbák nyers eredményei; jobb modell kiválasztása ezekből **NEM IGAZOLT**.
- **Formalizálható matematikánál van erősebb ellenőrzés a puszta újabb modellítéletnél:** a megengedett kifejezésnyelv pontos kiértékelése. Például `40 − 18 + 4 = 26` determinisztikusan eldönthető. Ezt a referenciára is érdemes alkalmazni, nem csak a tanulói válasz összevetésére. Szöveges feladat értelmezésére ez önmagában nem elég.

## SORREND-MEGJEGYZÉS

**B megírása és lektorálása előbb, a működésváltozó B-részek társ-kóddal közös aktiválása helyes.** Nem indokolt működésképtelen új utasításokat pusztán a tulajdonosi sorrend kedvéért előbb élesíteni.

A végrehajtási fájlban még három függőséget kell rendezni:

- **U0 szerepszűrése nem alapulhat kizárólag a workflow-lépésen.** A bank saját `bank` skilllel dolgozik, miközben a korpuszban és a futtatásban az `animator` szakaszon belül fut. Hívásonként tényleges szerep/feladatmód szükséges.
- **U3 `gaps`-ot használ, miközben annak teljes adatútja U4/C12-ben készül.** A szükséges tárolást és jelzést előre kell hozni vagy az aktiválást össze kell kötni.
- **Az új képi ellenőrző hívás saját utasítása és verziója U5-höz tartozzon.** A tervezői skill nem helyettesíti automatikusan az ellenőrzői szerződést.

## KONKRÉT MÓDOSÍTÁSI JAVASLATOK A TERVHEZ

- H43 szóegyüttállási szabályát **jelöltképzésre**, ne végleges blokkolásra használják; B2 és U6 szövege legyen azonos elvű.
- Vegyék fel külön hibaként a `mergeVerifierRetry()` lelettörlését és az aritmetikai utolsókísérlet-kivétel lezáratlan bizonyítékkezelését.
- C14-ben az unióból ellenőrzött jelöltlista legyen; minden végleges pont eredeti kéréshez való tartozását is igazolják.
- Javítsák a lektor „első menet” kalibráló példáját; különítsék el az értékegyezést az előírt köztes alak teljesítésétől.
- Töröljék a szövegátírás melletti feltétlen hash-változatlanságot; az ábrafüggetlenséget kössék ellenőrizhető előfeltételhez.
- A végrehajtási fájl rögzítse a régi kliens elutasítását, a DB-prompt pillanatképét, a tényleges hívásszerepet, a `try.match` ellenőrzését és a részleges jelentések lezárását.
- A regressziók között legyen **helyes helyesbítő mondat**, **sikertelen ellenőrző-újrahívás**, **tanár által kizárt többletpont** és **értékazonos, de nem a kért köztes alakú válasz**.

**Nem újabb teljes áttervezés szükséges. Ezek azonban részben a terv által előírt döntési szabályok korrekciói, ezért a jelen változatra az ELFOGADHATÓ verdikt még nem indokolt.**