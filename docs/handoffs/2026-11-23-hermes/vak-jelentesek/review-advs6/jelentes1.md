# Független review — feat/advent-s5-s6-elesites
Fej: b0bbadf106f7c2517ffacf721812b9cf046d7898
## Ítélet: NEM
A kapcsoló maradjon KI. Az A25/A50 szerinti címzettenkénti kézbesítés megszakadt futás vagy részleges siker után nem áll helyre. Az admin-előnézet szerveroldali elkülönítése működik, de a kliens az előnézeti állapotot a normál folyamatban is felhasználja.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

**L1 — blokkoló — A tartós levélfoglalás kézbesítésnek számít: újraindítás vagy részleges siker után címzettek maradnak ki.** `source/server/advent/store.ts:190`, `source/server/advent/result-email.ts:128–145`, `source/server/index.ts:741–749`. Egy párosított tanuló a telefonján teljesíti a naptárat. Ha a szerver az első tartós `claimMail` és a szolgáltatói hívás között leáll, a `final:` foglalás megmarad, de címzett nem kapott levelet. Évadzáráskor egyetlen foglalás is az **egész sort** kizárja. Ugyanez leállás nélkül: az egyik címzettnek sikerül a küldés, a másiknál az eredeti és az egyetlen memóriabeli pótküldés is hibázik. A sikeres címzett foglalása miatt a másiknak januárban sem próbál küldeni. Megcáfolási kísérlet: a DB atomikus foglalása védi a szokásos párhuzamos/ismételt küldést, a szolgáltatói idempotenciakulcs megismételt szolgáltatói hívásnál segíthet, de egyik sem pótol elmaradt hívást. A zöld DB- és S5-tesztek csak a három sikeres címzettet, a teljesen levél nélküli sort, illetve az egyszer hibázó küldőt fedik (`source/tests/advent-routes-db.integration.ts:1035–1083`, `source/tests/advent-s5.test.ts:100–111`). A megszakítási pont a kódúton igazolt, nem futtatott folyamatölés. **Javítás:** tartós küldési sor évad–tanuló–címzett egyedi kulccsal, külön lejáró foglalással és kézbesítési állapottal. Újraindításkor a hiányzó címzettek folytathatók legyenek; bizonytalan szolgáltatói kimenetnél stabil idempotenciakulcs és egyeztetés kell. Teszt: leállás foglalás után, leállás szolgáltatói átvétel után, részleges siker, párhuzamos feldolgozók.

**L2 — közepes — Az előnézeti gyorsítótárból a normál főoldal egy még zárt ablakot nyitna.** `source/client/src/advent/useAdvent.ts:153–157`, `source/client/src/components/AdventHomeCard.tsx:35–39`. Az admin mobilon megnézi a december 10-i előnézetet, onnan a Vissza gombbal a december 5-i normál főoldalra jut, és megnyomja a „Kinyitom” gombot. A gyorsítótár kulcsa csak az alany-generációt tartalmazza, a módot és a napot nem. A 390×844-es Chromium-próbában, szétválasztott normál és előnézeti HTTP-fixture-rel, a valódi főoldali CTA előtt „Ma a 10. ablak nyílik — és még 9 vár rád” látszott; a CTA `/api/advent/doors/10/open` kérést indított, a normál `/state` csak a 403 után ment ki. Másik próbában paraméter nélküli útvonalon is látszott az ELŐNÉZET sáv. Ez kliensoldali keveredés, nem DB-sorok összekeverése. **Javítás:** elkülönített normál/előnézeti mód és előnézeti nap a cache-kulcsban és az írások eredményének alkalmazásánál; a főoldal mindig normál módot kérjen. Teszt teljes lapfrissítés nélküli oda-vissza navigációval.

**L3 — közepes — Az átvételi hibánál az „Újra” az összesítő modál mögé kerül (§22.25).** `source/client/src/pages/AdventCalendar.tsx:718`; a tényleges gomb a háttérben van (`:550–555`), a mentésjelző `:620`-on. Párosított gyerek fekvő telefonon megnyitja az összesítést, az átvétel 503-at kap. A modál azt mondja, próbálja újra, de benne csak „Bezárás” van. A 844×390-es képen látszik a háttér elsötétített gombja. A böngésző egy POST-ot, nulla modálon belüli újrapróbagombot és a hiba után eltűnt mentésjelzőt mért. Bezárás után az „Újra” tényleg elindította a második POST-ot. A követett teszt is előbb bezárja az összesítést (`source/tests/advent-calendar.spec.ts:559–565`), ezért átmegy. **Javítás:** a mentetlen állapotot és a működő „Újra” gombot az aktív modálban is mutatni, a sikeres válaszig.

**L4 — közepes — A zárás előtt feldolgozott, zárás után kézbesített válasz visszaírja a régi lezáró állapotot (§22.21, §22.24).** `source/client/src/advent/sync.ts:44,60`, `source/server/advent/routes.ts:143,511`. A tanuló január 6-án, éjfél előtt válaszol. A szerver elmenti a választ, az éjféli GET már lezárt nézetet olvas ugyanazzal a sorverzióval, majd a hálózat kézbesíti a korábbi POST-választ. A verzióőr egyenlőségnél elfogadja a régi `closing` és `doors` mezőket az új `phase` mellé. A böngészős fixture sorrendje: `catchup GET v1` → mentett `answer v2` → `closed GET v2` → késleltetett `answer v2`. A lezárt sáv a fixture „Folytasd a naptárat!” szövegére váltott; éles szövegekkel ez a pótlási fázis szövege lenne a januári lezárás helyett. A szerver írási tilalmát ez nem oldja fel. **Javítás:** külön kezelni a sor revízióját és a nap/fázis-pillanatképet; régi fázisnézet egyenlő revízióval se írhassa felül az új GET-et. A sorhoz falióra helyett valódi monoton revízió ajánlott.

**L5 — közepes — Az ablaknyitással mentett végleges átvétel nem indít levelet.** `source/server/advent/routes.ts:410,443–445,541–558`, `source/server/advent/store.ts:139–157`, `source/server/advent/adoption.ts:193–202`. A tanulónak 24 megválaszolt, 22 megoldott ablaka van, a párosított telefonon pedig vendégként megoldott egy, a tanulónál még javítható ablakot. Ha az ablaknyitás beér és lefut a külön `/adopt` vendégsor-olvasása előtt, a megnyitás tranzakciója átveszi az ablakot, menti a megfelelést és törli a vendégsort, de nem hív `onResult`-ot. A későbbi `/adopt` már nem találja a vendégsort, ezért a levélhorgát sem éri el. Újabb válasz nélkül a levél csak évadzáráskor pótolható, nem a 18.1 szerinti első végleges eredménykor. A tranzakció- és útvonalkövetés igazolja; ezt a sorrendet külön DB-próbában nem futtattam. **Javítás:** minden megfelelésbe átmenő tranzakció hozza létre ugyanazt a tartós küldési eseményt, a kiváltó végponttól függetlenül.

**L6 — kicsi — Óraátállítás napján az előnézeti óra nem budapesti dél.** `source/server/advent/preview.ts:30`. Az admin a 2026. március 29-i vagy október 25-i előnézetet kéri. A kód a budapesti éjfél UTC-idejéhez 12 eltelt órát ad; az óraátállítás miatt ez rendre 13:00 és 11:00 budapesti idő. A független böngészős `Intl`-számításban a szomszédos napokon 12:00 lett. A szezon szokásos napjain nincs ablakra gyakorolt hatás. **Javítás:** közvetlenül a zónabeli 12:00-t konvertálni UTC-re; teszt mindkét átállási napra.

**L7 — kicsi — A szülői levélből hiányzik a tantárgyankénti bontás.** `source/server/advent/result-email.ts:87–95`. Az 5. osztályos tanuló eredményéről a szülő telefonon csak az összesítést látja; még a külön Karácsony sor sincs benne. A 4.1(e) és a 12.3 előírja, a 18.1 a pillanatot és a legjobb kört módosítja, a bontást nem vonja vissza. A levélsablon és a teszt csak összesítő mezőket tartalmaz. **Javítás:** a legjobb kör tervének `subjects` mezőjéből és a próbákból legyen HTML-kódolt tantárgyi bontás, Karácsony sorral.

**L8 — kicsi — A státuszvégpont nem ad 400-at hibás előnézeti dátumra.** `source/server/advent/routes.ts:355`. Admin munkamenetben `/api/admin/advent/preview/status?date=2026-02-30` 200 `{ enabled: false }`-t ad, miközben az ilyen `/state` 400-at. A közös `/status` megkerüli az előnézeti `invalidClock` kezelőt. Az ág forrásból egyértelmű; a HTTP-teszt csak a `/state`-et és egy írást jár be. **Javítás:** egységes 400-as dátumkezelés a státuszon is, vagy az előnézeti `/status` leválasztása, ha nem támogatott.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — talált hiba.** Az állapot alakja közös (`source/shared/advent/contract.ts:53–87`), de a mód nincs elkülönítve a kliensen (L2). A teljes ablaklista és a régi szerver egyetlen `door` mezőjére visszaeső út tesztje zöld; azonos revíziónál a fázis és a `closing` keveredik (L4).
2. **Biztonság/adatvédelem — a szerveroldali jogosultságot próbáltam, nem sikerült megtörni.** A22: olvasásnál fejléc, írásnál törzs, az előnézeti URL-ben csak nap; a normál napló az állapot `firstName` mezőjét nem írja ki (`source/server/index.ts:475–499`). Admin nélkül nincs előnézet, CSRF nélkül nincs törlés; CSRF-fel az admin csak saját előnézetét törli. A DB-teszten a párosított GET nem mentette el az átvételt. A levél HTML-escape tesztje és a nyilvános e-mail-cím őr zöld; címzettek a terv meglévő adminfeloldójából érkeznek, nem tanulói/feliratkozói listából. L2 kliens-cache, nem jogosultság-megkerülés.
3. **Regresszió — talált hiba az SPA-n (L2).** A build-flag őre, az érintetlen játéklistát ellenőrző teszt, a kikapcsolt API és a fejléc nélküli e2e-út zöld; a vendég és párosított tanuló böngészős alapútja lefutott. Régi tananyag és Stúdió-lecke teljes UI-útja nem futott.
4. **Budapest és dátumhatárok — talált hiba.** November–január fázistesztjei és az egyszerű téli/nyári előnézeti nap zöld; L6 az átállás napja, L4 a január 7-i válasz/GET verseny.
5. **Séma, takarító, indulás/leállítás, e2e — sémát és törlést próbáltam, nem sikerült megtörni; leállási hiba L1.** Migráció és Drizzle-séma nincs a diffben; az eldobható DB-séma és a takarítás tesztje zöld. A teszt megtartja a frissebb eszköz- és preview-sort, a tanulói sort és az aktuális értesítő-foglalást. Induláskor és naponta fut, `unref`-fel, e2e-n kívül; az évadzáró levél a flag mögött van. A leállítás nem várja meg és az új indulás nem rekonstruálja az adventi levélmunkát.
6. **Párhuzamosság/ismétlés/időtúllépés — talált hiba.** Normál kétlapos válasz, különböző revíziók és az írás előtt indult GET eldobásának követett tesztje zöld. Azonos revíziós fázisverseny (L4), átvételi belépők versenye (L5), valamint tartós kézbesítési hiány (L1) nincs kivédve.
7. **Tesztminőség — talált rés.** A DB-s rácsteszt konkrét hibásérték-mutációkkal járja be a GET-et és POST-ot; az admin-őr önellenőrzése mesterséges őrizetlen végpontot utasít el. Az „Újra” forrás-őre önmagában csak mintákat mér, a böngészőteszt pedig előbb bezárja az összesítést (L3). A saját browser-próbában a válaszsorrendet és verziókat változtattam; forrássor-eltávolításos mutáció nem futott. A teljes rács-fixture és a látott kérdésekre szűkített kizárólista dokumentált spec-változások. A tesztóra injektálható; az S5 rövid újrapróba-tesztje valódi időzítőt használ. Valódi levél tesztben/e2e-ben nem indult.
8. **Feladat-specifikus elfogadás:**
   - **8a / A25, A50:** preview, vendég és nem végleges tanulói sor nem küld a mért utakon. Három sikeres címzett és ismétlés zöld. Megszakadás/részleges siker és implicit véglegesítés: L1, L5. A takarító éles tanulói sort nem töröl. Késői kézbesítés: L4.
   - **8b / A16, A22, §22:** az A16 teljes lapbetöltéssel zöld valódi adminnal, majd munkamenet nélkül; DB-ben a nyilvános flag KI mellett is. SPA, óraátállás, státuszdátum: L2, L6, L8. A22 lásd 2. A §22 pontjai: **1, 3, 7–10, 15, 17, 27** — évfolyam, lezárt olvasás, egy DB-pillanatkép, történeti kizárás, karácsonyi pótlás, sérült terv és rács tesztjei zöldek. **2, 13, 16, 19, 20, 22** — alanyváltás, lejárt link, régi GET/POST és újrapárosítás célzott tesztjei zöldek; az előnézeti módváltást nem mérik. **4, 14, 21** — szerveróra, horgony és önálló fázisváltás zöld, együttes késői POST-tal nem (L4). **5, 6** — a főoldal átmeneti státuszhibája és a teljes ablaklista tesztje zöld. **11, 12** — körváltás és kifejezett átvétel zöld; L5 ettől eltérő levélút. **18, 23** — csillag viselkedése és önálló helye: követett teszt zöld, álló képen látható. **24–26** — L4 és L3; a tiszta főoldali egyszeri 503 utáni nyitás tesztje zöld, előnézetből jövet L2 eltér. **28** — a `render.yaml` változatlan, az alapérték KI; valós bekapcsolás nem történt.
   - **8c:** admin/CSRF, normál fallback és HTML-kódolás lásd 2.; tartalmi bontás L7. **8d:** közös válaszalak és verzió/ablaklista visszaesés lásd 1.; kliens-cache L2. **8e:** KI és e2e lásd 3. és 5.; leállás L1. **8f:** a 7. pont; S6-egységteszt injektált órát és időzítőt használ, DB-ben hamis levélküldő van.
9. **Egyéb — talált hiba.** Sablontartalom L7, eltérő közös `/status` ág L8. Az illusztrációk helyőrzők: a jegyzék üres; a végleges képcsere külön szelet, nem állítom késznek.

## Mit próbáltam megtörni, és nem sikerült

- Idegen vagy névtelen előnézet, CSRF nélküli törlés, másik admin sorának törlése: a valódi DB/HTTP őrök elutasították vagy elkülönítették.
- Párosított GET-mellékhatás és sérült rács: a GET nem ment; a hiányos, üres, ismétlődő és tartományon kívüli elrendezésnél a DB-sor változatlan maradt.
- Már elküldött levél szokásos újrahívása, nem végleges eredmény és vendégsor: a hamis küldő nem kapott új hívást. Ez nem cáfolja L1-et.
- Főoldali egyszeri 503 utáni újranyitás, kisebb szerververziójú `/adopt` késleltetése: a követett böngészős teszt mindkettőt megfogja. A saját próbák ettől eltérő feltételeket terheltek.

## Mit NEM vizsgáltam

- Éles Render/Vercel, éles adat, valódi Resend, szolgáltatói deduplikációs ablak, S8 éles értesítő: nem indítottam valódi küldést. A szolgáltatói kimenet és az éles konfiguráció UNVERIFIED.
- Adventi foglalás közbeni tényleges folyamatölés, több éles szerverpéldány, szolgáltatói időtúllépés és nyers DB/provider hibák teljes A22-naplóútja: UNVERIFIED. A Node-os saját próbát a futtató homokozója elutasította; L1 és L5 az ellenőrzött kódutakból, nem végrehajtott crash-tesztből következik.
- Régi kliens új szerverrel, régi tananyag és Stúdió-lecke teljes UI-útja, éles játékosfiókos be-/kilépés: UNVERIFIED, megosztott hookra marad regressziós kockázat. Valós telefon, Safari, képernyőolvasó, végleges képanyag és a teljes kérdésbank tényszerűsége sem volt a helyi ellenpróba része. A két megnézett kép Chromium, helyőrzőkkel.

## Megcáfolt gyanúk

- Az előnézeti URL önmagában nem jogosít és nem választ tanulói DB-sort. Külön admin-őr, külön `preview` alany, nincs levélhorgó.
- Sikeres küldés után a normál ismétlés nem dupláz szükségszerűen: az atomi foglalás védi. Ettől még a megszakadt küldés elveszhet.
- Az e2e build kapcsolója nem az éles flag: érvényes fejléc nélkül a szerver naptára nem él, az éles Render-konfig változatlan.

## Mit futtattam (parancs + eredmény)

- `npx tsc --noEmit` — kilépés 0.
- `npx tsx --test source/tests/advent-s5.test.ts source/tests/advent-s6.test.ts source/tests/advent-pr-c-vak3.test.ts source/tests/admin-route-guard.test.ts` — 25/25.
- `npx tsx --test source/tests/advent-elesites-elott.test.ts source/tests/advent-pr-c-vak.test.ts source/tests/advent-pr-c-vak2.test.ts source/tests/advent-calendar.test.ts source/tests/advent-assignment.test.ts source/tests/advent-calendar-client.test.ts source/tests/advent-home-card.test.ts source/tests/advent-source-guard.test.ts source/tests/no-real-emails-guard.test.ts` — 71/71.
- `run_db_tests` (`npm run test:learning-db`, eldobható PostgreSQL 17) — 267/267, a DB-t eltávolította a futtató.
- `run_e2e source/tests/advent-calendar.spec.ts source/tests/advent-robustness.spec.ts source/tests/advent-home-card.spec.ts` — 64/64 Chromium-eset, egy worker, eldobható DB.
- `run_browser_scenario .blind-review-tmp/advent-browser.json` — 2 lefutott eset, megnézett 390×844 álló és 844×390 fekvő kép (L2, L3). Valódi kliens, szintetikus HTTP-válaszok.
- `run_browser_scenario .blind-review-tmp/advent-boundaries.json` — 3 lefutott eset: CTA, fázisverseny, független `Intl`-számítás (L2, L4, L6). Az első, viewport nélküli beadás nem indult el; a pótolt változat lefutott.
- `node .blind-review-tmp/advent-data-proba.ts` — a Node 24 homokozókorlátja miatt nem futott.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 1 | 1 | 0 | 0 | 0 |
| közepes | 4 | 4 | 3 | 0 | 0 |
| kicsi | 3 | 3 | 0 | 1 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) A foglalás után megszakadt vagy részben sikeres kézbesítés nem áll helyre — `source/server/advent/store.ts:190` — hivatkozás igazolt
- **L2** (közepes) Az előnézet állapota átkerül a főoldali és a normál naptárba — `source/client/src/advent/useAdvent.ts:154` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L3** (közepes) Az újrapróbagomb az összesítő modál mögött van — `source/client/src/pages/AdventCalendar.tsx:718` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L4** (közepes) Késői válasz egyenlő sorverzióval visszaírja a lezárt nézet szövegét — `source/client/src/advent/sync.ts:60` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L5** (közepes) A megnyitással mentett végleges átvétel nem indít levelet — `source/server/advent/routes.ts:444` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 23 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 4349
- tokenek: 3408551 bemeneti (ebből gyorsítótárból: 3163389, gyorsítótárba írva: 245093), 26468 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 94.1%; becsült megtakarítás: 11.7758 USD
- költség (a tényleges usage alapján): 1.1939 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
