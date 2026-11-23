# Független review — eredmény-e-mail B1b
Fej: ce98359855deca78e5a99df91f80d711bf2e95c7
## Ítélet: NEM

A B1b egy frissen megválaszolt, érvényes vendégkvíz eredményét eldobhatja a régi kliensről való frissítéskor. Ez új regresszió; a szerverig sem jut el a kérés.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

**L1 — blokkoló: a kezdés ideje miatt kimarad egy friss válaszú régi kör.** `source/shared/quiz-round.ts:25`, `source/client/src/lesson-runtime/resultReport.ts:33`. Egy vendég tanuló megnyitja a kvízt, nyolc nappal később a még régi klienssel megválaszolja az utolsó kérdéseket, és nem nyom kiértékelést (az automatikus küldés erre való). Az első beküldés átmeneti hálózati vagy szerverhiba miatt nem ér célba; amikor a tanuló frissíti a lapot, már az új kliens fut. A régi kliens nem tárolta az utolsó válasz idejét. A fej a kezdést tekinti utolsó válasznak, ezért nem küld, pedig a válasz friss.

- **Böngészős bizonyíték és ellenpróba:** Chromiumban megnyitottam a kvízt nyolc nappal korábbra állított órával, mai órával megválaszoltam, majd átmeneti 503 után a tárolóból csak a `lastAnsweredAt`-ot vettem ki, így a base által előállítható formát kaptam. A két válasz visszatöltődött, a kör lezáratlan maradt. A már elérhető, 202-t adó végponthoz **0 POST** ment, és nem lett elküldve-jelző. Csak a friss `lastAnsweredAt`-ot visszaírva **1 POST** és az eredeti próbával azonos `roundId`-hez tartozó jelző lett. A mért indulási kor 8 nap, az utolsó válasz az első próba rögzítésekor 1 másodperces volt.
- **Base és hatás:** `git show base:source/client/src/lesson-runtime/useExperienceRound.ts` szerint a régi formátum eleve mező nélküli; `git show base:source/client/src/lesson-runtime/resultReport.ts` szerint teljes kvíznél a base nem vizsgálta a kort, jelző nélkül küldött. Az új visszatérés megelőzi a POST-ot, a szerver nem tudja megmenteni az eredményt. A kézi lezárás működik, de a felhasználónak nem kellene külön megnyomnia, és nem kap jelzést az elmaradásról. A fej megvalósítási jegyzete dokumentálja a kezdésre visszaesést, de az 1b elfogadási feltétele az **utolsó válasz** korát méri, a megbízás pedig kifejezetten tiltja friss kör elvesztését.
- **Javítás:** a hiányzó `lastAnsweredAt` legyen ismeretlen kor, ne bizonyítottan elavult kör. A régi formátumú, egyébként küldhető körökre őrizzék meg a régi küldési viselkedést, a korhatárt pedig az ismert válaszidőre alkalmazzák. A régi formátumból önmagában nem lehet megkülönböztetni a friss és az elavult utolsó választ; ha a tulajdonos más migrációs kompromisszumot akar, azt külön kell rögzíteni.

**L2 — közepes, meglévő újrapróbaút: folyamatban lévő küldésnél nem érvényesül a korhatár az ismétlésre.** `source/client/src/lesson-runtime/resultReport.ts:51`, `source/client/src/lib/queryClient.ts:93–117`. A vendég megválaszolja a kvízt; az első kérés megszakad. Ha a lapot a gép felfüggeszti, és nyolc nap múlva ugyanaz a lap folytatja a futást, a backoff után a régi, lezáratlan kört korvizsgálat nélkül küldi. Chromiumban hálózati kivételt szimuláltam az első `fetch`-nél és a második előtt nyolc nappal előreléptettem a kliens óráját. A próbák kora rendre 0 és 8 nap volt, azonos törzzsel; a második elérte a mockolt 202-es végpontot, amit az elküldve-jelző is igazolt. A base ugyanezen a retry-úton korhatár nélkül küldött volna, tehát ez nem a diff által rontott forgatókönyv. **Javítás:** minden tényleges próbálkozás előtt ellenőrizni a lezáratlan kör határidejét, az általános `apiRequest` többi hívójának változtatása nélkül.

**L3 — kicsi, tesztlefedettség: az E2E korhatárteszt nem különíti el a kezdést az utolsó választól.** `source/tests/lesson-result-email-quiz.spec.ts:117–122`. A tanuló ugyanabban a rövid virtuális időablakban nyitja meg és válaszolja meg a kvízt; az esetek 6 vagy 8 napra lépnek tovább. Egy kezdést használó hibás bekötés mindkét távolságra ugyanazt a döntést hozná a böngészős tesztben. A segéd egységtesztje és a forrásőr ennél többet ellenőriz, de nem helyettesíti a hívási lánc próbáját. **Javítás:** külön E2E eset nyolcnapos kezdéssel és mai utolsó válasszal, valamint ugyanez B1a-formátumú visszatöltéssel; a negatív ágban az első POST-kísérletet is számlálni.

## A hibakereső pontok (ítélet + bizonyíték)

| Pont | Ítélet és bizonyíték |
|---|---|
| 1. Adatszerződés | **A törzset nem sikerült megtörni érvényes bemenettel.** A két szigorú változat `source/shared/lesson-result-email.ts:16–21`: pozitív egész `startedAt` mindkettőnél, `lastAnsweredAt` csak kvíznél. A tényleges feladat-POST-ban csak a kezdés volt, a követett kvíz-E2E a tényleges törzset a közös Zod-sémával validálta. A `startedAt: 0` kimarad (`resultReport.ts:44`); normál útvonalon a mezőket `Date.now()` írja. Törtszám csak a tárolóba kívülről bekerülve jelentene eltérést; ilyen forgatókönyvet nem tekintettem regressziónak. |
| 2. Biztonság / adatvédelem | **Nem találtam új hibát.** A két időadat a meglévő JSON POST-ba kerül, nem az URL-be; a tanulói token és az ujjlenyomat útja változatlan. A böngészőben látszott a CSRF-fejléc; az eredményrouter előtt továbbra is a meglévő CSRF-őr van (`source/server/routes.ts:792–857,890`). Nincs új GET, link vagy naplózás a diffben. |
| 3. Regresszió | **Találtam: L1.** A Stúdió-lecke vendégútján a tároló beolvas, de az automatikus beküldés elmarad. A feladatfolyamatban 3 s-os döntőbíró-választ szimuláltam: 500 ms után csak a döntőbíró kérése látszott, az ítélet megjelenése után egy feladat-POST. A bejelentkezett szerveres kvíz és a régi HTML-anyag külön útja diff alapján nem módosult. |
| 4. Budapest / dátumhatár | **A normál határt nem sikerült megtörni.** Pontosan `7 × 86 400 000` ms elfogadott, +1 ms nem (egységteszt); az eltelt idő nem függ a budapesti óraátállítástól. A B1a levélformázó téli/nyári idejét és dátumhatárát teszt ellenőrizte. A készülék faliórájának visszatekerése más kérdés: kód szerint negatív kor esetén az őr nem tilt; valódi órakorrekció külön nem volt mérve. |
| 5. DB / migráció / életciklus | **Migráció, cron és leállítás: a diffre nem alkalmazható.** A másolaton a PostgreSQL 17-es E2E harness migrált és takarított; az indulási napló szerint háttérjobok nélkül futott. A változatlan migráció és Drizzle-séma egyaránt a `(lesson_id, kind, round_key)` egyedi kulcsot adja (`0030_lesson_result_emails.sql:13`, `source/shared/schema.ts:1173`). |
| 6. Verseny / ismétlés / timeout | **Találtam: L2.** Normál sorrendben a lezárás és újratöltés nem okozott második POST-ot az E2E-ben; a `roundId`, a tárolt jelző és a szerver címzettenkénti foglalása változatlan. Az időablakból kicsúszó retry viszont elmegy. |
| 7. Tesztminőség | **Találtam: L3.** Az öt követett E2E és a 15 célzott egységteszt zöld; meglévő ellenőrzést nem távolítottak el. A végrehajtás 1b része bővült. A kezdésre és utolsó válaszra eltérő döntést adó böngészős ellenpéldát futtattam; a követett specet a korhatársort szó szerint kivéve nem tudtam futtatni. |
| 8. B1b elfogadás | **Részben teljesül.** A mezők rendben; friss válaszú, régen indított új formátumú kör és 8 napos lezárt kör elment. Az új formátumú, 8 napos lezáratlan kör normál újratöltését a követett E2E blokkolta, de az átmeneti régi formátumot L1, az életben maradt kérést L2 érinti. A négy éles fájl diffjében összesen 29 új sor van (1 + 8 + 2 + 18), a ~400 soros keret alatt; nincs szeletkapcsoló. |
| 9. Egyéb | **Nem találtam további mért regressziót.** Megnéztem a 390×844 és 844×390 képeket: a visszatöltött választás és eredményjelzés megjelenik, az automatikus küldés elmaradása nem látszik a felületen. |

## Mit próbáltam megtörni, és nem sikerült

- Kvíz lezárása vagy újratöltése egy már elfogadott POST után: nem lett második. A döntőbíró késleltetése nem küldte el idő előtt a feladatkört.
- A régi alakú tároló beolvasása: a kérdésazonosítók és a válaszok megmaradtak. A gond a küldési döntés, nem a beolvasás. Friss válaszidő visszaállítása után az eredeti körazonosító maradt.
- Lezárt kör a korhatáron túl: a saját böngészős visszajátszásban 8 napos válaszidővel is küldött; az elutasítás nem szivárgott át a lezárt ágra.

## Mit NEM vizsgáltam

- Éles telepítés, valódi Resend-küldés, tényleges belépéses vagy párosított fiókváltás, párhuzamos fülek és Postgres-szintű kézbesítési verseny: eldobható környezetben, mockolt végponttal mértem a böngészős hívást. A `gate:push` CI-eredménye **UNVERIFIED**.
- Valódi operációsrendszer-felfüggesztés vagy NTP-visszaállítás, döntőbíró 45 s-os fallback és elnyúló választest: az előreléptetett kliensóra a retry határát izolálta, nem modellezte ezeket.
- Szó szerinti forrásmutáció és a követett spec azon futtatása: a követett munkafa nem írható, a saját Node-próbát a homokozó a Node-verzió miatt elutasította. Az őrt eltávolítva várható tesztbukás így **UNVERIFIED**, nem futtatási eredmény.

## Megcáfolt gyanúk

- A szigorú feladatséma kvízmezőt kap: a mért feladat-POST nem tartalmazott `lastAnsweredAt`-ot.
- Az opcionális mező miatt elvesznek a régi válaszok, vagy megváltozik a körazonosító: a böngészős tárolópróbán nem történt meg. Az L1-ben a küldéshez el sem jut a kliens.

## Mit futtattam (parancs + eredmény)

- `npx tsx --test source/tests/result-report-complete.test.ts source/tests/lesson-result-email-date.test.ts source/tests/lesson-result-email.test.ts source/tests/request-retry.test.ts` — 15/15.
- `npx tsc --noEmit` és `npx tsc --noEmit -p tsconfig.test.json` — mindkettő 0.
- `run_e2e source/tests/lesson-result-email-quiz.spec.ts source/tests/lesson-result-email.spec.ts` — 5/5 Chromiumban, eldobható adatbázissal.
- `run_browser_scenario .blind-review-tmp/b1b-legacy.json` — álló kép és friss kezdésű legacy kontroll: egy POST, majd azonos körre nincs ismétlés. A tervezett régi kezdést az első menet nem állította be; azt a következő futás külön ellenőrizte.
- `run_browser_scenario .blind-review-tmp/b1b-replay.json` — fekvő kép, L1: 0 legacy POST, 1 a friss idő visszaállításakor, 1 a külön lezárt kontrollban.
- `run_browser_scenario .blind-review-tmp/b1b-task-retry.json` — döntőbíró-várakozás és L2: a második próbán 8 napos kor és sikerjelző.
- `node .blind-review-tmp/b1b-fixture.ts` — a homokozó elutasította; nem futott.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 1 | 1 | 1 | 0 | 0 |
| közepes | 1 | 1 | 1 | 0 | 0 |
| kicsi | 1 | 1 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) Friss válaszú legacy kör automatikus beküldése elmarad — `source/shared/quiz-round.ts:25` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L2** (közepes) Az életben maradt retry a korhatáron túl is elküldi a lezáratlan kört — `source/client/src/lesson-runtime/resultReport.ts:51` — hivatkozás igazolt; futtatással igazolt (teljes út)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 24 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 3593
- tokenek: 1785928 bemeneti (ebből gyorsítótárból: 1670457, gyorsítótárba írva: 115399), 17853 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 94.0%; becsült megtakarítás: 6.2323 USD
- költség (a tényleges usage alapján): 0.6342 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
