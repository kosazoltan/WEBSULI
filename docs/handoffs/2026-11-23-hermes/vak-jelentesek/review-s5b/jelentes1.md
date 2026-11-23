# Független review — TGM S5b
Fej: 20a1823b8f0430a441b5e8420bb4e2d6c338ab31
## Ítélet: NEM

Egy szabályos ábrabeillesztés megsérti a V11-et: a leckében megmarad a `rejtely` jelölő és a nyitóblokk szövege, de a lejátszó „Magyarázat” fejlécet ad neki. A KI gyártás vizsgált lenyomatai nem változtak.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

### L1 — Blokkoló: a közbeillesztett ábra eltünteti a kiosztott nyitófejlécet (V11)
**`source/shared/lesson-block-label.ts:91–93`.** A tanár BE állapotban hatodikos leckét gyárt. A szerző Célkártyát és `rejtely` nyitást ad; az animátor az általa szemléltetett Célkártya után illeszti az ábrát (`after: 0`). A diák fekvő telefonon a nyitószöveget látja, de az már a harmadik blokk, így „Rejtély” helyett „Magyarázat” a fejléce.

**Bizonyíték:** a valódi `/preview/:id` → `LessonView` → lejátszó útvonalon, a tárolt leckét szimuláló HTTP 200-as válasszal, ábra nélkül `A lecke célja | Rejtély | A lecke tanulsága`, azonos nyitással és jelölővel, közbeillesztett ábrával pedig `A lecke célja | Folyamat | Magyarázat | A lecke tanulsága` jelent meg. A képernyőképen a „Magyarázat” alatt a rejtély szövege látható. Kerestem a szerveroldali védelmet: az animátor utasítása kifejezetten az ábrázolt `explain` blokk utáni beszúrást írja elő (`source/server/studio/step-io.ts:740–747`); a folt engedi ezt a pozíciót (`source/server/studio/visual-patch.ts:104–115`), az animátorkapu pedig az ábrák *nélküli* blokksorrendet hasonlítja össze (`step-io.ts:855–859`). Az ívkapunak továbbra is `explain` az első blokk (`source/shared/lesson-arc.ts:84–92`). Nem kell hibás modellválasz. A beszúrás működését külön a követett folttesztek is mérik; a böngészős próba nem indított gyártást.

**Base → head:** a base csak a régi heurisztikus „Mese”/„Történet” címet ismerte, nem volt tárolt forma. A diff az új, V11 szerinti adatszerződést a fizikai indexhez köti: az új jelölő figyelmen kívül hagyása ezért a diff hibája. **Javítás:** S5b-jelölt leckében azonosítsák a nyitóblokkot a beszúrt ábráktól függetlenül (stabil szerepazonosítóval vagy a Célkártya utáni első nem ábra blokkal). Régi leckén maradjon a régi szabály. A regressziós teszt tegyen közéjük ábrablokkot.

### L2 — Közepes: évfolyamváltó javításnál az új formához a régi címke marad
**`source/server/studio/structured-improvement.ts:191`.** A tulajdonos egy S5b-jelölt harmadikos leckére azt kéri: „alakítsd át 12. osztály számára”. A javítás az új évfolyamból oszt formát a szerzőnek (`:175–191`), de a jelöltbe és az alkalmazott leckébe a régi `openingForm` kerül (`:251`, `:312`, továbbá `source/shared/lesson-repair.ts:50–51`). Példa: `m1` magon a forrás algoritmusával kiszámolt index 3, amely a fiatal készletben `helyzet`, a felső készletben `megfigyeles`. Ha a szerző követi az új formát, a megfigyelés mégis „Helyzet” címet kap. Rokoneset: a `valtozatossag-1` lecke teljes javítása is új formát kér, de az átvitt v1 jelölő formátlan marad. A base-ben nem volt kiosztott forma, így ilyen eltérés sem. A hívási láncot olvastam, a magot kiszámoltam; a teljes alkalmazási reprodukció **UNVERIFIED**, ezért jegy. **Javítás:** a futás állapotát továbbra is a tárolt leckéből rögzítsék. A változatlan nyitás tartsa meg a jelölőjét; az engedélyezetten újragyártott nyitásnak ugyanazt a szerveroldali kiosztást adják át a promptba, az előnézetbe és a zárolt mentésbe. Ha v1-et nem akarnak frissíteni, a teljes javítás se kérjen rá új formát.

### L3 — Közepes: a BE prompt egyszerre kéri a régi kötött mesét és az új formát (V9)
**`source/shared/lesson-opener.ts:157–160`.** Harmadik–negyedik évfolyamon a változatlanul beillesztett `stageLine` még „kaland gyerek- vagy fantáziahőssel”, illetve „az 5. mondat »Te mit tennél?« típusú kérdés” utasítást ad (`:23`, `:78–80`). Utána ugyanaz a BE prompt például kötelező kis rejtélyt és 3–6 mondatot kér. Egy szabályos hárommondatos rejtély nem felelhet meg mindkettőnek. A base-ben a két régi utasítás összhangban volt. A V9 teszt a `PONTOSAN 5` részsztringet tiltja (`source/tests/lesson-opening-forms.test.ts:60–64`), nem a bennmaradt 5. mondatot és a második formakiosztást. Modellviselkedést nem mértem. **Javítás:** a BE lépcsősor a korosztályt, szóhatárt, címkéket, hangnemet és tanulságot adja; formát és nyitáshosszt csak az új szerződés írjon elő. A KI és HTML ág maradjon érintetlen.

### L4 — Közepes: a csomagkitöltő egyes magoknál harmadik kötelező kapukérdést ad (V10)
**`source/shared/lesson-bank-plan.ts:50`.** Tíz bankcsomagos új leckénél a kitöltő a `gate`-et is felveheti a második, kötelező fajtának. `map-6` magon a forrás FNV/mulberry32, keverés és kiosztás lépéseinek újraszámolása mag nélkül két, maggal három kapukvótát adott. A második csomag `selfCheck` tétele mellé a kitöltő tesz `gate`-et, miközben a keverés már kiosztott kettőt. A banképítő a kvótában lévő fajtákat előírja (`source/server/studio/experience-builder.ts:605,707`), a lejátszó pedig a következő meg nem oldott kapunál megállítja a listát (`source/client/src/lesson-runtime/CognitiveMethods.tsx:59–61`). Tíz egység reális, a fejezetplafon 12 (`source/shared/lesson-length.ts:12,49`). A közös bank „legalább két” kaput kér, ezért ez nem sémahiba; az S5b tervben megnevezett két kötelező kapu mellé kerül egy harmadik. A teszt sem tíz egységet, sem felső korlátot nem mér (`source/tests/lesson-bank-plan-seed.test.ts:24–29`). A számpélda algoritmusszámítás, nem gyártás. **Javítás:** a BE kitöltő csak nem kapu fajtát használjon, a két elsődleges kapuhelyet külön teszteljék. A KI ág maradjon a régi.

### L5 — Kicsi: a javítási terv mentéskori kapcsolót ír, az invariáns tárolt állapotot
**`docs/specs/2026-11-20-tgm-valtozatossag-abrak.md:214–216,226–227`.** Ha a tanár előnézete és alkalmazása között változik a környezet, a V12 szó szerinti szövege átjelölést vár, a megbízás invariánsa és a terv 7. szakasza viszont a tárolt leckét teszi forrássá. A kód e tekintetben helyesen nem a környezetet olvassa (`source/server/studio/structured-improvement.ts:165–166,312`). **Javítás:** a 11. szakaszban, a V12-ben és a végrehajtási tervben a futás elején a tárolt állapotból hozott döntést írják le, ne a mentéskori env-értéket.

## A hibakereső pontok (ítélet + bizonyíték)

| Pont | Ítélet és bizonyíték |
|---|---|
| 1. Adatszerződés | **Hiba:** L1, L2. A séma átengedi az `openingForm`-ot (`lesson-schema.ts:376`); az azonosítás és a javítási kiosztás nem végig konzisztens. A jelölő eltérése nem buktatja az alkalmazási ellenőrzést, de a teljes mentett JSON tranzakciós hash-e továbbra is kell (`apply.ts:22–25`, `apply-readback.test.ts`). |
| 2. Biztonság/adatvédelem | **Próbáltam, nem sikerült megtörni:** a diff nem vezet be éles URL-t, HTTP-metódust, titkot vagy személyes adatot. A címke saját kódszótári kulcsra korlátozott (`lesson-block-label.ts:93`); a modelljelölő eldobását gyártásra és javításra mérik a futtatott `lesson-variety-paths` tesztek. |
| 3. Regresszió | **Hiba:** L1–L2 a jelölt új és a javított leckén. Jelöletlen leckén és a `valtozatossag-1` szokásos, forma nélküli alakján nincs új címkeág; a visszajelző függvény a base-hez képest változatlan. A névtelen előnézetet, javítási munkapadot és meglévő forrásvizuál-útvonalat futtattam. |
| 4. Europe/Budapest | **Nem alkalmazható:** a kiosztás magból, évfolyamból és banktervből dolgozik; a diff nem változtat dátumértelmezést vagy lejáratot. |
| 5. Migráció, indítás, cron, e2e | **Próbáltam, nem sikerült megtörni:** az új adat a meglévő `lessons.json` JSONB mezőben él (`schema.ts:678–688`), nincs migráció-, cron- vagy indítókód-diff. Eldobható DB-vel az alkalmazás és az E2E-specifikációk elindultak. |
| 6. Verseny, folytatás, újrapróba | **Próbáltam, nem sikerült megtörni a kapcsoló hatókörét:** a bank és a lektor a futás `AsyncLocalStorage` döntését örökli (`lesson-variety-flag.ts:15–32`, `engine.ts:568–571`); a javítás a tárolt jelölőt használja. A kétirányú env-váltásos folytatás és a párhuzamos banktesztek zöldek; a DB-tesztek lefedték a lejárt bérletet és a leállás utáni folytatást. |
| 7. Tesztminőség | **Hiba:** L1, L3, L4. A V11 fixture előre beépíti a szabályos blokkszomszédságot; a saját ellenpróba az inputba tett ábrával buktatta ezt a feltételezést. A V2 verzióemelése dokumentált; a „Peti” sor kizárását célzott teszt kíséri, de a V12 szövege eltér az invariánstól (L5). Kódmutációt nem futtattam. |
| 8. S5b elfogadási pontok | **V8:** a KI lenyomatok és kvóta-ellenpróbák zöldek a vizsgált mintákon. **V9:** a készlet- és magküszöbök zöldek, de L3. **V10:** az első kiosztott fajta és a minimumok a követett mintán zöldek, az extra kötelező kapu L4. **V11:** blokkoló L1. **V12:** a jelölő miatti hamis visszaolvasási hiba nem jelentkezett; L2 a jelölő tartalmát, L5 a követelmény szövegét érinti. |
| 9. Egyéb | **Kerestem, nem találtam új leletet:** a közös opciókeverés rögzített alapvonala zöld. A mintaoldal három mért nézetében nem találtam vízszintes túlfutást vagy levágott címet. |

## Mit próbáltam megtörni, és nem sikerült

- KI gyártás új forrásból és meglévő térképről, kéretlen mezőkkel: a követett lenyomat- és sématesztek nem jeleztek eltérést. A szerzői prompt magja KI-ben nem kerül a szerződésbe.
- Folytatás ellenkező env-értékkel, illetve jelöletlen lecke javítása BE környezetben: az útvonaltesztekben a rögzített állapot maradt érvényben. A modell nem írta felül a szerverjelölőt.
- Címketördelés: a képeken a 360×640-es „Rejtély” és a 844×390-es „Gondolatkísérlet” olvasható; 1280×800-on az ismeretlen forma „Történet”-re esett vissza. A mért dokumentumszélesség rendre 360, 844 és 1280 px volt, azonos a viewport szélességével.

## Mit NEM vizsgáltam

- Nem indítottam fizetős vagy éles gyártást. A V9 promptkonfliktusának modellfüggő gyakorisága, a kvótán túli végső módszersorrend és az éles állomány hatása **UNVERIFIED**.
- A saját TypeScript-próbát a futtató hálózati sandboxja ezen a Node-verzión elutasította. Nincs egyedi, adatbázisig futó évfolyamváltó javítási próba vagy kódmutáció. A V11 reprodukció a valódi frontendben, a tárolt választ szimulálva futott, nem a gyártástól a DB-ig.
- Nem adtam át S5a-binárisból S5b-binárisba egy félkész BE jobot, nem vizsgáltam éles kapcsolóváltást vagy teljes jogosultsági mátrixot. Azonos verzión belül megszakított futásokat és az eldobható DB/E2E-útvonalakat vizsgáltam.

## Megcáfolt gyanúk

- „A Zod-séma levágja az `openingForm`-ot.” Nem: `.passthrough()`; a kontroll `/preview/:id` útvonalon megjelent a „Rejtély”. L1 nem elveszett API-mező.
- „Az alkalmazási hash-ből is eltűnik a jelölő.” Nem: csak a jelölt és a mentett tartalom összevetéséből tűnik el; a tranzakció teljes JSON-hashe előtte kötelező.
- „A lektor új ága menet közben a változatosság env-et olvassa.” A tényleges kód `effectiveLessonVariety()`-t hív a futás hatókörén belül, nem a végrehajtási tervben szereplő közvetlen olvasót.

## Mit futtattam (parancs + eredmény)

- `npx tsx --test` a `source/tests/` alábbi tesztjeire: `lesson-opening-forms`, `lesson-bank-plan-seed`, `lesson-variety-flag`, `lesson-variety-paths`, `lesson-feedback-openers`, `apply-readback`, `lesson-opener`, `source-visuals-flag`, `single-run-engine`, `parallel-bank`, `repair-bank-reuse` (`.test.ts`) → 133 sikeres. Külön `seeded`, `option-order`, `visual-patch` → 24 sikeres. A DB nélküli modulimportok figyelmeztetése mellett mindkét parancs 0-val tért vissza.
- `npx tsc --noEmit` és `npx tsc --noEmit -p tsconfig.test.json` → 0.
- `run_e2e source/tests/preview-navigation.spec.ts source/tests/lesson-repair-workbench.spec.ts source/tests/source-visuals.spec.ts` → 0, eldobható PostgreSQL-lel.
- `run_db_tests` → 259 sikeres, az eldobható adatbázist eltávolította.
- `run_browser_scenario .blind-review-tmp/s5b-review-browser.json` → három nézet, képernyőképek és szélességmérés. `run_browser_scenario .blind-review-tmp/s5b-published.json` → V11 kontroll, L1 reprodukció és L4 számítás. A sikeres kilépés a forgatókönyv lefutását jelenti, nem a mért címke helyességét.
- `node .blind-review-tmp/s5b-contract.ts` → futtató elutasította, nem futott.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 1 | 1 | 1 | 0 | 0 |
| közepes | 3 | 3 | 0 | 1 | 0 |
| kicsi | 1 | 1 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) Közbeillesztett ábra esetén a lejátszó nem adja a kiosztott nyitófejlécet — `source/shared/lesson-block-label.ts:91` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L2** (közepes) Évfolyamváltó javításkor a kiosztott és a megtartott nyitásforma eltér — `source/server/studio/structured-improvement.ts:191` — hivatkozás igazolt
- **L3** (közepes) A BE prompt a régi mesekövetelményt is beilleszti az új nyitásforma mellé — `source/shared/lesson-opener.ts:157` — hivatkozás igazolt
- **L4** (közepes) A kevert kvóta kitöltője harmadik kötelező kapukérdést írhat elő — `source/shared/lesson-bank-plan.ts:50` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: scenario)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 37 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 3801
- tokenek: 5002810 bemeneti (ebből gyorsítótárból: 4790156, gyorsítótárba írva: 212543), 26484 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 96.0%; becsült megtakarítás: 17.9901 USD
- költség (a tényleges usage alapján): 1.2754 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
