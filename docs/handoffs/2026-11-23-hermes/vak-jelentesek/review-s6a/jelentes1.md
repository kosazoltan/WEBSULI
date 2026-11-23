# Független review — feat/tgm-s6a-v2
Fej: e95b83d5180bb2d58bdb74e79c6fe7aea8e5055d
## Ítélet: NEM

BE állapotban a kiosztás két külön módon sérti a változatossági célt: az egyik esetben maga a mintaazonosító lépi túl a plafont, a másikban a szerzőnek átadott blokksorok válnak azonossá. Mindkettő az S6a új átíró lépésében keletkezik. A meglévő, követett tesztek nem jelezték őket.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

- **L1 — blokkoló — A mohó kiosztás akkor is feladja a 40%-os szabályt, amikor van szabályos megoldás.** `source/shared/lesson-section-shapes.ts:40`. BE állapotban egy tanár a Stúdióból indít egy összehasonlításokra épülő leckét, amelynek tíz fogalomfejezetét a modell jogszerűen `comparison` típusúnak jelöli. A `00000000-0000-4000-8000-000000000067` térképazonosító magja `3379279618`: a kiosztásban az első nyolc fejezeten már négy `donteshelyzet` és négy `alap` van, a kilencedik `osszehasonlito`, a tizedik pedig egy ötödik `donteshelyzet`. Ez 5/10 a megengedett 4/10 helyett. Megcáfolási próba: ugyanazokra a típusokra az `alap → osszehasonlito → donteshelyzet` ciklus tíz helyre 4/3/3-at ad, szomszédismétlés nélkül. Nem a két szabály ütközik, hanem a már meghozott döntések szorítják sarokba a mohó algoritmust. A forráshű JS-ellenpróba 200 rögzített azonosítóból 10 fejezetnél 4, 12 fejezetnél 1 ilyen esetet talált; ez próbafrekvencia, nem éles becslés. A tíz fejezet a valós motorban elérhető: 28 tanítandó fogalomnál `ceil(28/3) = 10` (`source/shared/lesson-length.ts:12–14,46–51`). A base-ben az elfogadott modellterv közvetlenül ment, ez a választás nem létezett; a diff a `source/server/studio/single-run/engine.ts:730–731` soron át a szerzőnek is továbbítja a hibás kiosztást. **Javítás:** determinisztikus visszalépés vagy előretekintő megoldó 12 fejezetig; enyhítés csak akkor, ha nincs teljes szabályos megoldás. Tesztbe kerüljön egynemű és vegyes típussorozat is, ne csak a négy típus ciklusa.
- **L2 — blokkoló — A kötelező záró `recap` a szerzőnek átadott tervben azonos mintává olvaszt két külön azonosítót.** `source/shared/lesson-section-shapes.ts:84`. BE állapotban négy `any` fogalomfejezet a `00000000-0000-4000-8000-000000000030` térképen `alap / kerdesfelveto / alap / donteshelyzet` azonosítót kap. A zárás hozzáfűzése után az 1., 3. és 4. fejezet `plannedBlocks`-a pontosan `explain,example,animate,check,recap`. Az utolsó két fejezet tehát azonos sorú, és ez a sor 3/4 helyet foglal el a felfelé kerekített `ceil(0,4 × 4) = 2` helyett. Megcáfolási próba: az azonosítókon mért V14 valóban zöld ezen a bemeneten; az eltérés a végleges sorokon jelenik meg. A saját V16-szimuláció kulcsa is a lezárt blokksor, nem az azonosító (`source/shared/lesson-section-shapes.ts:101–104`). A base nem cserélte le az elfogadott blokksorokat, így ezt az azonosságot nem állította elő. **Javítás:** a kiosztás a záró `recap`-pal normalizált sorokat is vegye figyelembe; ne engedje a záró `donteshelyzet`-et, ha azzal a szomszédja ismétlődne vagy betelne a tényleges sor kvótája, amíg van illő alternatíva.
- **L3 — közepes — A különleges záró fejezetnél a program nem biztosítja a tervezett `recap`-ot.** `source/shared/lesson-section-shapes.ts:82`. Egy többlépéses eljárás BE gyártásánál a modell végül `Ellenőrzés` fejezetet ad `explain,animate` blokkokkal. A terv sémája és fogalomfedettségi ellenőrzése ezt az alakot nem utasítja el (`source/server/studio/step-io.ts:76–82`, `source/server/studio/single-run/engine.ts:723–726`). A saját ellenpróbában a fejezet `animate`-tal zárva ment tovább: a különleges fejezet korai visszatérése megelőzi a `recap` pótlását. Ha a szerző változtatás nélkül követi a tervet, az ívkapu `no_recap` kifogást ad (`source/shared/lesson-arc.ts:195–204`). A prompt ugyan kéri a `recap`-ot, és a base-ben is átmehetett hiányos terv, ezért ez nem új blokkoló; az új V15 determinisztikus ígérete viszont nincs végigvezetve. **Javítás:** rögzíteni, hogy a különleges záró fejezetnél a `recap` az egyetlen engedett automatikus pótlás, vagy az ilyen új modelltervet elfogadás előtt ellenőrizni. A tulajdonosi és mentett terv maradjon érintetlen.
- **L4 — közepes — A BE tervezői kérés és a tényleges rendszerutasítás nincs összhangban.** `source/server/studio/step-io.ts:411`. A Stúdió BE gyártásában az állomás kérése már `sectionKind`-ot kér és a programra bízza a végleges ívet. Ugyanabban a modellbeszélgetésben a rendszerprompt továbbra is tartalmazza a pedagógusskillt (`source/server/studio/single-run/engine.ts:182–194`); a skill JSON-alakjából hiányzik a `sectionKind`, és kétszer a régi rögzített ívet írja elő (`source/server/studio/role-skills.ts:92–96`). A base-ben a két utasítás egyezett. Ha a modell a rendszerben felsorolt mezők szerint válaszol, a séma ezt elfogadja, a típus `any` lesz (`source/shared/lesson-section-shapes.ts:75`): változatosság maradhat, de a típushoz illesztés elvész. A tényleges modellreakció **UNVERIFIED**. **Javítás:** a tervezői szerep utasítását is a futásra rögzített BE állapothoz igazítani, KI-ben az eredeti bájtokat megtartva; a teszt a rendszerutasítást és az állomáskérést együtt vizsgálja.
- **L5 — kicsi — Üres mintán is sikeres a szimuláció küszöbvizsgálata.** `source/scripts/measure/shape-simulation.mts:12`. Ha az ellenőrzést futtató fejlesztő `--lessons 0`-t ad, vagy a `--counts` összes eleme kiesik a szűrésen, a számítás 0 fejezettel `topShare = -Infinity` és `samePatternProbability = 0` értéket ad. Mindkét összehasonlítás igaz, így a kilépési kód 0, pedig nem volt mérés. Az elszigetelt ellenpróba mindkét bemenetet lefedi; az alapértelmezett futás ettől nem hibás. **Javítás:** pozitív egész leckeszám, nem üres érvényes fejezetszám-lista és pozitív tényleges mintaszám ellenőrzése; hibás bemenetre nem nulla kilépés.

## A hibakereső pontok (ítélet + bizonyíték)

| Pont | Ítélet és bizonyíték |
|---|---|
| 1. Adatszerződés | **Talált hiba:** L2–L4. A séma opcionális `sectionKind`-ot fogad, az elfogadás után az átíró levágja, és a `plannedBlocks` kerül a szerző promptjába (`step-io.ts:626–627`). Ezen az átadási ponton keletkezik L2, illetve nem történik meg a záró pótlás L3-ban. |
| 2. Biztonság és adatvédelem | **Próbáltam, nem sikerült megtörni:** a diff nem nyit új HTTP-útvonalat, nem módosít auth/origin/CSRF viselkedést, és az új mező egy négyelemű osztályozás. A térképazonosítót a kiosztás helyben maggá alakítja; nem találtam új URL-be, linkbe vagy naplóba kerülő titkot vagy személyes adatot. |
| 3. Regresszió | **Talált hiba a BE tervezőnél:** L4. **KI állapotban nem találtam eltérést** az ellenőrzött kéréseknél: a régi promptág literáljait összevetettem a base-zel, a forrásvizuál-lenyomatok és a régi lecke/javítás tesztjei zöldek. A fokozatfüggő nyitásleírás változásának mindkét kiszolgálói hívóját ellenőriztem. Névtelen és belépett nézetet ez a diff nem módosít. |
| 4. Budapest/időhatár | **Nem alkalmazható:** a kiosztás és a küszöb csak magtól, típusoktól és elemszámtól függ; a diff nem változtat órát, dátumot vagy időzónát. |
| 5. Migráció/indítás/cron/leállítás/e2e | **Nem alkalmazható a változásra:** nincs migráció, Drizzle-séma-, indítási vagy cron-diff. A terv a meglévő job JSON-kimenetbe kerül (`engine.ts:626–628,730–731`); a régi terv alakja olvasható marad. `tsc` zöld. |
| 6. Párhuzamosság és folytatás | **Próbáltam, nem sikerült megtörni** a vizsgált úton: a futásállapot await után is rögzített; a meglévő megszakított bankteszt mindkét irányú környezetváltással zöld. A mentett terv és az explicit jóváhagyott terv mag nélkül megy át az átírón; a mentés az átírt tervből történik. A diff nem adott új aszinkron állomást vagy időtúllépést. |
| 7. Tesztminőség | **Talált lefedési hibát:** L1 mind a 200 magon átment a követett V14 ellenőrzésén, mert az csak négy ciklikus típussorrendet próbál; L2-t csak a végleges sorokon lehet látni, a V14 viszont azonosítókat mér. Az elszigetelt mutációs próbában ugyanaz a V14-bemenet elkapta a szomszédőr törlését (`n=3,s=1`), külön pedig a plafonőr törlését (`n=5,s=5`). Nem üres a teszt, csak hiányzik a globális ellenpélda. Meglévő teszt gyengítését nem találtam; az S6a követelményei dokumentáltak. |
| 8. S6a elfogadás | **V13:** a követett teszt mind a hat nominális mintát első, középső és utolsó helyzetben átengedte a változatlan ívkapun. **V14:** sérül (L1–L2). **V15:** KI és a jóváhagyott/mentett terv megkerülő ága rendben a vizsgált útvonalakon; a különleges záró fejezet határesete sérül (L3). **V16:** a követett teszt zöld; a saját, azonos algoritmusú számítás az alapeloszlás 400 leckéjén 2573 fejezetből 19,2% leggyakoribb sor és 15,4% azonossági valószínűség (`Σ p²`). Üres mintán hamis zöld (L5). |
| 9. Egyéb | **Talált hiba:** a mérőszkript üres mintás sikere (L5). A javított nyitásforma-lookupnál nem találtam KI regressziót: a keresés csak tárolt formaazonosítónál fut, a közös azonosítók sávonkénti leírását teszt fedi. |

## Mit próbáltam megtörni, és nem sikerült

- KI első gyártás és a banknál megszakított futás folytatása BE környezetben, majd a fordított irány: a jelölő és a promptkapcsoló a rögzített állapotot követte. A tárolt, jelöletlen lecke célzott javítása BE környezetben is KI maradt.
- Már elfogadott terv újrakiosztása: a felület elküldi a jóváhagyott sorrendet (`OutlineReview.tsx:198–203`), a motor a mentett/jóváhagyott tervet a modellág helyett veszi át (`engine.ts:719–730`). Mag nélkül az átíró csak a kéretlen `sectionKind` metaadatot távolítja el, blokksort nem oszt újra.
- Az ívkapu fellazítása, illetve a hat nominális minta eleji magyarázata vagy a kérdés előtti példája: a kapu nincs a diffben, a követett ívtesztek átmentek. A különleges zárásnál talált L3 ettől külön eset.

## Mit NEM vizsgáltam

- Nem volt fizetős modellhívás, éles adat vagy kiadott leckéken újramérés. A valós modell reakciója az ellentmondó promptra és a mondatszintű pedagógiai hatás **UNVERIFIED**.
- Nem volt DB-integráció vagy megszakításos DB-/HTTP-végpontpróba. A meglévő folytatási teszt a motorig ér, memóriatárolóval; a mentett JSON és a folytatási kapu hívási láncát olvastam, nem éles Postgresen mértem.
- A saját Node-ellenpróbát az eszköz elutasította, mert ezen a Node-verzión nem tudta garantálni a hálózati izolációt. A saját mérések böngészőben, a tiszta algoritmus JS-átiratával futottak, nem a szervermodult importálva és nem a teljes gyártási úton. Az eredeti TS-modult a követett tesztek futtatták. A bench CLI tényleges indítása és az éles fejezetszám-eloszlás **UNVERIFIED**.
- Nincs kliens-/elrendezés-diff; nem végeztem álló/fekvő képernyő-összevetést. A böngészős futásokat számítási ellenpróbára használtam.

## Megcáfolt gyanúk

- A pedagógus a varázslóban újraolvassa a környezetet: a gyártási hívás a `runWithLessonVariety` hatókörében van, az `effectiveLessonVariety()` ott a tárolt `false` értéket sem írja felül környezettel. Ezt az ellentétes környezetű teszt is igazolja.
- A szomszéd- és a 40%-os szabály L1-ben kényszerűen ütközik: a 4/3/3-as ellenkiosztás ezt cáfolja.
- A hat minta mindenképp átírja a jóváhagyott tervet, mert az átíró hívása közös: a magot a `planned === undefined` feltétel védi; az `undefined` magú ág nem módosít `plannedBlocks`-ot.

## Mit futtattam (parancs + eredmény)

- `npx tsx --test source/tests/lesson-section-shapes.test.ts source/tests/lesson-opening-forms.test.ts source/tests/lesson-arc.test.ts source/tests/source-visuals-flag.test.ts source/tests/single-run-engine.test.ts source/tests/studio-role-skills.test.ts` — **124/124 pass**.
- `npx tsx --test source/tests/lesson-variety-paths.test.ts source/tests/lesson-variety-flag.test.ts source/tests/lesson-opener-bank-reuse.test.ts source/tests/lesson-length.test.ts source/tests/lesson-block-label.test.ts` — **37/37 pass**. Mindkét csoportban a hiányzó `DATABASE_URL` miatt volt DB-kapcsolati figyelmeztetés; nem tekintettem DB-tesztnek.
- `npx tsc --noEmit` — **0**, diagnosztika nélkül.
- `run_browser_scenario .blind-review-tmp/shape-browser.json` — **0**, az elszigetelt számítás reprodukálta az L1-et; a közvetlen forrásmodul-URL HTML-választ adott.
- `run_browser_scenario .blind-review-tmp/shape-cases.json` — **0**, L2/L3/L5 és V16 ellenpróba.
- `run_browser_scenario .blind-review-tmp/shape-mutation.json` — **0**, a két mutáció a várt ellenpéldával bukott a JS-átiratban.
- `node .blind-review-tmp/shape-cap.mjs` — eszköz által elutasítva, nem futott. A második tesztcsoport első hívása egy nem létező `outline-autofix.test.ts` útvonal miatt elutasítva, a fenti javított lista futott. A `shape-browser.json` első változata a forgatókönyv-név hosszkorlátján bukott; a fenti néven a rövidített változat futott.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 2 | 2 | 0 | 2 | 0 |
| közepes | 2 | 2 | 0 | 1 | 0 |
| kicsi | 1 | 1 | 0 | 1 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) Szabályos teljes kiosztás mellett is túllépi a 40%-os plafont — `source/shared/lesson-section-shapes.ts:40` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: scenario)
- **L2** (blokkoló) A záró recap azonos végleges blokksorrá tesz eltérő mintaazonosítókat — `source/shared/lesson-section-shapes.ts:84` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: scenario)
- **L3** (közepes) Különleges záró fejezetnél kimarad az automatikus recap — `source/shared/lesson-section-shapes.ts:82` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: scenario)
- **L4** (közepes) A BE állomáskérés és a rendszerprompt eltérő tervezői szerződést ad — `source/server/studio/step-io.ts:411` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 22 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 4603
- tokenek: 1986924 bemeneti (ebből gyorsítótárból: 1853193, gyorsítótárba írva: 133665), 16036 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 94.0%; becsült megtakarítás: 6.9085 USD
- költség (a tényleges usage alapján): 0.6800 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
