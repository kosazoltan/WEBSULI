# Független review — fix/eredmeny-email-kviz / PR #510
Fej: a49c62b393a908e2d92917e82636bcc9fde6115e
## Ítélet: NEM

A helyi kvíz szokásos végleges és félbehagyott útja a célzott teszteken működött. Két külön kör azonban kaphat azonos azonosítót, és a szerver ilyenkor a második tanuló végleges eredményét sikeres duplikátumként nyeli el. Ehhez nem kell fiókváltás, hibás kliens vagy bekapcsolt tartós sor.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

### L1 — Blokkoló: két külön tanuló kvízköre azonos kulcsra eshet, a második végleges levél elmarad
- **Hely:** `source/client/src/lesson-runtime/resultReport.ts:241`, `source/client/src/lesson-runtime/useExperienceRound.ts:13–16`, `source/server/lesson-result-email.ts:376,390–406,718–735`.
- **Forgatókönyv:** két párosított tanuló külön eszközön ugyanazt a Stúdió-leckét tölti ki, eltérő mintavételezett kérdéssorral és kezdési idővel. Az első levele kimegy. Ha a második kör 32 bites azonosítója az elsőével egyezik, a szerver a második tanuló külön kvízére `202 duplicate` választ küld, levél nélkül. A kliens a 202-t sikernek könyveli el és törli a bejegyzést (`resultReport.ts:173–195`).
- **Bizonyíték és cáfolati kísérlet:** a determinisztikus böngészős keresés 15 745 mintavett kör vizsgálatánál talált ütközést; ez nem éles gyakoriság. A két állapotot független Chromium-környezetekben, a valódi leckekomponenssel fejeztem be. Mindkét végleges POST 25 választ és `round-1mk0n4d` azonosítót vitt; a kezdések `1788582780000` / `1789197840000`, az első kérdések `q25` / `q4`. A böngészős próba az API határáig futott, a válasz csonkolt volt. Az erősebb szerveroldali hash bemenete már egyezik, mert a végleges jelző csak lecke + fajta + ennek a rövid azonosítónak a függvénye. A másik tulajdonost az `own` ellenőrzés elutasítja; külön körként nincs mit felismernie. A jelző 24 órás határa a pillanatkép-elnyomásé, nem a végleges jelző egyediségéé; az R52 sem törli a végleges jelzőt. A tervben vállalt 32 bites kompromisszum egy esetleg elmaradó **részleges** levélre szólt, nem a másik tanuló végleges levelére.
- **Javítás:** a kör létrehozásakor egyszer generált és tárolt, nagy entrópiájú azonosító (pl. UUID) a claimen, mindkét eredmény-POST-on és a helyi jelzőkön. A korábban már elküldött körök migrációja ne hozzon létre újraküldést. Regresszióteszt: két külön kör ugyanarra a leckére két levelet ad, az egyik valódi ismétlése nem ad harmadikat.

### L2 — Közepes: a nem az eredmény-API-tól származó `200 text/html` elnyeli a pillanatképet
- **Hely:** `source/client/src/lib/queryClient.ts:183`, `source/client/src/lesson-runtime/resultReport.ts:298–313`.
- **Forgatókönyv és evidencia:** mobil méretű Chromiumban a tanuló válaszol egy kérdésre, majd háttérbe teszi a leckét. Az átmeneti átjáró a háttérkérésre `200 text/html` karbantartási oldalt ad anélkül, hogy az eredménykezelőt elérte volna. A böngésző `1`-et ment a `:quiz:partial:` kulcsra. Amikor a lecke változatlan állapotban ismét háttérbe kerül, már egyáltalán nem indul POST, pedig a következő válasz lehetne szabályos API-202. Azonos HTML-lel és 502-es státusszal a kontrollban két kérés indult, a második sikeres 202 lett. A hibás jelző tartós, újratöltéskor is beolvasódik. Ez nem a követő PR `202 conflict` esete: itt nincs API-nyugta.
- **Javítás:** elküldött állapot csak értelmezhető eredmény-API-nyugta után; a választörzs olvasása is maradjon az időkorláton belül. Sikertelen vagy nem eredmény-API-válasz után ugyanaz az állapot maradjon újrapróbálható.

### L3 — Közepes: falióraugráskor a szerveres leállítás indokolatlanul lenullázhatja az ürítési keretet
- **Hely:** `source/server/index.ts:704–708,745–760`, `source/server/shutdown-flush.ts:8–16`.
- **Forgatókönyv:** SIGTERM után a meglévő gyártásra és takarításra kb. 273 s telik el, közben a szerver faliórája 20 s-ot előrelép. A relatív kényszerleállító időzítőig kb. `295 − 273 = 22 s` van; az ürítő képlete viszont `295 − (273 + 20) − 2 − 10 = −10 s`-ot ad. A helper ezt nullára vágja, így nem várja meg például az adatbázisra váró levélkaput; ha a kisfilmworker már áll, a pool zárása rögtön jöhet. Visszaugráskor túl hosszú keret számolható.
- **Evidencia:** a relatív `setTimeout` és a faliórás `Date.now()` közti eltérés a forrásból és a fenti számításból következik. Nem állítok futtatott SIGTERM-óraugrás-próbát; a meglévő `source/tests/shutdown-flush.test.ts:25–57` a helpernek közvetlenül ad keretet, az időforrásokat nem veti össze.
- **Javítás:** monoton kezdőidőből (`performance.now()` vagy `process.hrtime.bigint()`) számolni az eltelt időt; tesztben a falióra ugorjon, a keret ne változzon.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — talált hiba (L1–L2).** A `kind`, `roundId`, `picks` (`−1` a kihagyás), `answers`, időbélyegek és `subject` megfelelnek a szigorú sémának (`source/shared/lesson-result-email.ts:10–31`); az identitás és a nyugta szemantikája hibás. A `resultApi: 2` közös konstans; a régi alak elhagyja az új mezőket.
2. **Biztonság és adatvédelem — a vizsgált útvonalon nem sikerült megtörni.** Mindkét új írás a közös CSRF mögött áll (`source/server/routes.ts:795–858,889–891`); nincs eredményt író GET. A párosító token az eredményút kérésének törzsében van. A normál eredménylog hibaosztályt használ; a levél kérdéseit, válaszait, mintaválaszát, opcióját és nevét az escape-esetek fedik. A DB-tesztekben a már várakozó igazolt kör tartalmát vendég nem írja át (`source/tests/lesson-result-email-partial-db.integration.ts:298,603`). Ez nem teljes napló-/titokaudit.
3. **Regresszió — talált hiba (L1), a szokásos ágakat nem sikerült megtörni.** A változatlan régi `lesson-result-email.spec.ts` zöld: szöveges feladat és gombos kvíz. Az új spec a vendég Stúdió-kvízt gomb nélkül is méri. A bejelentkezett szerveres `SavedLessonQuiz`/`sendPracticeResult` út megmaradt; a régi HTML saját beküldője nem része a diffnek. A főági, kilétet tartalmazó végleges kézbesítési kulcs a két külön tanulót azonos rövid körkulcs mellett is megkülönböztette.
4. **Időzóna — a zónaformázást nem sikerült megtörni.** `source/tests/lesson-result-email-quiz.test.ts:121–134` téli, nyári és budapesti évforduló-esete zöld; a „Beküldve” összeállítási időpontjának ismert eltérése már tervben szerepel. L3 tényleges falióraugrás, nem időzónaváltás.
5. **Migráció/indítás/cron/e2e — leállítási hiba (L3).** Nincs új migráció; a 64 karakteres `rc:`/`ro:` kulcsok elférnek a migráció és a Drizzle egyező `char(64)` mezőjében. A PostgreSQL 17 próba lefedi az élő, lejárt és végleges sorok elkülönítését. A cron indítása élesre és nem-e2e módra korlátozott (`source/server/index.ts:616–635`); a leállás megállítja az ütemezést (710–713).
6. **Párhuzamosság, ismétlés, megszakítás — hibák L1–L3.** A meglévő 60 ismétléses részleges–végleges DB-verseny, kapuhiba utáni retry és az eredeti tulajdonos alatti helyreállítás zöld. A saját böngészőpróbában 429 után, 10 s-os falióra-visszaugrás ellenére elment a második végleges POST. Több futó szerverpéldányt nem teszteltem.
7. **Tesztminőség — lefedettségi rés L1–L3.** Van valódi HTTP/DB és böngészős viselkedésteszt. J5 forrásőrét R26/R54 dokumentáltan váltja le; a közös ismétlési kapu tesztje viselkedési asserteket kapott. A `result-outbox.test.ts:32–52` két eltérő, előre választott kulcsú írást mér, nem a kulcsképzés egyediségét. Néhány DB-verseny valós időzítőkre épít (`lesson-result-email-partial-db.integration.ts:122–145`), zöld ezen a futáson. Az L2 502-es kontrollja és az L1 külön böngészőállapotai differenciális próbák; védő sor kivételével külön forrásmutáció nem készült.
8. **Feladatspecifikus:** **8a** adatvesztés/határidő L1–L3; **8b** hét nap határa és azonos körön első rögzítő/késői részleges a vizsgált próbákon rendben, L1 külön körre hibás; **8c** lásd 2; **8d** lásd 1, a közbenső régi tömb migrációja T3-N3; **8e** lásd 3–4, címzettek `ADMIN_EMAILS`/`ADMIN_EMAIL`; **8f** lásd 7, az eldobható adatbázisos eredményteszt tesztküldőt használ, a saját böngészős próbák szintetikus adatot.
9. **Egyéb — további igazolt hiba nincs.** A kvízfül, az új kör és az első kérdés választói a 390×844 és 844×390 képernyőképen is látszanak; állóban függőleges, fekvőben vízszintes elrendezésben. A diff nem módosítja az elrendezést.

**R1–R38 tételesen** (zöld = a futtatott teszt megfelelő esete, nem az összes éles variáció):

| Pont | Ítélet és bizonyíték |
|---|---|
| R1 | A 60 DB-verseny és a véglegesítés az elbukott első részleges küldés után zöld. |
| R2 | Utolsó válaszhoz mérés, 7 nap és 7 nap + 1 ms határ zöld; explicit lezárás kivétel. |
| R3 | Kör csere a nézetben, Playwright zöld. |
| R4 | 403 utáni egyszeri tokenfrissítés, Playwright zöld; korhatáros 403-variáns követő jegy. |
| R5 | Szerver körmérete és bejövő pillanatkép 7 napos határa, unit/DB zöld. |
| R6 | A már kiment részleges API-válasz DB-n zöld; API-n kívüli hamis nyugta L2. |
| R7 | A várakozó nagyobb állapotot kisebb késői állapot nem írta felül, DB. |
| R8 | A saját böngészőpróba végleges kérésén `keepalive: true`; késői részjelzőt Playwright is fed. |
| R9 | Két külön HTTP-keret: 60 átmegy, 61. 429, másik IP független. |
| R10 | Régi alak unit/Playwright zöld; részleges nem alakul véglegessé. |
| R11 | Azonos kör, eltérő IP/ujjlenyomat és első rögzítő DB-n zöld; külön kör azonosítója L1. |
| R12 | Jelzés nélküli régi szerver üzemmód Playwrightban zöld. |
| R13 | Levélszöveg, utolsó válasz és eltolt kliensóra, unit/DB zöld. |
| R14 | Közvetlen ürítés DB-n zöld; leállítási keretszámítás L3. |
| R15 | Azonos körön eltérő beküldővel véglegesítés elnyomja a késői részlegest, DB. |
| R16 | A rendes vendégkontroll vendég maradt; a 12. kör idegen részleges előzménye követő jegy. |
| R17 | Teljes pillanatkép nem ütemez, DB zöld. |
| R18 | Tartós végleges jelző vizsgálata memóriatörlés után zöld; nem valódi újraindítás. |
| R19 | Kapuhiba után egyszeri, ellenőrzött retry, DB zöld. |
| R20 | Függő előző beküldés mellett a külön azonosítójú következő indul, Playwright; ütközés L1. |
| R21 | Frissebb állapot kiszorítja a kapuhibás régit, DB. |
| R22 | Mért párhuzamos felvételnél az igazolt első tartalma marad, DB. |
| R23 | 403 után képesség nélküli új token mellett nincs második pillanatkép, Playwright. |
| R24 | Lapon belüli újrapróba a saját 429-es kontrollban zöld; dokumentumok közti tartósság alapból ki, T-3. |
| R25 | Lassú régi küldés közben nincs hamis `queued: true`, DB. |
| R26 | Folyamatos 503-as Playwright-próba és `retries: 0` őr zöld. |
| R27 | Külön tanulók eredményeit összevonhatja (L1). |
| R28 | Tárírási hiba mellett memóriasor küld, unit/Playwright; `sent`-írás hiba követő jegy. |
| R29 | Felvétel közben véglegesített kör nem hoz létre várakozót, DB. |
| R30 | A sor 7 napos határa unit zöld; lejárt lezárt kör tartós visszaéledése T3-N2. |
| R31 | Címkeeltérés lefokoz a mért esetekben; a kivett fiókváltási osztályra nincs jóváhagyás. |
| R32 | Külön tárolókulcsos bejegyzések modellje zöld; a kapcsoló alapból KI. |
| R33 | Határidő-számítás L3; változatlan óránál párhuzamos helper-tesztek zöldek. |
| R34 | Kapuhiba közben idegen vendég nem szorítja ki az igazolt tulajdonost, DB. |
| R35 | R47/R50 váltotta le; a mért helyreállításban nem vette át az új címet. |
| R36 | A „már kiment” lekérdezés alatti véglegesítés után nincs várakozó, DB. |
| R37 | Megakadt POST-választest teszt zöld; `AbortSignal.timeout` kompatibilitása követő jegy. |
| R38 | Névfeloldás hibájára újrapróba, ciklusvégen felszabadulás, DB. |

**T1–T20:** T1 levélsorok/mintaválasz — unit zöld; T2 automatikus kvíz és feladatos feltétel — unit/Chromium zöld; T3 gomb nélküli és kihagyásos lezárás — Chromium zöld; T4 `gate:stage`/`gate:push` nem futott, a mért kapuk lent; T5 séma/dátum/escape — unit zöld; T6 késleltetés/elnyomás — DB zöld, azonosító L1; T7 pillanatkép/korkorlát — a normál kontroll zöld, nyugta L2; T8 unit/DB/Chromium célcsomagok zöldek; T9 P1/P2 útvonal és körváltás, P3 nyugta L2, P4 késői részleges DB/Chromium; T10 R1–R8; T11 R9–R10; T12 R11–R14; T13 R15–R17; T14 R18; T15 R19; T16 R20–R23; T17 R24–R25; T18 R26–R29; T19 R30–R34; T20 R35–R38 — ítéletek a táblázatban. A külön **T-3** (T3-E1–E4, T3-N1–N3) nem e fej követelménye.

**R39–R54:** R39–R40 tokenhez kötött törzs és küldéskori lejárat a Playwright-csomagban zöld. R41–R42 halasztott küldés és az eredeti tulajdonos folytatása DB-n zöld (a lefokozott R53 kivétel). R43, R44, R47–R50 célzott böngészős helyreállítás és párosítás zöld a vállalt kivételeken kívül. R45 közvetlen DB-ürítő zöld; R46 a kapu mögötti HTTP-próba zöld; R51 claim/TTL/számláló kontroll zöld, azonosító L1; R52 sorkiválasztás DB-n zöld; R53 kivéve; R54 a böngészős óra-visszaugrásra a követett és a saját próba is zöld.

## Mit próbáltam megtörni, és nem sikerült

- Szabályos 502 HTML után a változatlan félbehagyott eredmény második háttérbe kerülésnél újra elindult. L2-nél a különbség a hamis siker.
- Végleges 429, `Retry-After: 1`, 10 s-os falióra-visszaugrás: a második 25 válaszos kérés elindult és 202-t kapott; mindkét POST keepalive-os volt.
- Sikertelen részleges küldés után véglegesítés, kapu- és névfeloldási hibák, lejárt claim-sorok: a célzott DB-esetek nem törtek.
- A 60 + 60 kérés egy IP-ről átment a közös kapu mögötti külön kereteken, a többi írás a saját közös határán megállt.

## Mit NEM vizsgáltam

- Éles Resend/Render és többpéldányos forgalom: az L2 200-as átjáróválasza csonkolt, előfordulása élesben UNVERIFIED. L1 a böngészőtől az API-határig mért; a két konkrét eredményre külön valódi DB-s levélpróba nem futott, a szerverkövetkezmény statikus. A régi HTML-anyagok éles kézbesítése és fizikai Safari/iOS sem volt mérve.
- Valódi szerveres SIGTERM + falióraugrás nem futott; L3 kódból számolt. Nem mértem a takarítás cron-időpontját és végrehajtási idejét nagy éles táblán.
- Saját forrásmutáció nem futott: a saját Node-próbát a futtató v24.22.3-as biztonsági korlátja elutasította. Követett fájlt nem módosítottam. Teljes repóteszt és a két kiadási kapuszkript nem futott.
- A követő PR-ra tett nyitott füles fiókváltást, az R53 és a kivett R52-szabály eseteit, a takarítás két adagja közti szétválást, a 403 utáni korkorlátot, a dokumentált tesztküldő-, AbortSignal-, Retry-After- és 12. körös kivételeket nem számoltam új leletnek; a 202 utáni tartósság szintén külön szelet.

## Megcáfolt gyanúk

- Az eredménylimiter-kivétel nem kerüli meg a CSRF-et, csak a közös sebességkorlátot.
- Az `rc:` és `ro:` kulcs nem lóg túl a DB-mezőn: `3+61`, illetve `3+29+32` karakter. A törlőszűrő nem érinti a hex végleges kulcsokat.
- Normálisan két külön, éppen befejezett kör nem blokkolja egymást a kliensben: az in-flight őr azonosító szerint dolgozik; L1-ben maga az azonosító nem különbözteti meg a köröket.

## Mit futtattam (parancs + eredmény)

- `npx tsc --noEmit` és `npx tsc --noEmit -p tsconfig.test.json` — mindkettő 0.
- `npx tsx --test source/tests/lesson-result-email-quiz.test.ts source/tests/lesson-result-email.test.ts source/tests/learner-attribution.test.ts source/tests/result-report-complete.test.ts source/tests/result-outbox.test.ts source/tests/shutdown-flush.test.ts source/tests/lesson-result-limits.test.ts source/tests/request-retry.test.ts` — 55/55 zöld.
- `npx tsx --test source/tests/admin-route-guard.test.ts source/tests/review-rate-limit.test.ts` — 13/13 zöld, a külön DB-kapcsolati figyelmeztetések mellett.
- `run_db_tests` — 299/299 zöld, eldobható PostgreSQL 17.
- `run_e2e source/tests/lesson-result-email-quiz.spec.ts source/tests/lesson-result-email.spec.ts` — 49/49 zöld, Chromium.
- `run_browser_scenario .blind-review-tmp/kviz-proba.json` — 429-es kontroll, álló/fekvő képek és determinisztikus ütközéskeresés; 0.
- `run_browser_scenario .blind-review-tmp/eredmeny-hatarok.json` — két valódi kliensbeküldés, 200 és 502 kontrollpár; 0, a mért eltérés L1–L2.
- `node .blind-review-tmp/korazonosito.mjs` — elutasítva; a bizonyíték a két böngészős próbából származik.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 1 | 1 | 1 | 0 | 0 |
| közepes | 2 | 2 | 1 | 0 | 0 |
| kicsi | 0 | 0 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) Két külön tanuló körének azonosítóütközése elnyeli a második végleges levelet — `source/server/lesson-result-email.ts:735` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L2** (közepes) A 200-as HTML karbantartási oldal elküldöttnek jelöli a pillanatképet — `source/client/src/lib/queryClient.ts:183` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L3** (közepes) A falióra ugrása lenullázhatja a szerver leállítási ürítési keretét — `source/server/index.ts:746` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 36 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 7737
- tokenek: 5321020 bemeneti (ebből gyorsítótárból: 4976824, gyorsítótárba írva: 216474), 28270 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 94.2%; becsült megtakarítás: 18.6955 USD
- költség (a tényleges usage alapján): 1.3216 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
