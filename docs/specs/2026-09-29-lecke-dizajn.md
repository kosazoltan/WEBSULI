# Lecke-dizájn és ábra-kontrasztőr (2026-09-29)

Tulajdonosi kérés: „mindenképpen lényegesen szebb, esztétikusabb dizájn legyen minden tananyagon”, és az élesben
mért olvashatatlan magyarázó ábra javítása (Hunyadi János, 6. o., `/preview/aa1c5346-…`).

## Diagnózis (bizonyított, helyben mérve a valódi lecke JSON-ján)

Mérés: a lecke JSON-ja az éles előnézet hálózati válaszából (`GET /api/lessons/by-file/aa1c5346-…`, csak olvasás),
helyi Vite-próbán (`/__lesson-runtime-probe?candidate=1`) renderelve, Playwright + Chrome, 1280 és 390 px.

| # | Hiba | Mért érték | Gyökérok |
|---|---|---|---|
| 1 | Az illusztráció feliratai olvashatatlanok sötét témában | „Keresztény sereg”: `rgb(240,249,255)` a `#d8e9f2` kártyán, **1,17:1**; 7/64 ábrafelirat < 4,5 | `shared/lesson-visual-params.ts:134` a modellnek `fill="currentColor"` szöveget és világos („közepes telítettségű”) kitöltést ír elő; a keret `client/src/lesson-runtime/blocks/explanatory-visuals.tsx:28` `bg-card`, amit `lesson-theme.css:369-373` a lecke témájának felületére és tintájára fest (`color: var(--lesson-ink)`). A `currentColor` így témafüggő (sötét témában világos), a modell kitöltése témafüggetlen (világos) → világos a világoson. A tisztító (`shared/illustration-svg.ts:27`) színt nem vizsgál. |
| 2 | Az „Eredmény:” sor sötét témában szinte láthatatlan | **1,62:1** (`#146b44` a `#2d3f5f`-on) | `.lesson-answer { color: var(--lesson-ok) }` (`lesson-theme.css:305`); a sötét világok (`arena`, `space`, `dojo`) nem adnak saját `--lesson-ok`-ot, így a világos téma sötétzöldje érvényes. |
| 3 | Halvány (muted) szöveg és inaktív fül a sötét „arena” világban | **4,12:1** (`#94a3b8` a `#2d3f5f`-on) | `lesson-experience.css:174` arena `--lesson-muted`. |
| 4 | Több világ akcentszíne fehér szöveggel / szövegként nem éri el a 4,5:1-et | candy 3,53; jungle 3,30; ocean-kids 2,23; magic 3,96; space 4,23 (fehér az akcenten) vagy 3,27 (akcent-szöveg a felületen); dojo 2,14 (akcent-szöveg) | `lesson-experience.css:168-176` palettái, tükrözve `shared/lesson-visuals.ts`. |
| 5 | A fejezetcím „matricás” kiemelése (sticker-headings) a fehér cím alsó sávját sárgára festi, mobilon csak az utolsó sort; a sorszám-jelvény 28 px/13 px | képernyőkép `lecke-elotte-fejezet-*` | `lesson-experience.css:196` háttércsík a `h2`-n; `lesson-theme.css:206-217`. |
| 6 | A kidolgozott példa lépései apró (`text-sm`), `list-inside` számozással, az eredmény csupasz színes szöveg | képernyőkép | `LessonRuntime.tsx:135`, `:153`. |
| 7 | A tanítási oszlop 1050 px széles kártyán 72ch-s bekezdés — jobb oldalt nagy üres sáv asztalon | képernyőkép | `lesson-experience.css:19`, `lesson-grade.css` `p { max-width: 72ch }`. |
| 8 | Az ábra aláírása kicsi (`text-sm`) és halvány; az ábra nem különül el a szövegtől | képernyőkép | `explanatory-visuals.tsx:49`. |

Egyéb mért állapot (előtte): vízszintes görgetés 0, levágott szöveg 0 (mindkét téma, mindkét szélesség); a kvíz szövegeinek
legkisebb kontrasztja 7,36:1.

## Cél
1. **Kontraszt-őr:** minden illusztráció-SVG minden felirata WCAG AA (≥ 4,5:1) a ténylegesen mögötte lévő színhez, a lecke
   témájától függetlenül — a már közzétett leckéken is, újragenerálás nélkül.
2. **Szebb lecke minden tananyagon:** egységes, visszafogott, gyerekbarát, igényes megjelenés a meglévő leckeadatból.

## Nem-cél
- A lecke-adatmodell (`shared/lesson-schema.ts`) és a tárolt leckék módosítása; újragenerálás; éles DB-írás.
- A paraméteres rajzolók (cycle, barChart, …) geometriájának átírása; a játékok; a HTML-alapú régi leckék (`.websuli-html-lesson`).
- Új betűkészlet (csak a helyben csomagolt Nunito / Source Sans 3 / Source Serif 4).

## 1. Kontraszt-őr — rögzített döntések

- **Új tiszta modul:** `shared/svg-contrast.ts` (DOM-alapú, jsdom és böngésző alatt is fut; nincs React-függés).
  - Színkezelés: `#rgb`, `#rrggbb`, `rgb()/rgba()`, nevesített alapszínek (black, white, red, … ~20), `none`, `currentColor`,
    `url(#grad)` → a színátmenet stop-színeinek átlaga (stop-opacity-vel). Ismeretlen szín → nem ítél (kihagyja).
  - WCAG relatív luminancia és kontrasztarány; alfa-kompozitálás.
  - Geometria: rect, circle, ellipse, polygon, polyline (kitöltve zártként), path (a szegmens-végpontokból közelített
    sokszög; M/L/H/V/C/S/Q/T/A/Z, abszolút és relatív). Transzformáció: translate, scale, rotate, matrix (affin).
  - **A felirat háttere:** a felirat becsült közepén (x, y, `text-anchor`, ~0,55 em/betű, y − 0,35 em) a festési sorrendben
    ELŐTTE lévő, a pontot tartalmazó kitöltött alakzatok, alulról felfelé kompozitálva a kártya/papír hátterére
    (`fill-opacity` × `opacity`, a szülő `g` átlátszóságával szorozva). A `defs`/`marker` tartalma nem háttér.
  - `measureIllustrationText(svg, surface)` → feliratonként `{ text, color, background, ratio }` (a `currentColor` a
    `surface.ink`, a mező a `surface.background`) — a mérés tiszta függvénye, a tesztek ezt használják.
  - `enforceIllustrationContrast(root, paper)` → a felirat színe marad, ha ≥ 4,5:1; különben `#0f172a` vagy `#ffffff`,
    amelyik a háttérhez nagyobb kontrasztot ad. A `fill-opacity` < 1 feliratnál a kicserélt szín teljes fedésű.
    Ugyanez a csak-körvonalas elemekre (line, polyline, `fill="none"` alakzat, path) a nem-szöveges határral (≥ 3:1,
    WCAG 1.4.11): a `stroke` a körvonal egy pontja alatti háttérhez mérve.
- **Témafüggetlen illusztráció:** `sanitizeIllustration` (a szerver beillesztéskor ÉS a kliens megjelenítés előtt ugyanazt
  futtatja, `explanatory-visuals.tsx:408`) a tisztítás után:
  1. a gyökér első elemeként papír-hátteret tesz (`<path id="websuli-paper" d="M{vx} {vy}h{w}v{h}h-{w}z" fill="#f8fafc"/>`,
     idempotens: a meglévőt lecseréli; `path`, mert a tisztító szerződése szerint a kimenetben nincs `width` attribútum);
  2. minden `currentColor` értéket (fill, stroke, stop-color) a papír tintájára (`#0f172a`) old fel;
  3. lefuttatja a kontraszt-őrt a papírra.
  Így az SVG bármely témán ugyanúgy néz ki, a régi, tárolt SVG is (a kliens újratisztít). Az eredmény `contrastFixes`
  mezője név szerint sorolja a javított feliratokat.
- **Jelzés a Studio-gyártásban:** `applyVisualPatch` új `notes` mezője: „N. fejezet M. ábra: a kontraszt-őr X felirat
  színét javította (…)”; a futtató (`step-runner.ts` ~805. sor) naplózza. Nem blokkol (a javítás determinisztikus).
- **Modellnek szóló szabály:** a szerződés (`lesson-visual-params.ts:134`) és az ábrakészítő skill (`role-skills.ts`
  animator, < 5200 karakter — teszt őrzi) egy mondatot kap: kitöltött alakzaton a felirat explicit, kontrasztos színű
  (világos kitöltésen `#0f172a`, sötéten `#ffffff`); a szabad felirat és vonal `#0f172a`; a rajz világos papíron jelenik meg.

## 2. Dizájnirány (megjelenítési réteg)

Közös elv: „nyugodt tankönyv”: egy olvasóoszlop, világos kártya-hierarchia (fejezetfej → magyarázat → példa → ábra →
kérdés → összefoglaló), egységes térköz-ritmus, a világ színe a hangsúlyokon, nem a szövegen.

- **Tipográfiai skála** (a korcsoport-réteg `--grade-size` alapján, 1,05rem a 5–6. o.):
  fejezetcím `clamp(1.35rem, 2.4vw, 1.75rem)`, 1,25 sormagasság, `text-wrap: balance`; kártya-szöveg `--grade-size`,
  1,75; példa-lépés 0,95 em; ábra-aláírás 0,92 em (korábban `text-sm` = 14 px).
- **Ritmus/térköz:** 8 px-es alapegység; kártyák közt 16 px; fejezetek közt 56 px (`section + section`); kártya belső
  térköz `clamp(18px, 2.6vw, 28px)`.
- **Olvasóoszlop:** az egész lecke (fejléc, fülsor, panelek) legfeljebb 840 px széles, középen (korábban 1050 px, a
  bekezdés 72ch-ra vágva → jobb oldalt üres sáv). A végrehajtáskor mérve: a 780 px-es panel a 960 px-es fülsor alatt
  elcsúszott a fejléctől, ezért egyetlen közös oszlop lett; a kártyán belül a bekezdés kitölti a szélességet.
- **Kártya-hierarchia:** minden blokk: felület + 1 px vonal + 4 px bal oldali színsáv (magyarázat: akcent, példa:
  másodlagos, ábra: másodlagos, összefoglaló: lágy háttér) + finom árnyék világos témában.
- **Fejezetfej:** 40 px-es lekerekített négyzet sorszám-jelvény (akcent/akcent-tinta), mellette az emoji és a cím; a cím
  alatt vékony elválasztó. A `sticker-headings` különlegesség a jelvényt teszi „matricává” (kiemelő szín, −4°, árnyék) —
  a címszöveg mögé nem kerül színsáv.
- **Kiemelő-címke (`**…**` → `.lesson-key`):** lágyabb (0,05/0,3 em térköz, 0,35 em sarok, 700-as vastagság), a tinta
  mindig sötét (`--lesson-key-ink`, tartalék `#1f2937`) — világos kiemelésen sosem világos szöveg.
- **Kidolgozott példa:** a lépések számozott körökkel (CSS-számláló), teljes méretű szöveggel; az **„Eredmény:”** kiemelt
  doboz: `--lesson-ok-bg` háttér, `--lesson-ok-bg-ink` tinta, 4 px `--lesson-ok` bal sáv, pipa-jel (CSS). A szöveg
  változatlan („Eredmény: …”, a böngészőtesztek erre keresnek).
- **Ábrakeret:** `.lesson-figure` kártya; a rajz egy belső „tábla” (`.lesson-figure-plate`): illusztrációnál a papír
  (`#f8fafc`, a kontraszt-őr ehhez mér), paraméteres ábránál a téma háttere (`--lesson-bg`, a `currentColor` a téma
  tintája — ezek a rajzolók mindkét témára méretezettek). Aláírás 0,92 em, `--lesson-muted`, felső elválasztóval.
- **Színpaletta-tokenek:**
  - Sötét világok (arena, space, dojo) saját siker/figyelmeztetés párt kapnak: `--lesson-ok: #6ee7a8`,
    `--lesson-ok-ink: #052e16`, `--lesson-ok-bg: #14432f`, `--lesson-ok-bg-ink: #d1fae5`, `--lesson-warn-bg: #4a3710`,
    `--lesson-warn-ink: #fde68a`, `--lesson-error: #fb7185`.
  - arena `--lesson-muted: #c0cadb` (6,40:1).
  - Akcentszínek AA-ra (fehér/sötét tinta az akcenten és akcent-szöveg a felületen/háttéren is ≥ 4,5):
    candy `#be185d`, jungle `#15803d`, ocean-kids `#0e7490`, magic `#7e22ce`, princess `#a21caf`,
    space `#a78bfa` + tinta `#1a1535`, dojo `#ff9b9b` + tinta `#0f172a`. A `shared/lesson-visuals.ts` palettája
    ugyanígy (a `lesson-visuals.test.ts` az egyezést őrzi — a teszt nem változik, a két oldal együtt).
- **Idővonal és oszlopdiagram (mért apróságok):** az idővonal 12 px-es eseményfelirata 0,8rem, az összekötő vonal a
  téma vonalszínét kapja (a `bg-muted` alig látszott); az oszlopdiagram „átlag” felirata (`text-red-600`, az alkalmazás
  témáját követő `dark:` változattal) a lecke `--lesson-error` tokenjét kapja — mérve 3,56:1 volt a sötét színpadon.
- **Kvíz:** a kvízkártya a közös kártyaszabályt követi; a helyes/hibás válasz a sötét világokban sötét siker/figyelmeztetés
  tokent kap (nem világító világoszöld tábla).

## Edge case-ek
- A modell saját teljes hátteret rajzol (sötét égbolt téglalap) → a felirat e fölött mérődik, fehérre vált; a papír alatta van.
- Áttetsző alakzat (`fill-opacity`, `opacity`, szülő `g opacity`) → kompozitálva a papírral.
- Színátmenetes kitöltés → a stop-színek átlaga; ismeretlen `url(#…)` → az alakzat nem ítélt (átlátszó).
- Transzformált felirat/alakzat → affin mátrixszal számolva; ismeretlen transzformáció → az elem kimarad a mérésből.
- `tspan` saját színnel → a saját színe mérődik és javul; szín nélküli `tspan` a `text` színét örökli.
- Ismételt tisztítás (szerver, majd kliens) → azonos kimenet (idempotens).
- Sötét kitöltés + világos (explicit) szöveg → változatlan (pozitív teszt).
- Régi leckék: az adatmodell nem változik; a kliens-oldali újratisztítás és a CSS minden megjelenített leckére hat.

## Elfogadás (EARS, mérhető)
- HA a Hunyadi-SVG (a pontos éles szöveg) átmegy a `sanitizeIllustration`-ön, AKKOR minden felirata ≥ 4,5:1 a sötét
  (`#2d3f5f`/`#f0f9ff`) ÉS a világos (`#ffffff`/`#172c45`) témafelületen is — unit-teszt, a régi kódon BUKIK.
- HA egy felirat sötét kitöltésen explicit világos színű, AKKOR a színe változatlan — unit-teszt.
- HA az ábrakészítő alacsony kontrasztú illusztrációt ad, AKKOR a folt `notes` mezője név szerint jelzi — unit-teszt.
- Valódi böngészőben (Chrome, 1280 és 390 px, a Hunyadi-lecke sötét „arena” és világos „ocean” témával): minden
  ábrafelirat ≥ 4,5:1; az „Eredmény:” sor ≥ 4,5:1; a lecke HTML-szövegeinek legkisebb kontrasztja ≥ 4,5:1;
  vízszintes görgetés 0; levágott szöveg 0; a `?visuals=1` mérőlecke ábráin 0 átfedés, 0 levágás, betű ≥ 11,5 px.
- Mind a 15 téma (`EXPERIENCE_THEMES`) 390 px-en: a lecke HTML-szövegeinek legkisebb kontrasztja ≥ 4,5:1.
- Kapuk zöldek: `tsc` (app és teszt), `lint`, `node --test tests/*.test.ts`, `build`.

## Mérés utána (2026-09-29, helyi Vite-próba, Chrome, a valódi Hunyadi-lecke)

| Mérés | Előtte | Utána |
|---|---|---|
| Illusztráció-feliratok, sötét (arena), 1280 és 390 px | 16/29 felirat < 4,5; legkisebb **1,17:1** | 0/29; legkisebb **11,05:1** |
| Illusztráció-feliratok, világos (ocean) | legkisebb 7,86:1 | legkisebb 11,05:1 |
| Minden ábrafelirat (64 db, paraméteres is), sötét | legkisebb 1,17:1 | legkisebb 9,91:1 |
| „Eredmény:” sor, sötét | 1,62:1 | ≥ 5,26:1 (a lap legkisebb HTML-kontrasztja) |
| HTML-szöveg legkisebb kontrasztja, sötét / világos | 1,62 / 6,21 (28 elem < 4,5 sötétben) | 5,26 / 6,21 (0 elem < 4,5) |
| Kvíz (megválaszolt kérdésekkel), sötét | 7,36 | 9,14 |
| Mind a 15 téma × 3 évfolyam (2., 6., 10.), 390 px | — | HTML legkisebb 5,02, kvíz legkisebb 5,02, ábra legkisebb 9,45; görgetés 0, levágás 0 |
| `?visuals=1` mérőlecke | „átlag” felirat 3,56:1 | 6,39:1; a repó `tests/explanatory-visuals.spec.ts` 3/3 zöld (360/390/1280) |
| Vízszintes görgetés, levágott szöveg | 0 / 0 | 0 / 0 |

A mérő 8 „átfedést” jelez a Hunyadi-lecke oszlopdiagramjain előtte és utána is: ezek UGYANANNAK a kétsoros
feliratnak a sorai (18 px-es sorköz, a betűdoboz ~19 px) — képen ellenőrizve nincs valódi átfedés (a 09-24-es spec is ezt rögzítette).

Teljesítmény: a legrosszabb esetű, 360 elemes illusztráció tisztítása + kontraszt-őre jsdom alatt 260 ms; a kliens
`useMemo`-val csak az SVG változásakor futtatja.

## Érintett fájlok
`shared/svg-contrast.ts` (új), `shared/illustration-svg.ts`, `shared/lesson-visual-params.ts`, `shared/lesson-visuals.ts`,
`server/studio/visual-patch.ts`, `server/studio/step-runner.ts`, `server/studio/role-skills.ts`,
`client/src/lesson-runtime/{LessonRuntime.tsx, blocks/explanatory-visuals.tsx, lesson-theme.css, lesson-experience.css, lesson-grade.css}`,
`tests/svg-contrast.test.ts` (új).

## Spec-változás a meglévő tesztekben
Nincs tervezett meglévőteszt-módosítás. (Ha a végrehajtás közben mégis jogosan kellene, itt dokumentálom.)
