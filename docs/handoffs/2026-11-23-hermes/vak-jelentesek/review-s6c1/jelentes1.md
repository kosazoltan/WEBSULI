# Független review — feat/tgm-s6c1-abrafajta-terv
Fej: 908502c9135d5cb1d561b219145e4b57d2d7830f
## Ítélet: NEM

A BE állapotban futó ábrakészítő négy katalógus-tantárgynál nem kap tantárgyi ajánlást. A KI állapotú kérésen és a 40%-os szerveroldali küszöbszámításon nem találtam regressziót.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

- **L1 — blokkoló — Négy katalógus-tantárgynál BE állapotban is elmarad az ajánlás.** `source/shared/visual-kind-plan.ts:43`. A Stúdió adminja bekapcsolt változatossággal jóváhagyott **Magyar nyelvtan** térképről gyárt leckét. A szűrés után a `venn` megmaradna, de az üres visszatérés miatt az ábrakészítő még ezt sem kapja meg. A fej követett tesztje szándékosan zöldre ellenőrzi, hogy e tárgy ábrakészítő promptja BE és KI állapotban **azonos** (`source/tests/visual-kind-plan.test.ts:59–60`). A valódi motor ugyanezt a promptot küldi, a tantárgyat a térképről veszi (`source/server/studio/single-run/engine.ts:620,876–880`); nincs második ajánló. A 19 katalógussor (`source/shared/catalog-taxonomy.ts:8–28`) és a szerződés (`source/shared/lesson-visual-params.ts:283–293`) metszetét soronként végignézve ugyanez az **angol, német és francia** esete is (egyedül a `timeline` marad). A `49397146` base-ben nem volt tantárgyi ajánló; a diff vezeti be a V23 szerinti BE funkciót és azt a feltételt, amely ezeknél a szabályos bemeneteknél elnémítja. A V23 promptkövetelménye így nem teljesül; ehhez nem kell hibás modellválasz. **Javítás:** a négy későbbi jelölt maradjon kiszűrve, de minden katalógustárgy kapjon már most is leírt, órához illő fajtákat. A teszt a tényleges BE promptot ellenőrizze minden hivatalos tantárgynévvel, ne csak a szűrés előtti táblát.
- **L2 — közepes — Az ajánló nem a modellnek elküldött teljes paraméterleírást vizsgálja.** `source/server/studio/step-io.ts:774`. Magyar irodalmi lecke gyártásakor a táblában szerepel a `decisionStory` (`source/shared/visual-kind-plan.ts:11`), és a modell ténylegesen megkapja a paramétereit (`step-io.ts:777`, `source/shared/decision-story.ts:31`), de az ajánlósorból kiesik: a szűrő csak a `VISUAL_PARAMS_CONTRACT`-ot és a `név — ` alakot nézi. Így a promptban ott a használható alak, de a tárgyi ajánlásban nincs ott. A használt negatív lookbehind nem szerkezeti ellenőrzés: egy leendő `előprocess — …` vagy `micro_map — …` szövegnél részszót is találna (`source/shared/visual-kind-plan.ts:32`). Ilyen téves ajánlást a jelenlegi szerződésben nem találtam. **Javítás:** az ajánló és az ábrakészítő ugyanabból a név szerint azonosított paraméterleírás-készletből dolgozzon, a külön `decisionStory`-leírást is beleértve; az eredeti promptdarabok és sorrendjük KI állapotban maradjanak érintetlenek.
- **L3 — közepes — A modell 40%-os utasítása nem egyezik a szerver mérési szabályával.** `source/shared/visual-kind-plan.ts:44`. A tanár BE állapotban egyfejezetes matematikaleckét indít. Az új prompt „egy fajta legfeljebb az ábrák 40%-a” szöveget ad, de az ötdarabos minimum és a forráshoz kötött ábrák kivétele nélkül. Ugyanez a kérés legalább egy ábrát kér a rajzolható fejezethez és legfeljebb kettőt enged fejezetenként (`step-io.ts:763,769,781`). Egy ábránál a leggyakoribb fajta aránya 1/1 = 100%, kettőnél is legalább 1/2 = 50%. A kérésben szereplő cél tehát nem teljesíthető, miközben a program helyesen nem jelez ilyen kis mintán. Tényleges modellreakció: **UNVERIFIED**. **Javítás:** a modellnek is a saját ábrákra és legalább öt darabra érvényes, nem kötelező célt mondja ki, vagy hagyja a számszerű értékelést a szerverre.
- **L4 — kicsi — A végrehajtási terv két jelzési időpontot ígér, a kód csak egyet használ.** `docs/specs/2026-11-20-tgm-valtozatossag-abrak-vegrehajtas.md:204`. Ha az admin a szerzői állomás után nézi a jobot, a mentésben már lehet szókeret- és try-jelzés, de ábrafajta-jelzés nincs (`engine.ts:859–871`); az csak sikeres publikálás után készül (`engine.ts:1146–1166`). A tulajdonosi véglegeslecke-invariáns alapján nem a korai jelzést kérem számon: a terv és az implementáció egyezzen meg abban, hogy kell-e egyáltalán előzetes mérés.
- **L5 — közepes — A végleges mentésre tett teszt nem méri a végleges mentést.** `source/tests/visual-kind-plan.test.ts:86`. Ha egy későbbi módosítás a végső `output.qualityNotes` értékadásnál kiszűri a `visual_kind_share` elemeket (`engine.ts:1162`), a Stúdióban a kész leckéhez nem jelenik meg a jelzés. Ez a mutáció nem változtatja meg sem a segédfüggvény-hívások eredményét a tesztben, sem a `:85–90` sorokon keresett részleteket vagy azok távolságát. Ez a forrásszöveg-őr logikájából ellenőrizhető; a mutált motor futtatása **UNVERIFIED**. **Javítás:** a `runSingleLesson` viselkedési tesztje vegyen át eltérő ábraeloszlású lektori cserét és folytatott checkpointot, majd ellenőrizze a `done` job mentett `qualityNotes`-át és `telemetry.gates.visualKinds`-át a ténylegesen publikált leckéhez képest, a többi jelzéssel együtt.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — talált hiba.** L1–L3. A jobkimenet oldalán az új számláló opcionális; a Drizzle `studioJobs.output` JSONB (`source/shared/schema.ts:804`), a GET a meglévő `produced.telemetry` és `produced.qualityNotes` mezőket használja (`lesson-pipeline-routes.ts:728–732`).
2. **Biztonság, adatvédelem — próbáltam, nem sikerült megtörni.** Az új promptdarabban a nyers tantárgyszöveg helyett kanonikus katalóguskulcs és konstans fajtalista szerepel; a jegyzet fajtaneve a végleges lecke enumjából származik. A változás nem ad titkot, személyes mezőt, URL-t vagy új naplózást. A job GET a meglévő adminrouter alatt marad (`lesson-pipeline-routes.ts:219,699–735`); a handler nem ír.
3. **Regresszió — próbáltam, nem sikerült megtörni.** A forrásos és térképes KI promptlenyomatok, a kéretlen mezős mentettlecke-lenyomatok és a jelöletlen leckék javítási tesztjei zöldek. A `git_diff` szerint a közös rendszerprompt, a bank előtagja, a kliens és az ábraparaméter-szerződés változatlan. Az ábrakészítő új feltétele KI-nál nulla tömbelemet szúr be; a jobkimenet új része csak a BE ágon fut.
4. **Europe/Budapest — nem alkalmazható.** Új naptár-, időzóna- vagy dátumhatár-logika nincs; a mérés blokkdarabszám.
5. **Migráció, indulás, cron, leállítás, e2e — próbáltam, nem sikerült megtörni.** Nincs migráció-, Drizzle-séma- vagy életciklus-változás. Az eldobható PostgreSQL-es E2E indult, a meglévő Studio-spec 5/5. Éles cron/leállítás nem része ennek a diffnek.
6. **Párhuzamosság, folytatás, időtúllépés — próbáltam, nem sikerült megtörni a vizsgált utakon.** A követett motorpróba átfordított környezetben mindkét irányú folytatást ellenőriz; a bank párhuzamos tesztje is zöld. Az ábrakészítő `AsyncLocalStorage`-ból olvas a `runSingleLesson` hatókörében (`engine.ts:571–573`, `lesson-variety-flag.ts:17–22,60–62`). A döntéshez nem kell új várakozás. A végső fajtaszámláló felülír, nem hozzáad, a jegyzetcsere csak a saját `reason` értékét törli. A konkrét S6c-1 lektori csere és mentés utáni visszaolvasás korlátait lásd lent.
7. **Tesztminőség, spec — talált hiba.** L1, L4, L5. A diff nem törölt vagy gyengített létező tesztet; a bontás dokumentált. A V23 táblateszt szerkezetet mér, de nem azt, hogy szűrés után mit kap meg a modell. A V24 segédfüggvény-teszt valódi viselkedést mér, a végleges job-ellenőrzés nem.
8. **S6c-1 — talált hiba az ajánlásban, nem találtam a szerver küszöbében.** L1–L3. Az aktuális szerződés közös sorában a `timeline` mellett álló `process`-t befogadja a teszt. Az öt alatti mintát, a pontos 2/5 = 40%-ot, a 3/5 = 60%-ot és a forrásábra kihagyását futtatott teszt ellenőrzi. A V24 4/10 és 5/10 esete ugyanebből a képletből számolva `0.4 > 0.4` → hamis, `0.5 > 0.4` → igaz. A végső mérés a már lecserélt, végkapuzott, szükség esetén forráspótolt `publishable`-t olvassa. V21–V22 és V23 négy új alakja a bontás szerint nem alkalmazható az S6c-1-re.
9. **Egyéb — talált hiba.** Az arányszabály ütközését rövid leckén is ellenőriztem (L3). A meglévő JobMonitorban mockolt kész jobbal a vizuális és try-jelzés együtt látható 360×640 és 844×390 nézetben. Megnéztem a két képernyőképet; a mérésben egyik nézetben sincs oldalszintű vízszintes túlcsordulás.

## Mit próbáltam megtörni, és nem sikerült

- A KI kérést BE környezettel, a BE kérést KI környezettel, valamint a megszakadt futás folytatását megfordított kapcsolóval. Az új ajánlóág nem kapcsol át menet közben.
- A pontos 40%-ot, a kis mintát és a forrásábrát; a futtatott V24 teszteken nem találtam számláló- vagy nevezőhibát. A segédfüggvény eltávolította a már elavult jelzést, a terjedelmi jelzést meghagyta.
- A meglévő Studio-kliens megjegyzéslistáját egyszerre két jelzéssel. Álló és fekvő képernyőn egyaránt kiírta mindkettőt; ez klienspróba, nem motor- vagy DB-próba.

## Mit NEM vizsgáltam

- Nem hívtam fizetős modellt, nem mértem szolgáltatói cache-találatot vagy azt, hogyan reagál a modell az ellentmondó kvótára. A cache-ről csak a bemeneti kérések azonosságára és a jelölők változatlanságára van bizonyíték.
- A saját Node-próbát a futtató hálózati sandbox-korlát miatt nem engedte elindítani. Az S6c-1 számlálóját a lektori tanításcserét és a folytatást kombináló saját végigfutással, mutált motorral, illetve a valós job JSONB visszaolvasásával nem mértem: **UNVERIFIED**. A futtatott e2e Studio-spec API-mockolt; a saját böngészős próba mockolt jobot kapott, mellékes nem mockolt kéréseknél 401 is látszott.
- Nem vizsgáltam S6c-2 ábrarajzolókat, éles adatokat, cronokat és éles leállítást. Nem tekintettem klienselfogadásnak, hogy a meglévő JobMonitor meg tudja jeleníteni a jelzést.

## Megcáfolt gyanúk

- **A sor közepén álló `process` kiesik:** nem, a valódi szerződés `timeline … process —` sora szerepel a zöld felismerési tesztben.
- **A fajtaarány miatt nem publikál, vagy elvész a try-/terjedelemjelzés:** a változás a meglévő publikálás után, a job végső mentése előtt írja a mérőszámot. A már meglévő `withTryShareNote` eredményéből csak a `visual_kind_share` bejegyzéseket szűri ki. A futtatott helperpróba szerint a terjedelmi jelzés megmarad; a teljes végső mentésre ez nem helyettesít integrációs tesztet.

## Mit futtattam (parancs + eredmény)

- `npx tsx --test source/tests/visual-kind-plan.test.ts source/tests/source-visuals-flag.test.ts source/tests/single-run-engine.test.ts source/tests/lesson-try-voices.test.ts` — 82/82.
- `npx tsx --test source/tests/lesson-variety-paths.test.ts source/tests/lesson-variety-flag.test.ts source/tests/studio-quality-notes-ui.test.ts source/tests/lesson-visual-params.test.ts` — 32/32. E két futásban az adatbázist el nem érő háttér-inicializálás naplózott, a tesztek zöldek.
- `npx tsx --test source/tests/visual-kind-plan.test.ts source/tests/studio-author-catalog.test.ts` — 9/9; a magyar nyelvtan hiányát maga a teszt rögzíti elvárásként.
- `npx tsc --noEmit` és `npx tsc --noEmit -p tsconfig.test.json` — mindkettő 0.
- `run_e2e source/tests/studio-ui.spec.ts` — 5/5; eldobható PostgreSQL 17.
- `run_browser_scenario .blind-review-tmp/studio-note.json` — két nézet és két képernyőkép, mindkét minőségi jelzés olvasható.
- `node .blind-review-tmp/ajanlas.mjs` — a futtató elutasította indítás előtt (Node v24 alatt nem zárható ki a hálózat).

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 1 | 1 | 0 | 1 | 0 |
| közepes | 3 | 3 | 0 | 0 | 0 |
| kicsi | 1 | 1 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) Négy katalógus-tantárgynál BE állapotban is elmarad az ajánlás — `source/shared/visual-kind-plan.ts:43` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: unit)
- **L2** (közepes) Az ajánló nem a modellnek elküldött teljes paraméterleírást vizsgálja — `source/server/studio/step-io.ts:774` — hivatkozás igazolt
- **L3** (közepes) A modell 40%-os utasítása nem egyezik a szerver mérési szabályával — `source/shared/visual-kind-plan.ts:44` — hivatkozás igazolt
- **L5** (közepes) A végleges mentésre tett teszt nem méri a végleges mentést — `source/tests/visual-kind-plan.test.ts:86` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 25 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 4395
- tokenek: 3105214 bemeneti (ebből gyorsítótárból: 2912805, gyorsítótárba írva: 192334), 13656 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 94.4%; becsült megtakarítás: 10.8763 USD
- költség (a tényleges usage alapján): 0.9088 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
