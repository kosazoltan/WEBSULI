# Végrehajtás — lecke-dizájn és ábra-kontrasztőr (2026-09-29)

Terv: `docs/specs/2026-09-29-lecke-dizajn.md`. Minden parancs a `source/` könyvtárban fut. Sorrend kötelező.

## T1 — Teszt ELŐBB: `tests/svg-contrast.test.ts` (új)
1. Rögzítsd a pontos éles Hunyadi-SVG-t (1. illusztráció, `rect #d8e9f2 / #f0dfd8`, `text fill="currentColor"`) konstansként.
2. Tesztek:
   - `contrastRatio("#ffffff", "#000000") === 21`, `contrastRatio("#f0f9ff", "#d8e9f2")` < 1,3 (a mért 1,17).
   - `measureIllustrationText(HUNYADI, { background: "#2d3f5f", ink: "#f0f9ff" })` a NYERS SVG-n: van < 4,5 (a hiba reprodukálva).
   - `sanitizeIllustration(HUNYADI)` kimenete a sötét (`#2d3f5f`/`#f0f9ff`) ÉS a világos (`#ffffff`/`#172c45`) felületen:
     minden felirat ≥ 4,5; a feliratszám 7.
   - Pozitív: `<rect fill="#1e3a8a"/>` + `<text fill="#ffffff">` → a kimenetben a szöveg `fill="#ffffff"` marad, `contrastFixes` üres.
   - `fill-opacity`: `<rect fill="#0f172a" fill-opacity="0.15"/>` + `#ffffff` szöveg → a papírral kompozitált világos
     háttéren a szöveg sötétre vált.
   - Körvonal: `<line stroke="#e2e8f0"/>` a papíron → a stroke ≥ 3:1 lesz.
   - Idempotencia: `sanitize(sanitize(x).svg).svg === sanitize(x).svg`; pontosan egy `websuli-paper`.
   - Transzformált csoport (`<g transform="translate(100 0)">`) alatti alakzat a helyén mérődik.
   - `applyVisualPatch` a Hunyadi-SVG-vel: `notes` név szerint jelzi („Keresztény sereg”).
3. Futtatás: `node --import tsx --test tests/svg-contrast.test.ts` → **BUKIK** (a modul hiányzik / a tisztító nem javít).
   Az eredményt jegyezd fel. Utána a mérőmodul megírása (T2) után újra futtatva is BUKIK a `sanitizeIllustration`-es
   állításon (1,17:1) — ez a régi render-út bizonyított hibája.

## T2 — `shared/svg-contrast.ts` (új)
Exportok: `parseColor`, `contrastRatio`, `measureIllustrationText(svg, surface)`, `enforceIllustrationContrast(root, paper)`,
`ILLUSTRATION_PAPER = { background: "#f8fafc", ink: "#0f172a" }`. A terv 1. pontja szerint (szín, kompozit, geometria,
affin transzformáció, `defs`/`marker` kizárva). DOM: a hívó adja a gyökeret (isomorphic-dompurify fragmentje).
Parancs: `node --import tsx --test tests/svg-contrast.test.ts` → a mérő-állítások zöldek, a tisztítós állítás még BUKIK.

## T3 — `shared/illustration-svg.ts`
`sanitizeIllustration`: tisztítás után papír-háttér (idempotens), `currentColor` → papírtinta, `enforceIllustrationContrast`;
az `ok` eredmény új mezője `contrastFixes: string[]`. Parancs: `node --import tsx --test tests/svg-contrast.test.ts tests/illustration-svg.test.ts` → zöld.

## T4 — Studio-jelzés és modellszabály
- `server/studio/visual-patch.ts`: `VisualPatchResult.notes: string[]`; illusztrációnál a `contrastFixes` → jegyzet.
- `server/studio/step-runner.ts`: a két `logger.info` (folt és javítás) hozzáfűzi a `notes`-t.
- `shared/lesson-visual-params.ts:134`: „Szöveg és vonal: fill/stroke="currentColor"; kitöltés közepes telítettségű szín.” →
  „A rajz világos papíron (#f8fafc) jelenik meg: szabad felirat és vonal #0f172a; kitöltött alakzaton a felirat explicit,
  kontrasztos színű (világos kitöltésen #0f172a, sötéten #ffffff).”
- `server/studio/role-skills.ts` animator, 3. lépés vége: egy mondat ugyanerről. A skill < 5200 karakter.
- Parancs: `node --import tsx --test tests/svg-contrast.test.ts tests/illustration-svg.test.ts tests/studio-role-skills.test.ts tests/role-skills-everywhere.test.ts` → zöld.

## T5 — Kliens: ábrakeret (`explanatory-visuals.tsx`)
- `FRAME` → `"lesson-figure"`; a `<svg>`/`<div>` köré `<div className="lesson-figure-plate">` (illusztrációnál
  `lesson-figure-plate lesson-figure-paper`); `Caption` osztálya `lesson-figure-caption`. A `data-anim` és a meglévő
  SVG-tartalom nem változik (`tests/explanatory-visuals.spec.ts` erre épít).

## T6 — Kliens: lecke-szerkezet (`LessonRuntime.tsx`)
- `LessonSection` `h2`: a cím szövege `<span className="lesson-chapter-title">`-be; a sorszám és az emoji marad.
- `ExampleBlock`: a lépések listája `className="lesson-steps"` (a `list-decimal list-inside text-sm` helyett); az
  `Eredmény: …` szöveg változatlan, egy elemben.

## T7 — CSS-tokenek és dizájn
- `lesson-experience.css`: sötét világok ok/warn tokenjei; arena muted; akcentek (terv 2. pont); új szabályok:
  olvasóoszlop, fejezetfej, kártyák, `.lesson-steps`, `.lesson-answer`, `.lesson-figure*`, `.lesson-key` tinta; a
  `sticker-headings` fejezetcím-szabály a jelvényre kerül. A `[data-flair~="…"]` szelektorok megmaradnak (flair-teszt).
- `lesson-theme.css`: `.lesson-answer`, `.lesson-section-no` alapértelmezett (nem-experience) változata; animációk csak a
  mozgás-kapun belül (band-theme teszt).
- `shared/lesson-visuals.ts`: a megváltozott akcentek (candy, jungle, ocean-kids, magic, princess, space, dojo).
- Parancs: `node --import tsx --test tests/lesson-visuals.test.ts tests/lesson-flair.test.ts tests/lesson-band-theme.test.ts` → zöld.

## T8 — Böngészős mérés (utána)
- Vite: `npx cross-env VITE_ENABLE_RUNTIME_PROBE=1 vite --port 5195 --strictPort`.
- Mérőszkript (scratchpad `lecke/shoot.cjs utana`): Hunyadi-lecke `arena` és `ocean` témával, 1280 és 390 px; kimenet:
  ábrafeliratok legkisebb kontrasztja ≥ 4,5, HTML-szöveg legkisebb ≥ 4,5, görgetés 0, levágás 0; a `?visuals=1` ábrákon
  0 átfedés. Képernyőképek: `lecke-utana-*.png`.
- Mind a 15 téma 390 px-en (scratchpad `lecke/themes.cjs`): HTML-szöveg legkisebb kontrasztja ≥ 4,5.

## T9 — Kapuk és lezárás
`npx tsc --noEmit`; `npx tsc --noEmit -p tsconfig.test.json`; `npm run lint`; `node --import tsx --test tests/*.test.ts`;
`npm run build` → mind zöld. Atomi commitok; push előtt külön hívásban az `.audit-ok` jelölők; PR a `main`-re.
