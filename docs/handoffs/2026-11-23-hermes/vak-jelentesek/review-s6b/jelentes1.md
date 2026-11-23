# Független review — TGM S6b
Fej: 9c7a6c1562deb63303fd6701ba0178573976c2c7
## Ítélet: NEM

Három blokkoló: a mentett `tryKind` folytatáskor elvész, a pontosan egyharmados kész lecke téves minőségi jelzést kap, és a rotáció ismételhet két fajtát akkor is, ha van választás. Base: `c87d1706e557112edd576bd4fcf751df04ec27f2`.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

### L1 — blokkoló — A program által kiosztott `tryKind` folytatáskor eltűnik a tervből és a szerzői kérésből
- **Hely:** `source/shared/lesson-section-shapes.ts:154–158`; hívó: `source/server/studio/single-run/engine.ts:719–741`, új checkpoint: `:787`, szerzői kérés: `:793–794`.
- **Forgatókönyv:** a tanár a Stúdióban BE állapotú gyártást indít. A motor menti az eljárást tanító fejezet tervét `tryKind: "dragSort"` értékkel, majd a folyamat a szerzői kérés előtt megszakad. A piszkozat folytatásakor a mentett állapot továbbra is BE, a `try` a blokksorban marad, de a konkrét fajta sem az újra mentett tervben, sem a modellnek küldött kérésben nincs ott. Ha csak a banknál állt meg, a folytatás akkor is felülírja a mentett tervet a fajta nélkül.
- **Evidencia és base:** a vázlatséma elfogadja a mezőt (`step-io.ts:109`), és a valódi folytatási út betölti a job mentett kimenetét (`single-run/live.ts:150–159`). Mivel már van terv, `shapedNow` hamis; a hívás mag nélkül megy a tisztító ágba, amely az S6b diff óta a `tryKind`-ot is kiveszi. A `sectionShapes` eredetjelzőt a motor csak ezután nézi meg. Az elszigetelt JS-ellenpróbában mentett `dragSort` mellett `programAssigned: true`, de `concreteKindInRequest: false`. A base ugyanezen az úton csak `sectionKind`-ot dobott el; a mentett, szerzőnek átadandó új mezőt ez a diff vezeti be és törli. A modell előzménye nem véd: a szerző előtti megszakításnál csak a modell eredeti terve van benne. Ez sérti a 3. invariánst.
- **Javaslat:** a tisztítás előtt állapítsátok meg a terv eredetét. Mentett BE + `sectionShapes: true` esetén őrizzétek meg a validált kiosztást; a friss modelltervnél, jóváhagyott tervnél és KI-nél maradjon a kéretlen mező szűrése. A motorteszt az igazi, szerző előtti checkpointból induljon, és a következő kérésben **és** a mentett tervben hasonlítsa össze a konkrét fajtát. A jelenlegi `lesson-variety-paths.test.ts:385–392` a banknál megszakított futásból indul, és csak a blokksort ellenőrzi.

### L2 — blokkoló — A pontosan egyharmados lecke tévesen `try_share_low` jelzést kap (V18)
- **Hely:** `source/server/studio/single-run/engine.ts:863–865`, kerekítés: `source/shared/lesson-section-shapes.ts:137–141`.
- **Forgatókönyv:** egy BE futás háromfejezetes kész leckéjében pontosan egy fejezetbe kerül `try`. A tanár a Stúdióban minőségi figyelmeztetést kap annak ellenére, hogy a lecke teljesíti a minimumot. A sikeres közzététel ettől nem áll meg.
- **Evidencia és base:** a követett V18-teszt maga is rögzíti, hogy 1/3 bemenetre a segédfüggvény `0.33`-at ad (`lesson-try-voices.test.ts:47–55`). Az elszigetelt számpróba eredménye: nyers arány `0.3333333333333333`, telemetria `0.33`, elvárt jelzés `false`, a motor feltételével `true`. A `qualityNotes` tényleg a job API-jába, onnan a Stúdióba jut (`lesson-pipeline-routes.ts:722–733`, `JobMonitor.tsx:170–185`). A base-ben ez a téves figyelmeztetés nem létezett; az új ág a megjelenítésre szánt, kerekített arányt hasonlítja a pontos küszöbhöz. Ez szabályos, a célértéket pontosan teljesítő modellválasszal reprodukálható.
- **Javaslat:** a jelzés feltétele a nyers darabszám legyen (`3 * withTry < total` nem üres leckénél), és csak a telemetriaérték legyen kerekített. Viselkedési teszt: 1/3-nál nincs jelzés, 1/4-nél van, mindkettő publikálható.

### L3 — blokkoló — Az `any` fejezet megismételheti a következő kötött `try` fajtáját (V17)
- **Hely:** `source/shared/lesson-section-shapes.ts:123–132`.
- **Forgatókönyv:** egy tanár BE gyártásában a tervező négy fogalmi fejezetet ad: `any`, `procedure`, `comparison`, `description`. A `00000000-0000-4000-8000-000000000002` térképazonosító magján (`3463461903`) az 1. és 4. fejezet kap `try`-t, köztük nincs másik: mindkettő `fillBlank`. A 4. fejezet fajtája kötött, az 1. fejezeté lehetne `match` vagy `dragSort`, ugyanazokkal a blokksorokkal.
- **Evidencia és base:** az izolált JS-port a repo magfüggvényeivel és jelöltsorrendjével ezt az eredményt adta. A példában a két minta már eleve tartalmaz `try`-t, ezért nincs kihagyott beszúrási vagy lazítási ág, amely megváltoztatná az eredményt. A fej csak az előző fajtát veszi ki az `any` jelöltjei közül, a következő kötött fajtát nem. A kiosztott konkrét fajták a friss futásban valóban átmennek a szerzőnek (`engine.ts:740–741`, `:793–794`); a base nem tartalmazott programozott `tryKind`-kiosztást. A V17 párra vonatkozó feltétele sérül: van választás, mégis ismétel a program.
- **Javaslat:** a `try`-t hordozó fejezetek listáján osszátok ki először a kötött fajtákat. `any` pozíciónál az előző fajta mellett a közvetlenül következő kötött fajtát is zárjátok ki; három fajtából így mindig marad jelölt. A teszt nézze az összes szomszédos `try`-párt, ahol legalább az egyik fél `any`. A mostani teszt (`lesson-try-voices.test.ts:28–32`) csak a második `any`-tól vizsgál visszafelé, a fenti irányt nem ellenőrzi.

### L4 — közepes, jegyre — A `tryShare` a szerzői állomás pillanatképe, nem a végleges lecke mérése
- **Hely:** `source/server/studio/single-run/engine.ts:843–868`, lektori tanításcsere `:1043–1048`, végleges mentés `:1151–1153`.
- **Forgatókönyv:** a Stúdióban a tanár BE piszkozatot folytat, amelyben már el van mentve a tanítás. Ha az S6a checkpointból származik, nincs mentett `tryShare`, és a folytatás sem pótolja. Új jobnál is elavulhat az érték, ha a rendes lektori tanításjavítás megváltoztatja, hány fejezetben van `try`.
- **Evidencia és base:** a mérést a diff kizárólag az első szerzői kör ágába teszi. A telemetriarögzítő továbbviszi, ami a checkpointban volt (`single-run/telemetry.ts:25–32`), a végső mentés pedig már nem mér újra. A base és a fej `single-run-1` mentései átjárhatók; a base nem írja az új mezőt. Az izolált vezérlési próbában a lektor utáni tartalomra `0` az arány, a mentett érték `0.67`; régi checkpointnál az érték hiányzik egy `0.67` arányú kész leckénél. Ez fázismodell, nem generálás DB-vel és lektorral; a konkrét lektori tartalomcsere végponttól végpontig **UNVERIFIED**.
- **Javaslat:** a publikálható `publishable` példányon állítsátok be a végső mérést, és cseréljétek vagy töröljétek csak az S6b minőségi jelzést; a szókeret és más megjegyzések maradjanak. Teszteljétek a mentett tanítás utáni folytatást és a lektori tanításcserét is.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — talált hiba.** A `tryKind` enum egyezik a leckeblokk fajtáival, és friss futásban a mentett tervben és a tényleges szerzői kérésben is ott van. A folytatás adatvesztése L1. A `RunGates` opcionális új mezőjét az API nem szűri le; a jelentés értéke viszont L2/L4 szerint hibás lehet.
2. **Biztonság és adatvédelem — próbáltam, nem sikerült megtörni a diff határán.** Az új értékek rögzített enumok, fix hangszövegek, illetve egy szám; nincs új URL, naplózott titok, kérésfogadó útvonal, módosító GET vagy CSRF/origin-változtatás a diffben. A meglévő végpontok teljes jogosultsági auditja nem volt cél.
3. **Regresszió — talált hiba BE folytatásnál; KI-nél nem sikerült eltérést előidézni.** A követett KI lenyomatok és a változatosság ellenkező környezetében futó promptpróbák átmentek; a szókeret-jelzés kódja KI-nél változatlan. A régi anyag, verzióeltérés és a két javítási út célzott tesztjei is átmentek. A jóváhagyott terv blokksora nem íródik át; a különleges fejezeteknél a base záró `recap`-kivétele maradt.
4. **Europe/Budapest — nem alkalmazható.** A kiosztás térképmagból, a metrika blokkdarabszámból jön, egyik sem használ órát, dátumot vagy dátumhatárt.
5. **Migráció, indítás/cron/leállítás, e2e — migráció és ütemezés nem alkalmazható; az e2e-utat nem sikerült megtörni a mért felületen.** A diff meglévő job-JSON-t bővít, nem változtat Drizzle-sémát, indítást, cront vagy leállítást. Az e2e mód őrtesztjei zöldek; az eldobható e2e szerveren a lejátszó-próba betöltött és működött.
6. **Verseny, megszakítás, időtúllépés — talált hiba.** L1 normál checkpointból következik, nem versenyből vagy környezet-olvasásból; L4-nél mentett tanítás mellett kimarad a mérés. A gyártás rögzített `varietyOn`-t visz az async hatókörbe, a lecke- és fogalomjavítás a tárolt jelölőt használja. Az ellentétes környezettel és párhuzamos bankkal futó követett próbák zöldek.
7. **Tesztminőség — talált hiány, az L1–L3 mellett.** A friss motoros próba tényleges szerzői kérést fog meg, de a folytatási része nem. Az új V18-őr mind a fej feltételével, mind a feltételt `false`-ra cserélve zöld a forrásszöveg-mintán (`head: true`, `mutant: true` az izolált regex-próbában); nem méri a jelzés működését. A V17-teszt nem vizsgál minden vegyes szomszédpárt. A blokksor-elvárások módosítása dokumentált a terv 13. szakaszában; az illesztés és a különleges fejezetek állításai nem tűntek el, de a `planSections` kimenetére igazított összevetés önmagában nem független szabályteszt.
8. **S6b elfogadás — V17 és V18 hibás, V19 és V20 a mért körben teljesült.** A minimum és a végleges sorok szomszéd-/40%-szabálya átment öt típusmintán × tíz fejezetszámon × 200 magon × két zárási módon; V17-et a vegyes rotáció töri meg. V18: L2/L4. V19: az 50 magos sávteszt és a KI/BE promptteszt zöld. V20: a 400 szimulált leckés teszt mindkét küszöb alatt maradt. A Próba szerveroldalon kizárólag `check`-et pontoz (`server/rewards/grade.ts:71–82`), a kliens is csak azt számolja (`SectionProba.tsx:60`); minden `try` fajtához van renderelő.
9. **Egyéb — próbáltam, nem sikerült további hibát igazolni.** Ellenőriztem a `try` helyét az ívkapu és a játékkvíz-export felől. Az ívkapu a `try`-t szemléltetésként, nem drillként kezeli; a kvízexport nem exportál `try`-t. Az új tevékenység nem ad külön pontszerzési utat.

## Mit próbáltam megtörni, és nem sikerült

- A KI futást BE környezetbe tettem a követett próbákkal, valamint az ellenkező irányú, bank után folytatott utat is ellenőriztem. Az állapot és a jelölő nem szivárgott át; a `tryKind` elvesztése külön, BE-n belüli hiba.
- A jóváhagyott és a különleges fejezetek átírását, a záró `recap`-ot, a puszta `try`-beszúrással létrejövő sorismétlést és a minimumot a követett mintákon ellenőriztem. A blokksor-assertok átmentek; ez nem fedi az összes lehetséges típusvektort.
- A lejátszóban helyes kitöltést adtam a próbalekcéhez. Mindkét megnézett képen (`3-try-portrait.jpg`, `4-try-landscape.jpg`) az egész kitöltős feladat és a „Helyes!” látszott; a dokumentum szélessége egyezett a 360, illetve 844 px-es nézettel. Ez a meglévő renderelő próbája, nem az új gyártás vagy a Studio minőségi jelzés végponttól végpontig tartó tesztje.

## Mit NEM vizsgáltam

- Valódi, fizetős modellhívást nem indítottam; a hangok pedagógiai hatása és a szerző utasításkövetése igazi forrásokon **UNVERIFIED**.
- Nem futott valódi DB-s, teljes Stúdió-job folytatás vagy lektori javítás saját bemenettel. A Node-homokozó elutasította a saját modulimportos próbát a telepített Node-verzió hálózat-tiltási korlátja miatt. Az ellenpróbák a megjelölt kódrészletek izolált JS-változatát futtatták böngészőben; a szerverhívási láncot a repóban ellenőriztem. A repo teljes DB-s tesztcsomagját és az általános névtelen/jogosultsági utakat nem jártam be.
- Nem teszteltem fizikai érintőeszközön az összes `try` fajtát vagy a kuponkiadást; a pontozást szerverkód és követett teszt, a kitöltőt két emulált nézet támasztja alá. A böngészőpróbában járulékos 404-ek voltak; ezek okát nem mértem, a célblokk működését nem akadályozták.

## Megcáfolt gyanúk

- Nem a környezeti kapcsoló vált KI-re folytatáskor: a mentett döntés és `sectionShapes` jelző megmarad; a hibás tisztítóág törli a fajtát (L1).
- Nem a friss szerzői kérésből hiányzik általánosan a kiosztás: a követett motorpróba a végleges sort és a konkrét fajtát is megtalálja. A hiba a mentett terv visszavételénél van.
- A `0.33` nem önmagában hibás telemetria: két tizedesre ez a várt érték. A túl korai kerekítés a **minőségi döntést** rontja el (L2).

## Mit futtattam (parancs + eredmény)

- `npx tsx --test source/tests/lesson-section-shapes.test.ts source/tests/lesson-try-voices.test.ts source/tests/lesson-variety-paths.test.ts source/tests/source-visuals-flag.test.ts source/tests/single-run-engine.test.ts` — 107/107.
- `npx tsx --test source/tests/lesson-arc.test.ts source/tests/lesson-opening-forms.test.ts source/tests/animate-try-kinds.test.ts source/tests/lesson-attempt.test.ts source/tests/lesson-version-skew.test.ts source/tests/regi-anyag-studio.test.ts source/tests/e2e-mode.test.ts` — 66/66. A két csomag DB URL nélküli importja DB-figyelmeztetést is kiírt; ezek nem DB-integrációs futások.
- `npx tsx --test source/tests/proba-server-grading.test.ts source/tests/lesson-schema.test.ts source/tests/lesson-variety-flag.test.ts` — 23/23.
- `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.test.json` — mindkettő 0.
- `node .blind-review-tmp/shapes-probe.ts` — futtató elutasította, nem futott.
- `run_browser_scenario .blind-review-tmp/s6b-review.json` — első validálás hiányzó viewport miatt elutasítva; javítva négy eset lefutott (L1–L3 izolált logikai próba, V18 regex-mutáció és két valódi lejátszónézet).
- `run_browser_scenario .blind-review-tmp/s6b-telemetry-stage.json` — egy izolált fázispróba lefutott (L4).

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 3 | 3 | 0 | 3 | 0 |
| közepes | 1 | 1 | 0 | 1 | 0 |
| kicsi | 0 | 0 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) Folytatáskor törlődik a kiosztott tryKind — `source/shared/lesson-section-shapes.ts:154` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: scenario)
- **L2** (blokkoló) Pontosan egyharmadnál téves try_share_low — `source/server/studio/single-run/engine.ts:865` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: scenario)
- **L3** (blokkoló) Az any fejezet nem kerüli a következő kötött try fajtáját — `source/shared/lesson-section-shapes.ts:129` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: scenario)
- **L4** (közepes) A kész lecke helyett a szerzői pillanatkép try-arányát menti — `source/server/studio/single-run/engine.ts:863` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: scenario)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 26 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 3455
- tokenek: 2672384 bemeneti (ebből gyorsítótárból: 2512609, gyorsítótárba írva: 159697), 16164 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 94.6%; becsült megtakarítás: 9.3882 USD
- költség (a tényleges usage alapján): 0.8123 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
