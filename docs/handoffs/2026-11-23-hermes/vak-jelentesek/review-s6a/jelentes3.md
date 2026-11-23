# Független review — TGM S6a, 3. vak kör
Fej: 3996d16c95e444d35fdeec0a6383ca2ea6bc3e90
## Ítélet: NEM
A jóváhagyott tervvel, BE állapotban indított futás folytatásakor megváltozik a szerzői kérés. A terv maga nem íródik át, de a kérés olyan programkiosztásként hivatkozik rá, amely nem történt meg. Ez megsérti a 12. szakasz 7. pontjának kifejezett kivételét.

## Az előző kör leleteinek sorsa
- Az átadott előző jelentésben nem volt blokkoló.
- **L4 (közepes) — továbbra is részben javítva.** A `step-io.ts:372` a fordulóban kifejezetten felülírja a régi alakot, de a `3996d16c` nem módosította a pedagógus rendszerutasítását. A `lesson-section-shapes.test.ts:98–118` zöld, de csak a forduló szövegét ellenőrzi. A rendszerutasításban a régi alak továbbra is jelen van. Nem emeltem a súlyosságot.
- **L6 (kicsi) — nem változott.** A `docs/agent-csapdak.md:1207–1208` szövege megmaradt. Repo-adatként kezeltem, nem követtem.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

- **L7 — blokkoló — A folytatás elfelejti, hogy a vázlatot a tanár hagyta jóvá.** `source/server/studio/single-run/engine.ts:735`. Egy Stúdió-admin mobilböngészőben jóváhagy egy vázlatot. A változatosság BE állapotában a gyártás a terv mentése után, még a szerző válasza előtt például hálózati időtúllépéssel megáll. Az admin az **Újra** gombbal folytatja. A tervezett sorok a mentésben helyesek, de a szerző most megkapja az **A FEJEZETEK VÉGLEGES BLOKKSORA** betoldást, amely azt állítja, hogy a program osztotta ki a sorokat, és azok felülírják a 2. állomás eredményét. Ennél a futásnál nem volt 2. állomás. A 12. szakasz 7. pontja a jóváhagyott tervnél bájtra változatlan szerzői kérést ír elő (`docs/specs/2026-11-20-tgm-valtozatossag-abrak.md:264–266`). **Evidencia:** a böngészős próbában a jóváhagyó POST elküldte a vázlatot, az Újra gomb POST-ja álló és fekvő nézetben is test nélküli volt (mockolt API-válaszok). A szerver frissen továbbadja az `approvedOutline`-t (`source/server/studio/single-run/live.ts:139–143`), folytatáskor viszont csak a mentett `output`-ot adja át (`:150–159`). A motor a szerző hívása előtt menti az elfogadott tervet (`engine.ts:731`, `:782`), hibánál megőrzi (`:708–712`); ugyanaz az `output.approvedOutline` a modell tervénél is létrejön, így nem bizonyítja az eredetet. Az érvényes mentett terv tanítás nélkül a szerzőtől folytatható (`:493–513`); a folytatás BE állapotát a mentett `lessonVariety` adja. Így az új feltétel frissen hamis, folytatáskor igaz, és a `:789` hozzáfűzi a nem üres szöveget. **Base:** a `git_diff` és a base motorja szerint ilyen betoldás korábban nem volt; a hibát a `3996d16c` új elágazása okozza. Nem kell hozzá hibás modellválasz vagy sérült tároló. A teljes szerver–modell kombinációt nem futtattam; a böngészős mérés a kliens kérését, a szerverkód a betoldás determinisztikus ágát igazolja. **Javítás:** a terv eredetét (vagy azt, hogy az S6a valóban kiosztott blokksorokat) mentsétek explicit módon a tervvel együtt; a betoldást frissen és folytatáskor is ez vezérelje. Régi, mező nélküli checkpointnál ne feltételezzetek S6a-kiosztást. Regressziós teszt: jóváhagyott BE futás megáll a szerző előtt, majd a mentésből folytatva a szerzői kérésben sincs betoldás; a modell tervével ugyanezen az úton legyen benne a mentett sor.
- **L8 — közepes — A szerzői kérés nem mondja meg, hogy a kiosztott sor a két kötelező nyitóblokk után következik.** `source/server/studio/single-run/engine.ts:736`. Ha az admin a változatosságot a nyitókapcsoló mellett kapcsolja be, egy új, modellterves lecke első fejezetében a nyitószerződés a második blokkra `explain`-t ír elő, és a tanítást a harmadik blokktól kéri (`source/shared/lesson-opener.ts:169–175`; a szerzői promptba illesztés: `source/server/studio/step-io.ts:571`). Az új betoldás viszont minden fejezetre „pontosan” a felsorolt blokksort mondja; a hat sor második eleme `example` vagy `animate` (`source/shared/lesson-section-shapes.ts:15–21`). Maga a V13 teszt a két nyitó `explain` blokk **után** teszi a teljes mintát (`source/tests/lesson-section-shapes.test.ts:17–19`), amit a betoldás nem közöl. A base-ben nem volt ez a kategorikus lista. A szerző értelmezheti a listát csak a tanítás törzsére, ezért a modell reakciója és a kész lecke eltérése **UNVERIFIED**. **Javítás:** a kérés nevezze a listát a tanítás törzsének, és nyitókapcsoló mellett mondja ki az első fejezet kétblokkos előtagját. Tesztelje a modellkérésben együtt a két előírást.
- **L4 — közepes, korábbi — A pedagógusi forduló felülírása mellett a régi tervezői szerződés megmaradt a rendszerutasításban.** `source/server/studio/step-io.ts:372`. A BE Stúdió-futás 2. állomása `sectionKind`-ot kér, miközben a rendszerutasításba beemelt pedagógusskill kimeneti alakjában nincs ilyen mező, és a régi tanítási sort adja (`source/server/studio/role-skills.ts:92–96`, `source/server/studio/single-run/engine.ts:182–194`, `source/server/studio/single-run/live.ts:104–109`). A forduló egyértelmű felülírása és a rendszerprompt bevezetője enyhíti az ellentmondást. Ha a modell mégis elhagyja a mezőt, a kiosztás `any`-ra esik vissza (`source/shared/lesson-section-shapes.ts:98`); a modell reakciója **UNVERIFIED**. **Javítás:** a BE rendszerutasítás és a forduló a futás rögzített állapotából ugyanazt az alakot kérje, KI-ben maradjanak a régi bájtok.
- **L6 — kicsi, korábbi — A repóútmutató külső előfeltételt szab a vak kör indítására.** `docs/agent-csapdak.md:1207–1208`. A már megbízott, konkrét fej-hashre dolgozó ellenőr a „Szabály 3”-at magára vonatkoztatva külső botokra várhat, és késhet az ellenőrzés. A sor a base óta került be; nem követtem, nincs alkalmazásoldali hatása. **Javítás:** szervezési ajánlásként a megrendelőnek címezni, nem a megbízott ellenőr előfeltételeként.

## A hibakereső pontok (ítélet + bizonyíték)
1. **Adatszerződés — talált hiba.** L7: a mentett tervből nem derül ki, ki hagyta jóvá. L4/L8: a tényleges modellkérés eltérő előírásait összevetettem.
2. **Biztonság és adatvédelem — a változott úton nem találtam új hibát.** A betoldás a már használt terv fejezetcímeit és blokktípusait adja ugyanannak a szerzői beszélgetésnek; nincs új URL, naplózási ág vagy GET-mellékhatás. A jóváhagyás és a folytatás mért klienskérése POST; az adminvédelmet és a folytatás meglévő jogosultság-ellenőrzését a diff nem módosítja (`lesson-pipeline-routes.ts:219`, `:795–801`). Nem végeztem teljes CSRF-/jogosultsági auditot.
3. **Regresszió — talált hiba.** A Stúdióban a jóváhagyott tervből indult futás folytatásakor L7. A KI kérések lenyomatai és a jóváhagyott tervet használó friss motorpróba zöldek. Az évfolyam szerinti mentett nyitásforma-visszaolvasás és a tárolt lecke javítási hatókörbe emelése is zöld (`lesson-opening-forms.test.ts:164–179`). Új névtelen lejátszói vagy régi anyagot kiszolgáló út nincs a kör változásában.
4. **Europe/Budapest — nem alkalmazható.** Az új kéréság és a magos minta nem dátumból dönt; dátumhatárhoz kapcsolódó változás nincs.
5. **Migráció, indítás, cron, leállítás, e2e — indítást próbáltam, nem sikerült megtörni.** A változás nem módosít SQL-migrációt, Drizzle-sémát vagy háttérjobot. A Playwright eldobható PostgreSQL-en alkalmazta a migrációkat és elindította az e2e szervert; a futtató eltávolította a DB-t. Éles cront nem futtattam.
6. **Megszakítás, újraindítás, párhuzamosság — talált hiba.** L7 egyetlen időtúllépés és Újra után előáll, nem versenyhelyzet. Az érintett mentés a szerző hívása előtt van. A kör nem változtatott a job atomikus foglalásán vagy a mentési soron; dupla folytatásra nem futtattam új terheléses próbát.
7. **Tesztminőség — a közvetlen bekötést méri, a hibás kombinációt nem.** A `lesson-variety-paths.test.ts:339–349` a valóban elküldött szerzői szöveget is figyeli. A `:359–364` friss jóváhagyást mér; a `:366–373` folytatása bankhibából indul, amikor már van mentett tanítás, és csak a mentett tömböt állítja. A betoldás kivétele a friss BE szövegassertet érintené; a folytatási őr hibáját a két külön eset nem látja. Futó mutációt a saját Node-próba elutasítása miatt nem igazoltam. A spec-változás dokumentált a 12. szakasz 7. pontjában.
8. **S6a-specifikus — V13/V14/V16 ellenpróbái zöldek; V15 és a 7. pont integrációjában L7/L8.** V13: mind a hat mintát több fejezetpozícióban, nyitóblokkokkal és `recap`-os zárással próbálja a teszt. V14: a követett teszt 200 magon, 3–12 fejezetig, hat típuseloszlással és mindkét zárási móddal méri a végleges blokksorokat. V15: a különleges fejezet és a záró `recap`, a friss jóváhagyott és a KI út tesztje zöld; a folytatott jóváhagyás szerzői kérése eltér. V16: a 400 szimulált leckés követett teszt mindkét küszöbe zöld. Új futás közbeni változatossági környezetolvasást nem találtam: a tervező a futáshatókört használja, a betoldás a már rögzített `varietyOn`-t (`lesson-variety-flag.ts:19–22,60–62`, `engine.ts:570–572,735`).
9. **Egyéb — L6.** A vak ellenőrzésre vonatkozó repo-szöveget nem alkalmaztam futtatási utasításként.

## Mit próbáltam megtörni, és nem sikerült
- Megpróbáltam KI módban előidézni a pedagógus- vagy szerzői kérés eltérését. A friss és a térképről indított futás kéréslenyomatai, valamint a KI promptpróbák zöldek. A folytatás mentett BE/KI állapota ellentétes környezetben is átment a követett motorpróbán.
- Próbáltam a záró `recap` miatt összecsúszó szomszédokat, a gyakorisági plafont és a különleges záró fejezetet a követett tesztekkel. A tesztelt magkészleten nem találtam új hibát; ez nem bizonyítás minden magra.
- Az admin jóváhagyó és folytató gombot végigkattintottam a tényleges kliensben, szimulált Stúdió-válaszokkal. A két képet megnéztem: az álló a jóváhagyási kártyát, a fekvő a készítési nézetet mutatja. A folytatás POST-ját a hálózati mérés igazolja, nem a képkivágás.

## Mit NEM vizsgáltam
- Nem hívtam fizetős modellt. L4/L8 modellreakciója és hatása a kész leckére nem mért.
- A saját teljes motor-ellenpróbát a futtató elutasította: Node v24.22.3 alatt a homokozó nem tudja kizárni a hálózatot. Így a jóváhagyás → szerzői időtúllépés → folytatás összefűzött szervermodell-próbáját és a futó mutációt nem futtattam. Az L7-beli böngészős próba API-válaszai mockoltak; a szerverállapot-átmenet a hívási láncból igazolt.
- Nem futtattam teljes DB-integrációs csomagot vagy éles cron-/leállításpróbát. Nem volt lejátszói változás ebben a körben, ezért nem készítettem külön régi lecke- vagy névtelen lejátszóvizuális regressziót. A változatlan, korábbi körben nem kifogásolt részeket nem auditáltam újra.

## Megcáfolt gyanúk
- A folytatás újra kiosztja vagy felülírja a már mentett blokksort: az `engine.ts:719–731` mentett terv esetén nem ad magot, és a követett folytatási tesztben a sor egyezik. Az L7 a kérés szövegéről, nem a tárolt terv átírásáról szól.
- Az új szerzői betoldás KI állapotban is bekerül, vagy újraolvassa a kapcsolót: a feltétel az előre rögzített `varietyOn`; a KI szerzői eset és a meglévő lenyomatok zöldek.

## Mit futtattam (parancs + eredmény)
- `npx tsx --test source/tests/lesson-variety-paths.test.ts source/tests/lesson-section-shapes.test.ts source/tests/source-visuals-flag.test.ts source/tests/lesson-opening-forms.test.ts` — 58/58 zöld; a DB nélküli importok csatlakozási figyelmeztetése nem teszthiba.
- `npx tsx --test source/tests/single-run-engine.test.ts source/tests/lesson-opener.test.ts` — 67/67 zöld.
- `npx tsc --noEmit -p tsconfig.test.json` — kilépési kód 0.
- `run_e2e source/tests/single-run-follow.spec.ts` — 4/4 zöld, eldobható DB eltávolítva, a Stúdió API-válaszait a spec mockolja.
- `run_browser_scenario .blind-review-tmp/s6a-approve-resume.json` — két nézet; állóban `approve-outline` POST vázlattal és `resume` POST test nélkül; fekvőben `resume` POST test nélkül. Egyéb, nem mockolt admin-lekérések 401-et adtak.
- `node .blind-review-tmp/s6a-round3.mjs` — a futtató elutasította; nincs futási eredmény.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 1 | 1 | 0 | 1 | 0 |
| közepes | 2 | 2 | 0 | 0 | 0 |
| kicsi | 1 | 1 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L7** (blokkoló) A folytatás elfelejti, hogy a vázlatot a tanár hagyta jóvá — `source/server/studio/single-run/engine.ts:735` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: scenario)
- **L8** (közepes) A kiosztott szerzői sor és a kötelező két nyitóblokk határa nincs kimondva — `source/server/studio/single-run/engine.ts:736` — hivatkozás igazolt
- **L4** (közepes) A pedagógusi forduló új alakot kér, de a rendszerutasítás megtartotta a régi alakot — `source/server/studio/step-io.ts:372` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 19 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 2450
- tokenek: 1581250 bemeneti (ebből gyorsítótárból: 1446946, gyorsítótárba írva: 134247), 16780 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 92.4%; becsült megtakarítás: 5.3641 USD
- költség (a tényleges usage alapján): 0.6482 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
