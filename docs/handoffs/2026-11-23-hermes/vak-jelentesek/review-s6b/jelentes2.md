# Független review — TGM S6b, 2. kör
Fej: 16824ffe47e653d9e0a65c4bac7e5c285d98bc40

## Ítélet: IGEN, FELTÉTELLEL

A három korábbi blokkoló megszűnt. Új blokkolót nem találtam. Külön jegyre javaslom a végleges telemetria és minőségi jelzés viselkedési tesztjét.

## Az előző kör leleteinek sorsa

| Lelet | Sors | Bizonyíték |
|---|---|---|
| L1 — a `tryKind` elvész folytatáskor | **Megszűnt** | A motor a tisztítás előtt ellenőrzi a rögzített BE állapotot, a mentett tervet és a `sectionShapes` jelzőt (`source/server/studio/single-run/engine.ts:730–743`). A séma elfogadja a fajtát (`source/server/studio/step-io.ts:109`), a tisztító ebben az egy ágban megtartja (`source/shared/lesson-section-shapes.ts:165–177`). A követett motorteszt szerzői válasz nélkül elmentett checkpointból folytat, és a konkrét fajtát a kiküldött kérésben **és** a következő mentésben ellenőrzi (`source/tests/lesson-variety-paths.test.ts:397–417`); passed. A valódi belépő a mentett job kimenetét adja át ugyanennek a motornak (`source/server/studio/single-run/live.ts:150–159`). |
| L2 — pontosan 1/3-nál téves figyelmeztetés | **Megszűnt** | A kerekített arány már csak a telemetria értéke; a döntés `3 × try-t tartalmazó fejezetek száma < fejezetszám` (`source/shared/lesson-section-shapes.ts:138–155`). A szerző utáni és a végső ág is ezt használja (`source/server/studio/single-run/engine.ts:864–869,1155–1159`). A követett próba 1/3 és 2/6 esetén nem jelez, 1/4 esetén jelez (`source/tests/lesson-try-voices.test.ts:120–129`); passed. |
| L3 — az `any` megismétli a rákövetkező kötött fajtát | **Megszűnt** | A kötött fajták már az `any` kiosztása előtt megvannak. Az `any` három jelöltjéből legfeljebb kettő esik ki: az előző és a közvetlenül utána álló kötött fajta (`source/shared/lesson-section-shapes.ts:126–134`). Az előző kör UUID-jével és típussorával, valamint 2–12 fejezet × 200 magon a két irányt ellenőrző próba passed (`source/tests/lesson-try-voices.test.ts:100–118`). |
| L4 — a mentett `tryShare` a szerzőnél mért értéken marad | **Megszűnt a sikeresen befejezett úton** | A lektori tanításcsere után a motor a publikálásra átadott `publishable` példányon újramér, a régi `try_share_low` jelzést cseréli vagy törli, majd ezt az állapotot menti `done`-ként (`source/server/studio/single-run/engine.ts:1043–1050,1144–1163`). Az ág nem függ attól, hogy új tanítás készült vagy mentett tanításból indult a folytatás. A jelzéscserére és a többi jelzés megőrzésére a követett egységteszt passed (`source/tests/lesson-try-voices.test.ts:132–144`). A teljes lektori tanításcsere utáni írás viselkedési próbája **UNVERIFIED**; lásd L5. |

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

### L5 — kicsi, jegyre — A V18 végső mentése nincs viselkedési teszttel védve
- **Hely:** `source/tests/lesson-try-voices.test.ts:144`; a vizsgált ág: `source/server/studio/single-run/engine.ts:1153–1163`.
- **Forgatókönyv:** a tanár a Stúdióban BE állapotú piszkozatot folytat egy S6a-ból mentett tanítási checkpointból. A végső újramérést egy későbbi módosítás átugorja. Ekkor a lecke elkészülne, de a job telemetriájából hiányozna a `tryShare`; új futásnál egy lektori tanításcsere után az eredeti érték és jelzés maradhatna.
- **Evidencia:** a hozzáadott teszt közvetlenül a `withTryShareNote` segédfüggvényt hívja, a motor bekötésénél viszont csak két forrásszöveg-részlet jelenlétét nézi. A végső `if (varietyOn)` feltétel `if (false && varietyOn)` alakra cserélése változatlanul hagyná mindkét ellenőrzött részletet. A többi `tryShare`-ellenőrzés vagy a segédfüggvényt, vagy a szerző utáni ágat nézi, nem a `done` mentést. Ez forrásból ellenőrzött teszthiány, nem mért futásidejű hiba; a mutáció futtatását a homokozó nem engedte. A base-ben nincs ilyen V18 mentés vagy teszt.
- **Javaslat:** a meglévő memóriás `PipelineStore`-ral a `done` patch tényleges tartalmát ellenőrizzétek. Legyen eset mentett tanításból (`tryShare` nélkül), lektori tanításcserével (1/4 → 1/3, illetve fordítva), valamint KI állapotban. A végső újramérés kikapcsolása buktassa a tesztet.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — próbáltam, nem sikerült megtörni.** A szerző előtti checkpointból a séma nem ejti el a fajtát, és a motorteszt a mentésben és a konkrét kérésben is ellenőrzi. A végső telemetria `gates` mezőit a `snapshot` továbbviszi (`source/server/studio/single-run/telemetry.ts:56–60`); a job API ezt és a `qualityNotes`-ot adja tovább (`source/server/studio/lesson-pipeline-routes.ts:722–733`).
2. **Biztonság és adatvédelem — a javító diffben nem találtam hibát.** Nincs új végpont, URL, naplómező, titok vagy személyes adat; a korábban is adminhoz kötött, olvasó job-végpont változatlan (`source/server/studio/lesson-pipeline-routes.ts:219,698–733`). Ez célzott diffvizsgálat, nem hozzáférés-audit.
3. **Regresszió — próbáltam, nem sikerült megtörni.** KI futás BE környezetben sem kap új hang- vagy `tryKind`-utasítást; a KI promptlenyomatok zöldek. A jóváhagyott terv sorai frissen és folytatva változatlanok; az új végső telemetriaág BE-re korlátozott. A jelöletlen lecke és a fogalomjavítás tárolt állapotot ellenőrző tesztjei átmentek. A KI `qualityNotes` byte-egyezését a javító diff ágai alapján ellenőriztem, nem külön DB-s összehasonlítással.
4. **Europe/Budapest, dátumhatár — nem alkalmazható.** A javítás darabszámmal, maggal és mentett logikai értékekkel dolgozik; nem ad dátumhatárt. A job meglévő `finishedAt` írása változatlan.
5. **Migráció, Drizzle, indítás/cron/leállítás, e2e-mód — nem alkalmazható a diffre.** A mezők a meglévő job-JSON-ban vannak. A Drizzle-adattár `saveStep` művelete a patch-et írja, változatlan sémával (`source/server/studio/pipeline-store.ts:197–205`); nincs új folyamat vagy ütemezés.
6. **Verseny, megszakítás, ismétlés — a vizsgált folytatási esetet nem sikerült megtörni.** A követett motorteszt a szerző előtt, egy másik a banknál szakítja meg a futást; az utóbbi ellenkező környezetben folytat. A mentési sorrend és a workflow-lízing nem változott (`source/server/studio/single-run/engine.ts:623–630`, `source/server/studio/pipeline-store.ts:197–205`). Párhuzamos HTTP-s folytatást nem mértem.
7. **Tesztminőség — talált hiba, L5.** Az L1 teszt tényleges kérést és mentést mér; az L3 teszt mindkét irányt ellenőrzi. A végső V18 csak szerkezeti őr. A korábbi mintateszt elvárásának módosítását indokolja a §13-ban dokumentált `try`-beszúrás; a szomszéd- és 40%-szabályra megmaradt az önálló ellenőrzés.
8. **V17–V20 és S6a-invariánsok — új viselkedési hibát nem találtam a javító commitban.** V17: a jelentett `any` → kötött párral és vegyes készletekkel zöld; a követett véglegessor-teszt a minimumot, a szomszédokat és a `ceil(0.4 × n)` korlátot is ellenőrzi. V18: nyers küszöb, kerekített telemetria, nem kapu; a végső bekötés teszthiánya L5. V19: az 50 magos sávteszt és a KI/BE promptpróba zöld. V20: a követett 400 leckés szimuláció a `<35%` és `<20%` ellenőrzésen átment. A különleges fejezet és a záró `recap` meglevő tesztje is passed. A Próba pontozója továbbra is csak `check` blokkokat számol (`source/server/rewards/grade.ts:71–75`); a pontozási és `try`-regiszter tesztek átmentek.
9. **Egyéb — próbáltam, nem sikerült megtörni.** Ellenőriztem, hogy a végső újramérés nem törli-e a szókeretjelzést, és nem vezet-e be új megállási feltételt: csak a `try_share_low` okra szűr (`source/shared/lesson-section-shapes.ts:151–155`), az új ág a meglévő publikálási hívás után fut, dobás vagy kimeneti kapu nélkül.

## Mit próbáltam megtörni, és nem sikerült

- Szerzői válasz nélkül mentett BE tervből folytatva elveszíteni a konkrét `tryKind`-ot; a próba a következő szerzői kérésben és a mentett tervben is megtalálta.
- Egyharmados határesetet a kerekítéssel tévesen hiányosnak jelöltetni, illetve 1/4-nél eltüntetni a jelzést; a darabszámpróbák egyik hibát sem mutatták.
- A korábban jelentett magon ismétlésre kényszeríteni az `any` fajtát a következő kötött fajta mellett; a célzott próba már nem talált egyezést.
- Ellenkező környezeti beállítással megfordítani a mentett futás állapotát, illetve jóváhagyott tervhez kiosztott blokksort hozzáadni; a követett tesztekben egyik sem történt meg.

## Mit NEM vizsgáltam

- **UNVERIFIED:** a végleges V18-jelzés lektori tanításcserét követő és régi checkpointból induló, viselkedési ellenpróbája, valamint a tényleges tesztmutáció. A saját futtatást a futtató a Node v24.22.3 hálózati izolációja miatt elutasította. A mentési láncot olvastam, a segédfüggvényeket a követett teszt futtatta.
- Nem futtattam eldobható DB-t vagy böngészős E2E-t/képernyőmérést. A javítás nem módosít megjelenítő komponenst vagy DB-sémát; a valódi DB-visszaolvasás, a párhuzamos HTTP-foglalás és a kész figyelmeztetés tényleges képernyője nem mért.
- Nem hívtam fizetős modellt. A szerzőnek küldött kérést és a determinisztikus kiosztást ellenőriztem, nem azt, hogy valódi modell milyen gyakran követi. A korábban nem kifogásolt, a javító commitban változatlan részeket nem auditáltam újra.

## Megcáfolt gyanúk

- A javított fajtaforgatásnak elfogyhat a jelöltkészlete: három megengedett fajta mellett legfeljebb két kizárás van.
- Mentett BE futásban csak az eredetjelző marad meg, a fajta nem: a mentést és a kiküldött kérést külön vizsgáló motorteszt ezt megcáfolta.
- A végső jelzés frissítése az egyéb minőségi jelzéseket is törli: a `length_over_budget` megőrzését a segédfüggvény tesztje igazolja.

## Mit futtattam (parancs + eredmény)

- `git diff --stat base...head`, célzott `git_diff`, `git_show head` és `git_show base:source/shared/lesson-section-shapes.ts`: a javító diff és a base viselkedésének elhatárolása.
- `npx tsx --test source/tests/lesson-try-voices.test.ts source/tests/lesson-section-shapes.test.ts source/tests/lesson-variety-paths.test.ts source/tests/source-visuals-flag.test.ts source/tests/single-run-engine.test.ts` — 112/112 passed.
- `npx tsx --test source/tests/lesson-variety-paths.test.ts` — 19/19 passed, megismételt célzott futás. A memóriás motorteszteknél a hiányzó `DATABASE_URL` miatt volt DB-figyelmeztetés; ezek nem DB-integrációs eredmények.
- `npx tsx --test source/tests/animate-try-kinds.test.ts source/tests/lesson-schema.test.ts source/tests/lesson-arc.test.ts source/tests/canonical-quiz-bank.test.ts` — 51/51 passed.
- `npx tsx --test source/tests/proba-server-grading.test.ts source/tests/lesson-opening-forms.test.ts` — 21/21 passed.
- `npx tsc --noEmit` és `npx tsc --noEmit -p tsconfig.test.json` — mindkettő 0.
- `node .blind-review-tmp/s6b-recheck.mjs` — az eszköz indítás előtt elutasította; saját ellenpróba nem futott.

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
| kicsi | 1 | 1 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
(nincs)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 17 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 1526
- tokenek: 1307223 bemeneti (ebből gyorsítótárból: 1191943, gyorsítótárba írva: 115229), 7645 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 92.6%; becsült megtakarítás: 4.4142 USD
- költség (a tényleges usage alapján): 0.4838 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
