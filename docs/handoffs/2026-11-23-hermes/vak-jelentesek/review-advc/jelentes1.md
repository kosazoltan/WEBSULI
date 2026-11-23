# Független review — feat/advent-c-felulet-es-elesites
Fej: efa4c5806f0d388977dcbef393bd257c2ac07ecc
## Ítélet: NEM

A kapcsoló maradjon kikapcsolva. Két blokkoló átvételi hiba van: szabályos játék után elérhetetlenné válhat a második kör, illetve a felület mentett tanulói eredménynek mutathat egy befejezett vendégnaptárt anélkül, hogy átvinné. A D-11 szerinti tulajdonosi előnézeti próba ettől független élesítési feltétel.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

### L1 — Blokkoló: átvétel után elfogyhatnak a második kör kérdései

**Hely:** `source/server/advent/adoption.ts:72–73`, `:150–162`; `source/server/advent/routes.ts:364–367`, `:468–472`.

**Forgatókönyv:** Egy elsős december 24-én a párosított tableten mind a 24 ablakban elhasználja a három próbát, de egyet sem old meg. A telefonján vendégként négy ablakot megold. Ezután a telefonon megnyitja a személyes linkjét, majd egy már megoldott ablakra koppint: ez elmenti az átvételt. Az „Új naptárat kérek” sikeresen a második körre vált, de ott már az első ablak megnyitására is 503 érkezik; az újrapróbálás nem segít.

**Evidencia, cáfolási kísérlet:** Az elsősök 150 tételét a bankból számoltam: `source/shared/advent/christmasBank/items-01-04.ts:9–158` (144 + 6); a másik két sávnak nincs elsős tétele. A négy lecserélt tanulói ablak 4 × 3 = 12 különböző kérdése a `retired` listára kerül. A deduplikáció kizárja ezeket a megmaradó 24 × 3 = 72 tervhelyből. A következő kör mind a 72 tervhelyet **és** a 12 `retired` azonosítót kizárja: 150 − 84 = 66 jelölt marad 72 helyre. Ellenőriztem, nincs-e tartalékág: az első megnyitás a teljes új tervet egyszerre építi; az elsősöknek csak ez az egy készlet áll rendelkezésre (`assignment.ts:116–149`). A készlet a 23. nap előkészítésekor elfogy, a `RangeError` 503-ra fordul (`routes.ts:192`); a körváltás nem ellenőrzi a kapacitást. Forrásból levezetett ellenpélda, a saját próba és a DB-futás indítása elutasítva.

**Javítás:** A megmutatott/megválaszolt kérdéseket válasszák külön a fel nem használt foglalásoktól; az utóbbiak lezárt körből ne foglalják a következő kör bankját. Az átvétel mellett is méretezzék a készletet a megőrzendő történetre. Körváltás előtt ellenőrizzék és tranzakcióban mentsék az új, játszható tervet. Regresszióteszt: a fenti elsős eset a második kör első kérdésének tényleges megnyitásáig.

### L2 — Blokkoló: a kész vendégeredmény az összesítés megnyitásával nem kerül át

**Hely:** `source/client/src/pages/AdventCalendar.tsx:274–281`, `:331`, `:348–350`; `source/server/advent/routes.ts:308–323`.

**Forgatókönyv:** A gyerek telefonon vendégként elér 24/24-et. Ugyanezen a telefonon megnyitja személyes linkjét, majd a főoldal „Megnézem” gombját. Az összesítés a párosított keresztnevével és a szó szerinti ajándéküzenettel mutatja az eredményt. Bezárja, anélkül hogy ismét megnyitna egy már megoldott kérdést. Másik párosított eszközön nincs meg a 24/24; január 7-től az eredeti telefon párosított nézetében sincs ott.

**Evidencia, cáfolási kísérlet:** A GET helyesen nem ír, csak egyesített előnézetet ad. A 24 megoldott ablak miatt `nextDoorToOpen` értéke `null`, a `roundIsOver` igaz (`source/shared/advent/home-card.ts:43–55`), a kattintás csak helyi párbeszédablakot nyit. Sem az összesítő, sem az ajándéksáv gombja nem küld írást. Van kerülőút: egy megoldott ablak újranyitása POST, ilyenkor a store menti a merge-et (`source/server/advent/store.ts:138–154`); erre a felkínált befejezési út nem kér. Lezáráskor már csak a mentett tanulói sor látszik, az írás tiltott. A vendégsor nem feltétlenül törlődik ekkor, de az eredmény már nem vehető át.

**Javítás:** A kliens különböztesse meg a függő átvételt a mentett állástól. A megtekintési útból legyen kifejezett, CSRF-védett, idempotens átvételi művelet a GET mellékhatásossá tétele nélkül. Teszteljék a „Megnézem” után egy külön, vendégsor nélküli eszköz visszaolvasását.

### L3 — Közepes: a tanulói kapcsolat változása nem választja szét a gyorsítótárat

**Hely:** `source/client/src/advent/useAdvent.ts:101–106`; `source/client/src/pages/PlayerAccount.tsx:81–84`, `:113`, `:324–329`; `source/client/src/lib/learnerProfile.ts:35–55`, `:97–102`.

**Forgatókönyv és evidencia:** Egy helyi tanulói token nélküli, de korábban tanulóhoz kötött játékos a közös tableten megnyitja a naptárt, majd a fiókoldalon bontja a tanulói kapcsolatot. A 30 másodperces frissességi ablakban ugyanabban az SPA-ban visszanyitja a naptárt: a korábbi tanuló ablakai és az összesítésben a keresztneve jelenhet meg. A szerver a bontás után már `player` alanyt old fel (`source/server/advent/identity.ts:72–78`), de a fiókoldal csak a fiók- és a játékos `/me`-kulcsot érvényteleníti. Minden adventi állapot azonos kulcson él. A lapok közti tokenváltozásra sincs feliratkozás. A be-/kilépéskori GET-megszakítás (`usePlayer.ts:142–146`, `sync.ts:30–33`) ezeken az utakon nem fut, és a régi POST eredménye is generációellenőrzés nélkül írja a közös kulcsot (`AdventCalendar.tsx:159`, `:212–214`, `:244`, `:252`). Ez kliensoldali keveredés, nem szerveroldali jogosultságmegkerülés.

**Javítás:** Reaktív, nem titkos alanykulcs vagy generáció; linkelés/bontás, tokenelutasítás és lapok közti alanyváltozás esetén különüljön el a cache, záródjon a korábbi kérdés. A késői GET- és POST-eredmények csak az indításkori alanygenerációhoz legyenek alkalmazhatók.

### L4 — Közepes: sikeres válasz eltolja az automatikus éjféli nyitást

**Hely:** `source/client/src/advent/useAdvent.ts:110–118`; `source/client/src/advent/sync.ts:36–41`; `source/client/src/pages/AdventCalendar.tsx:159`, `:212–214`.

**Forgatókönyv és evidencia:** December 4-én budapesti 23:00-kor a gyerek megnyitja az oldalt, a GET szerint 3 600 000 ms van éjfélig. 23:55-kor válaszol. A `setQueryData` új `dataUpdatedAt` időt ad, az `applyAnswerResult` viszont megőrzi a régi 3 600 000 ms-ot. Az effektus törli a régi időzítőt: az új határidő 00:00:01 helyett kb. 00:55:01 (23:55 + egy óra + egy másodperc). A nyitva hagyott lapon az 5. ablak zárt marad. A szerver dátumszámítása jó, de nincs új olvasás a válasz után. Az „éjféli határ” böngészőteszt `page.reload()`-ot hív (`source/tests/advent-calendar.spec.ts:271–276`); a tiszta segédteszt nem frissíti közben a cache-t.

**Javítás:** A szerveróra-minta érkezési ideje külön monoton horgony legyen, amit a helyi állapotírás nem módosít. Teszt: ugyanazon a lapon válasz éjfél előtt, majd az új ablak megnyílása újratöltés nélkül.

### L5 — Közepes: a más évfolyamú vendég teljes kérdéssora bekerül a tanulói tervbe

**Hely:** `source/server/advent/adoption.ts:148–154`; `source/tests/advent-elesites-elott.test.ts:32–48`.

**Forgatókönyv és evidencia:** A tanuló telefonon vendégként 4. osztályt választ, megoldja az 1. ablakot. Saját profilja ötödikesre változik, mielőtt tanulóként válaszolt volna. Párosítás után az eredmény helyesen átkerül, de az 5. évfolyamúnak jelölt terv 1. helyére a teljes negyedikes kérdéssor és tárgy másolódik, a fel nem használt kérdésekkel együtt. A friss évfolyam ellenőrzése csak a próbálatlan ablakok ágában van (`:136–143`). A deduplikáció nem ellenőrzi az egyedi vendégkérdés évfolyamát. A célzott teszt a vendéget is ötödikesnek állítja be, és az átvett ablakot kizárja az évfolyam-ellenőrzésből. Ez a 22.1 megsértése; a régi kérdés történeti visszanézése önmagában nem hiba.

**Javítás:** Más évfolyamnál az eredményt és a történeti megjelenítéshez szükséges sorrendmagot vegyék át, ne a terv kérdéssorát és tárgyát. A történeti azonosítók kizárását közvetlenül a próbák biztosítsák.

### L6 — Közepes: lejárt párosításnál az automatikus POST megelőzheti a választást

**Hely:** `source/client/src/pages/AdventCalendar.tsx:128–130`, `:181–185`, `:274–280`; `source/client/src/advent/useAdvent.ts:61–64`.

**Forgatókönyv és evidencia:** A telefonon van már évfolyamot választott vendégnaptár és egy közben visszavont személyes token. A gyerek a főoldali „Kinyitom” gombbal érkezik. A naptár már inicializálta `mustChoose=false` állapotát, a GET a régi token alapján `pairing:invalid` állapotot kap, de közben a párhuzamos profilkérés 401-et ad és törli a tokent (`learnerProfile.ts:97–102`). A jelzőt beállító effektus és az automata ugyanazt a renderelt `mustChoose=false` értéket látja; az automata nem hívja a kézi `pairingBlocks` őrt és a bemenetet frissen olvassa. Így vendégként nyitó POST-ot indíthat, mielőtt a gyerek a „Folytatom vendégként” gombot választotta volna. A szerver az érvénytelen **elküldött** tokenre 409-et ad, a már törölt tokenre ez nem védelem. Az időzített böngészős reprodukció UNVERIFIED.

**Javítás:** Minden író belépőpont ellenőrizze szinkron módon az aktuális `pairing:invalid` állapotot és a tárolt lejáratjelzőt is. Az automata a gyerek döntéséig ne fogyassza el a nyitási szándékot.

### L7 — Kicsi: sérült mentésnél célzott hiba helyett hálózati újrapróbát ajánl

**Hely:** `source/client/src/advent/useAdvent.ts:83–86`; `source/client/src/pages/AdventCalendar.tsx:285–294`.

**Forgatókönyv és evidencia:** Egy tanuló hiányos napkulcsú mentéssel nyit a telefonján. A szerver 409 `corrupt:true` jelzőt és gondozóhoz irányító üzenetet ad (`source/server/advent/routes.ts:63–65`, `:322`). A GET-kliens eldobja a törzset, az oldal pedig csak a túlterhelésre utaló „próbáld meg újra” szöveget mutatja. Az újrapróba ugyanarra a sérült sorra megy.

**Javítás:** Őrizzék meg a gépi `corrupt` jelzőt és adjanak rá célzott, gondozóhoz irányító állapotot; az átmeneti hibán maradjon az „Újra”.

### L8 — Kicsi: a karácsonyfa csillaga nem követi a 24. ablak megoldását

**Hely:** `source/client/src/pages/AdventCalendar.tsx:410–413`, `:506–509`; `source/client/src/advent/advent.css:192–193`.

**Forgatókönyv és evidencia:** A tanuló megoldja a 24. ablakot, de két korábbit elrontott. A 24. ablak a többihez hasonlóan kivilágosodik, és helyőrző motívumként valóban van benne `⭐` (`source/shared/advent/art.ts:33`). Ez nem a karácsonyfa csillagának külön felgyulladása: egyetlen `data-star="lit"` van, az ajándéküzenet szövegén, a megfelelési feltételhez és az összesítő megnyitásához kötve. A13.7/A43 szerint a 24. ablak eseménye a mérce, nem a pontszám.

**Javítás:** A fa csillagának állapota és egyszeri felfénylése kövesse a 24. ablak `solved` átmenetét; csökkentett mozgásnál statikus fény legyen.

## A hibakereső pontok (ítélet + bizonyíték)

| Pont | Ítélet és bizonyíték |
|---|---|
| **1. Adatszerződés** | **Talált hiba** (L4, L5, L7). A `pick`, `recorded`, `doors` sikeres válaszmezői egyeznek; a várakozási mezőhöz tartozó fogadási idő vész el, nem a mező neve vagy típusa. |
| **2. Biztonság, adatvédelem** | **Talált hiba** (L3, L6). A naptár API olvasásnál fejléccel, írásnál törzsben viszi az azonosítókat; a kártya URL-je azonosítómentes. A meglévő személyes link `t` paramétere nem új adventi API-út. Az adventi naplóág hibaosztályt ír, az alkalmazás requestnaplója szűrt (`source/server/index.ts:470–484`). A CSRF a router előtt fut, adventi kivétel nincs (`source/server/routes.ts:802–857`, `:891–901`). |
| **3. Regresszió** | **Próbáltam, nem sikerült megtörni** a futtatható főoldali, kártya- és játékkatalógus-őrökkel. A Hero és a szponzorsáv közé kerül a naptár, az üres listán külön ágban. A közös játékos/tanulói profilút hibái L3/L6; Stúdió böngészőút UNVERIFIED. |
| **4. Budapest** | **Talált hiba** (L4). A tiszta dátumpróbákon a novemberi/decemberi és január 6/7. határ, valamint az évad éve jó; a nyitva hagyott lap frissítése eltér. |
| **5. Migráció, cron, indítás, e2e** | Új migráció **nem alkalmazható** a diffre. A meglévő `0042` és `source/shared/schema.ts:1371–1415` mezői, FK-i, indexei és kényszerei statikusan egyeznek; a DB-futtató kétszer futtatná a migrációt. Az e2e- és az éles óra elkülönül. Előnézet, időzített takarító és levélküldés külön szelet; tényleges DB/cron-életciklus UNVERIFIED. |
| **6. Párhuzamosság és ismétlés** | **Talált hiba** (L2–L4, L6). Azonos kérdés ismétlése aktív körön belül a tárolt próbát használja; a két első párhuzamos átvétel a második, zárolt olvasást használja (`routes.ts:417–424`, `store.ts:129–159`). Valódi Postgres-szinkronizáció és hálózati válaszvesztés teljes útja UNVERIFIED. |
| **7. Tesztminőség** | **Talált hiány:** L4 időzítője `reload()`-dal kikerült, L5 célhelye ki van zárva az évfolyam-állításból. Forrásmutációs ellenpróba: az időzítős effektus elhagyását sem a rögzített idővel hívott segéd, sem a `reload()`-os állítás nem venné észre; ez nem futtatott mutáció. A lezárt olvasás változását a 22.3, a szigorított 24 napos tesztadatot a végrehajtás 16. kiegészítése dokumentálja. A párolvasási DB-teszt tényleges SQL-olvasásszámot és commit előtti/utáni állapotot vizsgál. |
| **8a. Adat- és állapotút** | **Talált hiba** (L1–L3, L5–L6). Lezárva az egyesített előnézet nem fut; írható fázisban egyetlen SELECT adja a két sort. Az 502 státuszt az ál-HTTP próba helyesen nem értelmezi `enabled:false`-ként; a tényleges kártyanézet UNVERIFIED. |
| **8b. Elfogadási pontok** | **Talált hiba**, az egyes kritériumok egyeztetése alább. |
| **8c. Védelmek** | **Próbáltam, nem sikerült megtörni** a kérdés API-alakjának és a tesztidő éles hatástalanságának őrét. A követett HTTP-eset zöld; a nyilvános bank nem titkos (16.7). A kliensoldali adatkeverés külön L3. |
| **8d. Szerződés** | **Talált hiba** (L6/L7). `question:null` → értesítés, `correctIndex:-1` → nincs helyes opció jelölve; `doors` → a teljes lista cserélődik. A szerver 429-re ad `Retry-After` fejlécet a teszt szerint. A kliens nem ehhez igazítja a POST ismétlését, hanem fix 4 másodperchez (`busy.ts:5–6`, `:31`); nem igazolható a fejléc szerinti visszalépés. |
| **8e. Mobil, fókusz, flag** | **Próbáltam, nem sikerült megtörni** a forrásőrökkel és a tiszta Escape/koppintás-tesztekkel. A nyitáskor a kérdés, bezáráskor a megnyitó kapja a fókuszt a kódban. Képernyőkép, tényleges átfedés/levágás, fókusz és kikapcsolt build UNVERIFIED. L8 külön vizuális állapothiba. |
| **8f. Tesztek és külső hívás** | **Talált teszthiány** (L4/L5). A böngészős specek között van valós fókusz-, koppintás- és átfedés-ellenőrzés, a DB-spec szerződést és sorokat is vizsgál, de nem futottak. Nem indítottam valódi levelet vagy fizetős képkérést. |
| **9. Egyéb** | **Talált hiba** (L1): a bank csak a szokásos körökre elég; az átvétel utáni teljes kizárólista felülírja ezt a kapacitásfeltételezést. |

### A terv elfogadási pontjainak egyeztetése

- **6. szakasz:** A1 a 24 ajtós terv és a rács szerint; A2–A3 normál kiosztás és sorrend zöld, L5 az átvett terv kivétele. A4 normál tervben zöld, átvételnél L1/L5; A5 eltérő alanyseed tesztelve. A6 visszajelzés és kézi továbblépés a komponensben; A7 két javítás és új kérdés tesztelve. A8 szó szerinti üzenet és A9 küszöb/javítás zöld tiszta tesztje; A10 L1; A11 mindhárom statisztika a renderben. A12, A14 szerveridő-teszt zöld; A13 L4; A15 tiszta szezonlogika + forrásőr; A16 ezen a fejen nincs előnézeti út. A17–A18 alany és évfolyam serveroldalon, a kombinált eset hibái L3/L5; A19 router előtti CSRF; A20 tárolt próba; A21 szigorú kérdésséma; A22 fejléc/törzs és naplószűrés; A23 alapból kikapcsolt router. A24 statikus sémaegyezés, DB UNVERIFIED; A25 külön S5. A26–A28 mobil és érintés teljes útja UNVERIFIED, a főoldali összesítő ág L2. A29 a CSS és `Snowfall` alapján nincs hóanimáció csökkentett mozgásnál. A30 fókusz/aria kódban, vizuális próba nem indult. A31 importőr zöld, 60 kB mérése és A32 konzolhiba-mérés UNVERIFIED.
- **12.5:** A33–A36 valódi bank validálva és normál tervei megépültek; átvételes méretezés L1. A37–A39 az S8-é, erre a szeletre nem alkalmazható.
- **13.8:** A40 a 30 képhely tesztje zöld, de a manifest üres (`source/shared/advent/art-manifest.ts:6`), még csak helyőrzők vannak. A41 feltétele nem áll, nincs jóváhagyott készletet mérni. A42 száraz terv/ár tesztek zöldek, a CLI kimenetét külön nem futtattam. A43 ablakfény megvan, a fa csillaga L8.
- **14.6:** A44 a Hero utáni sorrend és 132/160 px a forrásban, nem mérve. A45 mai → pótolható → javítható egységteszt zöld; külön út a teljesen kész (L2) és a lejárt link (L6). A46 a játéklistában/rácsban nincs, a lusta út feltételes. A47 a foglalat és a kártya célmagassága azonos; a banner `eager`, tényleges CLS UNVERIFIED. A48 főoldali egység-/forrásőrök zöldek; böngészőút nem indult.
- **16.10:** A49 alanyi és IP-plafon, foglalás és érvénytelen kérések elkülönítése HTTP-próbában átment, valós DB-terhelés nem. A50 külön S5/S6. A51 fejléc nélküli e2e-kapu a kódban. A52 a zárószövegek tiszta tesztje zöld: nincs holnap pótláskor, nincs nullás ablakdarab az üres, lezárt szövegben. A53 érvénytelen szerverjelzés megvan, kliensoldali verseny L6.
- **22. szakasz:** 1. új saját terv friss évfolyamra, az átvett hely hibája L5; 2. kézi játékosváltás GET-ürítése rendben, a teljes alanyelkülönítés L3; 3. lezárva mentett sor, a kész vendégeredmény L2 miatt ettől még nem kerül át; 4. L4; 5. HTTP-hiba elkülönítése segédteszten zöld; 6. teljes ablaklista a kliensben és szerveren; 7. egyetlen SQL-pillanatkép, futás UNVERIFIED; 8. `retired`-kizárás zöld, kapacitás L1; 9. karácsonyi tárgyú hely pótlása egységteszten zöld; 10. hiányzó/üres napkulcs elutasítva, célzott kliensüzenet L7.

## Mit próbáltam megtörni, és nem sikerült

- A tiszta dátum-, pontozási és szövegszabályok határeseteit: 23 megoldott és egy megválaszolatlan ablak még nem ad ajándéküzenetet; 24 megválaszolt és legalább 23 megoldott igen. A két javítás felső határát a szabályteszt ellenőrzi.
- Rossz kérdésalak, választási index, a helyes válasz vagy magyarázat jelenléte az előzetes API-alakban: a szigorú szerződés és a teszt véd. A nyilvános bank ebből nem lesz titkos.
- Az alanyi keret és a produkciós tesztidő-őr: a helyi HTTP-tesztekben csak a 291. írást utasította vissza az alanyi plafon, és nem e2e-ben a fejléc nem változtatta meg az órát.
- Játéklista, üres/nem üres főoldal forrásőrei, Escape kétszeri feldolgozása és koppintásvédő: a releváns egységtesztek sikeresek. Nem helyettesítik a renderelt oldal ellenőrzését.

## Mit NEM vizsgáltam

- **UNVERIFIED:** tényleges képernyőkép, mobil safe-area/átfedés/levágás, fókusz, hang, CLS, az időzítési és hálózati versenyek teljes böngészős útja. A saját 360×640 álló és 844×390 fekvő próba, valamint három követett Playwright-spec indítását a futtató elutasította (`postgres:17` nincs helyben vagy Docker nem fut); nem kaptam képet.
- **UNVERIFIED:** a DB-migráció tényleges kétszeri futása, valódi párhuzamos tranzakció, cron. A DB-futtatás ugyanezen okból nem indult. A saját függvénypróbát a Node v24 hálózattiltási korlátja miatt elutasította a futtató; futtatott mutáció nem volt. A forráslevezetések nem futási eredmények.
- **UNVERIFIED:** Vite OFF-artifact és gzip-méret (`build:client` nem engedélyezett), Vercel/Render éles környezet, proxy, termelési naplók, Stúdió és régi tananyag útja élő böngészőben. Nem indítottam külső szolgáltatást vagy fizetős hívást.
- **Külön szeletek / élesítés:** S3c jóváhagyott grafikája, S5 eredménylevél, S6 előnézet/takarító, S8 értesítő. A flagtől független előnézetet a vizsgált fejen nem találtam (`App.tsx` buildflag mögötti publikus útvonal, `server/routes.ts` publikus router). D-11 tulajdonosi próba nincs igazolva, nem helyettesíthető a tesztfejléccel.

## Megcáfolt gyanúk

- A párosított GET nem írja át a vendégsort: csak választ készít az egyesítésből. L2 szerint a kész eredmény útján szükséges írás hiányzik, nem a GET-védelem.
- A párhuzamos első átvétel második írója nem feltétlenül üres tanulói sorra egyesít: `ON CONFLICT` után újraolvasott, zárolt sorból indul; hiba esetén a törlés is visszagördül. Ez kódellenőrzés, nem futtatott versenyteszt.
- Az első 502 nem hiteles kikapcsolás: a segéd hibát dob, a kártya csak sikeres tiltó válaszra csukódik össze a forrásban.

## Mit futtattam (parancs + eredmény)

- `npx tsx --test source/tests/advent-calendar.test.ts source/tests/advent-rules.test.ts source/tests/advent-assignment.test.ts source/tests/advent-christmas-bank.test.ts source/tests/advent-elesites-elott.test.ts source/tests/advent-home-card.test.ts source/tests/advent-limits.test.ts` — 74/74 átment.
- `npx tsx --test source/tests/advent-calendar-client.test.ts source/tests/advent-contract.test.ts source/tests/advent-dialog-escape.test.ts source/tests/advent-tap-guard.test.ts source/tests/admin-route-guard.test.ts source/tests/home-list-visibility.test.ts source/tests/home-cards-modern.test.ts source/tests/home-practice-games-catalog.test.ts` — 39/39 átment; az adminőr helyi próba-DB kapcsolata `127.0.0.1:1` elutasítva, az útvonalleltár ettől függetlenül lefutott.
- `npx tsx --test source/tests/advent-art-pipeline.test.ts` — 22/22 átment.
- `npx tsc --noEmit` és `npx tsc --noEmit -p tsconfig.test.json` — mindkettő 0.
- `run_db_tests`; `run_e2e source/tests/advent-calendar.spec.ts source/tests/advent-home-card.spec.ts source/tests/advent-robustness.spec.ts`; `run_browser_scenario .blind-review-tmp/advent-browser.json` — indítás elutasítva, PostgreSQL/Docker hiánya, nincs futási eredmény.
- `node .blind-review-tmp/atvetel.ts` — indítás elutasítva, Node v24 alatt nem biztosítható hálózattiltás.
- `npm run build:client` — indítás elutasítva, nem engedélyezett szkript.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 2 | 2 | 0 | 0 | 0 |
| közepes | 4 | 4 | 0 | 0 | 0 |
| kicsi | 2 | 2 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) Átvétel után elfogyhatnak a második kör kérdései — `source/server/advent/adoption.ts:73` — hivatkozás igazolt
- **L2** (blokkoló) A kész vendégeredmény az összesítés megnyitásával nem kerül át — `source/client/src/pages/AdventCalendar.tsx:281` — hivatkozás igazolt
- **L3** (közepes) A tanulói kapcsolat változása nem választja szét a gyorsítótárat — `source/client/src/advent/useAdvent.ts:102` — hivatkozás igazolt
- **L4** (közepes) Sikeres válasz eltolja az automatikus éjféli nyitást — `source/client/src/advent/useAdvent.ts:112` — hivatkozás igazolt
- **L5** (közepes) Más évfolyamú vendég teljes kérdéssora bekerül a tanulói tervbe — `source/server/advent/adoption.ts:152` — hivatkozás igazolt
- **L6** (közepes) Lejárt párosításnál az automatikus POST megelőzheti a választást — `source/client/src/pages/AdventCalendar.tsx:275` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 25 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 4838
- tokenek: 3606711 bemeneti (ebből gyorsítótárból: 3375612, gyorsítótárba írva: 231024), 28934 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 94.8%; becsült megtakarítás: 12.5963 USD
- költség (a tényleges usage alapján): 1.2046 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
