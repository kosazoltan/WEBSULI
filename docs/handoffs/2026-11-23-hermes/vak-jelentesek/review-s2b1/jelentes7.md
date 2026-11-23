# Független review — feat/tgm-s2b1-v2, 7. kör
Fej: 617825a2163bd40fd4a6f2cc3bbbefdd34b365a3
## Ítélet: IGEN, FELTÉTELLEL
Nincs új blokkoló. A korábbi L10-et okozó gyártási feltétel kikerült; az SVG-n belüli levágás továbbra is reprodukálható, de annak ellenőrzését a tulajdonos külön szeletbe tette. Két kicsi lelet megy jegyre.

## Az előző kör leleteinek sorsa

- **L10 — részben szűnt meg; már nem blokkoló.** A `git show head` szerint a korábbi `PLAIN_TEXT_POSITIONS` és `visualAuthoringProblems` törölve. A szerver ismét közvetlenül a `visualParamProblems`-t hívja (`source/server/studio/visual-patch.ts:69`, a base-szel üres fájldiff). A `pictureCards` séma továbbra is megköveteli az SVG tisztíthatóságát, de nem hívja a helybecslőt (`source/shared/lesson-visual-params.ts:180–187,245–256`); a régi `illustration` ág változatlanul hívja. A lejátszó sématesztje zöld egység nélküli, `em`-es, `dy`-os és rajzterületen kívüli feliratra is. A valódi `/preview/review-l10` lejátszóban, szabályos szintetikus API-leckével az `x='10%'` és `x='40'` díszítő téglalap számított x-koordinátája egyaránt 40. Mindkét rajzon `getBBox().x + getBBox().width` = 471,32 (360×640), illetve 470,35 (844×390), miközben a `viewBox` jobb széle 400 és az SVG túlcsordulása `hidden`. Mindkét képen csak „Ma” látszik az SVG-s „Magasság” feliratból. A fizikai vágást tehát nem javították ki; a díszítő elem egységétől függő gyártási kivétel szűnt meg. A terv végső pontosítása kifejezetten kiveszi a kártya-SVG feliratainak elrendezés-ellenőrzését ebből a szeletből (`docs/specs/2026-11-22-tgm-s2b1-dontesi-fa-kepes-kartya.md:90–94`). Az új kimenet gyártási elfogadását a kódláncból ellenőriztem, nem élő modellfutással.
- **L7 — nem szűnt meg; továbbra is kicsi.** A DOM-számlálás mindkét Preview-nézetben két `websuli-paper` ID-t adott. Nem mértem belőle hibás rajzot; nem emelem a súlyosságát.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

### L7 — kicsi: a papírháttér DOM-azonosítója ismétlődik
`source/shared/illustration-svg.ts:102,251`. A tanuló telefonján egy két képes kártyát tartalmazó lecke megnyitása után a dokumentumban két `id="websuli-paper"` elem található. A `round7-preview-fixed.json` mindkét nézetben két ilyen elemet mért. A base a papírjelölőt már használta; a többrajzos út szándékosan kihagyja a névterezésből. Látható hibát vagy rossz hivatkozásfeloldást ezen a bemeneten nem mértem. **Javaslat:** a névterezett kártyaúton a háttér legyen egyedi azonosítójú vagy ne `id` jelölje; maradjon idempotens az újratisztítás, és ne változzon az előtag nélküli út.

### L11 — kicsi: az új teszt nem futtatja a gyártási kaput, amelynek viselkedését állítja
`source/tests/lesson-tree-cards.test.ts:186–198`. Ha egy fejlesztő később a jelenlegi `visualParamProblems` sor **után**, csak a foltgyártásban teszi vissza a kártyafelirat helybecslését, a tanár BE kapcsolóval újra elutasítást kaphat egy kilógó, egyébként rajzolható ábrára. A teszt olvasási állításai ettől nem változnak, a gyártást igazolni hivatott `patch.includes(...)` pedig továbbra is igaz, mert a keresett sor megmarad. A teszt nem hívja meg az `applyVisualPatch`-et. Ez a `617825a2` commitban bekerült lefedettségi hiba, nem jelenlegi termékhiba. A mutációt forrás alapján ellenőriztem; a saját változat futtatását a homokozó megtagadta. **Javaslat:** hívd meg az `applyVisualPatch`-et BE kapcsolóval és szabályos, kilógó feliratú képes folttal; az `added`, `rejected` mezőkön és a visszaadott leckén ellenőrizd az elfogadást. Egy hibás kártyaszám legyen negatív kontroll.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — próbáltam, nem sikerült megtörni.** V29: a követett tesztek az egyágú, 4 szintű és 14 csomópontos fát, a 9 kártyát és a hibás SVG-t elutasítják. V30: a `legacyAnimKindSchema` mindkét új típust kiszűri; a főági KI kérés- és sémalenyomat-tesztek zöldek. V31: a `sourceCoverageGate` mindkét megfelelő blokkot `shown`-nak méri. Az eltérő leltár- és megjelenítői famélység dokumentált, nem a mostani visszavonás következménye.
2. **Biztonság és adatvédelem — az érintett megjelenítési úton próbáltam, nem sikerült megtörni.** A V29-es tesztben a szkript és eseményattribútum nem jut a renderelt HTML-be; a `CardArt` csak sikeres tisztítás eredményét illeszti be (`source/client/src/lesson-runtime/blocks/tree-cards.tsx:61–75`). A visszavonás nem vezet be URL-t, hitelesítést, új kérést, naplót vagy GET-mellékhatást. Az ismétlődő DOM-ID külön, L7.
3. **Regresszió — próbáltam, nem sikerült megtörni.** A régi mentett leckealakokra a főági olvasásiséma-összevetés zöld; a régi `illustration` elrendezési és foltpróbái szintén. A `visual-patch.ts` és `svg-contrast.ts` base-diffje üres; a közös `illustrationLayoutProblems` törzse nem változott. A névtelen Preview és az új típusú mentett lecke API-alakjából történő megjelenítés futott.
4. **Europe/Budapest — nem alkalmazható.** Az utolsó commit nem olvas órát, időzónát vagy dátumot, és nem változtat ütemezést.
5. **Migráció, indítás, cron, leállítás, e2e — az e2e-indítást próbáltam, nem sikerült megtörni; séma és cron nem érintett.** A diff nem módosít Drizzle-sémát, migrációt vagy cront. A követett e2e az eldobható PostgreSQL 17 migrációja után lefutott, 0-val lépett ki; ez nem éles leállítási próba.
6. **Versenyhelyzet, megszakítás, timeout — az utolsó commitra nem alkalmazható.** Szinkron paraméterellenőrzés cserélődött vissza, új I/O, várakozás vagy megosztott állapot nélkül. A követett fedettségi próba az azonos bemenet ismétlését determinisztikusnak méri; jobmegszakítást nem szimuláltam.
7. **Tesztminőség — talált hiba (L11).** A gyártási viselkedésre vonatkozó állítás forrásszöveget keres. A geometriai elutasítási tesztek törlése önmagában nem hiba: a követelmény kivételét a terv rögzíti. Az új olvasási ellenpróba viselkedést mér.
8. **V32, képernyő, hozzáférhetőség — a tesztelt elrendezéseket próbáltam, nem sikerült megtörni.** Követett e2e a három előírt méreten; külön megnéztem a világos Studio 360×640-es és a sötét Future 844×390-es és 1280×800-as képeit. 1280×800-on a dokumentum kliens- és görgetési szélessége 1280/1280; a fák 3/10/13 csomópontosak, a vizsgált fa- és kártyadobozok között nincs mindkét tengelyen 1 px-t meghaladó átfedés, a vizsgált HTML-feliratok nem vágódnak. Az első fa két levele ugyanazon `ul` közvetlen `li`-je. A fa statikus lista, nem interaktív fakomponens; a nyolc kártyaképnek van `aria-label`-je. A `.sv-pcard*` szelektorok külön állnak az összehasonlító `.sv-card` szelektoroktól. A kártya SVG-jén belüli, külön jegyre kivett levágást lásd L10.
9. **Egyéb — új blokkolót nem találtam.** Kerestem a törölt gyártási segéd maradék hívóit: a név csak a felülírt történeti tervpontban maradt, a TypeScript-ellenőrzés zöld. A papírháttér névterezési kivételét újramértem (L7).

## Mit próbáltam megtörni, és nem sikerült

- A korábbi feltételt a `10%` és `40` díszítő koordinátával próbáltam előhívni. A gyártási elágazás már nincs a kódban; a lejátszó mindkét rajznál ugyanazt a fizikai levágást mutatta. Maga az oldal nem görgett vízszintesen.
- A KI útvonalon próbáltam eltérő blokkfajtával, kéretlen mezőkkel és régi leckealakokkal eltérést előhívni. A főági lenyomatokkal összevető tesztek nem jeleztek különbséget.
- A megadott három méreten újra ellenőriztem a fa és a nyolc kártya szabályos fixtúráját; a régi forrásábrák követett böngészős és fedettségi próbái is zöldek.

## Mit NEM vizsgáltam

- Élő modellhívást, teljes Stúdió-job mentését és folytatását, éles DB-t és bejelentkezett admin végigkattintását nem futtattam. A KI gyártási egyezést tesztelt modellválaszokkal, a Preview-t szintetikus API-válasszal ellenőriztem. A teljes gyártási lánc futtatása az L10 konkrét foltjára **UNVERIFIED**.
- A célzott saját Node-os, szerverfoltot mutáló próba nem indult: a futtató Node 24-es homokozója ezen a verzión nem tudja kizárni a hálózatot. Az L11 emiatt forrásalapú tesztlelet.
- Nem futtattam képernyőolvasót, Safari/iOS-t, teljes billentyűzetes és vizuális összevetést minden sávon; az akadálymentességi megfigyelések a Chromium DOM-ra korlátozódnak. Teljes XSS-, CSRF- és naplóauditot nem ismételtem meg a változatlan részeken.

## Megcáfolt gyanúk

- **A visszavonás a régi `illustration` minőségi őrét is kivette.** A régi ág továbbra is hívja az `illustrationLayoutProblems`-t, a követett tesztek továbbra is jeleznek kilógó régi illusztrációt.
- **A kártya elrendezésvizsgálatának törlésével a tisztító is eltűnt.** A paraméterséma és a beillesztési út is hívja; a V29-es SVG-próba zöld.
- **Az első Preview-futás olvashatatlan leckét jelzett.** A saját fixtúrából hiányzott az `explain.depth`; `depth: "core"` hozzáadásával ugyanaz az út kirajzolta a leckét. Ez a bemenet hibája volt, nem regresszió.

## Mit futtattam (parancs + eredmény)

- `git diff` (stat és célzott fájldiffek), `git log`, `git show head`, `git show 4b14b37e`, `git show base` — a visszavonás, az előző ág és a főági közös út összevetve.
- `npx tsx --test source/tests/lesson-tree-cards.test.ts source/tests/lesson-source-visual-kinds.test.ts source/tests/source-coverage-gate.test.ts source/tests/source-visuals-flag.test.ts source/tests/studio-author-catalog.test.ts source/tests/visual-patch.test.ts source/tests/illustration-svg.test.ts` — 102 sikeres, 0 sikertelen. A DB-konfigurációs figyelmeztetés nem buktatta a szimulált futásokat.
- `npx tsc --noEmit` — 0.
- `run_browser_scenario .blind-review-tmp/round7-preview.json` — saját hibás próbaadat (`depth` hiányzott), javítva és újrafuttatva.
- `run_browser_scenario .blind-review-tmp/round7-preview-fixed.json` — két sikeres Preview-mérés; a `1-round7-fixed-360.jpg` és `2-round7-fixed-844-dark.jpg` képeket megnéztem. Utóbbin a dokumentum `dark` osztálya aktív, de a 6. évfolyam leckefelülete saját világos palettáján marad.
- `node .blind-review-tmp/round7-patch-mutation.mjs` — a homokozó nem engedte elindulni.
- `run_e2e source/tests/source-visuals.spec.ts source/tests/preview-navigation.spec.ts` — 0, eldobható adatbázissal. A naplóban volt `ResizeObserver`- és hibajelentés-tárolási hiba a probe futásában; ebből nem állapítottam meg a visszavonás okozta regressziót.
- `run_browser_scenario .blind-review-tmp/round7-v32.json` — mindhárom böngészőnézet megnyílt; a `1-future-1280-cards.jpg`, `1-future-1280-tree.jpg`, `2-future-844-tree.jpg`, `3-studio-360-tree.jpg` képeket megnéztem.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 0 | 0 | 0 | 0 | 0 |
| közepes | 0 | 0 | 0 | 0 | 0 |
| kicsi | 2 | 2 | 1 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
(nincs)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 24 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 2090
- tokenek: 1850836 bemeneti (ebből gyorsítótárból: 1735436, gyorsítótárba írva: 115328), 17190 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 94.3%; becsült megtakarítás: 6.4793 USD
- költség (a tényleges usage alapján): 0.6339 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
