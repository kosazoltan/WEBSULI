# Független review — feat/advent-c-felulet-es-elesites, 4. visszaellenőrző kör
Fej: 1adcfef5728364de8fb92eeba68034a02a148bd3
## Ítélet: IGEN, FELTÉTELLEL
Nem találtam új blokkolót; a négy korábbi jegy nyitva marad. Az ítélet az alapból kikapcsolt változás beolvasztására vonatkozik, **nem** a D-11 szerinti bekapcsolás engedélye.

## Az előző kör leleteinek sorsa
Az előző jelentésben nem volt blokkoló. **L1, L2 és L3 nem szűnt meg:** mindhárom hibát reprodukáltam böngészőben. **L4 nem szűnt meg:** a kliensoldali renderhibát reprodukáltam, a szerverőrt forrásból ellenőriztem; a sérült DB-sor teljes HTTP-útja továbbra is UNVERIFIED. A súlyosságok változatlanok.

A fej merge: első szülő `d53178ef`, második szülő a megadott base (`f7f94f22`). A két szülő és a fej Playwright-konfigurációjának összevetésében a főágról érkező csomagolt Chromium megmaradt (`source/playwright.config.ts:27–34`), az adventi szerverkapcsolóval együtt (`:74–76`). A `docs/agent-csapdak.md` konfliktusfeloldása nem változtat futáskódot. Az integrációt és a korábbi leletek útját vizsgáltam; ez nem új audit a változatlan játéklogikáról.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

- **L1 — közepes: a későn érkező átvételi válasz visszafesti a megoldott ablakot.** `source/client/src/pages/AdventCalendar.tsx:281–284,365–372`; `source/client/src/advent/sync.ts:137–147`. Párosított tanuló 360×640-es telefonon megnyitja az összesítést, Escape-pel bezárja, majd megoldja a 2. ablakot. A régi `/adopt` pillanatképet csak a sikeres válasz és a kivilágosodás után engedtem át: `2 / 24 világít` → `1 / 24 világít`, a 2. ablak ismét `open`. A DB-zár a tranzakciókat rendeli sorba, nem a válaszok kézbesítését. A kliens ugyanazon alanygeneráción belül a régi GET-et szakítja meg, a másik POST-ot nem. A base-ben ez a kliensoldal és a külön `/adopt` nincs. Kijelzési visszalépés, nem igazolt DB-adatvesztés. **Javítás:** régebbi verziójú szerverpillanatkép eldobása vagy az átvétel és játékírások sorosítása; tesztben a régi válasz a kivilágosodás után érkezzen.
- **L2 — közepes: a kész vendégeredménynél az „Újra” nem próbálja újra az átvételt.** `source/client/src/pages/AdventCalendar.tsx:365–373,472–476`; `source/server/advent/routes.ts:519–522`. Párosított tanuló 360×640-en látja a 24/24-es előnézetet. Az első `/adopt` 503-at kap; helyreállás után a gyerek megnyomja az „Újra” gombot. A hiba eltűnik, de a nyomvonal `GET state → POST adopt → GET state`; második POST csak az összesítés külön megnyitásakor indul. A követett DB-eset ellenőrzi, hogy a GET nem ment, és másik eszköz a sikeres POST után látja az eredményt (`source/tests/advent-routes-db.integration.ts:989–1009`). Ha a gyerek kilép a hiba eltűnésekor, az átvétel függőben marad; évadzárás után már nem lehetséges. A base-ben ez a külön mentőút nincs. **Javítás:** az átvételi hiba „Újra” gombja az aktuális alanyhoz kötött `POST /adopt`-ot ismételje meg, és sikerig jelezze a függő állapotot.
- **L3 — kicsi: átmeneti hibánál elvész a főoldalról indított kérdésnyitás szándéka.** `source/client/src/pages/AdventCalendar.tsx:350–359,472–476`. Ismert évfolyamú tanuló a kártya célcímére érkezik 844×390-en. Az első nyitás 503-at kap; az „Újra” után csak GET-ek mennek (`GET state → POST open 5 → GET state → GET state`), kérdés nincs. Az ötödik ablakra külön rákattintva megjelenik. A POST előtt törlődik a szándék. A base-ben nincs ez a nyitási út. **Javítás:** újrapróbánál friss állapot alapján folytassa a nyitást; csak siker vagy tudatos megszakítás fogyassza el a szándékot.
- **L4 — közepes: a sorőr átengedheti a kirajzolhatatlan ablakrácsot.** `source/server/advent/routes.ts:54–66,125,357–358`; `source/client/src/pages/AdventCalendar.tsx:47–48,505–508`. Ha egy decemberi mentés `layout` tömbjében 25 szerepel a teljes 1–24. kérdésterv mellett, a szerverőr csak a tömb típusát nézi. Az ennek megfelelő 200-as állapotot beadva 360×640-en a `doorsByDay.get(25)` után `Cannot read properties of undefined (reading 'state')` és a globális hibahatár jelent meg. A 409-es kontroll a helyes, felnőtthöz irányító nézetet mutatta. A követett egységteszt az egyelemű `layout: [1]`-et is jóként fogadja (`source/tests/advent-limits.test.ts:443–448`). A base szerverőre is gyenge; a diff új fogyasztója renderhibává teszi a tartományhibát. Sérült tárolt állapot szükséges; a DB–HTTP szakasz nem futott. **Javítás:** az elrendezés az 1–24 permutációja legyen; hiányzó, ismételt és tartományon kívüli elemmel legyen külön 409-es HTTP/DB-teszt.

## A hibakereső pontok (ítélet + bizonyíték)

| Pont | Ítélet és bizonyíték |
|---|---|
| 1. Adatszerződés | **Talált hiba: L4.** Az ablaklistát és az elrendezést a fogyasztó összekapcsolja, a szerverőr nem validálja együtt. A teljes ablaklista és a tárolt eredmény HTTP-szerződése külön tesztelt (`advent-routes-db.integration.ts:790–804,898–914`). |
| 2. Biztonság/adatvédelem | **Próbáltam, nem sikerült megtörni a vizsgált úton.** Az átvételi DB-eset CSRF nélküli POST-ra 403-at, GET után változatlan sort vár (`:989–1005`). Az adventi kliens az azonosítókat fejlécben vagy törzsben adja (`useAdvent.ts:73–75,86–110`); a végpont-leltár zöld. |
| 3. Regresszió | **Próbáltam, nem sikerült megtörni a merge által érintett utat.** Valódi HTTP-n, tesztidő nélkül a főoldali kereső látszott, a kártya nem, az állapot 404; a `Games` és `HomePracticeGames` diffje üres. A Chromium-őr zöld. |
| 4. Europe/Budapest | **Próbáltam, nem sikerült megtörni.** A decemberi UTC 23:00-s váltás, december 25. és január 7. időtesztjei zöldek. Nyitva maradt lap lezárására külön e2e-eset van (`advent-calendar.spec.ts:449–461`). |
| 5. Migráció/indulás/cron/e2e | **Próbáltam, nem sikerült megtörni az indítást.** Migráció és Drizzle-séma diffje üres. A futtatók eldobható PostgreSQL-lel indultak és a konténer eltávolítását jelentették. Cron nem alkalmazható a merge-deltára. |
| 6. Verseny/ismétlés | **Talált hiba: L1–L3.** A fordított POST-kézbesítés nincs védve, az „Újra” két helyen csak olvas. A DB-eset a sikeresen commitolt válasz megőrzését méri, nem a kijelzési sorrendet (`:872–895`). |
| 7. Tesztminőség | **Talált rés: L4.** A hiányzó napkulcs DB-tesztje viselkedést mér (`:859–869`), de a `layout` tartományát nem. Lezárt előnézet: a módosított elvárás dokumentált (terv 22.3; DB-diff `:585–588`). A Chromium-őr negatív mintákat is tesztel (`playwright-bundled-chromium-guard.test.ts:23–35`); saját forrásmutációt a futtató elutasított. |
| 8a. Átvétel/alanyváltás | **Talált hiba: L1–L2.** A friss profilévfolyamot, lezárt állást és két eszközt célzó DB-esetek (`:756–855`) nem fedik a két klienshibát; a generációs egységtesztek zöldek. |
| 8b. Elfogadási pontok | **Talált hiba: L1–L4**; lásd lent a megfeleltetést. A szó szerinti üzenet, javítási plafon, szezon előtti és üres zárószöveg szabálytesztje zöld. |
| 8c. Titkok/CSRF/tesztóra | **Próbáltam, nem sikerült megtörni a vizsgált úton.** A kérdésalak tesztje kizárja a helyes választ és magyarázatot; a nem e2e HTTP-óra tesztje szerint a fejléc hatástalan. A bank nyilvánossága a terv 16.7 szerinti vállalt határ. |
| 8d. 409/429/eltűnt kérdés | **Talált hiba: L4.** A célzott `409 corrupt` UI-kontroll működött. A C5 DB-esete `question:null` és `correctIndex:-1` mezőket, a limit-esetek 429-et és `Retry-After`-t tesztelnek. |
| 8e. Kapcsoló/fókusz/mobil | **Próbáltam, nem sikerült megtörni a vizsgált utat a leleteken túl.** Megnéztem a 360×640-es álló rácsot és a 844×390-es fekvő kérdést. A fekvő dialógus mért doboza 544×370 px, a nézeten belül; a válaszok nem fedik egymást, a panel belül görgethető. A kérdés fókuszt kapott, Escape bezárt. Az azonnali zárás utáni fókuszminta még nem az ablakot mutatta; a végső fókusz-visszaadást a követett teszt méri. |
| 8f. Tesztek és mellékhatások | **Próbáltam, nem sikerült megtörni az eszközváltás után.** A konfig megtartja a tesztidőt, az eldobható DB-módot és a csomagolt Chromiumot. Éjfélnél vezérelt óra; saját próba helyi szerverrel és mesterséges válaszokkal, levélküldés nélkül. |
| 9. Más hibaforrás | **Próbáltam, nem sikerült megtörni az összeolvasztást.** A főági Chromium-váltás nem törölte az adventi kapcsolót és nem hozta vissza a gépre telepített Chrome-csatornát. |

**Elfogadási pontok a szelet és a visszaellenőrzés határán:**
- **6/A1–A11:** kiosztási, állapot- és küszöbtesztek; A1 sérült sorrendnél L4; A6 visszajelzése és a rács L1-ben ellentmondhat. A8 szó szerinti 24/24 üzenet, 23/24 és 22/24 határ; A7 két javítás; A9–A11 a végállapot, következő kör és összesítés tesztjei.
- **6/A12–A24:** A12–A15 idő és láthatóság; A16 külön S6. A17–A18 profil/vendég évfolyam; A19–A23 CSRF, ismételt válasz, kérdésalak, azonosító útja és kapcsoló. A24: DB-indítás futott, saját kettős migrációs/séma-próba nem.
- **6/A25–A32:** A25 külön S5/S6. A26–A30 követett mobil-, mozgás-, összesítő- és fókusztesztek, két saját kép; A28 normál egykoppintásos út, hibánál L3. A31 importőr zöld, éles gzip-méret UNVERIFIED; A32 mellett L4 injektált állapotból renderhibát ad.
- **12.5/A33–A39:** A33–A36 készlet/kiosztás, a 22.11 ismétlési kivételének külön tesztje van. A37–A39 külön S8.
- **13.8/A40–A43:** A40 helyőrzők a két képen, végleges A40–A41 WebP/cache az S3c határa; A42 generátor nem változott. A43 csillaghelye látszik, felgyulladás külön tesztelt.
- **14.6/A44–A48:** A44 és A47 magasság, elhelyezés és CLS a főoldali specben (`advent-home-card.spec.ts:25–59,174–227`). A45 normál út és L3. A46 listamentesség forrásőrrel, fejléc nélküli hiány valódi HTTP-n. A48 teljes régi tesztlista nem futott.
- **16.10/A49–A53:** A49 limit/párhuzamosság; A50 külön levél-szelet; A51 saját HTTP; A52 szabály és január 7.; A53 párosítási tiltás és másik lapos helyreállás.
- **22/1–10:** 1, 3, 6–10 célzott DB- vagy egységeset; 2 generáció; 4 szervervárakozás; 5 HTTP-hibánál megtartott hely. L4 nem a 10. pontban tesztelt hiányzó kérdésnap, hanem hibás elrendezés.
- **22/11–23:** 11 körváltás és legrégebbi ismétlés; 12 szervermentés/idempotencia, újrapróba L2; 13–16 generáció, horgony, vegyes évfolyam, tiltás; 17 az érvényes `409 corrupt` kontrollja működik, L4-nél az őr nem ezt állítja elő; 18 és 23 csillagtesztek. 19–22 a régi alany, régi GET, fázisváltás és újrapárosítás esetei; L1 azonos generációjú POST–POST sorrend.

## Mit próbáltam megtörni, és nem sikerült
- Tesztidő nélkül megpróbáltam előhozni a kártyát: valódi HTTP-n `enabled:false`, állapot-404, kártya nélkül.
- A helyes alakú `409 corrupt`-ra a kliens célzott üzenetet adott, újrapróba nélkül.
- A két szülő konfigjával és a csatornaőrrel ellenőriztem, hogy a merge visszahozta-e a gépi Chrome-ot vagy elvesztette-e az adventi e2e-kapcsolót: egyiket sem.

## Mit NEM vizsgáltam
- Éles Render/Vercel, tulajdonosi előnézet, végleges WebP/képgyártás, éles levél és cron nem futott. A kikapcsolt Vite-build műterméklistáját és a gzip-méretet nem mértem: a kapcsolóőr forrásalapú. D-11 ettől a review-tól független.
- L1–L4 saját böngészős próbái mesterséges válaszokat használnak; a teljes DB–HTTP–böngésző időzítést, L4-nél a sérült DB-sor HTTP-válaszát nem mértem. Saját Node-mutáció nem futott: a futtató Node v24.22.3-on a hálózati izoláció hiánya miatt elutasította.
- A változatlan ágakat nem auditáltam újra; az A48 teljes regressziós lista, Stúdió-lecke, fizikai telefon, éles proxynapló és a kérdésbank tételes tényellenőrzése nem igazolt ebben a körben. Az e2e napló egyes `advent-robustness.spec.ts` sorszámai eltérnek a fájlolvasóétól (párosított teszt: 583, illetve 417); az összesített futtatói eredményt jelentem, a tételes megfeleltetés itt UNVERIFIED.

## Megcáfolt gyanúk
- L1 nem igazolt adatvesztés: a kijelzés visszalépéséhez elég egy régi pillanatkép késői kézbesítése.
- L2-ben a hiba eltűnése nem igazolt mentés: a nyomvonal csak GET-et mutat, amely a DB-esetben nem módosít sort.
- Fekvő esetben nem az oldal nyúlik túl: a 370 px-es dialógus a 390 px-es viewportban van, a görgetés a panelen belüli.

## Mit futtattam (parancs + eredmény)
- `git diff base...head` stat és forrásdiffek; `git show head`, `git show d53178ef` és `git show base`: merge és a leletek base-összevetése.
- `npx tsc --noEmit -p tsconfig.test.json`: exit 0.
- `npx tsx --test` két körben: `advent-pr-c-vak2`, `advent-limits`, `advent-elesites-elott`, `advent-calendar-client`, `playwright-bundled-chromium-guard` (43/43); `advent-calendar`, `advent-rules`, `advent-assignment`, `advent-christmas-bank`, `advent-contract`, `advent-home-card`, `advent-pr-c-vak`, `admin-route-guard` (75/75).
- `run_e2e source/tests/advent-calendar.spec.ts source/tests/advent-home-card.spec.ts source/tests/advent-robustness.spec.ts`: a futtató 60 sikeres tesztet jelentett.
- `run_db_tests`: 268 sikeres eset, eldobható PostgreSQL eltávolítva.
- `run_browser_scenario .blind-review-tmp/advent-kor4.json` és `run_browser_scenario .blind-review-tmp/advent-kor4-layout.json`: három-három eset; L1–L4, 409 kontroll, fejléc nélküli állapot, két szemrevételezett kép.
- `node .blind-review-tmp/advent-kor4-check.mjs`: elutasítva; nincs mutációs mérés.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 0 | 0 | 0 | 0 | 0 |
| közepes | 3 | 3 | 3 | 0 | 0 |
| kicsi | 1 | 1 | 1 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (közepes) Késő átvételi válasz visszafesti a megoldott ablakot — `source/client/src/pages/AdventCalendar.tsx:370` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L2** (közepes) Az Újra nem próbálja újra a kész vendégeredmény átvételét — `source/client/src/pages/AdventCalendar.tsx:475` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L4** (közepes) A sorőr átengedheti a kirajzolhatatlan ablakrácsot — `source/client/src/pages/AdventCalendar.tsx:507` — hivatkozás igazolt; futtatással igazolt (teljes út)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 22 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 3177
- tokenek: 2718415 bemeneti (ebből gyorsítótárból: 2504724, gyorsítótárba írva: 213625), 26807 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 93.8%; becsült megtakarítás: 9.3043 USD
- költség (a tényleges usage alapján): 1.0527 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
