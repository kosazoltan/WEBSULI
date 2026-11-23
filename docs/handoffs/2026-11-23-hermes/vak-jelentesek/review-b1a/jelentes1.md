# Független review — B1a / eredmény-e-mail
Fej: 21a8d34b8c3f66a7822870a77b642e74654508a9
## Ítélet: IGEN, FELTÉTELLEL
A régi beküldéseknél nem találtam séma- vagy pontozási regressziót. A három lelet jegyre megy; az L1-et a B1b telepítése előtt javítanám, mert attól kezdve az elcsúszó beküldési idő a kliens által küldött körkezdet szűrését is érinti.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

### L1 — közepes: A levél összeállításának ideje jelenik meg beküldési időként, és újrapróbán megváltozik
**Hely:** `source/shared/lesson-result-email.ts:127–132`; az éles hívó nem ad `sentAt`-ot (`source/server/lesson-result-email.ts:123–124`), az újrapróba ismét meghívja a levélépítőt (`:144–153`).

**Forgatókönyv:** Egy tanuló a régi klienssel magyar idő szerint 20:41:55-kor beküldi a kvízt. Ha az első címzett megkapja a levelet, a másik címzett küldése pedig átmenetileg meghiúsul, az utóbbi pótlása a beállított 60 s múlva már 20:42-t ír „Beküldve:” címkével. Ugyanaz a beküldés így két külön időponttal szerepelhet. Az új mezővel egy, a tényleges beküldéshez képest 10 s-mal jövőbeli `startedAt` a pótláskor már meg is jelenhet. Késői első levél-összeállításnál is ugyanez a viszonyítási hiba.

**Evidencia:** Megkerestem, rögzíti-e valamelyik hívó az időt, illetve változik-e a kör kulcsa a pótláskor. A POST háttérben adja tovább a `graded`-et (`source/server/lesson-result-email.ts:214–217`), a küldő nem olvassa ki a DB-ben egyébként meglévő `createdAt`-ot sem (`:116–124`, `source/shared/schema.ts:1171`). A saját, leválasztott Chromium-próba a dátumlogika JS-másolatával, rögzített órával az első és a +60 s-os futás között `20:41 → 20:42` eltérést, a jövőbeli kezdésnél `null → 20:42` változást mutatott. Rögzített referenciaidővel egyik sem változott. A szigorúan múltbeli követelmény ellenére a `<=` az azonos ezredmásodpercet is átengedi. Az ugyanazon idempotenciakulcs mellett megváltozó HTML is új eltérés (`source/server/lesson-result-email.ts:49–50,137`, `source/server/resend.ts:243–248`); a szolgáltató reakciója **UNVERIFIED**. A böngészős próba nem küldött levelet.

**Javítás:** Rögzítsék a szerveroldali beküldési időt a POST feldolgozásának elején, a gyakorlókörnél pedig az eredményt kiváltó szerveres eseménynél. Adják tovább az időt a levélépítőnek, és a pótlásoknál ugyanazt az eredeti időt használják; külön kérésből indított pótlásnál is szükséges egy körhöz rögzített érték. Ehhez mérjék a kezdés szigorú múltbeliségét és a 400 napot. A küldőtesztben a kulcs mellett a dátumsort is hasonlítsák össze.

### L2 — kicsi: Az őszi óraátállításkor a levélben a kör látszólag a beküldés után kezdődik
**Hely:** `source/shared/lesson-result-email.ts:101–104,132`.

**Forgatókönyv és evidencia:** A kör `2026-10-25T00:50:00Z`-kor indul, a tanuló `2026-10-25T01:10:00Z`-kor küldi be. Az UTC-idők különbsége 20 perc. Az admin viszont „Beküldve: 2026. 10. 25. 02:10 (magyar idő)” és „A kör kezdete: 2026. 10. 25. 02:50” sorokat kap: mindkét helyi óraérték önmagában helyes, de az eltérő UTC-eltolás nem látszik. A formázó JS-másolatából készült álló és fekvő mintán is ezt láttam (`2-level-allo.jpg`, `3-level-fekvo.jpg`).

**Javítás:** Az ismétlődő órában legalább, vagy egységesen mindkét dátumsoron jelezzék az UTC-eltolást. Az óraátállítást közrefogó dátumpár kerüljön tesztbe.

### L3 — kicsi: A teszt nem ellenőrzi a `startedAt` útját a POST-tól a levélig
**Hely:** `source/tests/lesson-result-email-date.test.ts:31`.

**Forgatókönyv és evidencia:** Ha egy következő refaktor eltávolítja a `source/server/lesson-result-email.ts:196` hozzárendelését, a tablet továbbra is elküldheti a kezdést és 202-t kap, de az admin leveléből eltűnik a kezdés sora. A dátumteszt kézzel rakja a metát a pontozott objektumra. A létező HTTP→levél DB-tesztek (`source/tests/lesson-result-email-db.integration.ts:67–84,315–334`) nem küldenek ilyen mezőt, a böngészős specek pedig elfogják a POST-ot. A fedési rés kódolvasással igazolt, ezen a szerveroldali soron tényleges mutációs futás nem történt. A `lastAnsweredAt` külön negatív esetei is hiányoznak: a `:19` csak a `startedAt` mezőt rontja el.

**Javítás:** A meglévő eldobható DB-tesztben valós POST-tal, mindkét körtípusra ellenőrizzék a tesztküldőnek átadott HTML kezdéssorát. Legyen negatív sémaeset hibás `lastAnsweredAt`-ra és arra is, hogy feladatkörben ez a mező nem megengedett.

## A hibakereső pontok (ítélet + bizonyíték)
1. **Adatszerződés — a régi alakot nem sikerült megtörni; a beküldési időnél L1.** Base↔head: az ismert kulcsok és határértékek változatlanok, a két új mező opcionális; `lastAnsweredAt` csak a kvízágban szerepel (`source/shared/lesson-result-email.ts:16–21`). A régi kliens továbbra is csak a régi mezőket küldi (`source/client/src/lesson-runtime/resultReport.ts:31,39–46`). A két időmező nem kerül adatbázisba; a feladatszintű mentés csak `rows`-t kap (`source/server/lesson-result-email.ts:108–114,204–211`). A `lastAnsweredAt` most csak átmegy a sémán, a 7 napos klienslogika B1b.
2. **Biztonság/adatvédelem — új HTML- vagy CSRF-rést nem találtam; félrevezető kezdőidő: L1.** A dátumút számból `Date`-et, majd fix formátumú szöveget képez (`source/shared/lesson-result-email.ts:16,101–108,132`); nincs nyers kliensszöveg a dátumsoron. A módosítás nem visz értéket URL-be, linkbe, tárgyba vagy naplóba, nem ad GET-írást. A POST a változatlan CSRF-őr mögött van (`source/server/routes.ts:790–809,856–857,889–890`). A saját helyi böngészős POST token nélkül 403-at kapott; tokennel is a CSRF-rétegnél állt meg a próba, ezért abból nem következtettem a séma HTTP-eredményére.
3. **Regresszió — a szándékolt új dátumsoron kívül nem sikerült megtörni.** A vendég Stúdió-lecke két böngészős specje zöld; a DB-tesztekben a vendég régi POST-jából levél lett, a bejelentkezett szerveres gyakorlókör az utolsó válaszra továbbra is küld, majd a lezárás nem dupláz (`source/tests/learning-db.integration.ts:284–320`). A gyakorlókör nem ad új `meta`-t (`source/server/lesson-result-email.ts:225–229`), de a közös sablon miatt megkapja a „Beküldve” sort. A régi iframe-anyag külön építőt használ (`source/server/routes.ts:1050,1099–1127`).
4. **Europe/Budapest — L2.** Téli és nyári normál idő, nyári éjfél, évváltás és a tavaszi `01:59 → 03:00` váltás helyes volt; ősszel a helyi idő helyes, de kétértelmű. A küszöbpróbán pontosan 400×86 400 000 ms még megjelent, 1 ms-mal öregebb már nem.
5. **Migráció, indítás, cron, leállítás, e2e — nincs új migráció vagy életciklusút.** A diff nem érinti a Drizzle-táblát, a migrációkat vagy az indítási/leállítási beállításokat. Az eldobható DB és az e2e indítás-ellenőrzése lefutott. Éles cron/leállítás mérése erre a diffre nem alkalmazható.
6. **Verseny, megszakítás, ismétlés — L1.** Az atomi címzettfoglalás változatlan; a meglévő valódi DB-futtatásban a párhuzamos hívás, sikertelen címzett pótlása és lefagyó küldő foglalásának feloldása zöld. A dátum tartalma ennek ellenére változik ugyanannál a körnél, mert a foglalás nem rögzíti a formázó bemenetét.
7. **Tesztminőség — L3.** Meglévő tesztet nem gyengít a diff. A `plausibleStart` JS-másolatából külön elvettem a jövő- és korhatárfeltételt; a követett teszt bemeneteit használva a láthatósági eredmény `[false,true,false,false]` helyett rendre `[false,true,true,false]` és `[false,true,false,true]`. A kapcsolódó két levélassert tehát meg tudná fogni ezt a két mutációt. Ez leválasztott ellenpróba, nem a követett fájl mutált futtatása. A B1a szerver-először követelménye dokumentált a tervben és a végrehajtásban.
8. **Feladatspecifikus elfogadás — részben teljesül (L1–L3).** A végrehajtás `:27–30` szerinti opcionális pozitív egész mezők, szigorú objektumok és a `meta`-átadás látszanak a kódban. Az új dátumsor kötelező; a régi tárgy, tanuló-, évfolyam- és eredménysor változatlanságát a base-sablonnal kód szerint összevetettem, regressziót nem találtam. A méretőr szerinti éles diff +27/−5 sor, kliensváltozás és B1a-kapcsoló nincs. A kliens-e2e nem kötelező erre a szeletre, de a két meglévő specet futtattam. A zöld `gate:push`, a #510-ből való pontos tesztátvétel és a B1b előtti éles telepítés **UNVERIFIED**; a B8- és az összes szelet beolvadására vonatkozó EARS-pontok itt nem alkalmazhatók.
9. **Egyéb — kézbesítési szerződés: L1.** Ellenőriztem a Resend-adapterig: ugyanazt a kulcsot kapja, de a törzs az új időmező miatt újraépítéskor eltérhet. Ez az alkalmazásoldali eltérés a vizsgált fejben új, a szolgáltató viselkedését nem minősítettem.

## Mit próbáltam megtörni, és nem sikerült
- Régi vendég feladat- és kvízbeküldés, kihagyott kérdés `-1`, ismeretlen mező, hamis pontszám, túl hosszú válasz, szöveges dátum. A követett séma- és eredménytesztek zöldek; a böngészős tesztek a klienskérést elfogják, a régi POST valódi HTTP→DB→tesztküldő útját a DB-csomag méri.
- Pontozás, tárgy, vendégjelölés és levél-escape: a tárgy és a három meglévő összesítő sor forrása nem változott; az attribúciós és escape-tesztek zöldek. Teljes HTML-bájthasonlítást nem futtattam; a dátumsor szándékoltan új.
- Tavaszi DST-határ, nyári éjfél, évváltás, pontosan 400 nap és azon túli első ezredmásodperc: helyes eredmények a mért mintákon. A bemutatott két méretű levélminta nem takarta el és nem vágta le a dátumokat.
- Gyakorlókör utolsó válasza és párhuzamos lezárás, valamint ismételt címzettfoglalás: a DB-tesztekben nem lett plusz kézbesítés.

## Mit NEM vizsgáltam
- **UNVERIFIED:** Új mezőkkel valós, publikált leckére menő teljes HTTP→DB→tesztküldő út, különösen az érvényes tokenes új/hibás mezős esetek és az új időbélyeg azoknál. A helyi böngészős forgatókönyvek token kérése után is 403-nál álltak meg. A regressziós DB-csomag régi testeket használ; a dátumsort elszigetelten mértem.
- **UNVERIFIED:** Éles Resend-válasz és postafiók (különösen az eltérő HTML azonos kulccsal), éles `gate:push` bizonyíték, telepítési állapot, valódi levelezőkliensek. Nem küldtem valódi e-mailt; a képek Chromiumban előállított levélminták, nem kézbesített levelek.
- **UNVERIFIED:** A követett TS-kód saját mutált futtatása és a Node-folyamat TZ-jének átállításával végzett ellenpróba; a helyi Node-verzión a saját TS-próbát a homokozó elutasította. A két leválasztott dátumőr-mutációt böngészőben ellenőriztem. Teljes egységtesztkészlet, éles cron/leállítás, régi HTML-anyag kézi végigjátszása nem történt.

## Megcáfolt gyanúk
- „Az új kulcsok miatt a régi ügyfél 400-at kap”: az opcionális mezők nem írják át a meglévő kritériumokat; a régi alakot mérő egységteszt és a régi valós POST DB-esete átment.
- „A `lastAnsweredAt` már ebben a szeletben korhatárt állít”: a feldolgozó csak a `startedAt`-ot továbbítja. A korhatár a dokumentált B1b-be tartozik.
- „A szerveres gyakorló örökli a kliens által küldött `startedAt`-ot”: külön pontozott objektummal hív; a `meta` csak a POST-ágban kerül rá. A közös „Beküldve” sor viszont erre a hívóra is hat.
- „Az őszi hiba oka a rossz helyi óraátváltás”: a két helyi óraérték helyes `Europe/Budapest` szerint, az eltolást elhagyó megjelenítés teszi félreérthetővé őket.

## Mit futtattam (parancs + eredmény)
- `npx tsx --test source/tests/lesson-result-email-date.test.ts source/tests/lesson-result-email.test.ts source/tests/lesson-result-email-quiz.test.ts source/tests/learner-attribution.test.ts source/tests/open-answer-short.test.ts` — 31 átment, 0 bukott.
- `npx tsx --test source/tests/result-report-complete.test.ts source/tests/admin-route-guard.test.ts source/tests/e2e-mode.test.ts` — 20 átment, 0 bukott.
- `npx tsc --noEmit` — exit 0.
- `run_db_tests` (`npm run test:learning-db`, PostgreSQL 17) — 258 átment, 0 bukott; eldobható DB eltávolítva.
- `run_e2e source/tests/lesson-result-email.spec.ts source/tests/lesson-result-email-quiz.spec.ts` — 3 átment, 0 bukott (Chromium, elfogott eredmény-POST-ok).
- `node .blind-review-tmp/dates.ts` — a homokozó Node v24 alatt elutasította; nincs futási eredmény.
- `run_browser_scenario .blind-review-tmp/mail-review.json` — két forgatókönyv-validációs elutasítás után exit 0; dátumlogika, két mutációs ellenpróba és két megnézett képernyőkép. Az API-eset CSRF-403-nál megállt.
- `run_browser_scenario .blind-review-tmp/mail-post.json` — exit 0; proxy-beállítást utánzó helyi ismétlés: tokenvégpont 200, a POST-ok 403. Nem tekintettem adatszerződés-tesztnek.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 0 | 0 | 0 | 0 | 0 |
| közepes | 1 | 1 | 0 | 1 | 0 |
| kicsi | 2 | 2 | 0 | 1 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (közepes) A beküldés dátuma újrapróbán megváltozik és eltolja a kezdés ellenőrzését — `source/shared/lesson-result-email.ts:127` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: scenario)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 22 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 3263
- tokenek: 1767405 bemeneti (ebből gyorsítótárból: 1649502, gyorsítótárba írva: 117837), 16681 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 93.7%; becsült megtakarítás: 6.1503 USD
- költség (a tényleges usage alapján): 0.6265 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
