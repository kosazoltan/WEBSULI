# Végrehajtás: szebb, magyar ékezetbiztos tananyagbetű

> Spec: `docs/specs/2026-11-09-lecke-betucsere.md` · Ág: `feat/lecke-betucsere`

## T1 — Fontok előállítása
1. `source/scripts/prepare-lesson-fonts.py` `FAMILIES` bővítése: `("atkinsonhyperlegiblenext", "Atkinson Hyperlegible Next")`,
   `("figtree", "Figtree")`.
2. Futtatás egy eldobható venv-ben (`pip install "fonttools[woff]"`): `python scripts/prepare-lesson-fonts.py`. A meglévő 10 fájl
   bájtra változatlan marad (a szkript hash-egyezésnél nem tölt újra); új: 4 WOFF2 + 2 OFL.txt, a `lesson-fonts.css` és a
   `manifest.json` frissül.
3. `client/public/fonts/README.md`: a tábla és a leírás az új párossal; a régi családok „korábbi” sorba.

## T2 — `source/shared/lesson-typography.ts`
- `LESSON_FONTS = ["Atkinson Hyperlegible Next", "Figtree"]`; `BundledFont` = `LessonFont | "Nunito" | "Source Sans 3" |
  "Source Serif 4" | "Nunito Sans" | "Inter"`.
- `lessonFontPair`: 1–5. → Atkinson Hyperlegible Next, különben Figtree.
- `LESSON_FONT_CSS = "/fonts/lesson-fonts.css?v=hu-3"`, `LESSON_FONT_VERSION = "hu-3"`; a megjegyzések és a
  `LESSON_TYPOGRAPHY_CONTRACT` szövege az új családokkal.

## T3 — Hívók és szövegek
- `client/index.html`: `?v=hu-3`.
- `shared/lesson-design.ts`: `font: LessonFont`; explorer / adventure → Atkinson Hyperlegible Next, studio / laboratory / future → Figtree.
- `client/src/components/studio/studio.css`: `"Inter"` → `"Figtree"` (két hely).
- Szövegek / megjegyzések: `server/ai/lesson-html-spec.ts` (223, 263, 526), `server/improveAsync.ts` (126), `shared/lesson-skill.ts` (27),
  `client/src/lesson-runtime/LessonRuntime.tsx` (501), `client/src/lesson-runtime/blocks/explanatory-visuals.tsx` (301).

## T4 — Tesztek (dokumentált spec-változás: ez a spec váltja a 2026-10-16-os fontválasztást)
- `tests/lesson-typography.test.ts`: a családnevek és a `hu-3`; a manifest 14 face-t tartalmaz; az új családoknál `combiningMissing: []`.
- `tests/lesson-html-spec.test.ts`, `tests/lesson-design.test.ts`: családnevek, `hu-3`.
- `tests/lesson-typography.browser.ts`, `tests/lesson-fusion-live.browser.ts`: várt `font-family` és manifest-család.
- A mérce nem gyengül: ugyanazok az állítások, csak az új, jóváhagyott értékekkel.

## T5 — Ellenőrzés és szállítás
- `npm.cmd run check`, `lint`, `check:test`, `npm.cmd test`.
- Push, PR, Vercel-előnézet: 1–5. és 6–12. évfolyamos lecke — számított `font-family`, `document.fonts.check('16px "…"')`,
  ő/ű-próba, nincs vízszintes túlcsordulás; képernyőkép a tulajdonosnak.
- Review-botok, összevonás tulajdonosi jóváhagyással, Vercel-élesítés, élő ellenőrzés a websuli.vip-en.

## T6 — Módosítás: 0. és 6–12. évfolyam vissza Interre (ág: `feat/lecke-betu-inter-vissza`)
1. `lesson-typography.ts`: `LESSON_FONTS = ["Atkinson Hyperlegible Next", "Inter"]`; `BundledFont` legacy listában Figtree; `lessonFontPair` és
   `LESSON_TYPOGRAPHY_CONTRACT` Interrel; `hu-3` marad.
2. `lesson-design.ts` studio / laboratory / future → Inter; `studio.css` → Inter; a promptszövegek és megjegyzések Interrel.
3. Tesztek (dokumentált spec-változás): családnevek Inter; a `combiningMissing` állítás: Inter → `["U+030B"]`, más → `[]`.
4. `README.md` (fonts) tábla. Ellenőrzés: `check`, `lint`, `check:test`, `npm test`, Playwright typography + labs + fusion; PR, összevonás, élő ellenőrzés.
