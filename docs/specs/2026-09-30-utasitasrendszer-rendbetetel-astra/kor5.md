# VERDIKT: JAVÍTANDÓ

**A v5 a negyedik kör négy kifogását érdemben kezeli.** H43 jelöltképzése, C14 ellenőrzött jelöltlistája, H51/H52 felvétele és H53 korrekciója megfelelő irányú. Ezeket nem indokolt újranyitni.

**Egy további, konkrét döntési szabály azonban hibás maradt:** H48 az útvonalhoz tartozó *bármely blokkoló lektori jegyzetet* továbbra is elegendőnek tekinti a bank-ellenőr más természetű hibajegyének elhagyásához. Az útvonalegyezés nem bizonyítja a hibák azonosságát.

Az alábbi megállapítások statikus kód- és tervellenőrzésből származnak; **nem végeztem új futtatást**. A többi felsorolt pont végrehajtási feltétel, nem újabb áttervezési igény.

## KRITIKUS HIÁNYOK

### 1. H48: a blokkoló lektori jegyzet sem helyettesít automatikusan minden más leletet ugyanazon a tételen

**Bizonyítékhely:** U5/H48; `bank-verifier.ts/mergeBankVerifierNotes()`.

A terv előírása:

> „a `taken` csak BLOKKOLÓ lektori jegyzet útvonalát foglalja”

Ez javítja a figyelmeztetés miatti elnyomást, de megtartja a jelenlegi döntés másik problémáját:

```ts
verifierNotes.filter(
  n => isSingleChoiceNote(n) || !taken.has(n.blockPath)
)
```

**Nem egyválasztós leletnél továbbra is az útvonal egyezése dönt, nem a kifogás tartalma.**

A szabály által megengedett ellenpélda:

| Ellenőr | Ugyanazon nyílt feladatra adott lelet |
|---|---|
| Lektor, blokkoló | A mintaválasz hibás számértéket tartalmaz. |
| Bank-ellenőr | A rubrika a helyes `72` mellett a hibás `52` értéket is elfogadja. |

A második hibatípus tényleges korpuszbeli példa: **job `d6f5d4bc`, `experience.tasks.13`**. A táblázatban szereplő kétleletes együttállás **nem megfigyelt futás**, hanem a függvény és a terv szerinti ellenpélda.

A tervezett szűrés a bank-ellenőr jegyzetét kihagyja az egyesített leletlistából. A minta kijavítása azonban **nem igazolja a rubrika kijavítását**. Egy későbbi újraellenőrzéstől remélt újbóli felismerés nem helyettesíti a már rendelkezésre álló bizonyíték megőrzését.

**Szükséges döntési korrekció:**

- Azonos útvonalú leletek együtt kezelhetők, de csak azonos kifogások deduplikálhatók.
- Eltérő állításra, mezőre vagy követelményre vonatkozó leletek külön lezárandók.
- Egyetlen megjelenített jegyzet is megfelelő, **ha abban az összes különálló kifogás és bizonyíték megmarad**.
- A lelet lezárása ugyanazt követelje meg, mint H51-nél: ellenőrzött javítás, indokolt cáfolat vagy az érintett elem eltávolítása.

**Igazolt következmény:** a lelet kimarad az egyesített listából.  
**NEM IGAZOLT:** hogy emiatt valamely konkrét éles futásban hibás tétel publikálódott, illetve hogy egy nem mellékelt háttérnyilvántartás megőrizte-e a kihagyott leletet.

Ez nem új hibaosztály, hanem **H48 még hiányos lezárása**.

## TÉVES ÁLLÍTÁSOK

- **H2 „A pontozó szabálya sehol nincs leírva” mondata túlzó.**  
  A `role-skills.ts/bank` és az `experience-builder.ts` promptja leírja az ÉS-csoport/VAGY-szinonima szerkezetet, a szóalak-illesztést és a mintaválasz teljespont-követelményét. A helyes gyökérokleírás: **a tényleges algoritmus teljes szerződése nincs közölve, és egyes utasítások ellentmondanak egymásnak**. A sorrendfüggetlenség, a normalizálás, a toldalék- és elütéstűrés, valamint a globális tagadáskezelés a pontozókódból következik.

- **H1 két okra bontása megfelelőbb a korábbi változatnál.**  
  A hibás követelményrendszer és a hibás számítás külön kezelendő. A típusos válaszmező önmagában nem javítja ki a `5e9e2a84` hibás `111` eredményét. Ezt a v5 már helyesen mondja ki.

- **H8 lektorra bontott `731k / 830k / 765k` értékei továbbra is NEM IGAZOLTAK ebből a mellékletből.**  
  A bemutatott korpusz futásösszesítéseket tartalmaz, nem az állítást alátámasztó `visits.tokensIn` sorokat. A nagy, ismételt bemenet problémája viszont a `buildLektorPrompt()` kódjából igazolt.

- **A3 élő sématesztje, A4 pontos árai, képességadatai és teljesítménymérései NEM IGAZOLTAK a csatolt bizonyítékokból.**  
  Ugyanez vonatkozik a H36/H41 javítások regressziós lefedésére. A tervben szereplő állítás nem helyettesíti a nyers kérés–válasz naplót vagy a tesztet.

- A **H50 mezőbesorolásának**, a **hash-mondatnak** és az **5200/1800 karakteres tesztkorlátoknak** a javítása összhangban van a mellékelt kóddal.

## KOCKÁZATOK

### A végrehajtási fájl kötelező feltételei

1. **H50 pedagógusi ágának legyen konkrét végrehajtási helye.**  
   Az `outlineSectionSchema` továbbra is csonkolja az `animationSuggestions`, `keyPhrases` és `emoji` mezőket; a `keyPhrases` listahosszát is. U3 a tanári kérés, U5 a lektori megoldáslista csonkolását rendezi, de ez nem valósítja meg a vázlatmezők kezelését. U4-hez vagy más megnevezett egységhez kell rendelni az eredeti érték megőrzését, a módosítás jelzését és a jelentést érintő esetek kezelését. Nem szükséges minden túlhosszú díszítő mező miatt új modellhívás.

2. **Az ellenőrzési teljesség és a nyitott leletek állapota ne mondhasson ellent egymásnak.**  
   A `cleared` állapot nem lehet érvényes ugyanarra a tartalomváltozatra, miközben hozzá feloldatlan tartalmi lelet tartozik. A `solutionsTruncated` utáni pótlás vagy elutasítás legyen konkrét. A kivétel miatt eltolódó tömbindexek helyett a leleteket stabil elemhez és tartalomváltozathoz kell visszakötni.

3. **H43 bizonytalansága ne zárjon le korábban bizonyított hibát.**  
   Helyes, hogy egy puszta szóegyüttállásból származó bizonytalan jelölt csak figyelmeztetés. Más helyzet, ha egy korábban bizonyított téves állítás javításának ellenőrzése marad bizonytalan: az eredeti lelet ettől nem tekinthető lezártnak. Ez a H51-ben már elfogadott bizonyítékmegőrzési elv alkalmazása.

4. **A pontozási szerződéshez pontos értelmezési szabályok kellenek.**  
   A végrehajtási fájl rögzítse a megengedett kifejezésnyelvet, a pontos törtkezelést, a részfeladat-hozzárendelést és a mértékegységeket. Az `intermediate-step` ne puszta nyers karakteregyezést jelentsen: a szóköz vagy az azonos jelentésű műveleti jel nem más műveleti állapot. A nem értelmezhető kifejezés ne váljon „ellenőrzötté”. A `requiredDistinct` ugyanazt a tartalmi elemet ne számolhassa többször külön szinonimák miatt.

5. **A régi kliens és a régi futás kezelése külön tesztelendő.**  
   A §C-V/1 szerinti verzióegyeztetésnél a verziómezőt nem küldő régi kliens nem tekinthető automatikusan az új pontozó támogatójának. A DB-prompt teljes pillanatképét ellenőrző teszt szükséges. Az archivált szöveg nélküli, korábbi futásokra pedig külön migrációs vagy elutasítási szabály kell; utólag nem állítható elő bizonyítottan az eredeti prompt pusztán egy verzióazonosítóból.

6. **Az ábrafüggetlenséget ne két szófordulat hiányával azonosítsák.**  
   F feltételes állítása megfelelő, de az ábrasorszám és az „az ábrán látható” fordulat szűrése önmagában nem igazolja a függőségmentességet. A parafrázisos utalásokat és a kizárólag vizuálisan rendelkezésre álló adatokat is kezelni kell. A képi ellenőrző külön hívása önmagában nem bizonyít független hibázást vagy megfelelő felismerési arányt; ezt mérni kell.

7. **A limit-tábla tényhibát és véleménykülönbséget különítsen el.**  
   A vak megoldás eltérése önmagában nem bizonyított tanítási hiba. A jelenlegi `blindSolutionsPromptBlock()` is újraszámolást kér, és megengedi, hogy a vak megoldó tévedjen. A §C-L megfelelő sora csak az eldöntött tényhibára alkalmazható. A közös kapu és a 95%-os fedettség/tényhelyesség megkülönböztetése egyébként helyes.

### A három legerősebb várható költségcsökkentő lépés

| Lépés | Bizonyíték és tervbeli lefedés |
|---|---|
| **Változatlan bankcsomagok megőrzése** | A `unitTeaching()` teljes fejezetet tesz a hash-bemenetbe; a célzott szerzői ág jelenleg teljes leckét is elfogad. U2/U4 kezeli a fő újraépítési okokat. |
| **Bukott bankkísérletek és tartalékhívások csökkentése** | A korpuszban gyakori a `sample_score`, `bank_cardinality`, `duplicate_question` és a javítási hatókör hibája. U1/U2, C8/C13 és a hibakódhoz kötött javítás lefedi ezeket. |
| **Ismételt ellenőrzések és ellenőrzői bemenet csökkentése** | A teljes lecke és térkép ismételt küldése, illetve a hiányos ellenőrzési kulcsok kódból láthatók. U5/C10 megfelelő irány. |

**Az összegszerű sorrend NEM IGAZOLT.** A nettó megtakarításba a második kéréskivonatolás és a rendereltábra-ellenőrzés költségét is bele kell számítani. H40 helyesen külön marad.

### A3 és A4 szakmai értékelése

- **A3 mintái megfelelőek, de nem elégséges bizonyítékok.** A szigorú séma az alakot korlátozza, nem a válasz igazságát. A helyi szemantikai validálás és az ellenpéldás regresszió továbbra is szükséges.
- **A4 útvonalankénti kezelése és korlátozott újrapróbája megfelelő.** A konkrét profilok optimális volta, illetve egy jobb modell választása a mellékletből **NEM IGAZOLT**.
- A formalizálható aritmetikára a **pontos determinisztikus kiértékelés erősebb ellenőrzés**, mint egy újabb modellítélet. A v5 ezt már a referenciára is kiterjeszti. Szöveges feladat értelmezését vagy a kért műveleti állapot azonosítását ez önmagában nem oldja meg.
- A globális tagadásheurisztika ismert maradó hibája miatt H1/H2 teljes lezárása nem állítható; ezt U1 helyesen rögzíti.

## SORREND-MEGJEGYZÉS

**B megírása és lektorálása előbb, a működésváltozó részek társ-kóddal közös aktiválása szakmailag helyes.**

A végrehajtási fájlban egyértelmű elsőbbséget kell adni a §C-V pontosításainak:

- a tényleges hívásszerep felülírja U0 „lépésből képzett szerep” rövidítését;
- a `gaps` tárolása és jelzése U3 előfeltétele, nem halasztható U4-re;
- U2 lektori válaszszerződés-részébe H53 korrekciója is tartozzon;
- a képi ellenőrző saját utasítása és verziója U5 része;
- B6–B8 véglegesítése a tényleges működéshez igazodjon, ne tervezett képességeket dokumentáljon kész tényként.

A melléklet nem támasztja alá az összes A1-ben felsorolt forrás teljes auditját, ezért a **„100%-os hibaösszesítés” teljesülése NEM IGAZOLT**.

## KONKRÉT MÓDOSÍTÁSI JAVASLATOK A TERVHEZ

- **U5/H48 döntési szabályát cseréljék erre:**  
  „Azonos útvonalú lektori és bank-ellenőri leletek közül csak azonos kifogások vonhatók össze. Minden eltérő tartalmi kifogás bizonyítéka és lezárási kötelezettsége megmarad, a másik jegyzet súlyosságától függetlenül.”

- Kerüljön be regresszió: **ugyanazon tételen két külön hiba; az egyik javítása után a másik lelet továbbra is nyitott**. A próba ellenőrizze az egyesített leletlistát és a `cleared` állapotot is.

- H50 pedagógusi csonkoláskezelése kapjon konkrét egységet, adatutat és elfogadási tesztet.

- A végrehajtási fájl egy helyen rögzítse a fenti feltételeket, a §C-V elsőbbségi pontosításait és minden ismert maradó hiba státuszát.

**Nem szükséges újabb teljes áttervezés. A JAVÍTANDÓ verdikt oka egyetlen megmaradt döntési szabály: az útvonalalapú leletelnyomás. Ennek korrekciója után a többi felsorolt pont végrehajtási és aktiválási feltételként kezelhető.**