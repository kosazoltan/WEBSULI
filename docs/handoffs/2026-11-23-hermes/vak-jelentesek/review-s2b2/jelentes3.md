# Független review — TGM S2b-2, 3. vak kör
Fej: 5db1cfc4784a46cfe8fe7503fe18f290b17b1ee0
## Ítélet: IGEN, FELTÉTELLEL

Nincs igazolt blokkoló. A kör óta hozzáadott változásokban nem találtam kiadott leckét, kisfilmgyártást vagy lejátszást érintő regressziót. Az új V37 böngészős teszt viszont a javítás nélkül is teljesítheti az állításait (L5). Három korábbi jegy nyitva marad.

## Az előző kör leleteinek sorsa

- A kapott előző jelentésben nincs blokkoló. Az első körből hivatkozott üres **forrás-ábra**-panel megszűnt: a `Clip2Player.tsx:98` a panel előtt ellenőriz. A követett böngészős tesztben 360×640, 844×390 és 1280×800 nézetben a tábla hivatkozásánál nincs panel, míg az érvényes régi `process`-nél panel és rajz is van.
- **L1 — nem szűnt meg, meglévő hiba.** A saját próba a régi `cycle`-nál továbbra is egy üres panelt mért. Az új pozitív számegyenes- és `process`-minták érvényesek, de nem fedik ezt az esetet.
- **L3 — nem szűnt meg.** A keverési arány továbbra is konstans az egységtesztben; azonos CSS-mutációval újramértem a kontrasztesést. A sávos böngészős teszt az `explorer` A tónusának szegélyén ezt a konkrét mutánst észrevenné, de ez nem teszi az egységőrt a teljes CSS-viselkedés mérőjévé.
- **L4 — nem szűnt meg, meglévő korlát.** Újra reprodukáltam a négy rövid oszlopos esetet. Nem emeltem blokkolóvá: a base ezt már görgette, a diff nem rontja, és forrás-ábrát érint.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

- **L5 — kicsi, új: a V37 böngészős tesztje nem különíti el a fejlécfüggőséget a méretfigyelőtől.** `source/tests/source-visuals.spec.ts:366`. A fejlesztő 360×640-en a próbaoldalon rövidről hosszúra, majd vissza kapcsol. A próba csak a szélességet hasonlítja, de a `ResizeObserver` ugyanazt a tárolót figyeli (`source/client/src/lesson-runtime/blocks/source-visuals.tsx:99–103`), és annak magassága változik. A valódi React-hatás előző fejlécfüggőségének értékét a következőre állítottam, így a hatás nem települt újra (a takarító függvény változatlan). A szélesség végig 251 CSS px, a magasság 100 → 158 → 100; a `data-head-fit` így is `null → break → null`. Vagyis az új teszt ezekkel az állításokkal a base-beli, fejlécfüggőség nélküli viselkedést is elfogadná. Kontrollként 200 CSS px-re rögzített magasságnál ugyanilyen semlegesítéssel hosszú fejléc után `null` maradt. **Javítás:** a próbában rögzíteni és ellenőrizni mindkét méretet, megvárni a fontok és az első méretmérés beállását, majd ellenőrizni, hogy a `headerKey` eltávolításakor a böngészős teszt tényleg bukik. A termékkód működésében ez a lelet nem mutat hibát.
- **L1 — közepes, meglévő hiba: üres panel hibás régi ábra hivatkozásánál.** `source/shared/lesson-clip.ts:95`. Egy 6. osztályos tanuló 360×640-es telefonon a víz körforgása kisfilm második jelenetére lép. A lecke olvasási sémája elfogadja a `cycle` blokk `{ phases: [] }` rekordját, `sourceVisualProblems` régi fajtára `null`-t ad (`source/shared/lesson-visual-params.ts:201–205`), így az index felkínálható gyártáskor is (`source/server/lesson-clips.ts:202–215,383`). A `CycleAnim` viszont nem rajzol (`source/client/src/lesson-runtime/blocks/explanatory-visuals.tsx:203–207`). A böngészőben a séma-ellenőrzött próba a második jelenetben egy panelt, benne nulla kirajzolt gyermeket adott. A base minden `animate` indexet kínált és ugyanazt a rajzolót hívta; ez nem az új forrás-ábra-szűrő regressziója. **Javítás:** a tényleges kirajzolhatóságot közösen ellenőrizni a gyártónál és a lejátszónál, a renderelhető régi alakok megtartásával.
- **L3 — kicsi: a V34 egységteszt a fejléc keverését maga állítja elő.** `source/tests/source-visual-contrast.test.ts:42`. A fejlesztő megváltoztatja a CSS fejléc hátterében a keverést 14%-ról 90%-ra, a hex tokeneket nem módosítja. A teszt `0.14`-gyel és rögzített háttértoken-névvel számolna változatlan eredményt. Chromiumban a tényleges számított színek relatív fénysűrűségéből mérve az `explorer` A jel és szegély 3,801:1-ről 1,185:1-re esett. A mutált egységteszt futtatását a homokozó elutasította; az egységőr vakfoltja a bemenete és a böngészős mérés alapján igazolt. **Javítás:** a számított CSS-t ellenőrizni minden tónusra, sávra és csendes nézetre, a „Példa” címkével együtt.
- **L4 — közepes, meglévő megjelenítési korlát: négy rövid oszlop is görög.** `source/client/src/lesson-runtime/lesson-design.css:309`. A 2. osztályos tanuló 360 px-en a `Település | Távolság | Gyakoriság | Irányítószám` táblát nyitja meg. A séma-ellenőrzött új mintában a leghosszabb cella 12 karakter, mégis 535 CSS px a tábla görgethető szélessége a 301 CSS px belső keretben; az oldal 360 px marad. A képen csak görgetéssel érhető el az utolsó oszlop. A kompakt attribútum levétele azonos 535/301 px-et ad (kontroll, nem base-build). A base oszlopszám-alapú `min-width` szabálya már görgetést kényszerített ki ennél a keretnél; az automatikus táblaméretezésben a változatlan `break-word` nem csökkenti az egybefüggő szavak minimális szélességét. Ez a V36 négyszlopos esetét sérti, de nem új hiba. **Javítás:** három és négy oszlopra tartalomszélességhez igazodó tördelés és térköz; a számos minta mellé négy 12 karakterhez közeli szó is kerüljön a böngészős próbába.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — meglévő hiba (L1); új törést nem találtam.** A `blockIndex` a fejezet eredeti indexe marad, nem a szűrt lista pozíciója. Ugyanaz az indexlista megy a prompthoz és a kapuhoz (`lesson-clips.ts:202–215,383`). A böngészőben érvényes régi és kizárt forrás-ábra is átment a kisfilm olvasási sémáján, a megfelelő panelviselkedéssel.
2. **Biztonság és adatvédelem — próbáltam, nem sikerült megtörni.** A `headswap` próbaút buildkapu mögött van (`source/client/src/App.tsx:75–83`), helyi állapotot vált, nem küld adatot. A címek/cellák és feliratok React szövegcsomópontok; a követett jelölő-szöveg teszt átment. Nincs új token-, napló-, API-, eredet- vagy GET-írási út a diffben.
3. **Regresszió — új hibát nem találtam.** Régi `process` ráúszó rajza mindhárom méretben látható; a címpanel pozitív kontrollként megmarad, kisfilm nélküli leckén nincs gomb. A kapcsoló KI lenyomatpróbái zöldek. A CSS-hivatkozások keresése csak forrás-ábra fogyasztókat talált, köztük a döntési fa tónusjelét. A próba nem terjedt ki valódi fiókszerepkörökre.
4. **Budapesti dátumhatár — nem alkalmazható.** A változás nem használ időpontot, naptári napot vagy időzónát; a lejátszó jelenethossza és időzítése nem változik.
5. **Migráció, indítás, cron, leállítás és e2e-mód — új hibát nem találtam.** Nincs migráció-, Drizzle- vagy életciklus-diff. Az eldobható PostgreSQL-es e2e elindult, 42 teszt lefutott, a futtató törölte a DB-t. Ez nem külön cron- vagy éles indítási próba.
6. **Párhuzamosság, megszakítás, időtúllépés — próbáltam, nem sikerült új törést előidézni.** A kétirányú fejlécváltás és a kisfilm szünet/előző/következő útja átment. Az e2e a megakadt lekérdezés lejártát és az átmeneti 502 utáni felépülést is lefuttatta. A `useHeaderFit` takarításában a leszerelt mérés `alive` őrt és `disconnect()`-et kap; a friss dependency melletti teszt vakfoltja L5.
7. **Tesztminőség — L3 és L5.** A cím/jelző helyének és a tónusszegély tokenjének eltérő elvárásai dokumentáltak a 17. szakaszban. A valódi lejátszós negatív/pozitív pár erősíti V35-öt; a V37 böngészős mutáció mellett a méretfigyelő elfedi a hiányzó függőséget. Az egységteszt a függőségtömb alakját ellenőrzi (`source/tests/source-visuals-findings.test.ts:49–53`), nem a viselkedést.
8. **Szeletspecifikus elfogadás.** **V33:** a megnézett 360×640-es és 844×390-es képeken a cím kívül és a jelző fölül van; 1280×800-on a minta elfér a keretben, jelző nélkül. A `<caption>` megmaradását az egységteszt igazolja. **V34:** az egységpróba zöld, Chromiumban a mért `explorer` A jel és vonal 3,801:1; az őr korlátja L3. **V35:** a tábla nem kap panelt. A `decisionTree` és `pictureCards` benne van a közös tiltólistában (`source/shared/lesson-schema.ts:86`), amelyet a gyártó és a lejátszó is használ. A régi hibás `cycle` külön jegy. **V36:** a háromoszlopos számos minta zöld, a négyszavas határeset nem teljesül (L4), a print-média próba `overflow-x: visible`-t kapott. **V37:** a követett rövid–hosszú–rövid próba működik; a függőség nélkül megmaradó zöld állításokat L5 dokumentálja. A vizsgált max-tábla oldalának mért szélessége rendre 360, 844 és 1280 CSS px, a széles tábla a saját keretében görög.
9. **Egyéb — új hibát nem találtam.** A próbaút új kapcsolóága nem váltja le a normál próbaoldalt; ezt az ugyanazon futásban lefutó `fusion`, `source-visuals=1/max/tree` és az új `headswap` próbák ellenőrzik. A nyomtatási CSS szelektorai forrás-tábla osztályokra korlátozódnak.

## Mit próbáltam megtörni, és nem sikerült

- Három nézetben kerestem a szűrés téves pozitívját (eltűnő érvényes régi ráúszó) és téves negatívját (ottmaradó forrás-ábra-panel): a régi `process` megmaradt és a táblapanel eltűnt. Nem azonos az L1-ben mért, régi nem kirajzolható ábrával.
- Megpróbáltam a max-táblával oldalszintű vízszintes túlcsordulást előidézni. A 360, 844 és 1280 CSS px-es mérésekben a dokumentum a viewport szélességén maradt; a megnézett képernyőképeken a cím nem került a görgő keretbe.
- Megakadt, átmenetileg hibás és régi formátumú kisfilmlekérdezést is próbált az e2e; a meglévő védekezések működtek.

## Mit NEM vizsgáltam

- Nem futtattam a base teljes alkalmazását, nem nyitottam meg éles leckét és nem hívtam fizetős modellt. A base-összevetés Gitből és a megnevezett kontrollokból áll; a gyártás teljes szolgáltatói lánca, valós stúdiós és bejelentkezett szerepkörök **UNVERIFIED**.
- Nem vizsgáltam a tényleges nyomtatott/PDF-oldaltörést, képernyőolvasót vagy nem Chromium böngészőt. A print emuláció, a DOM és a képernyőképek nem fedik ezeket.
- Nem játszottam le külön `decisionTree` és `pictureCards` ráúszót, és nem mértem végig böngészőben az összes tónust minden csendes sávban: a közös kizáró feltétel, az egységteszt és a célzott CSSOM-mérés áll rendelkezésre. Nem próbáltam a teljes média/hang- és gyártási újraindítást.
- A V34 mutált egységteszt saját Node-harnessét a sandbox a Node v24.22.3 hálózati korlátozása miatt nem engedte elindítani; a mutáns tényleges egységtesztkimenete **UNVERIFIED**.

## Megcáfolt gyanúk

- Nem marad üres panel a kizárt táblahivatkozás után, és nem tűnik el emiatt az érvényes régi `process`: pozitív és negatív böngészős kontroll, mindhárom nézetben.
- A döntési fa és a képes kártya nem maradt ki a gyártó/lejátszó tiltólistájából: ugyanaz az öttagú lista van a közös feltételben. Egyedi böngészős próbájukra nem terjesztem ki az állítást.
- A négy rövid oszlopos L4 nem oldalszintű túlcsordulás és nem új regresszió: a keret görög, a dokumentum nem; a kompakt attribútum nélküli kontroll és a base szabálya ezt már megengedte.

## Mit futtattam (parancs + eredmény)

- `git_diff` (stat és célzott diffek), `git_log`, `git_show head`, célzott `git_show base` és `9ae50395`: az utolsó commit próbaoldalt, teszteket és a terv teszthivatkozását módosította, nem az éles renderelőket.
- `npx tsx --test source/tests/source-visual-contrast.test.ts source/tests/source-visuals-findings.test.ts source/tests/lesson-source-visual-kinds.test.ts source/tests/lesson-clip.test.ts source/tests/source-visuals-flag.test.ts` — 73 átment, 0 bukott. Ennek a külön egységfutásnak nem volt DB URL-je; nem DB-integrációs bizonyíték.
- `npx tsc --noEmit` és `npx tsc --noEmit -p tsconfig.test.json` — mindkettő 0.
- `run_e2e source/tests/lesson-clips.spec.ts source/tests/source-visuals.spec.ts` — 42 átment Chromiumban, az eldobható DB eltávolítva.
- `run_browser_scenario .blind-review-tmp/s2b-v37-mutacio.json` és `run_browser_scenario .blind-review-tmp/s2b-recheck.json` — első képi próbák; a függvényalakú `evaluate` lépések nem értékelődtek ki, ezért nem tekintettem ezeket mérésnek. A javított `run_browser_scenario .blind-review-tmp/s2b-meres.json` — mind a hat eset lefutott; ellenőrzött képek álló, fekvő és asztali nézetben, továbbá L1/L3/L4/L5 mérései.
- `node .blind-review-tmp/s2b-contrast-mutant.ts` — a homokozó indítás előtt elutasította; nem állítok eredményt.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 0 | 0 | 0 | 0 | 0 |
| közepes | 2 | 2 | 2 | 0 | 0 |
| kicsi | 2 | 2 | 2 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (közepes) Meglévő hiba: a hibás régi cycle hivatkozás üres panelt hagy — `source/shared/lesson-clip.ts:95` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L4** (közepes) Meglévő korlát: négy rövid oszlop 360 px-en belső görgetést igényel — `source/client/src/lesson-runtime/lesson-design.css:309` — hivatkozás igazolt; futtatással igazolt (teljes út)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 19 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 2055
- tokenek: 1424685 bemeneti (ebből gyorsítótárból: 1307217, gyorsítótárba írva: 117411), 13731 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 92.8%; becsült megtakarítás: 4.8500 USD
- költség (a tényleges usage alapján): 0.5617 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
