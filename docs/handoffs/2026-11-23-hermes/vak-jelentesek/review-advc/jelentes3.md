# Független review — adventi naptár / felület és élesítés előtti javítások
Fej: d53178ef3c072f056133ef7066a1a3892997cb53
## Ítélet: IGEN, FELTÉTELLEL
A leletek jegyre menjenek. A kapcsoló maradjon **kikapcsolva**: L1 és L2 javítása és visszamérése szükséges, és a tulajdonosi admin-előnézet (D-11) és a jóváhagyott grafika sem áll rendelkezésre ezen a fejen. Az utóbbi kettő külön tervezett szelet; az ítélet a kikapcsolt felület összevonására, nem az élesítésre vonatkozik.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

**L1 — közepes: késő átvételi válasz visszafesti a már megoldott ablakot.** `source/client/src/pages/AdventCalendar.tsx:369–370,281–284`; `source/client/src/advent/sync.ts:137–147`. Párosított tanuló 360×640-es telefonon megnyitja, majd bezárja az összesítést és megoldja a 2. ablakot. Az összesítés által indított `/adopt` válaszát késleltettem. A sikeres válasz után „2 / 24 világít”; a régi átvételi válasz után „1 / 24 világít”, a 2. ablak `open`. A GET lemondása nem érinti a másik POST-ot, az alany-generáció azonos, a DB-zár pedig a tranzakciókat sorosítja, nem a válaszok kézbesítését (`source/server/advent/store.ts:154–155`, `source/server/advent/routes.ts:531–532`). DB-adatvesztést nem állítok. **Javítás:** régebbi szerververziójú állás eldobása, vagy az átvétel és a játékírások sorosítása. Tesztben a régi `/adopt`-válasz csak a sikeres válasz és a kivilágosodás után érkezzen meg.

**L2 — közepes: az „Újra” nem próbálja újra a kész vendégeredmény átvételét.** `source/client/src/pages/AdventCalendar.tsx:365–373,472–476`. Párosított tanuló 360×640-en látja a kész 24/24-es vendégeredményt. Az automatikus `/adopt` 503-at kap; helyreállás után a gyerek megnyomja az „Újra” gombot. A hiba eltűnik, de csak `GET /state` megy ki. Az összesítés **külön** újranyitására már ment POST. A változatlan előnézet nem indítja újra az effektust. A DB-teszt igazolja, hogy a GET nem ír; ha a gyerek a hiba eltűnését sikernek veszi és kilép, másik eszközén nem jelenik meg az eredmény. Évadzárás után már nem lehet átvenni (`source/server/advent/routes.ts:519–522`). **Javítás:** tényleges, aktuális alanyhoz kötött `POST /adopt` az átvételi hiba újrapróbájára; igazolt mentésig látható függő állapot.

**L3 — kicsi: átmeneti hibánál elvész a főoldalról indított kérdésnyitás szándéka.** `source/client/src/pages/AdventCalendar.tsx:350–359,472–476`. A kártya célcímére érkező, ismert évfolyamú tanulónál fekvő telefonon a mai ablak első nyitása 503-at kap. Helyreállás után az „Újra” csak állapotot olvas, nincs kérdés; külön az ablakra kattintva megnyílik. A nyitási szándék már a POST előtt törlődik. **Javítás:** az újrapróba friss állapot alapján folytassa a kérdésnyitást, csak siker vagy szándékos megszakítás fogyassza el a szándékot.

**L4 — közepes: a sorőr átengedi a kirajzolhatatlan ablakrácsot.** `source/server/advent/routes.ts:59–66,125,357–358`; fogyasztó: `source/client/src/pages/AdventCalendar.tsx:47–48,505–508`. Ha sérült decemberi mentésben a `layout` egyik eleme például `25`, a szerver csak a tömb voltát ellenőrzi, majd elküldi a mindig 1…24-ig képzett ablaklistával. A gyerek telefonon megnyitja a naptárt: `doorsByDay.get(25)` → `undefined`, az `!` nem futásidejű őr, a `shownState` az `undefined.state`-et olvassa. Így célzott 409 helyett renderhiba; üres tömbnél kivétel nélkül tűnik el a rács. A zöld `source/tests/advent-limits.test.ts:447–448` még jóként kezeli az egyelemű `layout: [1]` tömböt teljes kérdésterv mellett. A 25-ös eset kódútból igazolt, a tényleges sérült DB-sor HTTP-válasza **UNVERIFIED**. **Javítás:** a `layout` legyen az 1…24 permutációja; HTTP/DB-teszt duplikált, hiányzó és tartományon kívüli elemmel.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — talált hiba (L1, L4).** A `doors` és `summary` együtt érkezik, de másik írás régebbi nézetet alkalmazhat; a `layout` nincs ellenőrizve a `doors`-hoz. A `question: null` / `correctIndex: -1` működő, futtatott szerver–kliens út (`source/tests/advent-calendar.spec.ts:90`, DB-kör).
2. **Biztonság/adatvédelem — a vizsgált úton próbáltam, nem sikerült megtörni.** Az adventi API fejlécben/törzsben viszi az azonosítókat (`useAdvent.ts:87–110`, `routes.ts:219–229`), nem URL-ben; a közös API-napló szűrt metaadatot ír (`source/server/index.ts:455–483`). Az `/adopt` token nélkül 403, a GET nem módosít sort (`advent-routes-db.integration.ts:984–1000`). Ez nem állítás a meglévő, `?t=`-s párosító levéllink teljes életútjáról. A bank nyilvános (terv 16.7), de az API megnyitáskor nem küldi a helyes indexet és magyarázatot.
3. **Regresszió — a futtatott körben próbáltam, nem sikerült megtörni.** A két játéklista változatlan, listaőrök és meglévő nyilvános/admin DB-esetek zöldek. `UserFileList.tsx:317–326`: Hero → foglalat → támogatói sáv. Buildkapus lusta útvonal és kártya; a leckeutak pozíciója változatlan (`App.tsx:102–110`). A valódi KI release-build nem volt mérhető.
4. **Budapesti idő — próbáltam, nem sikerült megtörni.** Határtesztek éjfél két oldalával, több évaddal; a nyitva hagyott böngészőtesztben frissül az új ablak válasz után is, illetve eljön a január 7-i zárás (`advent-calendar.spec.ts:329,449`).
5. **Migráció/indítás/e2e — próbáltam, nem sikerült megtörni; adventi cron nem alkalmazható.** Változatlan 0042 és Drizzle, a DB-kör a kétszeri migrációt és sémát ellenőrzi. A `store.sweep` bekötése az S6-ra marad. E2e tesztidő nélküli letiltás és eldobható DB leállása igazolt.
6. **Párhuzamosság/újrapróba — talált hiba (L1–L3).** A két első átvétel és egy-pillanatképes olvasás DB-tesztje zöld, de nem fedi két POST eltérő kézbesítését. Két saját 503-as úton az „Újra” nem az eredeti műveletet indítja. A követett megnyitási időkorlát-teszt lefutott (`advent-robustness.spec.ts:152–168`); az ottani sikeres visszatéréshez is külön ablaknyitás kell.
7. **Tesztminőség — talált hiányt (L1–L4).** Késő GET van a követett e2e-ben, késő POST nincs; a sikeres DB-átvétel nem méri az 503 utáni gombot. A CLS, mobil dobozok és fókusz mért viselkedés, az admin-őr és készletvalidátor futó negatív esetet is tartalmaz. A KI build-őr forrásmintás (`advent-calendar-client.test.ts:163–178`). A korábbi kiosztási teszt dokumentáltan a 22.11 szerint változott: a megmutatott kérdéseket zárja ki, nem az összes foglalást (`advent-limits.test.ts:488–497`). Saját kódmutáció nem indulhatott a futtatóban.
8. **Feladat-specifikus ellenőrzés:**
   - **8a — talált hiba:** L1/L2. Friss/eltérő évfolyam, két eszköz első átvétele, lezárt mentés és ismételt válasz: tesztelt (`advent-routes-db.integration.ts:657,751,818,984`; `advent-pr-c-vak.test.ts:172`). A késő nyitás és a 429 közbeni alanyváltás e2e (`advent-calendar.spec.ts:388`).
   - **8b, elfogadás:** **A1** ép sorral 24 ablak, L4; **A2** négy opció/évfolyam; **A3** azonos kérdés/sorrend; **A4** normál ismétlésmentesség; **A5** eltérő alany: kiosztási tesztek, A4-nél 22.11 kivételével. **A6** visszajelzés/tovább; **A7** új kérdés és max. két javítás: szabályteszt, DB és e2e. **A8** szöveghű üzenet 24/24-nél és 23/24-nél mind a 24 válaszával; **A9** 22/24-nél nincs; **A10** új kör; **A11** statisztika: szabályteszt/e2e. **A12** napi nyitás; **A13** éjfél; **A14** pótlás/zárás: időteszt/e2e. **A15** szezonkártya: főoldali e2e. **A16** S6, nincs. **A17/A18** párosított/névtelen évfolyam: DB/e2e. **A19** CSRF; **A20** tárolt válasz; **A21** kérdésalak; **A22** azonosítók; **A23** KI API; **A24** séma: DB, egység és forrásőr. **A25** S5/S6, nincs. **A26** standard mobilállapotok mérése zöld. **A27** bevitel/hószünet; **A28** kérdés/összesítés, hibaút L3; **A29** csökkentett mozgás; **A30** fókusz/Escape: e2e. **A31** 2D/importút forrásból, gzip UNVERIFIED. **A32** standard mobil e2e konzolhiba-ellenőrzése zöld. **A33** készletvalidátor; **A34** vegyes napok; **A35** alsós kiosztás/körök; **A36** normál ismétlésmentesség: bank/kiosztás, A36-nál 22.11 kivételével. **A37/A38/A39** S8, nincs. **A40** helyőrző működik, kész illusztráció nincs (`art-manifest.ts:6`). **A41** kép- és cache-mérés S3c. **A42** hívásmentes kép-pipeline teszt zöld. **A43** csillag és csökkentett mozgás e2e. **A44** hely/méret/CTA főoldali e2e. **A45** egy koppintás ismert évfolyammal zöld, 503 után L3. **A46** nincs a játékok közt; szezonon kívül/fejléc nélkül nincs kártya. **A47** `layout-shift` és doboz: a szezonon kívüli alapvonalhoz képest ≤0,02 többlet három tesztméreten, kész banner nélkül. **A48** listaőrök zöldek, a teljes örökölt főoldali e2e nem futott. **A49** 144-es út és 429-fejléc a tesztekben, nem valós iskolai terhelés. **A50** S5/S6, nincs. **A51** fejléc nélkül KI. **A52** üres zárószöveg, pótláskor nincs „holnap”, elérhetetlen 95%-nál nincs ígéret: szabályteszt; szezon előtt „Még nincs itt az advent…”, teaserben szerveres „Hamarosan” (`AdventCalendar.tsx:400–407`). **A53** lejárt link és újrapárosítás: e2e.
   - **8b, 22. szakasz:** **1** friss évfolyam DB; **2** alany-cache egység/e2e; **3** lezárt mentés DB; **4** szerver-várakozás egység/e2e; **5** státuszhiba egység, külön főoldali 5xx nem mért; **6** teljes ablaklista szerver/egység, L1; **7** egyetlen pillanatkép DB; **8** `retired` kizárás egység, 22.11 kivételével; **9** vegyes pótlás egység; **10** napkulcs egység, layout L4; **11** körváltás DB, legrégebbiek pótlása egység; **12** sikeres átvétel HTTP, 503 után L2; **13** alany-generáció egység/e2e; **14** éjféli horgony egység/e2e; **15** más évfolyam eredménye egység; **16** lejárt link őre egység/e2e; **17** célzott 409-es felület e2e, amikor a szerver tényleg 409-et ad (L4); **18** csillag e2e; **19** késő nyitás/429 alanyváltással e2e; **20** késő GET e2e, azonos alanyú késő POST L1; **21** fázisváltás e2e; **22** újrapárosítás másik lapon e2e; **23** csillag 360 px-en e2e és álló képen.
   - **8c — próbáltam, nem sikerült megtörni:** lásd 2.; `clock.ts:20–25` az e2e-ág előtt az éles órát adja, követett HTTP-teszt futott.
   - **8d — talált hiba:** L1/L4. `pairing: invalid` és 429 `Retry-After` szerveroldalon tesztelt; az automatikus író-újrapróba fix várakozású (`busy.ts:28–34`).
   - **8e — a mért normál nézetet nem sikerült megtörni.** Saját 360×640 és 844×390 képen a 24. ablak alja a mért `y + height` szerint 632 és 382 px, mindkettő belefér. A csillag látszik, az álló cím csonkolódik. A hosszú kérdés, gombdobozok és Escape utáni fókusz követett tesztje zöld. A kombinált hibasávos fekvő teszt belső görgetést megenged (`advent-robustness.spec.ts:193–210`), így ez nem bizonyít teljes görgetésmentességet minden hibás állapotban.
   - **8f — talált teszthiány:** L1–L4 a zöld futások mellett. Eldobható adatbázis és helyi mockok; adventi levélküldő nincs bekötve.
9. **Egyéb — talált hiba:** a közös „Újra” kezelő összemossa az állapotolvasást két sikertelen írással (L2/L3). Az S3c/S6 előfeltételei hiányoznak, ezért a D-11 nem teljesíthető ezen a fejen (`art-manifest.ts:6`, `App.tsx:109`, `source/server/routes.ts:894–901`).

## Mit próbáltam megtörni, és nem sikerült
- Két egyidejű első átvétel, olvasás commit előtt/után és sikeres ismétlés: a külön DB-kapcsolatú tesztek nem veszítettek megoldást, nem dupláztak sort.
- Késő GET, késő nyitás alanyváltás után és január 7-i fázisváltás: a követett e2e védelem működött.
- Üres lezárt naptár és lejárt-link sáv: a saját álló és fekvő képeken nem találtam levágást; kész grafikát nem láttam.

## Mit NEM vizsgáltam
- Külön KI release-artifact, gzip-súly, éles Render/Vercel: a külön build tiltott; az e2e-kikapcsolás nem helyettesíti az artifact mérését.
- A kész képes változat CLS-e, képbájt/cache, admin-előnézet, éles levelezés, tulajdonosi telefon: külön szeletek és környezet. Nem indítottam képgenerálást vagy valódi levelet.
- WebKit, valódi képernyőolvasó, iskolai NAT-terhelés és a teljes régi főoldali/Stúdió/játékos-login böngészőcsomag: marad kompatibilitási kockázat. Saját főoldali 5xx nem futott.
- Saját Node-kódmutáció és sérült sorral saját HTTP/DB futás: a két Node-próbát a sandbox hálózati korlátozása miatt elutasította. L4 kódút és követett sorőrteszt, nem mért HTTP-eredmény.

## Megcáfolt gyanúk
- Az átvétel nem GET-mellékhatás, és nem CSRF-kivétel: DB-teszttel ellenőrzött.
- Nem kell 24 helyes válasz: 23×100 ≥ 95×24, de 22×100 < 95×24; minden ablakra kell válasz. Zöld szabályteszt és e2e.
- L1 nem bizonyít mentésvesztést: a zárolt szervermentés nem azonos a késő HTTP-válasz felületi alkalmazásával.

## Mit futtattam (parancs + eredmény)
- `npx tsc --noEmit` — sikeres.
- `npx tsx --test source/tests/advent-{calendar,rules,assignment,contract,elesites-elott,pr-c-vak,pr-c-vak2,home-card,calendar-client,source-guard,art-pipeline}.test.ts` — külön fájlargumentumok, 108 átment.
- `npx tsx --test source/tests/advent-{limits,christmas-bank,dialog-escape,tap-guard}.test.ts source/tests/admin-route-guard.test.ts source/tests/home-list-visibility.test.ts source/tests/home-cards-modern.test.ts source/tests/home-practice-games-catalog.test.ts` — külön fájlargumentumok, 48 átment.
- `run_db_tests` — 262 átment, eldobható PostgreSQL 17 eltávolítva.
- `run_e2e source/tests/advent-calendar.spec.ts source/tests/advent-home-card.spec.ts source/tests/advent-robustness.spec.ts` — 60 átment, eldobható DB eltávolítva.
- `run_browser_scenario .blind-review-tmp/advent-review-ui.json` — 3 eset, 2 megtekintett kép, L1 reprodukálva.
- `run_browser_scenario .blind-review-tmp/advent-review-retry.json` — 2 eset, L2/L3 reprodukálva.
- `node .blind-review-tmp/advent-corrupt.mjs`, `node .blind-review-tmp/advent-mutation.mjs`, `npm run build:client` — futtató elutasította.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 0 | 0 | 0 | 0 | 0 |
| közepes | 3 | 3 | 2 | 0 | 0 |
| kicsi | 1 | 1 | 1 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (közepes) Késő átvételi válasz visszafesti a már megoldott ablakot — `source/client/src/pages/AdventCalendar.tsx:370` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L2** (közepes) Az Újra nem küldi újra a kész vendégeredmény átvételét — `source/client/src/pages/AdventCalendar.tsx:475` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L4** (közepes) A sorőr érvényesnek fogadja a kirajzolhatatlan ablakrácsot — `source/server/advent/routes.ts:59` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 22 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 3549
- tokenek: 3234642 bemeneti (ebből gyorsítótárból: 3008088, gyorsítótárba írva: 226488), 28270 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 94.4%; becsült megtakarítás: 11.2042 USD
- költség (a tényleges usage alapján): 1.1499 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
