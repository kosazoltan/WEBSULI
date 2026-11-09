# Spec: szebb, magyar ékezetbiztos tananyagbetű

> Dátum: 2026-11-09 · Állapot: **JÓVÁHAGYVA (tulajdonos, 2026-11-09: „B + D (javasolt)”)**
> Előzmény: `docs/specs/2026-10-16-websuli-design.md` (Nunito Sans / Inter). Végrehajtás: `docs/specs/2026-11-09-lecke-betucsere-vegrehajtas.md`.

## Kérés
- Tulajdonos: a jelenlegi betű „nagyon csúnya”; olyan kell, amely kezeli az ékezetes betűket, és szebb a tipográfiája.
- Összevetés (betűminta-oldal, 8 jelölt): a tulajdonos a **B – Atkinson Hyperlegible Next** (1–5. évfolyam) és a
  **D – Figtree** (0. és 6–12. évfolyam) párost választotta.

## Mért tény
- `shared/lesson-typography.ts` `lessonFontPair`: 1–5. → Nunito Sans, 0. és 6–12. → Inter; `LESSON_FONT_VERSION = "hu-2"`.
- `scripts/prepare-lesson-fonts.py` a Google Fonts hivatalos repójából, rögzített revízióval tölt; a teljes fontot WOFF2-be
  kódolja (nincs kivonat), ellenőrzi a magyar ábécét, és a manifestbe írja a hash-eket.
- Az új két család a szkripttel előállítva: mindkettő normál + valódi dőlt, a teljes magyar NFC-ábécé megvan, és a kombinálható
  U+0301 / U+0308 / U+030B is (`combiningMissing: []`). Súly: Atkinson 200–800, Figtree 300–900 (a 400–800-as tartomány megvan).

## Cél
- A tananyag (Stúdió-lecke lejátszó, HTML-tananyag, szerzői promptok) betűje: 1–5. évf. **Atkinson Hyperlegible Next**,
  0. és 6–12. évf. **Figtree**; a címsor ugyanaz a család. Tartalék: Noto Sans, majd rendszer sans-serif.
- A Stúdió felülete (`studio.css`) is Figtree-t használ (eddig Inter), hogy a szerkesztő és a lecke egységes legyen.
- A stíluslap verziója `hu-3` (immutable gyorsítótár miatt új URL).

## Nem cél
- Az alkalmazás általános felülete (`index.css` „Source Sans 3”, Tailwind `fontFamily`) — külön döntés.
- A régi családok (Nunito, Source Sans 3, Source Serif 4, Nunito Sans, Inter) törlése: helyben maradnak a régi HTML-témák
  leíró mezői és a korábbi tartalom miatt.

## Edge case-ek
- Felbontott (NFD) ő/ű: a megjelenítés NFC-re normalizál (marad); az új családoknál a kombinálható jelek is megvannak.
- Font nem töltődik be: Noto Sans, majd rendszerfont.
- Régi, saját HTML-dizájnú anyag: a `withLessonTypography` az új párost adja, az elrendezés marad.
- Visszatérő böngésző régi CSS-sel: a `?v=hu-3` új címet ad.

## Elfogadás (EARS)
- [ ] A1: WHEN a lecke évfolyama 1–5 THEN a törzs és a címsor betűje SHALL „Atkinson Hyperlegible Next”; WHEN 0 vagy 6–12 THEN „Figtree”.
- [ ] A2: A két új család normál és dőlt WOFF2-je SHALL helyben, a manifest hash-ével egyezően létezik, `hungarianVerified: true`,
      `combiningMissing: []`; külső (Google/CDN) font-kérés nincs.
- [ ] A3: A `LESSON_FONT_CSS` SHALL `/fonts/lesson-fonts.css?v=hu-3`, és az `index.html` ugyanezt tölti.
- [ ] A4: A szerzői promptok (`LESSON_TYPOGRAPHY_CONTRACT`, HTML-spec, skill, improve) az új családokat nevezik meg.
- [ ] A5: Valós böngészős render (Vercel-előnézet) egy 1–5. és egy 6–12. évfolyamos leckén: a számított `font-family` az új
      család, a betű ténylegesen betöltődött (`document.fonts.check`), az ő/ű helyesen jelenik meg, nincs vízszintes túlcsordulás.
- [ ] A6: `check`, `lint`, `check:test`, `npm test` hibátlan.
