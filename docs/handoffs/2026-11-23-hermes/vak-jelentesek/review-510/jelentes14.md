# Független review — fix/eredmeny-email-kviz / #510
Fej: 7f65b405b0ab884631eb970d27219e1c5452b05b
## Ítélet: NEM

A kötelező böngészős eredménylevél-regresszió piros. Emellett a régi és az új kliens közös helyi tárolója elveszítheti a már beküldött kör új azonosítóját, így ugyanaz a kör újra levélküldésre kerülhet. Ehhez nem kell fiókváltás, és a tartós sor alapértelmezett KI állásában is fennáll.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

### L1 — Blokkoló: az UUID-ra váltás elvágja a kötelező böngészős regresszióteszteket
- `source/tests/lesson-result-email.spec.ts:38`, `source/tests/lesson-result-email-quiz.spec.ts:47,118`; az új formátum forrása `source/client/src/lesson-runtime/useExperienceRound.ts:38–39`.
- Chromiumon, 390×844-es méretben a vendég tanuló kitölti az első feladatot és lezárja a feladatkört. A POST megérkezik, de a teszt a kötőjel nélküli régi formátumot követeli. Mért érték: `round-30ce1e03-d518-42d1-b3d2-01d4d8444912`, elvárás: `/^round-[a-z0-9]+$/`. A teszt így az egyszeri kvízbeküldés és újratöltés ellenőrzéséig sem jut el. Ugyanez a szűk regex maradt az automatikus és a részleges kvíztesztben; mindkét eset bukóként szerepel a futási összegzésben. Összesen 3 bukott, 46 átment.
- Cáfolat: a base szerver sémája is elfogad kötőjeleket, az új sémapróba átment, és a POST-ot a Playwright tényleg látta. Nem hálózati ingadozás vagy szerveres 400; az E7/T3 kapu ettől még nem teljesül.
- Javítás: az új tesztek mérjék pontosan az új formát, a régit külön kompatibilitási esetben. A #492 miatt változatlanul előírt tesztnél vagy maradjon kompatibilis a huzalformátum, vagy egyeztetett, dokumentált szerződésváltással együtt változzon az elvárás. Az egyszeri POST és az újratöltés ellenőrzését meg kell tartani.

### L2 — Blokkoló: a régi fül le tudja választani a már beküldött körről az új azonosítót
- `source/client/src/lesson-runtime/useExperienceRound.ts:39,46–52`; `source/client/src/lesson-runtime/resultReport.ts:236–243`; `source/server/lesson-result-email.ts:390–395,739`.
- Ugyanaz a vendég tanuló ugyanabban a böngészőben nyitva hagy egy, a telepítés előtti alkalmazásfület. Az új fülön minden kérdésre válaszol, gombot nem nyom, és megvárja a sikeres beküldést. A régi fülön ezután az alkalmazáson belül megnyitja ugyanazt a változatlan leckét: a régi állapotíró visszamenti a kört, de a `roundKey` és a `lastAnsweredAt` nélkül. Amikor a friss kliens újranyitja a leckét, a változatlan, teljes kör a régi lenyomatos azonosítóval beküldhető másodszor, új válasz és fiókváltás nélkül.
- Cáfolati kísérlet és forrásbizonyíték: a base `useExperienceRound.ts` a Zod objektumséma `parsed.data` értékét menti vissza, nem őrzi az ismeretlen mezőket. A tárolókulcs nem buildfüggő (`source/client/src/lesson-runtime/LessonRuntime.tsx:530,595`). Nem kell feltételezni, hogy a régi fül is POST-ol: gombnyomás nélkül éppen nem küld. Az új kliens a `sent` jelzőt csak az aktuális azonosítóval keresi. A régi lenyomat kötőjel nélküli, a tárolt UUID kötőjeles: a két ID biztosan eltér. A végleges jelző, a kézbesítési sor és a szolgáltatói idempotenciakulcs is az érkezett ID-ból képződik, nincs köztük alias, így a DB duplikációvédelme sem fogja egy körnek látni. A teljes vegyes buildes böngésző→DB→levél futás **UNVERIFIED**: a saját fixture nem jutott el a kvízig, a saját Node-futtatást a homokozó elutasította. A lelet a két verzió olvasott kódján alapul, nem mért dupla levélen.
- Javítás: olyan verziókompatibilis tárolás vagy deduplikáció szükséges, amelyben a régi író nem tudja eltávolítani az új ID feloldásához szükséges adatot. Teszteljék: új kliens automatikusan beküld → régi kliens megnyitja/visszaírja → új kliens újranyitja → egy levél; kontrollként egy valóban új kör továbbra is küldhető.

### L3 — Közepes, jegyre: a falióra előreugrása idő előtt elfogyasztja a leállítási ürítés időkeretét
- `source/server/index.ts:704–708,746,750,760`; `source/server/shutdown-flush.ts:9–15`.
- Ha a szerver egy futó workflow végét várja SIGTERM után, és közben előreáll a falióra, a 295 s-os `setTimeout` nem ugrik vele, a `Date.now()`-ból számolt keret igen. Kódból számolva: 270 s workflow + 3 s utóvárakozás után `295 − 273 − 2 − 10 = 10 s`; +12 s falióra-korrekció után ugyanennyi ténylegesen eltelt időre `−2 s`. Mindkét ürítési korlát nullára vágja. A szerver továbbmehet a pool lezárása felé, miközben a levél még fut, és a kényszerleállításig maradt idő. A párhuzamosítás az összeadás ellen véd, nem az eltérő órák ellen. Valódi SIGTERM és órakorrekció együtt **UNVERIFIED**; a kereteltérés forrásból levezetett.
- Javítás: a leállítás eltelt idejét monoton órával mérjék, és a kényszeridőzítő meg az ürítés egy közös konstansból számoljon. Az órakorrekciót külön teszt mérje; a jelenlegi `source/tests/shutdown-flush.test.ts:54` a hibás faliórás képletet rögzíti.

### L4 — Kicsi, jegyre: a repó ügynökdokumentuma a review olvasási körét befolyásolná
- `docs/agent-csapdak.md:10–11` (már a base-ben is jelen). Az „Elég ezt az indexet beolvasni” mondat és az utána megadott parancs az automatizált olvasó vizsgálatát szűkítené. Nem követtem; a katalógust adatként kezeltem. Az útmutató nevezze ezt fejlesztői tájékozódási tippnek, ne független ellenőrzést irányító utasításnak.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — talált hiba:** L1/L2. A szerver sémája fogadja az UUID-t; az eltérés a régi teszt és a régi tárolóíró felől jön. Az SQL `char(64)` oszlop kivonatot, illetve 64 karakteres `rc:`/`ro:` kulcsot kap, nem a nyers ID-t.
2. **Biztonság és adatvédelem — próbáltam, nem sikerült megtörni a vizsgált kaput:** a két POST a `source/server/routes.ts:857–891` CSRF-kapuja mögött van. Párosító adat a POST törzsében megy; a hozzáférési napló nem ír teljes sikeres törzset (`index.ts:447–481`), a levélküldő `quiet` módban fut. A DB naplóteszt (`lesson-result-email-db.integration.ts:200`) és az HTML-escape teszt (`lesson-result-email-quiz.test.ts:56`) zöld. A meglévő párosító linkek életciklusa és a követő PR-ban vállalt fiókváltási osztály nem új bizonyíték.
3. **Regresszió — talált hiba:** L1/L2. A feladatok döntőbíró-kapuja és külön, nem keepalive POST-ja megvan; az eredeti feladat/kvíz browser spec az első feladat POST-jáig jut. A `lesson-result-email-db.integration.ts:87` a szerveres kvíz saját kérdéspillanatképéből pontozást ellenőrzi. A régi HTML `/api/material-result` útját a diff nem cseréli le.
4. **Időzóna és dátumhatár — talált hiba az eltelt idő mérésében (L3), nem az időzóna-formázásban:** `lesson-result-email-quiz.test.ts:121–134` téli/nyári és újévi Budapest-határt mér. A „Beküldve” összeállításkori időpontjának éjfélkockázata dokumentált jegy, nem új lelet.
5. **Migráció, indítás, cron, e2e, leállítás — talált hiba (L3):** `0030_lesson_result_emails.sql:3–13` és `shared/schema.ts:1161–1173` egyeznek a használt oszlopokban; eldobható DB-n futott. A cron Budapest-idős és az E2E indulási ág kihagyja (`index.ts:535,634`); leállításkor leállnak a cron taskok (`:711–712`). A kényszerített E2E-küldő már átadott jegy.
6. **Versenyhelyzet, megszakadás, timeout — talált hiba:** L2/L3. A DB-csomag 60, valós időzítővel indított részleges/végleges versenyt tartalmaz, és a tényleges küldősorrendet vizsgálja (`lesson-result-email-partial-db.integration.ts:122–158`). Kapuhiba, névfeloldás, futó/halasztott ürítés és 202 előtti ismétlés külön tesztjei átmentek (`:443,603,642,670,713`).
7. **Tesztminőség — talált hiba:** L1 és L3 forrásőre. Az R46 közös kapu mérését valódi HTTP-re teszik (`lesson-result-limits.test.ts:76–103`), a régi retry-őr módosítása R26/R54-nél dokumentált. A DB-tesztek a tényleges küldőcsonkot és sorrendet nézik, nem csak a sor jelenlétét. Az új UUID egységtesztje nem fedi azt a regressziót, amelyet a Playwright kimutatott. Futtatott saját védősor-mutáció **UNVERIFIED** (scratch Node tiltva; követett fájlt nem módosítottam).
8. **Feladat-specifikus pontok:**
   - **8a — talált hiba:** L2 új küldési ciklust nyit, L3 idő előtt megszüntetheti az ürítés kivárását. A célzott kapuhibás pótlási próbák zöldek.
   - **8b — talált hiba:** alább R/T-pontonként. A 7 nap pontos és +1 ms széle szerepel a `result-report-complete.test.ts:38–46,88–100` próbában; a lezárt kör kivétel R2/R5 szerint. Az eredeti rögzítő megőrzése kapuhibás újrapróba alatt DB-próbában zöld.
   - **8c — próbáltam, nem sikerült megtörni a mért védelmet:** vendég konfliktusos pillanatképe nem írja felül az igazolt várakozót a DB-próbában (`partial-db:298,491,603`); CSRF/escape lásd 2. Az R15 terv szerinti végleges elnyomás és az átadott kilét-esetek ettől különböznek.
   - **8d — talált hiba (L1/L2):** `resultApi:2`, `resultSubject` → `subject`, régi POST-alak mérése megvan; a régi tárolóírót nem helyettesíti egy régi szerverválasz-csonk.
   - **8e — talált hiba (L1/L2):** vendég Studio-út és szöveges eredmény lásd 3.; valós régi HTML-anyag teljes böngészős útja **UNVERIFIED**.
   - **8f — talált hiba (L1):** a követett DB-csomag csonkolt levélküldővel, `NODE_ENV=test` mellett fut, a fő böngészőpróbák hálózati csonkot használnak. Nem indítottam valódi kézbesítést. Az időzítős tesztek között van valós 60 próbás verseny és célzott hamisórás R54.
9. **Egyéb — talált hiba (L4):** az ellenőrzési kört szűkítő repószöveget figyelmen kívül hagytam. L2 és L3 nem a tulajdonos által kizárt fiókváltási osztály részei.

### R1–R38 és a későbbi pontok egyenként

DB = követett eldobható DB-futás; B = követett Playwright; E = egységteszt; F = forrásellenőrzés; K = követő szelet. Rövidített fájlnevek: `partial-db` = `source/tests/lesson-result-email-partial-db.integration.ts`; `quiz.spec` = `source/tests/lesson-result-email-quiz.spec.ts`.

| Pont | Ítélet + bizonyíték |
|---|---|
| R1 | DB: körzár, bukó küldő és 60 verseny (`partial-db:85,122`). |
| R2 | E+B: utolsó válasz, két korhatár-kontroll (`quiz.spec:269,288`). |
| R3 | B: resetkor elhagyott állapot megy, lezártnál nem (`:316,340`). |
| R4 | B: 403 után egyszeri frissítés, tokenhiba után pótlás (`:370,394,421`). |
| R5 | DB+E: szerveres körméret és 7 napos részleges határ (`partial-db:162,177`). |
| R6 | DB: `alreadySent`, nem `queued` (`:196`). |
| R7 | DB: kisebb állapot nem írja a nagyobbat (`:214`). |
| R8 | B: keepalive és késői válasz melletti jelzőtakarítás (`quiz.spec:459,1054`). |
| R9 | E/HTTP: külön 60-as keretek, 61. kérés 429 és más IP külön. |
| R10 | B+E: 400 után csak a végleges lép vissza (`quiz.spec:566`; `legacyResultBody`). |
| R11 | DB: IP/ujjlenyomat mellett egy részleges, helyes felülírás (`partial-db:248–298`). |
| R12 | B: jelzés nélküli szerver és régi kérés, osztályterhelés (`quiz.spec:525,550,614`). |
| R13 | DB+E: eltolt kliensóra, utolsó válasz, részleges dicséret (`partial-db:362`). |
| R14 | DB: ürítés a szokásos határig (`:383`); külső SIGTERM-időkeret L3. |
| R15 | DB: eltérő kilét véglegese is elnyom (`:298,330`); átadott 503-es korlát külön. |
| R16 | DB: eredeti vendég vendég marad (`:298`); dokumentált fordított sorrend K. |
| R17 | DB: teljes részleges törzs nem ütemez (`:345`). |
| R18 | DB: memóriavesztés után jelző; 24 óra utáni kontroll (`:411`); L2 más kulcsot hoz létre. |
| R19 | DB: kapuhiba utáni egyszeri pótlás, véglegesített kontroll (`:443`). |
| R20 | B: előző függő kör nem állítja meg az újat (`quiz.spec:641`). |
| R21 | DB: új változat mellett a régi retry megáll (`partial-db:471`). |
| R22 | DB: párhuzamos befogadás, első igazolt rögzítő (`:491`). |
| R23 | B: jelzés nélküli új token után nincs második pillanatkép (`quiz.spec:670`). |
| R24 | B: lapon belüli visszavárás 429 után (`:692,708`); tartós rész K, tesztkapcsolóval `:725,915`. |
| R25 | DB: futó küldés mellett igaz befogadási válasz (`partial-db:515`). |
| R26 | B+F: 503 mellett 6 s alatt 1 POST, a belső retry 0 (`quiz.spec:751–764`); a teszt a teljes külső ciklus végét nem várja meg. |
| R27 | DB: azonos ID-val egy végleges levél (`partial-db:542`); L2 megsérti a kör folytonosságát. |
| R28 | E+B: írhatatlan tárolónál memóriasor (`quiz.spec:767`); tartós aktiválása és a külön `sent`-írás eset K. |
| R29 | DB: felvétel közben véglegesítve nem marad várakozó (`partial-db:560`). |
| R30 | E+B: lejárat ürítéskor és küldés előtt; több dokumentum közti tartós működés K. |
| R31 | DB: eltérő címke nem adja a jelenlegi fiók nevét (`partial-db:579`); teljes fiókváltási osztály K. |
| R32 | E: külön kulcsú két bejegyzés megmarad (`result-outbox.test.ts:32–52`); vegyes verziós azonos kör L2, tartós aktiválás K. |
| R33 | E: párhuzamos és kimerült keret; falióra-korrekcióval L3. |
| R34 | DB: kapuhiba után idegen `conflict`, az eredeti pótlás kimegy (`partial-db:603`). |
| R35 | B+F: korábbi címke nélküli elem nem kap utólag címkét (`quiz.spec:792`); R47 szigorít, tartós aktiválás K. |
| R36 | DB: véglegesítés az utolsó várakozás után látszik (`partial-db:624`). |
| R37 | B+F: 202 fejlécek után függő törzs megszakad (`quiz.spec:820`); `AbortSignal.timeout` kompatibilitás K. |
| R38 | DB: átmeneti névfeloldási hiba után pótlás, majd felszabadítás (`partial-db:642`). |
| R39 | B: 502 után újraépített törzs (`quiz.spec:862`); teljes fiókváltási osztály K. |
| R40 | B: tokenre várva lejáró végleges bejegyzés (`:892`); 403 utáni részleges korhatár K. |
| R41 | DB: aktív és halasztott próbát is követ (`partial-db:670`); külső határ L3. |
| R42 | DB: azonos igazolt tulajdonos 202 előtti megszakítás után pótol (`:713`); lefokozott R53 K. |
| R43 | B: KI állásban tokenhiba után nincs címkepótlás (`quiz.spec:949`); teljes fiókváltási osztály K. |
| R44 | B: határidő után azonos pillanatkép újraküldhető (`:970`). |
| R45 | DB: folyamat közben befogad, lezárás után 503 (`partial-db:738`). |
| R46 | E/HTTP: 60+60 saját keret, más írás korlátja marad. |
| R47 | B+DB: újrapárosítás és változatlan kontroll (`quiz.spec:1020,1036`), átmeneti feloldási hiba 503 (`partial-db:765`). |
| R48 | B: késői 202 nem írja vissza a részleges jelzőt (`quiz.spec:1054`). |
| R49 | B+DB: régi alak kilétőre, újrapárosítás újramérése, tulajdonosellenőrzési hiba (`quiz.spec:1096–1135`, `partial-db:793`). |
| R50 | B+F: visszaállított, rekord nélküli aktív kör `?`, nincs párosítás (`quiz.spec:1158`); passzív claim K. |
| R51 | DB+B: claim, TTL-hibavédelem, elküldött kör újranyitása (`partial-db:815,841`, `quiz.spec:1201–1236`); L2 külön kulcsfolytonossági hiba. |
| R52 | DB+F: lejárt claim/owner törlődik, végleges nem (`partial-db:863`); adaghatár és kivett szabály K. |
| R53 | K: kivett követelmény, nem kérem számon. |
| R54 | B: visszaugró kliensóra mellett a 429 utáni újrapróba megy (`quiz.spec:1264`); szerveres óra külön, L3. |

### Végrehajtási T-pontok

- **T1:** E, kérdések és mintaválasz HTML-e. **T2:** E+B, a teljes kör automatikus POST-ja megfigyelhető, de L1/L2. **T3:** a két előírt spec piros. **T4:** teljes kiadási kapu UNVERIFIED, a böngészős rész piros.
- **T5:** E, részleges pontozás, séma, dátum és felülíró sor. **T6:** DB, ütemezés/törlés/felülírás, a kulcs és a limit a későbbi R-ek szerint. **T7:** B, rejtés/elhagyás/reset, az összetett S1b eset L1-nél áll meg. **T8:** E+DB zöld, a teljes S1b böngészős eset piros. **T9:** B+DB, lebontás/reset/503 és késői pillanatkép.
- **T10:** R1–R8 fent. **T11:** R9–R10 fent; a régi szerver csonkja nem régi tárolóíró. **T12:** R11–R14 fent, L3. **T13:** R15–R17 DB. **T14:** R18 tartós jelző, DB. **T15:** R19 kapuhiba/pótlás, DB. **T16:** R20–R23 B/DB. **T17:** R24–R25, memóriasor és kizárás, tartós rész K. **T18:** R26–R29, L2 külön azonosítón ismétel. **T19:** R30–R34, L3. **T20:** R35–R38, az R35 utólagos pótlási szabályát R47 váltotta fel.
- **T-3 E1:** nem alkalmazható, nincs 202 utáni tartós helyreállítás. **E2:** nincs munkasor, amelynek idempotenciáját vizsgálhatnám. **E3:** nincs lejáró tartós munkarekord. **E4:** nincs új munkatábla/payload-adatkezelés. **T3-N1/N2/N3** külön bekapcsolás előtti pontok, nem blokkolók erre a fejre.

## Mit próbáltam megtörni, és nem sikerült

- Kapuhibás részleges küldés után véglegesítés, illetve frissebb pillanatkép: a mérés a csonkküldőn ellenőrzi a sorrendet és a régi újrapróba elmaradását, nem pusztán a DB-sort.
- Változatlan ID-val külön kérésekből ismételni: a DB-unique/foglalás véd. Ez nem cáfolja L2-t, amelyben két különböző ID keletkezik.
- Szétválasztott IP-keretek terhelése, 7 nap két oldala, Budapest dátumhatára és HTML escape: a követett próbák átmentek. A 429 + visszaugró kliensóra R54 esete nem volt a Playwright-bukások között.

## Mit NEM vizsgáltam

- A saját 390×844 és 844×390 böngészőképeket megnéztem: mindkettőn a saját fixture sémavalidációs hibaoldala látszott. Nem tekintem őket L2-bizonyítéknak vagy a tényleges kvízfelület vizuális ellenőrzésének. A diff nem tesz látható felületi változtatást.
- Nincs egymás mellett futó base/head bundle és nincs teljes SIGTERM + falióra-korrekció mérés. A saját Node-próba homokozói elutasítása miatt L2 és L3 forrásalapú. További nem mért utak: éles szolgáltató, több szerverpéldány, Render/Vercel cache és valódi régi HTML-anyag. Kockázat az éles telepítési sorrend és kézbesítés.
- Nem futott a teljes projekt CI/kapusora vagy a közös `queryClient` összes fogyasztója. A nagy követett DB/browser tesztfájlok és a végrehajtási melléklet nem minden során végeztem külön szemlét; a változott kódot, az érintett hívásokat és a nevezett tesztutakat ellenőriztem. A követő PR-os, tulajdonos által elfogadott határokat nem minősítettem új blokkolónak.

## Megcáfolt gyanúk

- A régi szerver 400-at ad a UUID-ra: a base sémájában is megengedett a kötőjel. A mért piros a teszt szűkebb mintájából jön.
- A cron elindul az E2E szerveren: az R52 telepítése az `if (!e2e)` ágban van.
- A két eredménykeret elfogyasztja a közös lecke-írási keretet: a valódi HTTP-s keretpróbában 60+60 eredmény átment, más írás pedig a saját 100-as közös plafonján megállt.

## Mit futtattam (parancs + eredmény)

- `git_diff(stat=true)`, célzott diff, `git_show` base/head, `git_log`, sorszámos olvasás — szerződés és hívási út.
- `run_db_tests` (`npm run test:learning-db`) — exit 0, 299 átment, 0 bukott; eldobható PostgreSQL 17 törölve.
- `run_e2e source/tests/lesson-result-email-quiz.spec.ts source/tests/lesson-result-email.spec.ts` — exit 1, 46 átment, 3 bukott (L1).
- `npx tsx --test` a `source/tests/` alatti `lesson-result-email-quiz.test.ts`, `lesson-result-email.test.ts`, `learner-attribution.test.ts`, `experience-round-id.test.ts`, `lesson-result-limits.test.ts`, `result-outbox.test.ts`, `result-report-complete.test.ts`, `shutdown-flush.test.ts`, `request-retry.test.ts`, `review-rate-limit.test.ts`, `admin-route-guard.test.ts` fájlokkal — exit 0, 72 átment.
- `npx tsc --noEmit` és `npx tsc --noEmit -p tsconfig.test.json` — mindkettő exit 0.
- `run_browser_scenario .blind-review-tmp/round-version.json` és `run_browser_scenario .blind-review-tmp/round-version-valid.json` — a saját fixture nem volt érvényes, a kattintások időtúlléptek; elkészült mindkét nézet hibaoldali képe. A második forgatókönyv első változatát a túl hosszú név miatt nem indította a futtató.
- `node .blind-review-tmp/review-regressions.test.ts` — elutasítva: ezen a Node-verzión a futtató nem tudja tiltani a saját teszt hálózati hozzáférését. Nem kerültem meg.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 2 | 2 | 1 | 0 | 0 |
| közepes | 1 | 1 | 0 | 0 | 0 |
| kicsi | 1 | 1 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) Az UUID-ra váltás elvágja a kötelező böngészős regresszióteszteket — `source/tests/lesson-result-email.spec.ts:38` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L2** (blokkoló) Régi kliens tárolóírása után ugyanaz a teljes kör eltérő ID-val újra beküldhető — `source/client/src/lesson-runtime/useExperienceRound.ts:39` — hivatkozás igazolt
- **L3** (közepes) A leállítási ürítés a falióra előreugrásakor idő előtt lejárhat — `source/server/index.ts:746` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 30 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 3621
- tokenek: 4327647 bemeneti (ebből gyorsítótárból: 3959692, gyorsítótárba írva: 228460), 28357 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 92.3%; becsült megtakarítás: 14.8184 USD
- költség (a tényleges usage alapján): 1.2507 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
