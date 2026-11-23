# Független review — feat/tgm-s2b2-megjelenito-leletek (2. kör)
Fej: 9ae50395279ec36bd20a9a27fa267af26a20c24a
## Ítélet: IGEN, FELTÉTELLEL
A kizárt forrás-ábrák helyén eltűnt az üres panel. Új blokkolót nem találtam: a régi érvényes ábraráúszás megmaradt; az új feltétel nem módosítja a kisfilm adatsémáját vagy a jelenetvezérlést. Három nem blokkoló ügy marad jegyre.

## Az előző kör leleteinek sorsa
- **Korábbi blokkoló nem volt.** A körönkénti változást a `53dacccb` előző fejjel, a regressziókat a `412854e3` base-szel vetettem össze.
- **L1 — nem szűnt meg.** V35 most kifejezetten a forrás-ábrákra vonatkozik. A hibás régi `cycle` továbbra is megengedett; az üres panelt újra előidéztem (lásd lent).
- **L2 — megszűnt.** Az előző fej minden `scene.overlay` mellé létrehozta a panelt. A `Clip2Player.tsx:98` most előbb meghívja az őrt (`lesson-clip.ts:99–102`). A 360×640-es próbán táblára, döntési fára és képes kártyára mutató jelenetnél **0 panel**; a nyitójelenet címpanelje megmaradt. Előre és vissza is megmaradtak a feliratok, a fa képernyőképén nincs fehér csík. A 844×390-es kontrollban a régi `numberLine` a lecke törzsében és a ráúszó DOM-jában is megjelent.
- **L3 — nem szűnt meg.** Az őrben maradt a `0.14` konstans; újra megmértem a valódi CSS 90%-ra állításának hatását.
- **L4 — nem szűnt meg.** A most legfeljebb négy oszlopra szűkített V36 határán is reprodukálható a belső görgetés. Nem blokkoló: a base-ben is görgött volna, és csak a forrás-ábra megjelenítését érinti.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)
- **L1 — közepes, meglévő hiba: üres panel a hibás régi `cycle` hivatkozásánál.** `source/shared/lesson-clip.ts:95`. Egy 6. osztályos tanuló 360×640-es telefonon a víz körforgásáról szóló jelenetre lép. A lecke olvasási sémája átengedi a `{ phases: [] }` blokkot, a `sourceVisualProblems` a régi fajtára `null`-t ad (`source/shared/lesson-visual-params.ts:201–205`). A gyártó a szűrt indexeket továbbadja a promptnak és a kapunak (`source/server/lesson-clips.ts:202–215,383`), de a `CycleAnim` nem rajzol (`source/client/src/lesson-runtime/blocks/explanatory-visuals.tsx:203–207`). A séma-ellenőrzött leckén a második jelenet `lessonVisual` paneljében a `.clip2-visual` gyermekeinek száma 0; folytatás után fehér csík látszik. A base minden `animate` blokkot felkínált, és ugyanazt a rajzolót használta. **Javítás:** a régi fajtáknál a tényleges kirajzolhatóságot ellenőrizze közös gyártó- és lejátszófeltétel, ne a megjeleníthető régi blokkokat is kizáró, szigorúbb szerzői kapu.
- **L3 — kicsi: a V34 egységteszt nem a CSS-ből veszi a keverési arányt.** `source/tests/source-visual-contrast.test.ts:42`. Ha egy későbbi stílusmódosítás 14%-ról 90%-ra állítja a fejléc keverését, az `explorer` sávban a jel és a vonal kontrasztja 3,801:1-ről 1,185:1-re esik (Chromium CSSOM-mutáció, relatív fénysűrűség a számított színekből). Az egységteszt változatlan hex tokeneket és mintákat olvasna, és továbbra is `0.14`-gyel számolna. A mutáns egységtesztet nem futtattam; a vakfoltot a teszt bemenete és a böngészőmérés igazolja. A változatlan fej teljesíti a mért küszöböket; a base-ben az őr még nem létezett. **Javítás:** a tényleges számított háttér, jel, vonal és címke kontrasztját ellenőrizni mind az öt sávban, normál és csendes állapotban.
- **L4 — közepes, meglévő megjelenítési korlát: a V36 szerinti négy rövid oszlop is görög.** `source/client/src/lesson-runtime/lesson-design.css:309`. Egy 2. osztályos tanuló 360 px-es telefonon megnyitja a `Település | Távolság | Gyakoriság | Irányítószám` táblát. A sémán át betöltött leckében a leghosszabb cella 12 karakter, `data-compact=true`, mégis 545 CSS px a görgethető szélesség és 301 CSS px a keret belső szélessége; a teljes oldal 360 px. A képen csak oldalra húzva érhető el az utolsó oszlop. A kompakt szabály leveszi a `min-width`-eket, de az automatikus táblaméretezésben a `break-word` nem csökkenti az egyszavas cellák minimális szélességét. A base oszlopszám-alapú korlátja ennél a keretnél eleve görgetést kényszerített ki; kontrollként a fejen a kompakt attribútum levétele ugyanúgy 545/301 CSS px-et adott (nem teljes base-futtatás). **Javítás:** 3–4 rövid oszlopra a tényleges kerethez igazodó tördelés és térköz; a három számos minta mellé határeseti teszt nagyobb betűméretű sávban.

## A hibakereső pontok (ítélet + bizonyíték)
1. **Adatszerződés — meglévő hiba (L1), új törést nem találtam.** A panelőr ugyanazt a `blockIndex`-et ugyanabban a fejezetben keresi, mint a rajzoló (`ClipContext.tsx:21–25`, `clip2-overlays.tsx:75–80`). A JSON és az indexelés változatlan.
2. **Biztonság és adatvédelem — próbáltam, nem sikerült megtörni.** Nincs új végpont, origin/CSRF-döntés, URL-paraméter, naplózás vagy írási hívás. A látható táblacím React-szövegcsomópont (`source-visuals.tsx:121`); a követett biztonságos szövegmegjelenítési teszt zöld. Nem külön jogosultsági audit.
3. **Regresszió — próbáltam, nem sikerült megtörni.** A régi `numberLine` a törzsben és a ráúszóban megmaradt; a címpanel is. A gyártó a régi fajtáknál ugyanazokat az indexeket kapja, mint a base-ben: `sourceVisualProblems` rájuk `null`. Az új CSS-osztályok és tokeneik hívói forrás-ábramegjelenítők; a nyomtatási szabály is `.sv-table*`/`.sv-scroll-hint` elemekre korlátozott. Éles bejelentkezett fiókot nem használtam.
4. **Europe/Budapest — nem alkalmazható.** Nincs módosított időzóna- vagy naptári számítás.
5. **Migráció, indítás, cron, leállítás, e2e — séma és életciklus diff nélkül; e2e-t próbáltam, nem tört meg.** A migrációs és Drizzle-fájlok változatlanok; az eldobható PostgreSQL-es e2e elindult, a két célzott spec sikeres.
6. **Ismétlés, megszakítás, időtúllépés — próbáltam, nem sikerült megtörni.** Késleltetett hanggal szüneteltettem, előre és vissza léptem, majd bezártam a lejátszót. Nem maradt ott előző panel. A követett kisfilm-spec futtat elakadó és átmeneti 502-es lekérést is. A poll és hangkezelés nem változott.
7. **Tesztminőség — talált hiba (L3).** A mutáció megmutatja, mit nem érzékel az egységteszt. Az új L2 teszt az őr értékét méri, a JSX bekötését regexszel ellenőrzi, ezért külön bejártam a valós lejátszót. A jelző helyének, a tónustokennek és a V35/V36 hatókörének változása dokumentált; a táblázatteszt a `caption` megmaradását és a látható címet is ellenőrzi (`lesson-source-visual-kinds.test.ts:135–145`). A saját Node-mutációt a homokozó nem indította el.
8. **Szeletspecifikus pontok.** V33: a cím kívül; fekvő mobilon a jelző teteje 53,28, a kereté 81,58 CSS px ugyanabban a scrollpozícióban. Asztalon a tábla elfért (1158/1158 CSS px), jogosan nincs jelző. A mért teljes oldalszélesség 360, 844, illetve 1280 CSS px; az álló, fekvő és asztali képeket szemrevételeztem. V34: a három színes jel és vonal minimuma normál és csendes szelektorral, öt sávban 3,291:1, a „Példa” minimuma 4,758:1. V35: fa, képes kártya és tábla kizárva; L1 külön jegy. V36: három rövid oszlop elfér (301/301 CSS px); L4 a határeset. A követett nyomtatási próba `overflow-x: visible` értéket igazol. V37: az effekt a fejléc-kulcstól függ (`source-visuals.tsx:102–110`); élő fejléc-csere nem volt mérve.
9. **Egyéb — új leletet nem igazoltam.** Hiányzó fejezet és nem ábrára mutató index a követett teszt szerint nem hoz létre panelt. A visszaellenőrzés változása nem nyúl a hanghoz, a színpadhoz vagy a mentéshez.

## Mit próbáltam megtörni, és nem sikerült
- Régi érvényes számegyenes és címpanel eltüntetése; új kizárt panel visszahozása oda-vissza lépkedéssel. Az érvényes számegyenes fekvő képe szünetben készült, így a még el nem indult animáció helyett a rajzoló DOM-ját ellenőriztem.
- Hosszú táblacím levágása és oldalszintű vízszintes túlcsordulás; a saját mérések és a követett 360-as próba alapján a cím elfér. A belső görgetés külön ügy (L4).
- A kontrasztküszöbök megdöntése a változatlan stílussal nem sikerült; a 90%-os mutánsban igen.

## Mit NEM vizsgáltam
- A változatlan, előző körben nem kifogásolt részeket nem auditáltam újra teljes mélységben. Éles leckeadat, bejelentkezett éles fiók, fizetős AI/TTS és valódi filmgyártás nem volt; az üzemi szolgáltatói lánc UNVERIFIED. A gyártói következtetés kódúton és követett kaputeszteken alapul.
- Nem készítettem nyomtatott PDF-et, nem mértem élő fejlécszöveg-cserét, nem próbáltam Safari vagy fizikai telefon alatt. Az oldaltörés, az eszközspecifikus tördelés és az effekt időzítése ezeken az utakon UNVERIFIED.
- A munkafa mutálása helyett tervezett saját Node-próbát a futtató elutasította; sem az L2 védelem nélküli egységtesztjét, sem a V34 mutáns egységtesztjét nem állítom lefuttatottnak.

## Megcáfolt gyanúk
- **„Az új panelőr minden régi ráúszást elnyel.”** A `numberLine` ténylegesen létrejött, a címpanel megmaradt, overlay nélküli jelenetben nincs panel.
- **„A fa és a képes kártya nincs kizárva.”** Mindkettő a közös kizárt készletben szerepel (`lesson-schema.ts:86`), és a böngésző egyiknél sem hoz létre panelt.
- **„Asztalon tévesen hiányzik a görgetésjelző.”** Az első kiolvasás a hiányzó jelzőn hibázott; a megismételt mérés igazolta, hogy a tábla teljesen elfér.

## Mit futtattam (parancs + eredmény)
- `npx tsx --test source/tests/source-visuals-findings.test.ts source/tests/source-visual-contrast.test.ts source/tests/lesson-source-visual-kinds.test.ts source/tests/lesson-clip.test.ts source/tests/lesson-design.test.ts` — 67 sikeres, 0 bukás.
- `npx tsc --noEmit` és `npx tsc --noEmit -p tsconfig.test.json` — mindkettő 0.
- `run_e2e source/tests/lesson-clips.spec.ts source/tests/source-visuals.spec.ts` — 0; a naplóban volt `ResizeObserver`- és duplikált hibanapló-üzenet, diffhez kötésüket nem igazoltam.
- `run_browser_scenario .blind-review-tmp/s2b2-kor2.json` — kisfilm, három képernyőméret, képernyőképek; az asztali null jelző kiolvasását a következő futás javította.
- `run_browser_scenario .blind-review-tmp/s2b2-v36-v34.json` — V34 CSSOM-mutáció és valódi színmérés, asztali kontroll. Az első négyoszlopos próbabemenet üres blokkfeliratát a séma elutasította; javítva a következő futásban.
- `run_browser_scenario .blind-review-tmp/s2b2-v36-l1.json` — érvényes négyoszlopos ellenpélda és hibás régi `cycle` a tényleges lejátszóban, képernyőképekkel.
- `node .blind-review-tmp/s2b2-ellenproba.mjs` — futtatás előtt elutasítva a Node-homokozó hálózattiltási korlátja miatt.

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
| kicsi | 1 | 1 | 1 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (közepes) Meglévő hiba: üres panel a hibás régi cycle hivatkozásánál — `source/shared/lesson-clip.ts:95` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L4** (közepes) A V36 határán négy rövid oszlopnál is görög a tábla — `source/client/src/lesson-runtime/lesson-design.css:309` — hivatkozás igazolt; futtatással igazolt (teljes út)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 20 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 2445
- tokenek: 1638206 bemeneti (ebből gyorsítótárból: 1514602, gyorsítótárba írva: 123544), 18511 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 93.4%; becsült megtakarítás: 5.6319 USD
- költség (a tényleges usage alapján): 0.6456 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
