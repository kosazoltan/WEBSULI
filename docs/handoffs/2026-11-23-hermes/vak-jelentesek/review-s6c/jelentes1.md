# Független review — TGM S6c
Fej: 87d746368b244133648c110de228525316d4331a
## Ítélet: NEM

A KI modellkérést és a futásra rögzített kapcsolót nem sikerült megtörnöm. A megjelenítési védelem viszont nem fedi le mind a hat ábrát: a jelöletlen út is megváltozik, és a jelölt úton helyes paraméterekből hibás vagy részben láthatatlan ábra készül. A megjelenítők és a gyártási mérés külön javíthatók; a megjelenítőket nem engedném be a kapcsolóra hivatkozva, mert L1-et a KI állapot sem védi ki.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

- **L1 — blokkoló — Jelöletlen leckén is az új tört-, térkép-, szóépítő- és mondatelemző rajzoló fut.** `source/client/src/lesson-runtime/blocks/animate-blocks.tsx:108–116`. Amikor egy tanuló telefonon megnyit egy jelöletlen leckét, amely egy 25 mezős táblán az `1/25`-öt tanítja, a felirat és a rajz eltér: a `/preview` útvonalon a sémán átment próba `1/24`-et mutatott. Ugyanott az üres `spots`-os térképnél eltűnt a base „Nincs megadott pont” állapota. A base `animate-blocks.tsx` a négy régi komponenst regisztrálja, a `FractionAnim`-ban nincs felső nevezőkorlát; a diff lecseréli ezeket, de csak a `process` és a `timeline` elé tesz jelölővizsgálatot. A külön próbaoldalon mind a négy `vv-figure` megjelent jelölő nélkül. Ez a tulajdonos szigorú invariánsát sérti; a terv 14/1. pontjának mintavételi állítása nem bizonyítja, hogy ilyen régi adat nem jut el a lejátszóhoz. **Javítás:** mind a hat fajtához őrizni a base megjelenítőjét, és csak jelölt leckén váltani; a dokumentációt és a jelenleg jelöletlenül is `.vv-pie`-t elváró tesztet ehhez igazítani.
- **L2 — blokkoló — A szóépítő a helyes részekből helytelen szót állít elő.** `source/client/src/lesson-runtime/blocks/variety-visuals.tsx:92`, BE szerződés: `source/shared/lesson-visual-params.ts:346`. Egy harmadikos a jelölt nyelvtanleckében `alma + -t = almat` ábrát látott, miközben a helyes felirat ugyanazon a képernyőn `almát`. A `parts: ["alma", "-t"]` a hirdetett tő + rag alak, nem hibás modellválasz. A base csak a részeket és a pluszjelet írta ki, nem állított hamis eredményt. A diff kötőjeleket töröl és összefűz; a hat részt megengedő szerződéssel szemben a hatrészes próba eredménye üres maradt. Bizonyíték: `2-szoepites.jpg`, `/preview/review-word` DOM. **Javítás:** az eredmény legyen explicit és ellenőrizhető; ha nem áll rendelkezésre hiteles eredmény, ne jelenjen meg egyenlőség. Egyeztetni kell a hirdetett részhatárt a rendererrel.
- **L3 — blokkoló — Az áltörtábra elhagyja az egészen felüli maradékot.** `source/client/src/lesson-runtime/blocks/variety-visuals.tsx:25–27`, BE szerződés: `source/shared/lesson-visual-params.ts:344`. Egy jelölt matekleckében a megengedett `9/2`-höz a böngésző négy kételemű sávot rajzolt, mindkét cellát mindegyikben kitöltve (`[2,2,2,2]`, összesen 8 fél). Az ábra alatti magyarázat helyesen négy egészet és egy felet mond. A base egyetlen köre már telítődött áltörtnél, de nem mutatott négy egészre lebontott számlálósávot. A diff új, darabonként leolvasható sávja hamis mennyiséget mutat: három egész után 3 fél marad, abból a negyedik sávban csak 2 látszik. Bizonyíték: `4-360-altort.jpg`, `9/2` ARIA-címke és a kitöltött cellák DOM-száma. **Javítás:** külön számolni a valódi egészrészt és maradékot; sok egész esetén egyértelmű tömör jelölés, nem csendes telítés. A teszt a rajzolt mennyiséget is mérje.
- **L4 — blokkoló — Két külön térképpont azonos helyre kerül, az egyik sorszáma eltűnik.** `source/client/src/lesson-runtime/blocks/variety-visuals.tsx:65–71`, `source/client/src/lesson-runtime/lesson-design.css:463–473`. Egy 360×640-es telefonon földrajzleckében két külön mérőállomás (`x: 0` és `x: 5.5`, `y: 50`) egyaránt `left: 6%; top: 50%` lett; azonos, mért 34 px-es bal pozícióval csak a 2-es látszik, az 1-es csak a legendában marad. A base közvetlenül a megadott százalékot használta, nem omlasztotta össze a két koordinátát. A diffben a szerződéses koordinátát felülíró clamp és az ütközéskezelés hiánya okozza. A széltől távoli kontrollban Budapest és Budaörs jelölődobozai is átfedték egymást (mért metszet: 24,97 × 26,20 px); az első középpontját a második jelölő fedte. Ez V21 átfedésmentességét sérti. Bizonyíték: `1-map-edge.jpg`, `4-360-kozeli.jpg`. **Javítás:** a pontokat a párnázott rajztérre arányosan leképezni, a közeli számozott jelölők takarását pl. vezetővonallal vagy csoportjelölővel feloldani.
- **L5 — blokkoló — Jelölt leckén levágódik az idővonal alja a fejezetkisfilmben.** `source/client/src/lesson-runtime/blocks/animate-blocks.tsx:104`, hívó: `source/client/src/lesson-runtime/clips/clip2-overlays.tsx:75–80`, keret: `source/client/src/lesson-runtime/clips/lesson-clips2.css:53`. Egy tanuló 360×640-en egy nyolc rövid időrendi eseményt mutató kisfilmet indít (az idővonal paramétersémája tízig enged). Jelölten 5/8 esemény fért el teljesen: `clientHeight=206`, `scrollHeight=295`, az utolsó sor teteje 257,70 px-rel lejjebb volt a keret tetejénél. A jelöletlen kontroll ugyanazon a kisfilm-adaton 8/8 sort tartott a keretben, `167/167` px; ez a base változatlan vízszintes rajzolóága. A külön, öt eseményes jelölt próbán nem volt vágás: a hiba a magasabb renderer és a változatlan `overflow: hidden` együttállása, nem a lejátszás elindítása vagy a média. Bizonyíték: `1-8-uj-timeline-kisfilm.jpg`, `2-8-regi-timeline-kisfilm.jpg`. **Javítás:** külön kompakt kisfilmes vetület, vagy a be nem férő ábra kizárása a ráúszó panel lehetőségei közül, üres panel nélkül.
- **L6 — közepes, jegyre — A mérés nem a végleges leckére vonatkozik; folytatáskor hiányozhat.** `source/server/studio/single-run/engine.ts:888–891`. BE gyártásnál a Stúdióban öt ábrából három azonosként rögzített figyelmeztetés megmaradhat, ha a lektor után az egyiket másik fajtára cserélik (3/5 = 60% → 2/5 = 40%). A jelzés a tanításcsere (`:1056–1057`), a végkapu (`:1075–1077`) és az esetleges forráspótlás előtt készül; a `done` mentés előtt csak a `tryShare`-t számolja újra (`:1160–1170`). Korábbi BE job kész bankjának folytatásakor, ha a mentés S6c előtti és nincs ilyen mezője, a `pastAnimator` miatt ki sem számolja. Ez az új mérés hibája; a hívási láncból következik, S6c motorpróbával nem mértem. **Javítás:** a végleges `publishable` alapján újraszámolni, a `visual_kind_share` jegyzeteket ok szerint lecserélni/törölni, és mérni a lektori cserét és a folytatást.
- **L7 — kicsi, jegyre — A színőr akkor is átmegy, ha eltűnik a látható szín.** `source/tests/lesson-variety-feedback.browser.ts:130–131`. Egy szóépítő chip látható hátterét és szegélyét átlátszóvá változtattam a böngészőben; a teszt predikátuma továbbra is igaz volt, mert a nem üres `--vv-tone` megmaradt. Ez a teszt hamis pozitívja, nem a vizsgált minta eredeti termékhibája. **Javítás:** a festett `backgroundColor`, `borderColor` vagy SVG `fill` tényleges számított értékét ellenőrizni egynél több sávon; a térképnél az egész figura méretén túl a jelölők takarását is mérni.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — talált hiba.** L1–L4: a régi `params` forma nem szigorodott (`lesson-schema.ts:152–159`, változatlan `visual-patch.ts:62–87`), de a rajzoló az elfogadott adatot részben átértelmezi. A V23 ajánlótáblája és a BE/KI prompt szerkezete zöld; ez nem bizonyítja a kirajzolás helyességét.
2. **Biztonság/adatvédelem — próbáltam, nem sikerült megtörni a változott felületet.** Nincs új útvonal, token, link, naplózott paraméter, origin-szabály vagy GET-mellékhatás; a koordináta véges számból képzett százalék, a címkék React szövegcsomópontok (`variety-visuals.tsx:11–13,65–77,96–104`). A próbaútvonal buildkapuja megmaradt (`App.tsx:75–81`). A közös forrásábra feliratait szövegként kezelő teszt is zöld.
3. **Regresszió — talált hiba.** Névtelen `/preview` a tényleges `LessonView` sémáján át: L1. Közös `ANIMATE_REGISTRY` második hívója, a kisfilm: L5. A régi folyamat/idővonal JSX a base-zel egyezik; a jelöletlen böngészős kontroll legacy ágat használt. A tárolt jelölő megtartását és a modelljelölő eldobását ellenőrző gyártási/javítási tesztek zöldek.
4. **Időzóna és dátumhatár — nem alkalmazható.** Az idővonal szövegelválasztót keres, nem számol dátumot (`variety-visuals.tsx:150–153`). A mérés darabszámot használ.
5. **Migráció / Drizzle / indítás / cron / e2e — az első négy nem alkalmazható; a próbaút működött.** Nincs DB-, worker- vagy indulási konfiguráció a diffben; az opcionális `visualKinds` a meglévő job JSON telemetriájában van. A két TypeScript-ellenőrzés és a helyi buildkapus próbaút lefutott.
6. **Versenyhelyzet, ismétlés, folytatás — talált hiba a végleges mérésnél (L6).** KI → BE környezetben folytatás és fordítva zöld. A két animator-olvasás ugyanazt az `AsyncLocalStorage`-értéket látja (`lesson-variety-flag.ts:17–22,52–62`; `engine.ts:571–574,878–888`). Rendes új S6c bank-checkpointnál a mentés együtt viszi a leckét, jegyzetet és telemetriát (`engine.ts:627–630,959`), a következő ág nem fűzi újra a jegyzetet. S6c duplázódást nem reprodukáltam.
7. **Tesztminőség — talált hiba, L7.** A böngészős CSS-mutációt az új színőr nem venné észre. A `visual-kind-plan.test.ts:83–87` szöveges őre nem méri az érték vagy jegyzet megírását. Korábbi tesztet nem láttam gyengíteni; az új jelöletlen törtelvárás viszont szembemegy a tulajdonosi invariánssal. A 14. szakasz és végrehajtása új, a 14/1. pontot L1 javításához pontosítani kell.
8. **Feladat-specifikus — talált hiba, L1–L6.** V21: a rövid jelölt minta oldalszélessége és a viewport egyezik mindhárom nézetben (`scrollWidth`: 360, 844, 1280 px); az átfedéses és a kisfilmes eset mégis bukik. V22: a `process` / `timeline` normál leckenézetben helyesen vált. V23: KI-nél az eredeti szerződéssor és az ajánlósor hiánya egyezik, BE-ben mind a négy alak és a tantárgyi ajánlás megjelenik; a szerződés és a rajz közti eltérés L2–L4. V24: a követett tesztben 5/10 jelez, 4/10 és az öt alatti nevező nem, a `sourceVisualId` kizár; a kerekítés csak a kiírt százalékot érinti (`visual-kind-plan.ts:42–56`). A végleges példány mérésére ez nem bizonyíték (L6).
9. **Egyéb — talált hiba.** A képméret átment, de a tanított tartalom helytállósága nem (L2, L3). A Tananyag lapon kívül a közös kisfilmes hívó más méretkorlátot alkalmaz (L5).

## Mit próbáltam megtörni, és nem sikerült

- Az ábrakészítő rögzített KI állapotát BE környezettel és fordítva. A követett teszt bájtra egyező KI kérést és eltérő BE kérést adott; a base–head `step-io.ts` diff és a forrásvizuál-lenyomat tesztek nem mutattak KI regressziót. A `visualKinds` csak a BE ágban kap értéket.
- A tiszta küszöbszámítást a 4/10 és 5/10 határral, hozzáadott forrásábrákkal és négyábrás leckével. A követett teszt zöld; nem az L6 teljes útját méri.
- A jelöletlen folyamat/idővonal és a rövid jelölt minták tördelését. Az álló, fekvő és asztali nézetben mért oldal és a képek a rövid mintán nem mutattak oldalirányú görgetést. A jelöletlen öt- és nyolceseményes kisfilm a régi renderert használta.

## Mit NEM vizsgáltam

- Nem mértem az éles adatbázisban a négy régi fajta előfordulását; nem használtam éles adatot vagy fizetős modellt. A visszaolvasott régi alakot szintetikus, érvényes API-válasszal mértem. Az éles érintettség darabszáma **UNVERIFIED**.
- A saját motoros próba nem futott: a futtató a Node v24 homokozó hálózati korlátozásának hiánya miatt elutasította. S6c lektori csere és checkpoint–időtúllépés–folytatás telemetriája nem volt DB-integrációval mérve; L6 ezért jegyre megy. A követett motor- és rögzítettállapot-tesztek lefutottak.
- Nem volt teljes bejelentkezett Stúdió-böngészős gyártás, minden sávra kiterjedő pixel-/kontrasztmérés vagy kisfilmes média-végpont vizsgálat. A kisfilm-próbákban a médiahibák nem állították le a mért ábrák DOM-megjelenését; a próba nem igazolja a médiaút működését.

## Megcáfolt gyanúk

- **A prompt kétszeri kapcsolóolvasása átveszi a megváltozó környezetet.** Az animator-hívó a futáshatókörön belül van, `false` esetén sem esik vissza az env olvasására (`??`).
- **A régi folyamat és idővonal JSX-törzse elveszett.** A base két törzse a `Legacy*` komponensekben megvan; a négy másik régi törzset tényleg lecserélték (L1).
- **A pontos 40% már jelez.** A döntés `> 0.4`; a 4/10 kontroll nem jelzett.

## Mit futtattam (parancs + eredmény)

- `npx tsx --test source/tests/variety-visuals.test.ts source/tests/visual-kind-plan.test.ts source/tests/source-visuals-flag.test.ts source/tests/single-run-engine.test.ts source/tests/lesson-visual-params.test.ts source/tests/animator-invariants.test.ts` — 92/92, kilépés 0.
- `npx tsx --test source/tests/lesson-source-visual-kinds.test.ts source/tests/studio-author-catalog.test.ts source/tests/lesson-variety-paths.test.ts source/tests/lesson-try-voices.test.ts source/tests/source-visuals-findings.test.ts` — 73/73, kilépés 0. A mockolt motorfuttatások mellett DB-kapcsolati figyelmeztetés volt; ez nem DB-integráció.
- `npx tsc --noEmit` és `npx tsc --noEmit -p tsconfig.test.json` — mindkettő kilépés 0.
- `run_browser_scenario .blind-review-tmp/s6c-layout.json` — 4 eset, kilépés 0; három nézet és közeli térképpont/áltört. A 0 a forgatókönyv lefutását jelenti, nem a termék helyességét.
- `run_browser_scenario .blind-review-tmp/s6c-extra.json` — 4 eset, kilépés 0; régi paraméter, szóépítés, színmutáció, öt eseményes kisfilm-kontroll.
- `run_browser_scenario .blind-review-tmp/s6c-clip.json` — 2 eset, kilépés 0; nyolc eseményes kisfilm jelölt/jelöletlen összevetése.
- `run_browser_scenario .blind-review-tmp/s6c-map-edge.json` — 1 eset, kilépés 0; érvényes külön koordináták azonos helyre esnek.
- Nem futott két korai böngészős változat (nem `/api/`-s mock, illetve hatnál több kép), valamint a `node .blind-review-tmp/s6c-load.mjs` (homokozókorlát). A böngészős eseteket a fenti lefutott változatokra cseréltem.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 5 | 5 | 5 | 0 | 0 |
| közepes | 1 | 1 | 0 | 0 | 0 |
| kicsi | 1 | 1 | 1 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) Jelöletlen leckén is az új négy megjelenítő fut — `source/client/src/lesson-runtime/blocks/animate-blocks.tsx:110` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L2** (blokkoló) A szóépítő hibás szóalakot gyárt, a hatrészes alak eredménye elmarad — `source/client/src/lesson-runtime/blocks/variety-visuals.tsx:92` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L3** (blokkoló) Az áltört sávja kisebb mennyiséget mutat a megadottnál — `source/client/src/lesson-runtime/blocks/variety-visuals.tsx:27` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L4** (blokkoló) A szélső koordináták összecsúsznak, az egyik sorszám nem látható — `source/client/src/lesson-runtime/blocks/variety-visuals.tsx:65` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L5** (blokkoló) A jelölt lecke idővonalának alja levágódik a kisfilmben — `source/client/src/lesson-runtime/blocks/animate-blocks.tsx:104` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L6** (közepes) A lecke végső ábrafajta-eloszlását nem méri a motor — `source/server/studio/single-run/engine.ts:888` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 37 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 4703
- tokenek: 3812339 bemeneti (ebből gyorsítótárból: 3645906, gyorsítótárba írva: 166322), 29343 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 96.1%; becsült megtakarítás: 13.6881 USD
- költség (a tényleges usage alapján): 1.0740 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
