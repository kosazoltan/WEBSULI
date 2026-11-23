# Független review — `1ed1dc68`
Fej: 1ed1dc68a9a22361dce2abe45d77cfff84101022
## Ítélet: IGEN, FELTÉTELLEL

A változás megszünteti a fix kérdésazonosító és a sorsolt kérdés ütközését, és megtartja a három rossz válasz utáni 409-es elvárást. Az eldobható PostgreSQL-en a teljes csomag zöld. Egy korábban is meglevő lefedettségi rés marad jegyre: a 409-es állítás nem különíti el a végleg hibás állapot védelmét a kérdésazonosító ellenőrzésétől.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

**L1 — kicsi, jegyre: az új azonosítóval kapott 409 nem teszi próbára önállóan a végleg hibás állapot védelmét.** `source/tests/advent-routes-db.integration.ts:279–281`. A CI-ben a virtuális vendég az első ablak három hibás válasza után a körön kívülről választott ID-t küld be. Ha egy későbbi refaktor csak a `source/server/advent/routes.ts:417` állapotfeltételét veszi ki, és közvetlenül a következő tervhelyet olvassa, a kérés akkor is 409: a háromhelyes terv negyedik eleme `undefined`. Két hibás válasz után ugyanez az idegen ID javítható ablakon is 409-et adna az ID-eltérés miatt. A `failed` állapotot a teszt ettől függetlenül ténylegesen ellenőrzi (`:271–275`); a 409 tehát nem hamis a jelenlegi kódon, a rés az önálló állapotvédelem mérésében van. Az elszigetelt ellenpróbában a feltétel eltávolítása három tervhellyel 409-et hagyott, egy negyedik, a beküldött ID-val egyező tervhellyel viszont 409 helyett 200 lett. Ez az elágazás modellje, nem módosított szerver futtatása.

**Javaslat:** maradjon meg a 144 írásos valódi játékmenet. Külön router-/DB-fixture-ben tegyünk a végleg hibás ablak tervébe egy érvényes negyedik ID-t: arra legyen 409, a tárolt próbák maradjanak változatlanok; egy már megválaszolt ID ismétlése ugyanazon a végleg hibás ablakon adja vissza a tárolt 200-as eredményt. Így az állapotőr kivétele már megbuktatja a célzott próbát.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — próbáltam, nem sikerült megtörni.** Az új ID a szerver által is használt évfolyam-adatfájlokból jön (`source/server/realtime/question-provider.ts:14–23,30–41`; `source/client/src/data/gradeQuizBank/index.ts:33–44`). A `questionId` karakterlánc és a `pick: 0` átmegy a `source/shared/advent/contract.ts:21–24` bemeneti sémáján. Az `/answer` az azonosító-egyezés után keres banktételt (`routes.ts:417–424`); nincs külön „nem létező banktétel” 409 ezen az úton.
2. **Biztonság és adatvédelem — próbáltam, nem sikerült megtörni a vizsgált változást.** Nincs új URL-paraméter, naplózás vagy GET-írás. A tesztsegéd az azonosítót írásnál törzsben, olvasásnál fejlécben küldi (`advent-routes-db.integration.ts:38–49,62–64`); a csomagban lefutott a CSRF nélküli 403 és az állapotolvasás utáni DB-ellenőrzés (`:118–141`), valamint a napló- és URL-őr.
3. **Regresszió — próbáltam, nem sikerült megtörni.** Az egyetlen változás a DB-teszt; a névtelen, párosított és játékos-fiókos eseteket tartalmazó teljes DB-csomag zöld. Kliens-, Stúdió- és régi anyagkód nem változott.
4. **Budapesti idő — próbáltam, nem sikerült megtörni.** A tesztórán december 26. pótlási fázis, minden ablak nyitható (`advent-routes-db.integration.ts:24–25,258–261`; `source/shared/advent/calendar.ts:71–82`). A budapesti éjfél, a december 24/25 és a január 6/7 határtesztjei zöldek.
5. **Migráció, indítás, e2e — próbáltam, nem sikerült megtörni.** A DB-futtató a `0042` migrációt kétszer játssza le (`source/scripts/run-learning-db-tests.ts:94–103`); a Drizzle-olvasást, indexeket és kényszereket ellenőrző teszt zöld (`source/tests/advent-db.integration.ts:35–45`). A flag és az érvényes tesztidő nélküli e2e-kikapcsolás esete lefutott. Cron és éles leállítás nem érintett.
6. **Párhuzamosság és ismétlés — próbáltam, nem sikerült megtörni.** Az érintett kör szekvenciális (`advent-routes-db.integration.ts:264–269`), az írás sorzár alatt fut (`source/server/advent/store.ts:115–146`). A DB-csomagban lefutott a párhuzamos módosítás, az átvétellel egyidejű válasz és az újraküldés. A 144 játékmenet-írás a változás után is `24 × 3 × 2`; a teszt minden megnyitásnál és válasznál 200-at vár.
7. **Tesztminőség — talált hiba (L1).** Sem a 409-es elvárás, sem a `failed`, az összesítés vagy az új kör ellenőrzése nem gyengült. Az állapotőr kiesését viszont az izolált modell szerint a változatlan háromhelyes kiosztás elfedi. Spec-változás nincs.
8. **Feladatspecifikus ellenőrzés — a sorsolási ütközést nem sikerült visszahozni.** A `seen` az egyetlen kör mind a `24 × 3 = 72` különböző, megnyitott és megválaszolt ID-ját lefedi. A válaszút csak az adott nap tárolt próbáira ad idempotens 200-at (`routes.ts:407–415`), ezért a kiválasztott ID nem kerülhet ebbe az ágba. Jelölt biztosan van: a futtatott bankőr tárgyanként legalább 18 egyedi, helyes előtagú tételt igazol öt tárgyban (`source/tests/grade-quiz-bank.test.ts:28–40,54–64`), tehát legalább `5 × 18 − 72 = 18` kilencedikes ID marad még a konzervatív becsléssel is. Az idempotens ismétlés szándékos: R8, E15, A20, valamint a javítható és a megoldott ablak meglévő ismétléspróbái (`advent-routes-db.integration.ts:170–174,787–789`).
9. **Egyéb sorsolásfüggő állítás — próbáltam, nem találtam azonos osztályú, jelenlegi hibát.** A `xmas-999` és `nem-letezo-kerdes` nem bankazonosítók a vizsgált fejen (`:181,623`; repókeresés). A `g07-torolt-001`-et a teszt előbb maga írja a mentésbe (`:782,788`); itt a 200 szándékos. Az új kör ellenőrzése a ténylegesen látott halmazhoz viszonyít (`:286–287`), a szerver pedig a korábbi tervet adja át kizárólistaként (`source/server/advent/adoption.ts:57–71`; `routes.ts:355–357`). A többi bejárt pontozás a kisorsolt kérdés opciósorrendjéből számolja a választ, nem fix indexet feltételez (`:70–78,529–537,756–763`).

## Mit próbáltam megtörni, és nem sikerült

- Kerestem olyan kiosztást, ahol a kiválasztott ID már megválaszolt lehet: a végigjátszott terv és a `seen` kapcsolatát követve erre nincs út a rögzített évfolyamú, átvétel nélküli tesztben. A tényleges kiosztáson a teljes DB-futás átment.
- Ellenőriztem, hogy az új 409 helyett ne 400/403/429 vagy egy korai 409 adjon félrevezető eredményt: a törzs és a nap érvényes, a teszt már létrehozta a tervet, és a december 26-i óra nem zárja az ablakot. A megmaradó kérdésazonosító-ellenőrzési lefedettségi rést L1 rögzíti.

## Mit NEM vizsgáltam

- **UNVERIFIED:** az állapotőr tényleges szervermutációja és a régi CI-bukás külön, rögzített seeddel való teljes újrajátszása. A saját Node-próbát a futtató a Node v24.22.3 hálózati sandbox-korlátja miatt blokkolta. A böngészős szerver érvényes időfejléccel is `{enabled:false}` állapotú volt; ott csak az izolált elágazást futtattam. Az eredeti szerverkódot a rendes HTTP/DB-csomag futtatta.
- Nem auditáltam az egész adventi specifikációt, az éles cron- és levélküldést, a produkciós proxykonfigurációt vagy a felületet álló/fekvő nézetben. A diff csak a szerverintegrációs teszt bemenetét módosítja; ezekről a review nem ad megfelelőségi állítást.

## Megcáfolt gyanúk

- A kijelölt kérdés nem fiktív és nem érvénytelen kérés: valódi, ki nem osztott kilencedikes banktétel. A státuszkódon kívüli mérce is megmaradt: három igazoltan rossz válasz, `failed`, megfelelő összesítés és sikeres új kör.
- A korábbi 200 nem a végleg hibás ablak újranyitása: az `/answer` előbb az adott ablak tárolt próbái közt keres, és találatkor új próba rögzítése nélkül adja vissza az eredményt.

## Mit futtattam (parancs + eredmény)

- `run_db_tests` (`npm run test:learning-db`, PostgreSQL 17): 258 sikeres, 0 bukás, 145,5 s; az eldobható DB eltávolítva.
- `npx tsx --test source/tests/advent-calendar.test.ts source/tests/advent-rules.test.ts source/tests/advent-assignment.test.ts source/tests/advent-contract.test.ts source/tests/advent-source-guard.test.ts`: 47 sikeres, 0 bukás.
- `npx tsx --test source/tests/advent-limits.test.ts source/tests/grade-quiz-bank.test.ts`: 28 sikeres, 0 bukás.
- `npx tsc --noEmit -p tsconfig.test.json`: 0-s kód.
- `run_browser_scenario .blind-review-tmp/advent-guard-review.json`: a helyi flag kikapcsolva; az izolált modellben 409 a `repairable`, `failed` és eltávolított őr esetén is három tervhellyel; negyedik egyező hellyel 409 → 200 az őr kivételekor. Egy korábbi forgatókönyv és az első változat validációs hibával el sem indult.
- `node .blind-review-tmp/advent-review.mjs`: sandbox elutasította, nem futott.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 0 | 0 | 0 | 0 | 0 |
| közepes | 0 | 0 | 0 | 0 | 0 |
| kicsi | 1 | 1 | 0 | 1 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
(nincs)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 21 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 3448
- tokenek: 2153982 bemeneti (ebből gyorsítótárból: 2022293, gyorsítótárba írva: 131626), 11963 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 95.7%; becsült megtakarítás: 7.5531 USD
- költség (a tényleges usage alapján): 0.6511 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
