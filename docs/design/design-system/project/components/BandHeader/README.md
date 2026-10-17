# BandHeader
The top of every lesson: the band's badge, grade, theme name and motto, from the concept board's column heads.

- **Use** once per lesson page, above the hero. The band (`explorer` … `future`) comes from the lesson's grade, never from a learner's choice.
- **Consumer provides:** grade range text (`1–2.` …), theme name and motto from `DESIGN_THEMES` (`source/shared/lesson-design.ts`), and the band glyph (leaf · compass · brain · flask · rising chart).
- **Do:** set the grade and name in `title`; the badge fill is `accent` with an `on-accent` glyph.
- **Don't:** colour the grade text with raw `accent` (3–5. band: 3.45:1 on `surface`).
