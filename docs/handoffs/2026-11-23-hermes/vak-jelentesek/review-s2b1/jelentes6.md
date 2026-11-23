# Független review — feat/tgm-s2b1-v2 (6. kör)
Fej: 4b14b37e86390682507c04caada879e03cc0abd1
## Ítélet: NEM
A KI állapotú régi illusztráció regressziója megszűnt. Az új kártyaőr viszont kihagyja a mérhető feliratot, ha egy attól független alakzat százalékos koordinátát használ.

## Az előző kör leleteinek sorsa
- **L9 — megszűnt.** A `git diff base...head` már nem módosítja az `illustrationLayoutProblems` törzsét (`source/shared/illustration-svg.ts:197–237`); a `source/shared/svg-contrast.ts`-ban nincs eltérés. Az `illustration` a `source/shared/lesson-visual-params.ts:246–251,265–267` szerint a régi ellenőrzés eredményét kapja. A pontos korábbi SVG-bemenettel a követett regresszióteszt (`source/tests/lesson-tree-cards.test.ts:206–217`) zöld: az `y=220` sor becsült alja ismét `220 + 20 × 0,2 = 224`, a 240 magas rajzon belül. A KI kapcsolós Stúdió-motorteszteken a kéréslenyomatok, a modellhibák és a tárolt régi lecke olvasása is egyeztek. A pontos L9-bemenetet a paraméterhatáron futtattam; a foltba illesztését a kódban követtem.
- **L7 — nem szűnt meg, továbbra is kicsi.** Az új Preview-próba is két azonos papírháttér-ID-t mért, funkcionális kárt nem mutatott.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

### L10 — blokkoló: egy díszítő téglalap koordinátája kikapcsolja a kártya feliratellenőrzését

**Hely:** `source/shared/lesson-visual-params.ts:270–281`; hívó: `source/server/studio/visual-patch.ts:62–70,88–105`.

**Forgatókönyv:** Egy tanár BE kapcsolóval készít leckét. Az Ábrák állomás két képes kártyát ad. A magasságot mutató rajz egyik díszítő téglalapján `x="10%"` van. A „Magasság” feliratnak ettől független, egység nélküli `x="370"`, `y="215"` koordinátája van a `0 0 400 240` nézetben. A folt gyártási őre a százalékos **téglalap** miatt nem hívja meg a helybecslőt. A tanuló telefonján a rajzban csak „Ma” látható. Ez nem a terv dokumentált kivétele: a százalék nem a feliratot pozicionálja (`docs/specs/2026-11-22-tgm-s2b1-dontesi-fa-kepes-kartya.md:78–89`).

**Evidencia, ellenpróba és base:** A valódi `/preview/review-l10` lejátszót szabályos lecke-API-fixtúrával nyitottam meg. A tisztítón átment SVG-ben 360×640-en a `getBBox()` szerint a felirat jobb széle 471,32 SVG-egység, a rajz határa 400, az SVG túlcsordulása `hidden`. 844×390-en 470,35 a jobb szél; mindkét képen látszik a levágás (`1-L10-kartyak-360.jpg`, `2-L10-kartyak-844-dark.jpg`). A védelmet az alkalmazás által kirajzolt SVG-n próbáltam megcáfolni: csak a téglalap `x` értékét cseréltem `10%`-ról `40`-re. A téglalap mért x-e mindkétszer 40, de a fejen lévő reguláris kifejezés eredménye `false` → `true`. Az azonos feliratra a közös becslő `370 + 8 × 20 × 0,55 = 458` jobb szélt ad, ami meghaladja a 401-es tűréshatárt (`source/shared/illustration-svg.ts:216–230`). A szerveroldali beillesztést a kódban követtem: `false` esetén a korai `return []` átugorja a hibát; a folt utána típust és fogalomcímkét ellenőriz, geometriát már nem. Az előző fej (`c0adcf78`, a `git show head` törölt sora) sikeres tisztítás után feltétel nélkül hívta a becslőt; annak akkori és mostani képlete ezen az eltolás nélküli feliraton azonos. A base (`dfe2ac50348a43f7b027bd11865121fff641e451`) `ANIM_KINDS` listájában nincs `pictureCards`, ilyen folt nem kerülhetett be. A mért hibát az új kártyaút és az utolsó commit kihagyási feltétele teszi lehetővé a tervben kért gyártási védelem ellenére. Nem kell hozzá sérült adat vagy rendellenes API-válasz.

**Javítás:** A tisztított DOM-ban a `text` / `tspan` tényleges pozicionáló attribútumait nézd, ne a teljes szerializált SVG-t. Csak azt a feliratot hagyd ki, amelynek helye nem becsülhető. A régi `illustration` és a tárolt lecke olvasási útja maradjon változatlan. Legyen foltszintű regresszióteszt az azonos helyű `rect x="10%"` és `rect x="40"` párra: a kilógó felirat miatt mindkettő bukjon.

### L7 — kicsi, jegyre: ismétlődő `websuli-paper` ID

`source/shared/illustration-svg.ts:102,251`: a tanuló két kártyát nyit meg a Preview-ban; mindkét papírháttér `id="websuli-paper"`. A 360×640-es futásban a DOM-számláló 2. A base is használta ezt a jelölőt, a kártyánkénti út kihagyja a névterezésből. Nem mértem hibás rajzot vagy rossz hivatkozásfeloldást. **Javítás:** a többrajzos úton használj egyedi vagy nem `id` típusú háttérjelölőt úgy, hogy az újratisztítás idempotens, a régi előtag nélküli út változatlan maradjon.

## A hibakereső pontok (ítélet + bizonyíték)
1. **Adatszerződés — talált hiba.** Egy sémán és tisztítón átmenő, mérhető feliratot az Ábrák állomás őre kihagy (L10). V29 fa- és kártyahatárai, V30 modellhatára, valamint V31 `shown` besorolása a követett tesztekben zöldek (`source/tests/lesson-tree-cards.test.ts:21–77,137–142`).
2. **Biztonság és adatvédelem — próbáltam, nem sikerült megtörni.** A követett tisztító- és renderpróbák eltávolítják a szkriptet és az eseményattribútumot; a módosult kártyaőr már a tisztított SVG-t kapja (`source/shared/lesson-visual-params.ts:270–276`). Az utolsó commit nem érint végpontot, hitelesítést, tokenkezelést vagy GET-mellékhatást.
3. **Regresszió — a korábbi L9 nem reprodukálható.** A pontos SVG-t futtattam a paraméterhatáron, a közös becslőt összevetettem a base-szel. A névtelen Preview-ban valós lejátszón nyílt meg az új ábra; a régi anyag olvasását és a Stúdió KI kéréseit a `source-visuals-flag.test.ts` ellenőrizte. A promptkatalógus őre szerint az új fajták nem kerültek a hirdetett listába.
4. **Europe/Budapest — nem alkalmazható.** A változtatás SVG-geometriát és paramétereket érint; nincs dátum, időzóna vagy időzítéshez kötött döntés a módosult ágban.
5. **Migráció / Drizzle / indítás / e2e — az adatbázis- és ütemezési változás nem alkalmazható.** A diff nem érint migrációt, Drizzle-sémát vagy cron-konfigot; a követett e2e-spec az eldobható PostgreSQL-lel elindult és 0-val zárt.
6. **Párhuzamosság, ismétlés, megszakítás — az új őrre nem alkalmazható.** Az ág szinkron, egyetlen kártya helyi DOM-szövegéről dönt, állapotot nem tárol. Az ismételt SVG-tisztítás idempotencia-próbája zöld. A teljes gyártó futás megszakítását nem terheltem.
7. **Tesztminőség — lefedettségi rés az L10-ben.** A zöld kaputeszt csak homogén rajzokat próbál; a `dy` elvárás módosítása dokumentált (`source/tests/lesson-tree-cards.test.ts:187–203`, terv 86–89). Az egyattribútumos böngészős mutáció változatlan geometriával megfordította az őr döntését. A forrásból kivett védő soros mutációt a homokozó nem tette lehetővé.
8. **Felület, akadálymentesség, CSS — L10.** A követett V32-próba mindhárom nézetben zöld a mérőleckén. Saját 1280×800-as mérésben a fák 3, 10 és 13 csomópontosak, a két levél azonos lista gyereke, 8 kártya jelent meg, a mért HTML-feliratok levágásainak száma és az oldalszintű túlcsordulás 0; a képeken nem láttam átfedést. A 360×640-es és a 844×390-es ellenpéldán a belső SVG-szöveg levágódik. A kép `aria-label` értéke a böngészőben „A háromszög magassága”. A fa statikus, egymásba ágyazott lista, nincs fókuszt igénylő ágművelet. A `.sv-pcard*` osztályok elkülönülnek a `.sv-card*` családtól (`source/client/src/lesson-runtime/blocks/tree-cards.tsx:84–90`, `source/client/src/lesson-runtime/lesson-design.css:407–417`).
9. **Egyéb — L7.** Két, külön tisztított rajzon megszámoltam a papírháttér-azonosítókat; a duplikáció megmaradt, konkrét vizuális kár nem mutatkozott.

## Mit próbáltam megtörni, és nem sikerült
- A korábbi `text dy` / két abszolút `tspan y` bemenettel nem tudtam újra kiváltani a régi illusztráció téves kilógási hibáját. A kártyákra korlátozott ág nem módosítja ezt az eredményt.
- A KI sémáján az új fajtákat, valamint a régi Stúdió-kimeneten a kéretlen mezőket próbáló követett ellenpróbák nem jutottak át. A 4 szintű, 1 ágú, 14 csomópontos fa és a 9 kártyás csomag elutasítása zöld.
- A szokásos fa- és kártyamintával nem okoztam oldalszintű vízszintes görgetést; az L10 ellenpélda is az SVG-n belül vág, nem az oldalt szélesíti ki.

## Mit NEM vizsgáltam
- Nem futott saját szerveroldali `applyVisualPatch`-próba, forrásmutáció vagy éles modellhívás az L9/L10 pontos bemenetével. A futtató Node v24.22.3 alatt visszautasította a saját szkriptet; az L10-nél a Preview és az őrfeltétel mért, a szerveroldali következmény a hívási láncból ellenőrzött. Nem ellenőriztem az ilyen generálás teljes adatbázisos mentési útját.
- Nem volt képernyőolvasós vagy teljes billentyűzetes próba, valódi bejelentkezett munkamenet, Firefox/Safari. A 844×390-es ellenpróbán a `dark` osztályt kényszerítettem, nem felhasználói témaváltást végeztem.
- A korábban nem kifogásolt, változatlan felületet, a gyártás folytatását/időtúllépését és a dokumentált S2b-2/S3a tételeket nem auditáltam újra. Az e2e mellékes naplófigyelmeztetéseinek okát nem izoláltam.

## Megcáfolt gyanúk
- A közös helybecslő visszaállítása nem hagyott másik aktív kártyaszűrőt a régi `illustration` útján: a `kind !== "pictureCards"` ág a régi eredményt adja vissza.
- A dokumentált `em`/`dy` kivétel nem magyarázza az L10-et: a felirat koordinátája nem változott, csak a rajz másik elemének geometriailag egyenértékű attribútuma.

## Mit futtattam (parancs + eredmény)
- `npx tsx --test source/tests/lesson-tree-cards.test.ts source/tests/source-visuals-flag.test.ts source/tests/visual-patch.test.ts source/tests/illustration-svg.test.ts source/tests/svg-contrast.test.ts source/tests/lesson-source-visual-kinds.test.ts source/tests/source-coverage-gate.test.ts source/tests/studio-author-catalog.test.ts` — 118/118 zöld; az egységfutás DB-figyelmeztetést is naplózott.
- `npx tsx --test source/tests/lesson-tree-cards.test.ts` — 13/13 zöld, az L9 pontos SVG-jével együtt.
- `npx tsc --noEmit` — 0.
- `run_e2e source/tests/source-visuals.spec.ts` — 0, eldobható PostgreSQL/Chromium.
- `run_browser_scenario .blind-review-tmp/s2b1-kor6-browser.json` — az előpróbán a kiértékelés `null`, nem használtam mérésként. `run_browser_scenario .blind-review-tmp/s2b1-kor6-mares.json` — 3 eset, 0; a képernyőképeket és a DOM-méréseket ellenőriztem.
- `node .blind-review-tmp/s2b1-kor6.ts` — a homokozó elutasította, nem futott.

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
- **L10** (blokkoló) Egy díszítő téglalap koordinátája kikapcsolja a kártya feliratellenőrzését — `source/shared/lesson-visual-params.ts:276` — hivatkozás igazolt; futtatással igazolt (teljes út)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 20 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 2687
- tokenek: 1417589 bemeneti (ebből gyorsítótárból: 1295768, gyorsítótárba írva: 121761), 18060 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 92.0%; becsült megtakarítás: 4.8022 USD
- költség (a tényleges usage alapján): 0.6147 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
