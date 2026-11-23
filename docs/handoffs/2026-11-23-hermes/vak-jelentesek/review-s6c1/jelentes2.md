# Független review — TGM S6c-1, 2. vak kör
Fej: ec757d9d6f6bcbdf6e610ce85bbb28c3c98c8f54
## Ítélet: IGEN, FELTÉTELLEL

Az előző blokkoló megszűnt. A `908502c9` óta változott részekben nem igazoltam új blokkolót. Két nem blokkoló tétel maradt: az ajánlás megfogalmazása és a pozitív véglegesmentési próba hiánya.

## Az előző kör leleteinek sorsa

| Lelet | Sors | Bizonyíték |
|---|---|---|
| L1 — négy tantárgynál nincs ajánlás | **Megszűnt.** | `visual-kind-plan.ts:43–48` már egy leírt fajtát is továbbad. A V23 egységteszt végigmegy a katalóguskulcsokon, és külön ellenőrzi a nyelvtan `venn`, illetve a három idegen nyelv `timeline` ajánlását (`source/tests/visual-kind-plan.test.ts:34–38`). A teljes promptépítő nyelvtanos ága is zöld (`:69–71`); az idegen nyelvek ugyanazt a segédet hívják (`source/server/studio/step-io.ts:777`). A `49397146` base-ben nincs új tantárgyi sor; BE-ben már nem marad el a korábban jelzett négy szabályos katalógusbemenetnél. A szerződés szűrése utáni **egy** fajta nem sérti a nyers ajánlótábla legalább két elemére vonatkozó V23-pontot. |
| L2 — a külön `decisionStory`-leírás kiesik | **A konkrét eset megszűnt.** | `step-io.ts:740–741,777–780` a döntéstörténet leírását is használja, és az irodalom teljes promptjában az ajánlott lista `timeline, decisionStory, illustration` (`visual-kind-plan.test.ts:71`, zöld). A Unicode-os és aláhúzásos részszóteszt zöld; a `process` meglévő, sor közepi leírását is felismeri (`lesson-visual-params.ts:292`, `visual-kind-plan.test.ts:25`). A `Geometry` és `triangleArea` külön szövege nincs az ajánló bemenetében, de egyik fajta sem kerül az aktuális ajánlótáblába, ezért ez itt nem okoz kiesést. |
| L3 — kis leckére is teljesíthetetlen 40%-os cél | **Részben.** | A követett teszt szerint a mondat immár legalább öt saját ábrához köti a célt, és kevesebb ábránál feloldja (`visual-kind-plan.test.ts:39–41`, zöld). Vegyes leckénél a nevező még nem egyértelmű; lásd L3 lent. |
| L4 — eltérő jelzési időpont a tervben és a kódban | **Megszűnt.** | A végrehajtás `:204` sora már kizárólag a végleges, publikált leckét írja elő. A motorban a mérés a sikeres publikáló hívás után, a `done` mentés előtt történik (`engine.ts:1146–1166`). |
| L5 — a végleges mentést nem méri a teszt | **Részben.** | Van már motorfuttatás memóriatárral, amely a `done` mentés `visualKinds` értékét és a KI ág mezőhiányát ellenőrzi (`lesson-variety-paths.test.ts:431–446`, zöld). A pozitív jelzésre továbbra sincs a végső mentést ellenőrző fixture; lásd L5 lent. |

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

- **L3 — kicsi, jegyre — A promptban a 40% nevezője vegyes ábráknál kétértelmű.** `source/shared/visual-kind-plan.ts:48`. Egy Stúdió-admin BE változatossággal és BE forrásvizuállal három kötött és öt saját ábrát tartalmazó leckét gyárt; a sajátak közül három azonos. A mondat az öt darabos minimumot már a saját ábrákra mondja ki, de utána általánosan „az ábrák 40%-ánál” fogalmaz. Minden ábrával osztva `3/8 = 37,5%`, a szerver tényleges nevezőjével `3/5 = 60%` (`visual-kind-plan.ts:57,64–70`). Ez megfogalmazási eltérés, nem hibás szerveroldali számítás; a modell tényleges értelmezése **UNVERIFIED**. **Javítás:** mindkét helyen egyértelműen „a saját ábrák”-at mondjon, vagy külön mondat mondja ki, hogy a forráshoz kötöttek a nevezőbe sem számítanak.
- **L5 — közepes, jegyre — A kész jobból eltűnhetne a pozitív fajta-jelzés anélkül, hogy az új mentési teszt bukna.** `source/tests/lesson-variety-paths.test.ts:441`. Egy BE futásnál, amelynek a publikált leckéjében öt saját ábrából három azonos, a Stúdióban jelzésnek kell megjelennie. A hipotetikus regresszió: `engine.ts:1162` kiszűri a `visual_kind_share` elemeket a ténylegesen mentett listából. Az új teszt csak a mentett jelzéseket hasonlítja a saját, eredetileg egyetlen ábrás fixture-jéből számolt `[]`-hoz (fixture: `source/shared/fixtures/lesson-fusion.ts:30–35,64–73`; kliens: `lesson-variety-paths.test.ts:118–137`). A modellhelyettesítő nem ad illeszthető ábrafoltot, a lektor nem kér cserét, az automata pótló pedig fejezetenként legfeljebb egy ábrát ad, csak ha még nincs (`source/server/studio/section-visuals.ts:24–39`). Ez az ötös határ alatti eset akkor is egyezne, ha a mentési mutáció minden pozitív fajta-jelzést kidobna; a régi forrásszöveg-őr (`visual-kind-plan.test.ts:96–101`) nem vizsgálja a mutált értékadást. Ez statikus mutációelemzés, a mutált futás **UNVERIFIED**; nem állítom, hogy a jelenlegi motor eldobja a jelzést. **Javítás:** a motorpróbában szabályos ábrafolttal vagy lektori cserével legyen tényleges küszöbátlépés. Folytatott checkpointból is ellenőrizze a `done` mentés konkrét darabszámait és jelzéseit, az elavult jelzés eltűnését, illetve a terjedelmi és `try` jelzések megmaradását.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — próbáltam, nem sikerült megtörni.** Az ábrafajta a publikálás előtti `lessonSchema`-ban enum, a kötöttség nem üres, normalizált `sourceVisualId` (`source/shared/lesson-schema.ts:133,152–159`). Az új telemetriamező opcionális (`source/shared/run-telemetry.ts:24`), a meglévő job-JSON-ban mentődik (`source/server/studio/pipeline-store.ts:197–205`), az API átadja a telemetriát és az általános `qualityNotes`-t (`source/server/studio/lesson-pipeline-routes.ts:722–733`). A változatlan JobMonitor nem okkód-engedélylistából jelenít meg (`source/client/src/components/studio/JobMonitor.tsx:170–184`); a két követett átadási őr zöld.
2. **Biztonság és adatvédelem — próbáltam, nem találtam új felületet.** Az új ajánlósor normalizált katalóguskulcsot és rögzített fajtaneveket ír, nem a szabad tantárgymezőt ismétli (`visual-kind-plan.ts:43–48`). A jelzés és a számláló nem visz át ábrafeliratot, felhasználóazonosítót vagy titkot (`:54–70`). Nincs új URL, GET-mellékhatás vagy írási végpont; a meglévő adminos GET `select`-et végez (`lesson-pipeline-routes.ts:219,698–709`). A meglévő origin/CSRF-védelem működését nem teszteltem újra.
3. **Regresszió — próbáltam, nem sikerült megtörni.** Base-diff szerint KI-nál a prompt új terítése üres, a régi szerződésdarabok és sorrendjük változatlanok (`step-io.ts:773–780`), a telemetriát és `qualityNotes`-t módosító ág nem fut (`engine.ts:1156–1166`). A követett prompt- és leckelenyomatok zöldek; a változatossági teszt BE környezetben is ellenőrzi a rögzített KI ábrakérést. Nincs kliens- vagy régi leckeséma-diff.
4. **Budapesti időzóna és dátumhatár — nem alkalmazható.** Az új döntés katalóguskulcsból, statikus szövegből és ábradarabszámból áll; nincs új óra-, dátum- vagy naptári elágazás.
5. **Migráció, indítás, cron, leállítás, e2e-mód — nem alkalmazható az új kódra.** A `studio_jobs.output` már JSONB (`source/shared/schema.ts:804`); nincs séma-, migrációs, indítási vagy ütemezési diff. A modellhelyettesítős motorpróbák és a típusellenőrzés zöldek, élő adatbázist nem igazolnak.
6. **Folytatás és párhuzamosság — próbáltam, a vizsgált részen nem sikerült megtörni.** Az állapotot a motor belépéskor rögzíti (`engine.ts:571–574`), folytatásnál a jobból olvassa (`source/server/studio/lesson-variety-flag.ts:60–62`). Mindkét ellenkező környezeti állapotú folytatás és a bank párhuzamosságtesztje zöld. A végső `visualKinds` értékadás felülír, nem összead, a segéd lecseréli a régi fajta-jelzést (`engine.ts:1159–1162`, `visual-kind-plan.ts:77–79`). Pozitív S6c-jelzéssel kombinált, megszakított lektori csere nincs így kimérve (L5).
7. **Tesztminőség — talált hiba: L5.** Az új teszt valódi motort futtat, de a pozitív jelzéshez érzéketlen. A mutáció következményét végigkövettem a tesztbemenettől az állításig; a saját futtató nem engedte elindítani a scratch-próbát. A nyelvtanos „nincs ajánlás” régi elvárást pozitív ellenőrzés váltotta fel, nem az ellenőrzés törlése. A végleges-only mérés dokumentációját a második kör összeigazította a kóddal.
8. **S6c-1 / V23–V24 és a cache — L3 megfogalmazási hiba, a szerveres szabályt nem sikerült megtörni.** V23-nál a sor közepi `process` és a külön `decisionStory` bekerül, a négy elhalasztott paraméteralak nem kerül az **új** ajánlósorba. V24-nél a követett próba ellenőrzi, hogy `2/5 = 40%` nem jelez, `3/5 = 60%` jelez, négy ábra nem elegendő, és a kötött ábra kiesik a számlálásból (`visual-kind-plan.test.ts:77–84`); a szigorú tört-összehasonlításból `4/10` és `5/10` ugyanígy következik. A KI kérés előtagját és az előző beszélgetésrészt a diff nem módosítja; cache-találatot szolgáltatón nem mértem.
9. **Más hiba keresése — próbáltam, nem találtam új blokkolót.** Megnéztem, hogy a mérés újra megállíthatja-e a gyártást vagy elveszhet-e a másik jelzés. A számítás a publikálás után van, nincs elutasítási ág; az eredmény a `withTryShareNote` után kerül a fajta-jelzés szűrőjéhez, amely csak a saját okkódját törli (`engine.ts:1146–1166`, `visual-kind-plan.ts:77–79`). A hosszjelzést és a `try`-jelzés cseréjét külön próbák fedik; azok zöldek.

## Mit próbáltam megtörni, és nem sikerült

- A futás rögzített kapcsolóját az ellenkező környezeti értékkel: a prompt mindkét irányban a futás állapotát követte, a folytatási teszt mindkét irányban megőrizte a futás állapotát.
- A szerződésszűrőt részszóval, sor közepi leírással és külön paraméterleírással: a meglévő bemeneteken nem találtam nem leírt fajtát az új ajánlásban. A katalóguskulcsos próba a korábban kieső négy tárgyat is átengedte.
- A 40%-os határt, a kis mintát és a forráshoz kötött blokkot: a fenti V24-assertok zöldek; az elavult fajta-jelzés törlésének/cseréjének izolált próbái szintén.

## Mit NEM vizsgáltam

- Saját scratch Node-próba: a futtató a Node v24.22.3 hálózati homokozó-korlátja miatt nem indította el. Emiatt nem futott a teljes, emberi katalóguscímkéket használó saját promptpróba, és nem futtattam mutált motort. A követett tesztek katalóguskulcsokat, valamint külön magyar nyelvtan és irodalom promptot mérnek.
- Élő Postgres / szolgáltatói AI és tényleges cache-hit: nem futott nehéz DB- vagy fizetős gyártás. A publikálás és az S6c-jelzés valódi adatbázisos újraindítási ablaka, hálózati időtúllépése és a pozitív lektori csere utáni kombinált viselkedés ezért **UNVERIFIED**.
- Böngészős álló/fekvő nézet: nincs megjelenítődifferencia, a V21–V22 az S6c-2-é. Az új megjegyzés meglévő JobMonitor komponensbe kerülését kódból és követett forrásszöveg-őrrel ellenőriztem, nem képernyőképpel.

## Megcáfolt gyanúk

- **A négy korábban kimaradó tárgy továbbra is üres.** A V23-próba szerint mind kap nem üres ajánlást; a nyelvtanos teljes promptban is megjelenik a sor.
- **A `decisionStory` csak a táblában van, nem jut az ajánlásba.** Az irodalmi prompt pozitív állítása zöld. A változatlan régi útmutató `fraction`, `wordBuilder` és `sentenceParts` említése nem az új tantárgyi ajánlósor része, a base-ben is ott volt.
- **Az új mezőtől a kliens szöveg helyett objektumot próbál megjeleníteni.** A telemetrianézet név szerint választ ki mezőket, nem rendereli végig a `gates` objektumot (`run-telemetry.ts:80–112`); a fajta-jelzést a meglévő általános jegyzetlista kapja.

## Mit futtattam (parancs + eredmény)

- `git_diff` (stat és célzott diff) + `git_log` + `git_show head`: a base-hez és az előző körhöz képest változott részek azonosítva; az utolsó commit nem módosítja a végleges mentés motorját.
- `npx tsx --test source/tests/visual-kind-plan.test.ts source/tests/lesson-variety-paths.test.ts source/tests/source-visuals-flag.test.ts` — 41 sikeres, 0 sikertelen.
- `npx tsx --test source/tests/single-run-engine.test.ts` — 52 sikeres, 0 sikertelen.
- `npx tsx --test source/tests/studio-quality-notes-ui.test.ts source/tests/lesson-try-voices.test.ts` — 11 sikeres, 0 sikertelen.
- `npx tsx --test source/tests/studio-author-catalog.test.ts` — 4 sikeres, 0 sikertelen.
- `npx tsc --noEmit` — 0 kilépési kód, nincs diagnosztika.
- `node .blind-review-tmp/s6c-prompt-and-mutation.cjs.mjs` — futtatás előtt elutasítva; nem teszteredmény. Az in-memory motorpróbák adatbázis-konfigurációs figyelmeztetésekkel, de 0 kilépési kóddal futottak.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 0 | 0 | 0 | 0 | 0 |
| közepes | 1 | 1 | 0 | 0 | 0 |
| kicsi | 1 | 1 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L5** (közepes) Az új mentési teszt nem észlelné, ha a pozitív fajta-jelzés eltűnne a kész jobból — `source/tests/lesson-variety-paths.test.ts:441` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 16 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 2540
- tokenek: 1140441 bemeneti (ebből gyorsítótárból: 1035271, gyorsítótárba írva: 105122), 9762 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 92.5%; becsült megtakarítás: 3.8289 USD
- költség (a tényleges usage alapján): 0.4640 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
