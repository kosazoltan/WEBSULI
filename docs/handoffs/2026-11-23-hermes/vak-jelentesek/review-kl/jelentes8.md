# Független review — fix/kisfilm-leallitas-hatarido
Fej: 632f4d9cd6a7e0450e94d2b559513b90778a00f7
## Ítélet: NEM
A kemény megszakítás után a kisfilmworker még elindíthat és véglegesíthet olyan médiaírást, amely addig csak a helyi tranzakciós sorban állt. Ez nem a DB-oldali leállítás visszaigazolásának vállalt hiánya: a hiba már a 60 és 70 másodperc közötti szakaszban, működő adatbázissal jelentkezik. Éles bekapcsolást nem igazoltam.

## Leletek (blokkoló / jegyre menő)

### L1 — blokkoló — A kemény megszakítás nem üríti a még el sem indult médiaírásokat
- **Hely:** `source/server/lesson-clips-db.ts:132`; hívási lánc: `source/server/index.ts:722–723` → `source/server/lesson-clips.ts:462–468`; médiaírás: `lesson-clips.ts:278–281,288–305` → `lesson-clips-db.ts:83–87,128–137`.
- **Forgatókönyv:** Éles szerveren a kezelő gyártás közben telepít. A kisfilm-ág 60 mp-es kivárásának vége előtt két jelenet állóképe egy időben elkészül. A első kép tranzakciója még a DB válaszára vár; a második kép már átjutott a `deps.stopped()` ellenőrzésen, de a `chain` mögött vár, SQL-t még nem indított. A kemény megszakítás megtörténik, majd az első tranzakció a végső 10 mp alatt befejeződik. A második csak ezután kap tranzakciót, `INSERT`-je és `COMMIT`-ja sikerülhet. Kész kisfilmsor nem követi, mert a worker írás előtti őre ekkor már megállítja a fejezetet. A kép árván foglalhatja a tárkeretet a későbbi söprésig.
- **Evidencia és cáfolati kísérlet:** Az egyfejezetes limit nem véd: a jelenetek `Promise.allSettled` alatt párhuzamosak. A jelzőt a kód **sorba állítás előtt** nézi; a `chain.then(() => session.transaction(...))` belépésekor és az `INSERT` előtt nincs új ellenőrzés. A kemény megszakítás a szolgáltatói jelet bontja, a kapcsolatot viszont csak a második kivárás lejártakor dobja el, ha a kör addig nem végzett. Ha a késői írás és a kör a végső várakozásba belefér, a leállás `ended` ágon térhet vissza. A zártartó kapcsolat és a 15 s-os `statement_timeout` tehát nem akadályozza ezt az ütemezést. A meglévő workerpróba (`source/tests/lesson-clip-worker.test.ts:808–813`) még a tárhívás előtt vált jelet; a DB-próba (`source/tests/lesson-clips-db.integration.ts:109–138`) a kapcsolat eldobását vizsgálja. A célzott saját adapterpróba futtatását a homokozó megtagadta; ez a lelet a fenti hívási láncból és az ütemezésből következik, nem futtatási eredményből.
- **Javítás:** A kemény megszakítás jelét kapja meg a zártartó tár is. A sorból kivételkor, illetve a tranzakción belül az írás előtt ellenőrizze: ami még nem indult el, álljon le `ClipAbortError`-ral. Az addig már elküldött SQL-re maradhat a külön kivárás és az eldobás. Regressziótesztben két médiaírást kell sorba állítani, az elsőt kapuval feltartani, megszakítani a kört, majd az elsőt felengedni; a másodikhoz ne induljon `INSERT`.

### L2 — közepes — A zárvesztési teszt a SIGKILL elküldését méri, nem a gyerek kilépésének és a takarításnak a kivárását
- **Hely:** `source/tests/lesson-clip-worker.test.ts:775,781–784`; a védendő sor `source/server/lesson-clips.ts:433`.
- **Forgatókönyv:** Egy későbbi módosítás kiveszi a körtest kivárását a `finally` ágból. Zárvesztésnél a `kill()` még megkapja a jelet, de a worker már befejezettnek tekintheti a kört, miközben a valódi gyerek még nem zárult le vagy a félkész fájl még megvan. A teszt „átkódoló leállt” eseménye már a `kill()` hívásában bekerül, a kilépési callback előtt; a végső állítás nem méri sem a callbacket, sem a munkamappa törlését. A modellválaszos párja is a megszakítási eseményt rögzíti (`:753`), nem a takarítás befejezését. Ez másik védő sor, mint a követő PR-ra tett tárváltási teszt.
- **Javítás:** A csonk tartsa vissza a kilépési callbacket a jel fogadása után. A teszt ezalatt ellenőrizze, hogy a kör ígérete még függőben van; felengedés után ellenőrizze a munkamappa eltűnését és a kör lezárulását. Az `await body` nélküli tényleges mutációfutás UNVERIFIED; a teszt mérési hiánya közvetlenül látszik az esemény rögzítési helyén.

### L3 — kicsi — A jóváhagyott 480 MB-os küszöb mellől hiányzik az üzemeltetési döntési szabály
- **Hely:** `docs/fejezet-kisfilmek-hasznalat.md:40–45,51–58`.
- **Forgatókönyv:** Az első mérés után Renderen a memória eléri a 480 MB környékét, majd visszaesik. A kézikönyv „tartósan … súrolja” esetén mondja ki az `off`-ot, de nem mondja meg sem a megfigyelési időt, sem azt, ki kapcsol vissza. Az útmutató 0. lépése mindkét adat rögzítését maga írja elő. Az első kör külön, 450 MB fölötti csúcsra adott azonnali szabálya ettől még egyértelmű.
- **Javítás:** Az élesítés előtt rögzíteni a tulajdonos által jóváhagyott időablakot vagy mintaszámot, a művelet felelősét és azt, hogy az első körben a szigorúbb csúcsszabály él. A dokumentált 480 MB-os jóváhagyást nem kérdőjelezem meg.

## A hibakereső pontok (ítélet + bizonyíték)

| Pont | Ítélet és bizonyíték |
|---|---|
| 1. Adatszerződés | **Próbáltam, nem sikerült megtörni** a HTTP-szerződést. A `lessonClipsResponse` `{ clips, pending }` alakját olvassa a kliens, a v2 elemeket mindkét oldal validálja (`source/server/lesson-clips.ts:99–109,129–135`; `source/client/src/lesson-runtime/clips/useLessonClips.ts:14–22`). A zárt tár az éles adapterből érkezik; a tranzakciós sor megszakítási szerződése hibás (L1). |
| 2. Biztonság és adatvédelem | **Próbáltam, nem sikerült megtörni** a vizsgált letöltési napló és origin védelmét: a követett tesztek lefuttatták a queryvel érkező, `Location` nélküli átirányítást, valamint a státusz- és törzsolvasási hibát (`source/tests/lesson-clip-worker.test.ts:693–735`). A nyilvános státusz-GET csak olvas, vészféknél a DB-t sem hívja (`source/server/studio/lesson-routes.ts:102–113`); nincs új állapotmódosító HTTP-végpont. |
| 3. Regresszió | **Próbáltam, nem sikerült megtörni** a kisfilm nélküli tananyag megjelenését. Chromiumban a hibás/régi válasz, a függő kérés kijelzésének lejárata és az ismert `pending` állapot közbeni 502 kezelése átment. A saját próba álló és fekvő nézetében is láttam a tananyag címét, és mindkét DOM-mérés 0 kisfilmgombot, illetve `pending: false` értéket adott. A Stúdió teljes élő gyártását nem futtattam. |
| 4. Dátumhatár | **Nem alkalmazható Budapest szerinti napváltásként**: a kisfilm napi limitjének szerződése kifejezetten UTC (`source/server/lesson-clips.ts:78`; `source/server/lesson-clips-db.ts:78–81`), SQL-je nem változott. A kör- és leállítási várakozások relatívak. |
| 5. Séma, indítás, cron, e2e | **Leállítási hiba: L1.** A sémát a diff nem módosítja; a migráció–Drizzle összevetések és az eldobható DB-futás zöldek. Induláskor a kisfilmworker éles és nem e2e környezetben indulhat, és csak `auto` módban készít időzítőt (`source/server/index.ts:540–564`; `source/server/lesson-clips.ts:471–498`). A leállítási kisfilm-lánc a Stúdió-kivárás előtt indul; a jel kezdetétől mért határidő ismert követő tétel. |
| 6. Verseny, ismétlés, megszakítás | **Hiba: L1.** Az új DB-sorban a megszakítás és a tényleges tranzakciókezdés közé rés kerül. A második zárkérés, a három eldobási állapot, a pontosan egyszeri release és a késői unlock követett tesztjei zöldek. |
| 7. Tesztminőség | **Hiba: L2.** A leállítási óratesztek vezérelt órát használnak, a redirectteszt új regexei mellől nem tűnt el a kérés elmaradásának állítása. A mutáció futtatására nem volt működő saját Node-homokozó. |
| 8a. Állapotút | **Hiba: L1.** Állóképek későn is árvasorokká válhatnak. Az ismert helyreállás: következő aktív körben árvajelölés, a jelöléstől számított 24 óra után törlés; sikeres és hibás átkódolás ideiglenes mappáját a követett teszt ellenőrzi. A kliens lejárati idejét elakadó válasszal is ellenőrzi a zöld Playwright-próba. |
| 8b. Elfogadási pontok | **(1) Párhuzamosság:** fejezetenkénti és átkódolási sor, `-threads 1` a két oldalon és `-filter_threads 1`; a sor- és kapcsolótesztek zöldek (`source/server/lesson-clips.ts:24,358–359`; `source/server/lesson-clips-providers.ts:264–271`). **(2) RSS:** a Node saját RSS-e, 320 × 1024² bájt, mérés kör/fejezet/átkódolás előtt; küszöb fölött a kör nulla modellhívással kimarad a workerpróbában. **(3) Éles újraindulás/memória:** UNVERIFIED, az elfogadáshoz kell az első Render-mérés. A már futó átkódolást memória miatt szándékosan nem öli meg a kód. A leállítási SIGKILL út csonkkal zöld, DB-sorhiba: L1. **Kikapcsolás:** `off`-nál nincs gyártás; a kézi üzemi szabály hiányos (L3). |
| 8c. Gyerekfolyamat és fájlok | **Forrásban nem találtam URL-ből képzett helyi útvonalat vagy shell-összefűzést.** `mkdtemp`, saját `in.mp4`/`out.mp4`, `execFile` argumentumtömb és `file` protokollkorlát (`source/server/lesson-clips-providers.ts:190–192,270–271,286–297`). A Render-fájlrendszer tényleges jogosultságait és az éles FFmpeg-build demuxer-viselkedését nem mértem. |
| 8d. Mezők, mérethatárok, számok | **Próbáltam, nem sikerült megtörni** a státuszmezőket és a túlcsorduló env-beállításokat: a kód csak biztonságos egészet és biztonságos bájtszorzatot fogad, más esetben alapérték (`source/server/lesson-clips.ts:58–64`). Nyers videó: 40 MiB streamkorlát; kimenet: 2 500 000 bájt a beolvasás előtt. A médiatábla kerete a változatlan, fejezetindítási küszöb, nem DB-szintű kemény plafon; az 1 bájtos teszt szándékosan engedi a már elkezdett fejezetet (`source/tests/lesson-clip-worker.test.ts:464–474`). A borító külön worker, a napi limit ismert eltérése követő tétel. |
| 8e. Megjelenítés, Stúdió és életciklus | **A kisfilm nélküli megjelenítést nem sikerült megtörni** (3. pont). A régi anyag sora külön áll le, a Stúdió kivárása nem került a kisfilm-ág elé (`source/server/index.ts:712–742`). Az éles, aktív gyártással egyidejű SIGTERM nem volt lefuttatva. |
| 8f. Tesztizoláció | **Hiba: L2.** A szolgáltatók csonkok; a POSIX teszt helyi ál-ffmpeg-et használ és a mostani futásban kimaradt (`source/tests/lesson-clip-worker.test.ts:324–338`). Az új zárvesztési esetekben is van időzítős polling; explicit belépési és kilépési kapuk pontosabbá tennék a mérést. |
| 9. Egyéb | **Hiba: L3.** A cutoff üzemeltetési ellenőrzése hiányos. A zár session-szintű; a Render tényleges, nem repóban tárolt DB-végpontjának session-affinitása UNVERIFIED. |

## Mit próbáltam megtörni, és nem sikerült
- Mesterségesen magas RSS és növekvő RSS: a kör illetve a következő fejezet kimaradt; a küszöb körüli átkódolási próbában csak az alacsonyabb RSS mellett indult a csonk.
- Normál release, foglalt zár és kényszerített eldobás zárkérés / munka / feloldás közben: a követett próbákban nem volt második release. A teljes eldobható Postgres-csomag is átment; a L1-ben leírt, **eldobás előtti** DB-sorhelyzetet nem futtatja.
- Hibás letöltési válasz, megszakadó törzs és query a hibában: a vizsgált ágakban a letöltési napló nem adta vissza a próbaértéket. Hibás/régi kisfilm-válasz és külön 502 mellett a tananyag megjelent.

## Mit NEM vizsgáltam
- Nem kapcsoltam be a gyártást a Renderen, nem hívtam fizetős szolgáltatót. Az első kör teljes memóriacsúcsa, újraindulásmentessége, az éles FFmpeg és az aktív Stúdióval közös valós SIGTERM ezért UNVERIFIED.
- Nem tudtam futtatni a két sorba állított médiaírás saját Node-próbáját vagy tényleges forrásmutációt: a futtató Node 24 alatt elutasította a saját Node-szkriptet. A böngészős e2e-mód letiltja a valódi gyártó workert; a zöld böngészőfutás nem ellenbizonyíték L1-re.
- A tulajdonos által követő PR-ra tett K-KL-L1/L2/L3/L4/L5, K-418-L2/L3/L5 és az elfogadott futás közbeni memóriafigyelés nem új blokkoló ezen a review-n. Nem jártam végig a teljes élő Stúdió- és régi anyag munkafolyamatot.

## Megcáfolt gyanúk
- A 480 MB-os Render-határt nem a Node RSS-ével hasonlítja össze a worker: kézi határ, eltér a kódbeli 320 MiB-tól és az első kör külön 450 MB-os szabályától.
- A zár eldobása nem tereli át a worker írásait a szabad poolra: az éles hívó `sessionStore`-t ad, a worker használja. L1-ben éppen az történik, hogy a még élő zárkapcsolaton fut későn a sorba állított írás.
- A kisfilm nélküli tananyag nem függ a kisfilm-végpont sikerétől. A képeken a tananyag címe mindkét nézetben megjelent; a fekvő képen a fejezetválasztó a képernyő alsó határa alá esik, ezért ott annak elrendezéséről nem állítok többet.

## Mit futtattam (parancs + eredmény)
- `npx tsx --test source/tests/lesson-clip.test.ts source/tests/lesson-clip-worker.test.ts source/tests/lesson-clip-lock.test.ts source/tests/lesson-clip-lock-deadline.test.ts source/tests/lesson-clip-shutdown-deadline.test.ts source/tests/lesson-clip-shutdown-timeout.test.ts source/tests/lesson-clip-shutdown.test.ts source/tests/lesson-clip-shutdown-dns.test.ts source/tests/lesson-clip-shutdown-poll.test.ts source/tests/lesson-clip-shutdown-retry.test.ts source/tests/e2e-mode.test.ts`: 78 teszt, 77 sikeres, 1 kihagyott, 0 hiba.
- `npx tsc --noEmit` és `npx tsc --noEmit -p tsconfig.test.json`: mindkettő 0.
- `run_db_tests`: eldobható PostgreSQL 17, 260 sikeres, 0 hiba.
- `run_e2e source/tests/lesson-clips.spec.ts`: 16 sikeres Chromium-teszt.
- `run_browser_scenario .blind-review-tmp/clip-regresszio.json`: két eset, 390×844 és 844×390; szándékos 502 mellett is látható a lecke. Az `1-kisfilm-nelkul-allo.jpg` és `2-kisfilm-nelkul-fekvo.jpg` képet megnéztem.
- `node .blind-review-tmp/dep.mjs` és `node .blind-review-tmp/kesoi-tranzakcio.mjs`: a futtató mindkét saját Node-parancsot indítás előtt elutasította a homokozó hálózattiltási feltétele miatt.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 1 | 1 | 0 | 0 | 0 |
| közepes | 1 | 1 | 0 | 0 | 0 |
| kicsi | 1 | 1 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) A kemény megszakítás után a tranzakciós sorból még új médiaírás indulhat — `source/server/lesson-clips-db.ts:132` — hivatkozás igazolt
- **L2** (közepes) A zárvesztési teszt kilépés helyett a kill hívásának pillanatát rögzíti — `source/tests/lesson-clip-worker.test.ts:775` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 19 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 6909
- tokenek: 1741334 bemeneti (ebből gyorsítótárból: 1588665, gyorsítótárba írva: 152612), 15245 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 91.6%; becsült megtakarítás: 5.8843 USD
- költség (a tényleges usage alapján): 0.6930 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
