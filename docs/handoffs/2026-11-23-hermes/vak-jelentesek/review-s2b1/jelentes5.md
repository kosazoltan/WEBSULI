# Független review — feat/tgm-s2b1-v2 (5. kör)
Fej: c0adcf7842e818b99c9834c82be056781b6ee01b
## Ítélet: NEM
Az L8 eredeti reprodukciója megszűnt, de a javítás a régi `illustration` fajtára is módosította a gyártási kaput. Így alapértelmezett, KI kapcsolónál egy jól kirajzolható illusztráció kimarad az új leckéből (L9).

## Az előző kör leleteinek sorsa

- **L8 — megszűnt az eredeti reprodukción.** `source/shared/lesson-visual-params.ts:200–205,246–273` és `source/server/studio/visual-patch.ts:62–70`: a lejátszó a kártyáknál a kirajzolhatóságot ellenőrzi; a geometriai őr csak az ábrafolton fut. A saját 844×390-es `/preview` próbában mindkét kártyablokk és mind a négy SVG bekerült a DOM-ba. A `y="28.8"` és `y="1.44em"` változat függőleges `getBBox()` határa egyaránt 8,82–33,50 volt (`1-azonos-em-kartyak-844.jpg`). A `y="212" dy="52"` változat felső határa 244,02 a 240 magas `viewBox`-ban: a tárolt blokkot ettől már nem rejti el a lejátszó. Az ábraállomás ellenőrzőjét közvetlenül hívó követett teszt (`source/tests/lesson-tree-cards.test.ts:187–202`) mindkét jó változatot elfogadta és a valóban eltolt változatot elutasította.
- **L7 — nem szűnt meg, kis jegy marad.** Ugyanabban a rendes Preview-ban egy kétkártyás blokkon belül két `websuli-paper` ID van. Nem mértem tanulói hibát; nem súlyosbítom.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

### L9 — blokkoló: KI kapcsolónál a gyártó kidob egy jól megjelenő régi illusztrációt

**Hely:** `source/shared/illustration-svg.ts:220–229,234–235`; hívási lánc: `source/server/studio/single-run/engine.ts:833–845` → `source/server/studio/visual-patch.ts:62–70,103–105` → `source/shared/lesson-visual-params.ts:246–251,265–267`.

**Forgatókönyv:** Egy tanár Stúdió-leckét gyártat az alapértelmezett, KI `STUDIO_SOURCE_VISUALS` beállítással. A 4. állomás hagyományos `illustration` foltban küld egy háromszögrajzot. Két, abszolút `y`-nal pozicionált `tspan` (`150`, `220`) van a `dy="32"` eltolással megadott közös `<text>` elemben. Mindkét felirat a tanításból jön. A folt sémája ezt a régi ábrafajtát átengedi, de az új őr a szülő `dy` értékét mindkét szövegrészre ráadja. Az „Alap” feliratra tévesen kilógást jelent, ezért a folt nem illeszti be az ábrát. A fejezet esetleges pótló `process` blokkja nem hozza vissza a háromszögrajzot.

**Evidencia és base-összevetés:** A valódi `/preview/review-l8` útvonalon szabályos lecke-API-válasszal, 844×390-en az alkalmazás tisztítóján átment SVG-n mértem. A `getBBox()` szerint a két szöveg függőleges tartománya 162–186,80 és 200–224,80 SVG-egység; nem fedik egymást, és mindkettő a 240 magas rajzterületen belül van (`1-regi-illusztracio-844.jpg`). Ugyanezen DOM-adatokkal a `git show base:source/shared/illustration-svg.ts` és a fej kilógásképletét is kiértékeltem a böngészőben. A base a második sor aljára `220 + 20 × 0,2 = 224`-et számít; a fej `220 + 32 + 20 × 0,2 = 256`-ot, ami túllépi a `240 + 1` tűrést. A base becslésében a két sor nem fed át; a 20-as betű teljesíti a méretellenőrzést (`20 × 317 / 400 = 15,85 > 11,5`). A `base...head` diffben az új `dy`-visszaesés okozza az eltérést. A régi `illustration` már a base-ben is ezt az őrt hívta; a kapcsoló csak a folt sémáját választja ki, nem védi az ellenőrzést. A render és a geometria mért; a gyártási elutasítás a bejárt hívási láncból következik, nem külön gyártómotor-futtatásból. A hiba nem igényel sérült tárolót vagy érvénytelen modellválaszt, és megsérti a KI működés főági azonosságát.

**Javítás:** Ebben a szeletben a régi `illustration` úton tartsd meg a base elrendezésellenőrzését. A kártyák új becslése ne olvassa újra a szülő `dx`/`dy` attribútumát minden `tspan` eltolásaként; használjon közös, sorrendben léptetett SVG-szövegkurzort. Legyen `applyVisualPatch`-regresszióteszt a KI állapotú, többsoros régi ábrára az egyszerű `em`/`dy` kártyatesztek mellett.

### L7 — kicsi, jegyre menő: ismétlődő papírháttér-ID

**Hely:** `source/shared/illustration-svg.ts:102,256`. A tanuló 844×390-es Preview-ban két kártyát nyit meg; a DOM-ban mindkét háttér azonos `websuli-paper` ID-t kap. A jelölő a base-ben is létezett, de az új megjelenítő kártyánként adja hozzá és kihagyja a névterezésből. Funkcionális eltérést nem mértem. **Javítás:** a többrajzos út is egyedi azonosítót kapjon, vagy az újratisztítás nem `id` típusú jelölőt használjon; az előtag nélküli régi út maradjon változatlan.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — talált hiba (L9).** Az enum és a tárolt lecke sémája átmegy; a következő, gyártási lépés tér el. V29 határtesztjei és V31 forrásfedettségi tesztje zöld. V30 új fajtákra vonatkozó enum- és lenyomatpróbája is zöld, de nem ellenőrzi ezt a régi SVG-változatot.
2. **Biztonság és adatvédelem — nem sikerült megtörni a vizsgált határt.** A V29 SVG-tisztítási teszt nem talál beszúrt szkriptet vagy eseményattribútumot a renderben; az L8-javítás nem változtatott az SVG beillesztési útján. Új kérés, tokenátadás, GET-mellékhatás vagy origin-kezelés nincs a mostani javításban.
3. **Regresszió — talált hiba (L9).** A közös őr régi gyártási hívója érintett. A tárolt régi `illustration` a valódi Preview-ban helyesen megjelent, és a régi leckealakok olvasási lenyomatai átmentek. Az új fajták a katalógusteszt szerint továbbra sincsenek a szerzői promptban.
4. **Europe/Budapest, dátumhatár — nem alkalmazható.** A javított kapu és geometria idő- és dátumfüggetlen.
5. **Migráció, Drizzle, indítás/cron — nem alkalmazható a módosításra.** Nincs ezekhez tartozó diff. A követett böngészős teszt eldobható PostgreSQL-lel elindult és átment.
6. **Verseny, ismétlés, megszakítás — nem alkalmazható az új ellenőrzőre.** Szinkron, a folt bemenetéből számol; a javítás nem változtatott újrapróbáláson, írási sorrenden vagy időkorláton. Az e2e naplóban megjelent ResizeObserver-figyelmeztetés és naplózási egyediségütközés; kapcsolatuk a vizsgált változással UNVERIFIED.
7. **Tesztminőség — az L8 tesztje viselkedést mér, de L9-et nem fedi.** A `lesson-tree-cards.test.ts:192–202` az olvasási és gyártási eredményt külön méri, de csak egyszerű, `tspan` nélküli SVG-vel. A saját böngészős ellenpróbában ugyanazon mintán a régi képlet alkalmazásával megszűnt a hamis kilógás. A forráskód-mutációt a futtató nem engedte. A két út szétválasztását a terv `:83–85` dokumentálja.
8. **Megjelenítés és akadálymentesség — a mintán nem sikerült megtörni; L7 azonosítóhiba megmaradt.** V32 követett spec átment. A saját mérésben a dokumentum szélessége rendre 360, 844 és 1280 px, a viewporttal egyenlő; az Igen/Nem fa első listájában két közvetlen gyermek van. Megnéztem az álló, fekvő és asztali képeket: a látható szövegnél nem találtam átfedést vagy levágást. A fa statikus lista, nincs működtetendő, elérhetetlen vezérlő. Mind a nyolc kártyának van `role="img"` és `aria-label` jelölése, `.sv-card` osztályt nem kaptak. A `.dark` próbában a lecke sávjának felülete világos maradt, így ez nem teljes értékű natív sötéttéma-ellenőrzés.
9. **Egyéb — talált hiba (L9).** A koordinátaparser megosztása nem biztosítja a szövegszakaszok azonos pozicionálását. A tisztító sorrendben léptetett kurzort használ (`source/shared/svg-contrast.ts:420–455`); a geometriai őr minden résznél újraolvassa a szülő eltolását.

## Mit próbáltam megtörni, és nem sikerült

- Az egyenértékű `em`/egység nélküli kártyák és a ténylegesen eltolt kártya visszaolvasását: mindkét blokk megjelent, miközben a követett tesztben az eltolt változat a gyártási ellenőrzőn elbukott.
- A három nézet oldalszélességét, a két levél közös szülőjét és a kártyák saját osztályait: a vizsgált mintákon nem jött elő regresszió.

## Mit NEM vizsgáltam

- Nem futtattam élő modellt, saját végponttól végpontig tartó gyártást vagy valódi tanári fiókos közzétételt. A saját Node-próbát a homokozó Node-verziója elutasította; az egyedi foltra nincs mért szervernapló vagy közzétételi eredmény.
- Nem mértem natív képernyőolvasóval, mobil Safari/Firefox alatt vagy a rendszer natív sötét témájával; ezek eltérései UNVERIFIED. A korábban nem kifogásolt, változatlan útvonalakat és az S2b-2 későbbi feladatait nem auditáltam újra.

## Megcáfolt gyanúk

- Az L8 szabályos `em` koordinátája továbbra is eltünteti a teljes kártyablokkot: cáfolja a rendes Preview és az egyező DOM-geometria.
- A KI állapotban jelentkező eltérés a régi Zod-enumból vagy egy tárolt lecke érvénytelenítéséből ered: a régi ábra a Preview-ban megjelenik, az eltérés a gyártási elrendezésőrben van.

## Mit futtattam (parancs + eredmény)

- `npx tsx --test source/tests/lesson-tree-cards.test.ts source/tests/source-visuals-flag.test.ts source/tests/illustration-svg.test.ts` — 38/38 zöld; a környezet DB-csatlakozási figyelmeztetést adott, ez a futás nem DB-teszt.
- `npx tsx --test source/tests/studio-author-catalog.test.ts` — 4/4 zöld.
- `npx tsc --noEmit` — sikeres.
- `run_browser_scenario .blind-review-tmp/l8-preview.json` — sikeres Preview-mérés és két képernyőkép; az első futásban nem meghívott JS-kifejezéseket javítva újrafuttattam.
- `run_browser_scenario .blind-review-tmp/fa-kartya-nezetek.json` — sikeres háromnézetes mérés és öt képernyőkép.
- `run_e2e source/tests/source-visuals.spec.ts` — 0 kilépési kód.
- `node .blind-review-tmp/kontroll-kapu.ts` — a homokozó elutasította; nem tekintettem lefutott próbának.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 1 | 1 | 0 | 1 | 0 |
| közepes | 0 | 0 | 0 | 0 | 0 |
| kicsi | 1 | 1 | 1 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L9** (blokkoló) KI kapcsolónál a gyártó kidob egy jól megjelenő régi illusztrációt — `source/shared/illustration-svg.ts:220` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: scenario)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 27 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 2897
- tokenek: 2222038 bemeneti (ebből gyorsítótárból: 2083756, gyorsítótárba írva: 138201), 19995 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 94.2%; becsült megtakarítás: 7.7801 USD
- költség (a tényleges usage alapján): 0.7540 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
