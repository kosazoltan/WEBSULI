# Független review — feat/tgm-s6a-v2 (4. vak kör)
Fej: cdc0cfbe3f9596e0cd92cf4f39779f5c66fc92d0
## Ítélet: IGEN, FELTÉTELLEL
A korábbi L7 blokkoló megszűnt, új blokkolót nem találtam. Egy új tesztlefedettségi rés (L9) és a korábbi prompt-ellentmondás (L4) külön jegyre megy.

## Az előző kör leleteinek sorsa
- **L7 — megszűnt.** A `source/server/studio/single-run/engine.ts:719–742` szerint a jóváhagyott tervet a motor átveszi, nem osztja újra, így frissen nem kap `sectionShapes: true` jelzőt. Folytatáskor az érvényes mentett terv **és** a mentett `sectionShapes === true` kell ahhoz, hogy a kérés megkapja a betoldást. A jelző nélküli, tanár által jóváhagyott vagy régi tervbe nem következtet bele kiosztást. A jelző a modellhívás előtt kerül a jobra (`engine.ts:787–794`); a tároló a teljes `output`-ot menti (`source/server/studio/pipeline-store.ts:197–205`), a folytató onnan olvas (`source/server/studio/single-run/live.ts:150–159`). A base-ben nem volt szerzői betoldás; a `3996d16c` csak a friss `input.approvedOutline`-t vizsgálta, a fej már az eredetet is megőrzi. A célzott motorpróba zöld: a jóváhagyott mentett tervből jelző nélkül elindul a szerző, a vázlat nem változik, nincs betoldás (`source/tests/lesson-variety-paths.test.ts:363–374`). Ez memóriatárolós próba, nem élő adatbázisos megszakítás.
- **L8 — a kérés szövegében megszűnt.** `engine.ts:741` a sort a tanítás törzseként nevezi meg, és bekapcsolt nyitószerződés esetén elé rendeli a nyitóblokkokat. A szerző fő promptja a két nyitóblokkot és a harmadik blokktól induló tanítást mondja ki (`source/server/studio/step-io.ts:571`, `source/shared/lesson-opener.ts:169–175`). A motorpróba a betoldás új szövegét ellenőrzi (`lesson-variety-paths.test.ts:349`); a modell tényleges követése UNVERIFIED.
- **L4 — változatlan, közepes jegy.** A régi rendszerutasítás és a forduló explicit felülírása megmaradt; nincs új üzemi evidencia.
- **L6 — megszűnt.** `docs/agent-csapdak.md:1207–1208` már kifejezetten a kör megrendelőjének címzett szervezési ajánlás, nem az ellenőr előfeltétele. Nem követtem repóbeli utasításként.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)
- **L9 — közepes — A teszt nem védi a modellterves gyártás szerző előtti folytatását.** `source/tests/lesson-variety-paths.test.ts:379`. Ha egy Stúdió-admin BE futása a modellterv mentése után, az első szerzői válasz előtt időtúllépéssel megáll, az **Újra** műveletnél a szerzőnek a már kiosztott sorrendet ugyanazzal az explicit felülírással kell megkapnia. A teszt modellterves ágában a hiba csak a banknál történik; ekkor már van mentett `lesson` (`engine.ts:861–862`). A motor átveszi ezt és kihagyja a szerzőt (`engine.ts:843–846`), a teszt pedig folytatás után csak a mentett sorokat nézi (`lesson-variety-paths.test.ts:381–384`). Az `engine.ts:735` mentett jelzőt visszaolvasó feltételének elhagyását egyik itteni ág sem ellenőrzi: a friss modellterv `shapedNow` ága megmarad, a jóváhagyott folytatás éppen a betoldás hiányát várja, a banki folytatás pedig nem hív szerzőt. A teszt zöld; a mutáns tényleges futása UNVERIFIED. A jóváhagyott teszt egy befejezett outputból töröl mezőket, nem a megálláskor mentett párbeszédet használja; a friss jóváhagyott kérésre szánt assert a folytatás utáni kérést ellenőrzi másodszor (`:369–375`). **Javítás:** mindkét eredetnél a szerző modellhívásánál dobjon időtúllépést a tesztkliens, folytasson a ténylegesen mentett kimenetből és párbeszédből, és hasonlítsa össze az első és a megismételt kérést. Modelltervnél a betoldás mindkettőben jelenjen meg, jóváhagyott tervnél egyikben sem. Ez lefedettségi, nem működési lelet.
- **L4 — közepes, korábbi — A BE tervezői forduló és a rendszerutasítás eltérő tervszerződést mutat.** `source/server/studio/step-io.ts:372`. Egy BE módú Stúdió-futásban a 2. állomás `sectionKind`-ot kér, de a rendszerutasításba emelt pedagógusskill a régi JSON-alakot és a régi ívet tartalmazza (`source/server/studio/role-skills.ts:92–96`). A forduló explicit felülírása és a rendszerutasítás fordulónkénti formátumot elsőbbségben részesítő mondata (`engine.ts:185`) enyhíti ezt. Ha a modell mégis elhagyja a típust, a program `any`-ra esik vissza (`source/shared/lesson-section-shapes.ts:98`). A modell reakciója UNVERIFIED. **Javítás:** BE állapotban mindkét helyen ugyanazt a szerződést adni a futás rögzített állapotából; KI állapotban maradjon a régi szöveg.

## A hibakereső pontok (ítélet + bizonyíték)
1. **Adatszerződés — próbáltam, nem sikerült megtörni.** A `sectionShapes` opcionális belső boolean a mentett vázlat mellett; csak a szó szerinti `true` számít, és csak érvényes mentett tervnél. A `resumePointOf` validálja a vázlatot (`engine.ts:493–505`), a mentő és visszaolvasó a teljes job-outputot használja.
2. **Biztonság és adatvédelem — próbáltam, nem sikerült új rést találni.** Az új jelző nem kerül URL-be, logüzenetbe vagy a job-poll válaszába (`source/server/studio/lesson-pipeline-routes.ts:699–734`); a router adminvédett (`:219`), a folytatás POST és a meglévő foglaláson megy át (`:778–801`). Nem változott a router, a CSRF/origin kezelés vagy a GET művelet.
3. **Regresszió — próbáltam, nem sikerült megtörni.** A base szerzői kéréséhez képest KI-ben az új betoldás üres; friss jóváhagyott tervnél is üres, a folytatott jóváhagyott tervet a motorpróba is ellenőrzi. A forrásvizuál-kéréslenyomatok, a régi lecke/fogalomjavítás, valamint az évfolyamonként eltérő nyitóforma-leírás visszaolvasási tesztje zöld (`source/tests/lesson-opening-forms.test.ts:164–180`). A merge S2b-2 kliensfájljai a megadott base-ben is ott vannak.
4. **Europe/Budapest, dátumhatár — nem alkalmazható.** Az új döntéshez csak a terv eredete, a mentett állapot és a térkép magja kell; nincs idő- vagy naptárfüggő elágazás.
5. **Migráció, indítás, cron, leállítás, e2e — az új migráció/cron nem alkalmazható; az e2e-indítást próbáltam, sikerült.** A meglévő `studio_jobs.output` JSONB oszlopba kerül a mező (`source/shared/schema.ts:804`). A Playwright eldobható PostgreSQL 17-tel indult, a négy teszt átment, a konténer eltávolítását a futtató jelezte. A Studio API a böngészőtesztben mockolt.
6. **Versenyhelyzet, ismétlés — próbáltam, nem sikerült új hibát találni a mért ágakon.** A jelző és a terv egy mentésben, a szerző előtt íródik; a mentések sorrendezettek és lízinggel védettek (`engine.ts:623–631,787–794`, `pipeline-store.ts:197–205`). Banki hiba után a motorpróba szerint a kiosztott terv nem változik, és ellentétes környezeti kapcsoló sem írja felül a mentett döntést. A szerző előtti modellterves út mérési rése: L9.
7. **Tesztminőség — találtam hibát: L9.** A `d97055e9` szöveges őre a nevesített `shapedNow` alakot követi, nem a folytatási feltétel viselkedését. A mentett eredet és a nyitási előtag szerződését dokumentálták (`docs/specs/2026-11-20-tgm-valtozatossag-abrak.md:264–267`). A mentett feltétel eltávolításának hatását végigkövettem a tesztágakon, de a saját mutáns futtatását a homokozó elutasította.
8. **S6a elfogadás — a változott bekötésben L9 lefedettségi rés, új működési hiba nem igazolódott.** V13: zöld az ívkapu-próba mind a hat mintára, nyitóblokkal és záró recappel. V14: zöld a 3–12 fejezetes, 200 magos vizsgálat a mintaazonosítókra és a végleges sorokra. V15: zöld a KI/BE motor- és tervpróba; a különleges fejezetet a kiosztó kihagyja a dokumentált záró recap kivételével, a mentett tervet a fej nem osztja újra. V16: a követett szimulációs teszt mindkét küszöb (35%, 20%) alatt maradt és az ismétlés azonos eredményt adott; a kiosztó kód nem változott az előző kör óta. A pedagógus a futás `AsyncLocalStorage` értékét olvassa; a folytatási döntés nem olvas `STUDIO_LESSON_VARIETY`-t a környezetből (`source/server/studio/lesson-variety-flag.ts:19–22,60–63`).
9. **Egyéb — próbáltam, nem sikerült új hibát találni.** A merge feloldásában a base S2b-2 elfogadási pontjai megmaradtak. A korábban kifogásolt repós szervezési ajánlás címzettjét javították; az aktuális diffben nem találtam új, a megbízott ellenőrt eltérítő utasítást.

## Mit próbáltam megtörni, és nem sikerült
- Jóváhagyott terv elvesztett eredete újrapróbáláskor: a teszt a mentett outputot adja az új motorhívásnak, `input.approvedOutline` nélkül; a szerzői kérés nem állít kiosztást.
- Újrakiosztás banki hiba után és kapcsolóátfordulás folytatáskor: a célzott motorpróbákban a mentett terv és a változatossági állapot megmaradt.
- Kliensoldali jóváhagyás/újrapróbálás és megszakadt követés: a böngészőtesztben a jóváhagyás, a monitor váltása és az újratöltés utáni követés átment, mockolt API-val.

## Mit NEM vizsgáltam
- Nem indítottam fizetős gyártást: a valós modell két promptutasítás közötti választása és a kész tananyag blokksora UNVERIFIED.
- Nem idéztem elő valódi szolgáltatói időtúllépést, folyamatleállást vagy két párhuzamos folytatást élő Studio-végponton. A motorpróba memóriatárolós, a böngészőpróba mockolt API-s; az új jelző útját a valódi tárolóban kódból követtem. Hibás valós visszaállítás vagy lízingütközés nem zárható ki ezekkel a futásokkal.
- A saját mutációt nem futtattam: a futtató a Node v24.22.3 alatt nem tudta garantálni a hálózati izolációt. Az L9 következtetése ezért kód- és tesztág-elemzés.
- Nem auditáltam újra a változatlan kiosztót, a névtelen lejátszót, a teljes CSRF/origin útvonalat vagy az S2b-2 megjelenítőket. A vizsgált diffben nincs kliensoldali változás; az e2e képernyőképeit nem ellenőriztem vizuálisan, álló/fekvő elrendezésről nem állítok új eredményt.

## Megcáfolt gyanúk
- A `sectionShapes` nem az API `approvedOutline` értékéből készül, és az `output.approvedOutline` puszta jelenlétéből sem következtet eredetre. A jóváhagyott folytatáshoz ezért nem kell új kliensmező.
- Nem kell új DB-oszlop: a jelző a meglévő JSONB-n megy át, a tároló nem szűri ki külön kulcsként.
- A nyitóblokkok és az új lista már nem két egymást kizáró elsőblokksorrendet írnak elő: a kérés külön nevezi a két nyitóblokk helyét és a tanítás törzsét.

## Mit futtattam (parancs + eredmény)
- `npx tsx --test source/tests/lesson-section-shapes.test.ts source/tests/lesson-arc.test.ts source/tests/source-visuals-flag.test.ts source/tests/single-run-engine.test.ts source/tests/studio-role-skills.test.ts source/tests/lesson-variety-paths.test.ts source/tests/lesson-opening-forms.test.ts` — 146 átment, 0 bukott. A memóriatesztek mellett az importált DB-modul hiányzó `DATABASE_URL` miatt figyelmeztetett; ez nem élő DB-futtatás.
- `npx tsx --test source/tests/lesson-variety-paths.test.ts` — 17 átment, köztük a V15 motorpróba.
- `npx tsc --noEmit` és `npx tsc --noEmit -p tsconfig.test.json` — mindkettő 0.
- `run_e2e source/tests/single-run-follow.spec.ts` — 4 átment; eldobható DB indult és leállt.
- `node .blind-review-tmp/s6-check-loader.mjs` — a futtató elutasította a saját próba indítását a Node-verzió hálózati izolációs korlátja miatt; nem mutációs eredmény.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 0 | 0 | 0 | 0 | 0 |
| közepes | 2 | 2 | 0 | 0 | 0 |
| kicsi | 0 | 0 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L9** (közepes) A teszt nem védi a modellterves gyártás szerző előtti folytatását — `source/tests/lesson-variety-paths.test.ts:379` — hivatkozás igazolt
- **L4** (közepes) A BE tervezői forduló és a rendszerutasítás eltérő tervszerződést mutat — `source/server/studio/step-io.ts:372` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 19 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 1484
- tokenek: 1537104 bemeneti (ebből gyorsítótárból: 1417405, gyorsítótárba írva: 119642), 11578 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 93.3%; becsült megtakarítás: 5.2665 USD
- költség (a tényleges usage alapján): 0.5567 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
