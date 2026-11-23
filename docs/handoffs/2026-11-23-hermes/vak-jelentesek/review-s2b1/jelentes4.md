# Független review — feat/tgm-s2b1-v2 (4. kör)
Fej: 2c7669fa6f61b421e60bbc8581e084e77d733a4b
## Ítélet: NEM

Az új SVG-elrendezésőr a lecke megnyitásakor is fut. Egy hibátlan kártyablokkot teljesen eltüntet, miközben egy valóban levágott feliratot átenged.

## Az előző kör leleteinek sorsa

- Nem volt korábbi blokkoló. **L7 nem szűnt meg**, továbbra is kicsi, jegyre menő. A rendes `/preview` nézetben két érvényes kártya ismét két `websuli-paper` ID-t kapott (`source/shared/illustration-svg.ts:102,251`); a képernyőképen mindkét háttér rendben megjelent.
- A `dd4e8ba7` merge második szülője a megadott base (`9e292c0f`). A `2c7669fa` új kártyaellenőrzését és tesztjét vizsgáltam; a változatlan részeket nem auditáltam újra, a böngészős mintákat regressziós kontrollként futtattam.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

### L8 — blokkoló: az SVG-elrendezésőr érvényes képeskártya-blokkot tüntet el, a ténylegesen kilógó feliratot pedig átengedi

**Hely:** `source/shared/lesson-visual-params.ts:249`, `:188–201`; a geometria `source/shared/illustration-svg.ts:216–230`; olvasási hívó `source/client/src/lesson-runtime/LessonRuntime.tsx:317–324`.

**Forgatókönyv:** A tanuló 844×390-es fekvő nézetben megnyit egy tárolt leckét. Egy kétkártyás blokk SVG-jén a modell a „Nap” felirat `y` koordinátáját `1.44em`-ben adta meg (`font-size="20"`, `viewBox="0 0 400 240"`). Az `em`-et a tisztító támogatja (`source/shared/svg-contrast.ts:396–407`). A felirat helye ugyanaz, mint `y="28.8"` esetén. Az új őr azonban `parseFloat`-tal `1.44`-et olvas, és a felirat tetejét `1,44 − 20 × 0,8 = −14,56`-ra becsüli. A lejátszó a másik, hibátlan kártyát és az egész blokkot is elrejti. Ugyanez az ellenőrzés a szerzői kimenetből is kivágja a blokkot (`source/server/studio/single-run/engine.ts:135–140`).

**Mért evidencia:** A valódi `/preview` → `LessonView` → `LessonRuntime` lánc szabályos lecke-API-választ kapott. A két azonos geometriájú blokk közül csak az egység nélküli jelent meg. A kontroll SVG-n csak a `y` értékét cserélve a Chromium `getBBox()` mindkét esetben a `[179.431,8.818,41.44,24.683]` dobozt mérte, egészében a rajzterületen belül. A fordított hibát is megmértem: `y="212" dy="52"` esetén az őr figyelmen kívül hagyja a `dy`-t. A „Csapadék” feliratot tartalmazó blokk megjelent, de a felirat teteje SVG-egységben `244,018` volt a `240` magas rajzterületen, és a felirat a képernyőn is teljesen hiányzott (`1-eltolt-kartya-844.jpg`).

**Miért blokkoló:** A `base...head` diff adja a `pictureCards` megjelenítőt; az előző funkcionális fej (`9df94e3c`) `visualParamProblems` ága sikeres sémaellenőrzés után üres hibalistát adott. A `2c7669fa` kötötte a becslést az olvasásban is használt ellenőrzőbe. A tárolt lecke Zod-sémájának változatlansága így nem védi a tanulói nézetet. Szabályos SVG és szokványos lecke-API-válasz elég a reprodukcióhoz; nem kell sérült tároló vagy hibás szolgáltató. A hibátlan blokk eltűnése sérti a tárolt leckére ígért megjelenítést (terv `:39–41`), a levágott ellenpélda pedig a V32 megjelenítési elvárást.

**Javítás:** Válaszd külön a gyártási minőségellenőrzést a teljes blokkot elrejtő olvasási ellenőrzéstől. A geometriát a tisztító `em`/`ex`-et és `dx`/`dy`-t már kezelő koordinátaszámításával egyezően mérd. API-ból betöltött lecke DOM-jában ellenőrizd, hogy az egyenértékű `em` és egység nélküli változat egyaránt megjelenik; a valódi eltolással kilógó példa a gyártási kapun bukjon.

### L7 — kicsi, jegyre menő: a háttér SVG-azonosítója ismétlődik

**Hely:** `source/shared/illustration-svg.ts:251`. Egy tanuló két érvényes kártyát tartalmazó leckét nyit meg 844×390-en. A rendes előnézet egyik kártyablokkjában két `websuli-paper` elemet és egy különböző azonosítót mért a DOM-lekérdezés. A base-ben megvolt a háttérjelölő, de nem volt képeskártya-megjelenítő; az új hívási út kártyánként adja hozzá ugyanazt a jelölőt. Mért tanulói hatás nincs. **Javítás:** a kártyába beillesztett háttér-ID is legyen egyedi, vagy legyen újratisztításkor felismert, nem `id` típusú jelölő; az előtag nélküli régi illusztrációs út ne változzon.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — hiba (L8).** A tisztító engedi az `em`-et, a gyártási becslő máshogy értelmezi, a kliens elrejti miatta a teljes blokkot. A kontrapróba ugyanazon koordináta két szabályos alakját vetette össze.
2. **Biztonság és adatvédelem — a vizsgált SVG-próbát nem sikerült megtörni.** A követett V29 próba a kártyába kerülő HTML-t ellenőrzi; a tisztítóteszt szerint a tiltott elemek és attribútumok kiesnek. A diff nem módosít HTTP-útvonalat, tokent, origin-ellenőrzést vagy GET-mellékhatást. Az új hibaszöveg SVG-feliratot tartalmazhat, amelyet a meglévő motor naplózhat; éles naplóhozzáférést nem auditáltam.
3. **Regresszió — hiba (L8) a tárolt képeskártyás leckében.** A névtelen `/preview` ellenpéldája mellett a régi leckealakok és a KI állapotú Stúdió-kérések lenyomattesztje zöld. A hagyományos `illustration` ágon a helyi regressziós tesztek átmentek.
4. **Időzóna/dátumhatár — nem alkalmazható.** A vizsgált ágdiff nem olvas dátumot; a merge e-mailes változása a megadott base része.
5. **Migráció/Drizzle, indítás/cron/leállítás — nincs diff ezen a rétegen.** A követett Playwright-spec eldobható PostgreSQL-lel, migrációkkal és e2e-szerverrel elindult és átment. Éles indítási ciklust nem futtattam.
6. **Versenyhelyzet/időtúllépés — az új ellenőrzésre versenyhelyzet nem alkalmazható.** Szinkron függvényhívás; azonos lezárt API-válaszban a kontroll megjelent és az `em`-változat hiányzott. Terhelést és gyártási időkeretet nem mértem.
7. **Tesztminőség — rés az L8 körül.** A `source/tests/lesson-tree-cards.test.ts:149–154` méri az abszolút koordinátás kilógás elutasítását, de a „megjelenítés nem változik” állításhoz csak a fajta listatagságát ellenőrzi. A teljes úton futó paramétermutáció (`28.8` → `1.44em`) megmutatta, mit nem fed le. Kódsor-eltávolításos mutációt nem tudtam futtatni. Meglévő viselkedési elvárás gyengítését nem láttam; a katalógusteszt a még nem hirdetett fajtákkal bővül, az S3a halasztását a terv rögzíti.
8. **Feladatspecifikus — V29, V30 és V31 pozitív esetei zöldek; V32 részben hibás (L8).** V29: 4 szint, 1 ág, 14 csomópont és 9 kártya elutasítva, SVG-tisztítási teszt zöld. V30: mindkét új fajta KI-nál elutasítva, a KI-lenyomat zöld. V31: a fedettségi teszt a két megfelelő blokkot `shown`-nak mérte. V32: a levelek ugyanannak a listának a gyerekei, a három előírt nézetben a mintán az oldal vízszintes túlcsordulása 0 px, de az eltolt SVG-felirat a rendes nézetben levágódik. A fa beágyazott lista; a kártyakép `role="img"` alatt megkapja a címkéjét (`apple` a böngészőben). A `.sv-pcard*` és `.sv-card` szelektorok különállnak (`lesson-design.css:407–418`); a követett spec a régi összehasonlítókártyát is futtatja.
9. **Egyéb — L7 fennáll.** A gradient-ID-k elkülönítésének zöld tesztje nem bizonyítja az összes ID egyediségét; a háttérjelölőt külön mértem.

## Mit próbáltam megtörni, és nem sikerült

- A KI állapotú modellhatárt és a régi leckealakokat a követett lenyomat- és olvasásitesztekkel; eltérést nem találtam.
- A minta kis fáját, 13 csomópontos fáját és nyolc kártyáját mindhárom kért nézetben. Az álló és fekvő képeken a kis fa vezetővonala, a lista és a kártyarács a vizsgált mintán rendben volt; a kis fa 360 px-en `grid`, 844 és 1280 px-en `flex`. Ez nem cáfolja a külön SVG-ellenpéldát.
- A követett SVG-tisztítási, kontraszt- és idempotenciatesztek a régi ábrákon nem mutattak regressziót.

## Mit NEM vizsgáltam

- Nem futtattam élő modellgyártást, bejelentkezett tanári publikálást vagy DB-ből olvasott konkrét képeskártyás rekordot. A próbában csak az API-válasz volt helyettesítve; a kliens a rendes megnyitási láncon futott. Az éles naplóhozzáférés és a nagy SVG-tömbök időkerete UNVERIFIED.
- Nem ellenőriztem a képernyőolvasós/billentyűzetes végigjárást, Safari/Firefox viselkedést vagy rendszer-szintű sötét módot. A Chromium-próbában a `dark` osztályt beállítottam, de a képeken a lecke sávfelülete világos maradt; ez nem teljes sötéttéma- vagy kontrasztmérés.
- A saját Node-ellenpróbát a futtató a Node 24 jogosultsági korlátja miatt nem indította. Kódszintű őreltávolítást és külön szerveroldali mutációs futást nem igazoltam; a fő leletet a teljes böngészős út bizonyítja.

## Megcáfolt gyanúk

- A `y="12%"` is eltűnt, de ezt nem tulajdonítottam az új őrnek: az előzetes tisztító eleve csak számot, `px`, `em`, `ex` egységet enged szövegpozícióként (`svg-contrast.ts:400–407,567–571`). Az L8 mért bemenete támogatott `em` egység.
- Az ismétlődő háttér-ID a mért esetben nem eredményezett háttérhibát; L7 nem blokkoló.

## Mit futtattam (parancs + eredmény)

- `npx tsx --test source/tests/lesson-tree-cards.test.ts source/tests/source-visuals-flag.test.ts source/tests/lesson-source-visual-kinds.test.ts source/tests/source-coverage-gate.test.ts source/tests/illustration-svg.test.ts source/tests/studio-author-catalog.test.ts` — 95/95, kilépés 0.
- `npx tsx --test source/tests/svg-contrast.test.ts` — 15/15, kilépés 0. `npx tsc --noEmit` — 0.
- `run_e2e source/tests/source-visuals.spec.ts` — kilépés 0 az eldobható PostgreSQL-es környezetben; a ResizeObserver-/hibanaplózási zajt nem tulajdonítottam a diffnek.
- `run_browser_scenario .blind-review-tmp/kartya-kapu.json` — kilépés 0, négy eset; tárolt leckében L7, három nézetben regressziós képek, 0 px oldaltúlcsordulás.
- `run_browser_scenario .blind-review-tmp/kartya-em.json` — az első leírás túl hosszú esetnév miatt nem indult; rövid névvel kilépés 0. A kimenet és a kép reprodukálta L8-at; a kilépési kód a mérések lefutását jelzi, nem a megjelenítés helyességét.
- `node .blind-review-tmp/kartya-kapu.ts` — a futtató nem indította (Node v24.22.3, hálózati sandbox hiánya).

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 1 | 1 | 1 | 0 | 0 |
| közepes | 0 | 0 | 0 | 0 | 0 |
| kicsi | 1 | 1 | 1 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L8** (blokkoló) Az SVG-elrendezésőr érvényes tárolt kártyablokkot tüntet el, levágott feliratot átenged — `source/shared/lesson-visual-params.ts:249` — hivatkozás igazolt; futtatással igazolt (teljes út)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 20 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 3167
- tokenek: 1398747 bemeneti (ebből gyorsítótárból: 1286508, gyorsítótárba írva: 112179), 18690 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 92.5%; becsült megtakarítás: 4.7766 USD
- költség (a tényleges usage alapján): 0.5961 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
