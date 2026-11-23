# Független review — feat/tgm-s2b2-megjelenito-leletek
Fej: 53dacccb9f55a48a59dee8eca2467703181f9f4d
## Ítélet: IGEN, FELTÉTELLEL

Négy lelet megy jegyre. A base-hez (`ae57953ada7e87b30f2384db5275d8ca3fffc8f1`) képest nem találtam igazolt blokkoló regressziót a forrás-ábra nélküli leckékben, illetve új adatírást vagy biztonsági határátlépést. A V35 csak részben teljesül: az öt forrás-ábrafajta kiszűrése működik, de a hibás régi ábrák szűrése nem.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

- **L1 — közepes, meglévő hiba: a hibás régi ábra továbbra is választható a kisfilmhez (V35).** `source/shared/lesson-clip.ts:95`. Ha egy 6. osztályos leckében `cycle` blokk maradt `{ phases: [] }` paraméterrel, az olvasási séma átengedi (`source/shared/lesson-schema.ts:152–159`). A régi fajtát a `sourceVisualProblems` ellenőrzés nélkül `null`-lal engedi át (`source/shared/lesson-visual-params.ts:200–205`); az öt új fajtánál a rövidzár miatt meg sem hívódik. Ezért a hibás blokk indexe bekerül a forgatókönyvíró promptjába, és a kapu egy rá mutató hivatkozást elfogad (`source/server/lesson-clips.ts:202–215,383`). A 360×640-es böngészőpróbán a tanuló a jelenetre lépve csak üres fehér panelt kapott: `.clip2-visual` volt, ábra nem (`CycleAnim` visszatér `null`-lal). A base mindegyik `animate` indexet átengedte, és ugyanazt a rajzolót hívta; a diff ezt a régi hibát nem rontotta, hanem a V35 ígérete ellenére meghagyta. **Javítás:** a kisfilmhez külön, a megjelenítő tényleges érvényességével egyező alkalmassági ellenőrzés kell; a modellnek szóló szigorúbb minőségi kaput ne alkalmazzák vakon a még kirajzolható régi ábrákra. Teszt: érvényes és hibás régi blokk vegyesen, prompt és lejátszott jelenet ellenőrzésével.
- **L2 — kicsi: a kizárt forrás-ábra helyén látható fehér csík marad.** `source/client/src/lesson-runtime/clips/clip2-overlays.tsx:78`. Egy már eltárolt, döntési fára mutató kisfilmben a tanuló telefonon a jelenetre lapoz: a gyerekkomponens `null`, de a `Clip2Player` ettől még kirajzolja a festett `.clip2-panel` szülőt (`source/client/src/lesson-runtime/clips/Clip2Player.tsx:97`, `source/client/src/lesson-runtime/clips/lesson-clips2.css:16–24,62–68`). A 360×640-es próbán a fa és a képes kártya hivatkozásánál is 0 gyermekes, fehér, 252×15 CSS px-es panelt mértem a DOM dobozából; a csík a képen is látszik. A base az érvényes fa esetén még a tartalmat renderelte; a diff az üres keretet hagyja meg. Ez csak forrás-ábrás jelenetet érint, nem a kapcsoló nélkül kiadott leckéket. **Javítás:** a `lessonVisual` panelt csak akkor hozza létre a lejátszó, ha a hivatkozott blokk megjeleníthető; a böngészős teszt az üres panel hiányát is ellenőrizze.
- **L3 — kicsi: a V34 egységteszt a fejléc keverési arányát nem a CSS-ből veszi.** `source/tests/source-visual-contrast.test.ts:42`. Ha egy későbbi stílusmódosítás 14%-ról 90%-ra emeli a keverést, az új egységteszt továbbra is ugyanazokat a hex tokeneket olvassa, ugyanazzal a `0.14` konstanssal számol, és az ellenőrzött szelektorminták sem változnak. A valódi fejléc stílusszabályát ideiglenesen mutáltam Chromium CSSOM-ban: az `explorer/a` jel és vonal kontrasztja 3,801:1-ről 1,185:1-re esett. A fej mutáció nélkül eléri a küszöböket; az egységteszt vakfoltját a két változat azonos tesztbemenete igazolja, nem újrafuttatott mutáns egységteszt. A követett Playwright-próba részben védi ezt: a tényleges `a` vonalat méri négy normál sávban (`source/tests/source-visuals.spec.ts:261–281`), nem az összes tónust és csendes állapotot. **Javítás:** a küszöböket a tényleges számított színekből ellenőrizni mind az öt sávban, normál és csendes állapotban, a jelre, vonalra és címkére.
- **L4 — közepes: a rövid celláktól a többoszlopos tábla még nem lesz görgetésmentes (V36).** `source/client/src/lesson-runtime/lesson-design.css:309`. Egy 2. osztályos tanuló 360 px-es kijelzőn megnyit egy rövid statisztikai táblát (`Sorszám | Hónap | Nap | Minimum | Maximum | Átlag | Medián | Darabszám`); a fejléc és az adatsor minden cellája legfeljebb 9 karakteres. A tényleges lejátszóban `data-compact=true`, de a keret `scrollWidth=808`, `clientWidth=301`; az oldal maga 360 px marad. A kompakt szabály leveszi a `min-width` értékeket, de az automatikus táblaméretezésnél az egyszavas cellák `overflow-wrap: break-word` mellett továbbra is szélességet kényszerítenek ki. A háromoszlopos `1 | 2 | 3` minta valóban elfér; a base a többoszlopos esetre eleve görgetést engedett, így ez nem kiadottlecke-regresszió. **Javítás:** a kompakt mód szélességét ténylegesen a rendelkezésre álló helyhez igazítani (tördelhető cellák és kisebb térköz, vagy keskeny alternatív nézet); ha a szándék csak a néhány oszlopos esetre vonatkozik, szűkítsék a V36 feltételét és teszteljék az oszlopszám határát.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — talált hiba (L1).** A kisfilm tárolási sémája és az indexek jelentése változatlan: az index továbbra is az eredeti blokktömbbe mutat, a szűrés nem számozza újra. A leckeolvasás és a rajzoló paraméter-érvényessége viszont különbözik; az új kapu a régi fajtáknál ezt nem hidalja át. A táblák és kártyák séma–olvasó–lektor szerződéstesztjei zöldek.
2. **Biztonság és adatvédelem — próbáltam, nem sikerült megtörni.** A cím új helyén is React szöveg, a követett szerveroldali render- és Chromium-próba jelölőnek látszó adatot adott címbe, cellába és kártyába; az megjelenített szöveg maradt. A diff nem vezet be URL-paramétert, naplómezőt, végpontot, GET-mellékhatást vagy origin/CSRF-változást; az SVG-tisztító útvonal nem változott.
3. **Regresszió — hibás régi blokk: L1; egyébként a mért mintákat nem sikerült megtörni.** A base `block.kind === "animate"` feltételével összevetve a fej minden nem forrás-ábrafajtához ugyanazt az indexet és ugyanazt a megjelenítőt használja. A valódi kisfilmlejátszó a régi `process` próbában kirajzolta az ábrát; a régi magyarázó ábrák Playwright-specje zöld. A kapcsoló KI állapotú Stúdió-gyártási és leckejavítási lenyomatai változatlanok a célzott teszt szerint. A futtatott böngészős minta névtelen próbaoldal, nem belépett munkamenet.
4. **Időzóna és dátumhatár — nem alkalmazható.** A diff nem nyúl órához, dátumhoz vagy a kisfilm napi keretéhez (`source/server/lesson-clips.ts:77,351–369`).
5. **Migráció, indítás, cron, leállás és e2e — próbáltam, nem sikerült megtörni.** Nincs migráció-, tábla-, boot- vagy időzítődiff. A kisfilm migráció–Drizzle tesztjei zöldek; az e2e eldobható PostgreSQL-en migrált és elindult; a worker önálló tesztje leállításkor nem enged hibás sort írni a megszakadt fejezethez.
6. **Párhuzamosság, ismétlés, időtúllépés — próbáltam, nem sikerült megtörni.** A worker tesztjei lefedték a testvérjelenetek lezárását, az ismételt kör idempotenciáját, valamint a megszakítást és az I/O-időkorlátokat. A kétoszlopos fejlécet ugyanabban a böngészős lecke-példányban cseréltem; a mért `data-head-fit` hiányzóról `fit`-re váltott, a keret nem kezdett görögni (`301/301`). A mérőhatás takarítása a régi observer lekapcsolását és a függő font-visszahívás érvénytelenítését megtartja.
7. **Tesztminőség — talált hiba (L3).** A 14% → 90% CSS-mutáció áttöri a küszöböt, miközben az egységteszt nem olvassa az érintett értéket. A V35 teszt hibás régi blokkot nem ad be; a V37 egységtesztje csak a szignatúra és a függőségi lista jelenlétét keresi, nem azt, hogy valóban változó kulcsot kap-e a hook. A meglévő cím- és jelzőlokátor átírása dokumentált követelményváltozás (17. szakasz), nem a viselkedési ellenőrzés törlése.
8. **Feladat-specifikus elfogadás.** **V33 — próbáltam, nem tört meg:** 360 px-en a hosszú látható cím a kereten kívül volt, a jelző fölötte nem, hanem a cím és a keret között; a DOM-ban megmaradt a vizuálisan rejtett `caption`. **V34 — a mért fej megfelel, az őr hibás:** öt sáv × két állapot, tényleges számított színekből WCAG relatív fénysűrűséggel: a címke minimuma 4,758:1, az `a/b/c` jel és vonal minimuma 3,291:1 (L3). **V35 — részleges:** mind az öt forrásfajta kiesik az indexlistából a közös enum alapján; a döntési fa és a képes kártya hivatkozásánál a valódi lejátszó nem rajzolt forrás-ábrát, de üres panel maradt (L2), a hibás régi blokk pedig átment (L1). **V36 — talált hiba:** a háromoszlopos rövid fixtúra elfér, a nyolcoszlopos ellenminta nem (L4). Nyomtatási médián az e2e igazolja az `overflow: visible` értéket, nem a tényleges lapgeometriát. **V37 — próbáltam, nem tört meg:** az előnézeti újrarenderelés megváltoztatta a fejléc illesztését, lásd 6. pont.
9. **Egyéb — talált hiba (L2), más nem igazolódott.** A kisfilm szülőpaneljét külön mértem, nem csak az ábraelem hiányát. A CSS használati helyein az új `--ws-mark-*` tokenek és a nyomtatási/méretezési szelektorok csak forrás-ábra elemekre hatnak; a közös alap- és gombtokenek értéke érintetlen.

## Mit próbáltam megtörni, és nem sikerült

- 360×640, 844×390 és 1280×800 méretben néztem képeket és mértem oldalszélességet a hosszú táblacím, a döntési fa és a kártyák mellett. A képernyős mintákon a gyökér `scrollWidth` rendre 360, 844 és 1280 px volt; a hosszú táblán belüli görgetés nem vitte magával az oldalt. A rövid `1 | 2 | 3` minta 360 px-en 301/301 px volt. A kivétel a rövid, de sokoszlopos tábla belső görgetése (L4).
- A forrás-ábrák tiltását régi, érvényes `process` jelenet mellett próbáltam: a régi ábra megmaradt, a forrás-ábra nem rajzolódott ki. A kiadott, forrás-ábra nélküli gyártási út ellenpróbái és az ismételt/megszakadt worker-körök nem jeleztek új hibát.

## Mit NEM vizsgáltam

- Éles kiadott leckeadatbázis és élő AI-/médiaszolgáltatás, valamint bejelentkezett böngészős Stúdió-munkamenet: nem használtam éles adatot, fiókot vagy fizetős hívást. Az éles állományban a hibás régi paraméterek gyakorisága **UNVERIFIED**; a kisfilm böngészőpróbája a próbaoldal tárolt alakú tesztválaszával futott.
- Tényleges PDF-/papírnyomtatás, lapméret- és oldaltörésmátrix, valódi képernyőolvasó, Safari/Firefox: a futtatóban Chromium DOM- és képernyőmérés volt. A nyomtatási szabályt külön 360 px-es CSSOM-próbában is aktiváltam: a jelző eltűnt, de a tábla jobb széle x=365 px lett. Ez keskeny elrendezési kockázat, nem igazolt papírlevágás (**UNVERIFIED**).
- Az átírt CSS-sel futó Node-egységteszt: a saját `.mjs` futtatását a homokozó Node-verziója miatt elutasította. A CSS-mutációt a valódi böngészőben lefuttattam, az egységteszt érzéketlenségét forrásból ellenőriztem. A teljes repótesztet és a külön DB-integrációs csomagot nem futtattam; az e2e saját eldobható DB-t használt. A worker POSIX-os valódi ffmpeg-gyermekfolyamat próbája ezen a Windows-futáson kimaradt.

## Megcáfolt gyanúk

- Az S2b-1 két fajtája nem maradt ki a tiltólistából: a `decisionTree` és `pictureCards` benne van a `SOURCE_VISUAL_ANIM_KINDS` listában; a hivatkozás a lejátszóban sem ad ábrát. Az üres keret ettől külön hiba.
- A sötét `future` sáv és a csendes nézet nem örököl olvashatatlan táblafejléc-jelet a mért fejen. A CSS őrének vakfoltja nem a jelenlegi színek hibája.
- A görgetésjelző áthelyezése nem változtatta meg, melyik tábla kap saját fókuszmegállót; a követett teszt a valós túlcsordulással együtt ezt továbbra is ellenőrzi.

## Mit futtattam (parancs + eredmény)

- `git_diff` (stat és célzott diffek), `git_show base` (közös kisfilmindex és overlay), `git_log` — a vizsgálat a megadott base-re és fejre szorítkozott.
- `npx tsx --test source/tests/source-visual-contrast.test.ts source/tests/source-visuals-findings.test.ts source/tests/lesson-source-visual-kinds.test.ts source/tests/lesson-clip.test.ts source/tests/lesson-tree-cards.test.ts source/tests/lesson-design.test.ts` — 78 sikeres.
- `npx tsx --test source/tests/source-visuals-flag.test.ts source/tests/clip-style.test.ts` — 22 sikeres; a Stúdió-őrök külső DB nélkül futottak. `npx tsx --test source/tests/lesson-clip-worker.test.ts` — 34 sikeres, 1 kihagyott.
- `npx tsc --noEmit` és `npx tsc --noEmit -p tsconfig.test.json` — mindkettő 0.
- `run_e2e source/tests/source-visuals.spec.ts source/tests/explanatory-visuals.spec.ts` — 22 Chromium-eset sikeres.
- `run_browser_scenario .blind-review-tmp/views.json`, `run_browser_scenario .blind-review-tmp/overlay-and-layout.json`, `run_browser_scenario .blind-review-tmp/color-and-print.json` — sikeres mérések és képernyőképek; a forgatókönyvek a fenti leleteket is reprodukálták. Az overlay-forgatókönyv első, túl hosszú esetnevű változatát a futtató futás előtt elutasította; javítva futott.
- `node .blind-review-tmp/contrast-mutation.mjs` — a homokozó nem futtatta; nincs belőle teszteredmény.

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
- **L1** (közepes) A hibás régi ábra továbbra is választható a kisfilmhez — `source/shared/lesson-clip.ts:95` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L4** (közepes) Rövid celláknál is görög a többoszlopos táblázat — `source/client/src/lesson-runtime/lesson-design.css:309` — hivatkozás igazolt; futtatással igazolt (teljes út)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 27 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 3383
- tokenek: 2798012 bemeneti (ebből gyorsítótárból: 2633838, gyorsítótárba írva: 164093), 16373 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 94.6%; becsült megtakarítás: 9.8445 USD
- költség (a tényleges usage alapján): 0.8375 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
