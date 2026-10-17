Websuli is one learning platform with five looks: the lesson's grade picks the band, and the band sets colour, type size, imagery and voice. Everything else — components, layout, behaviour — is shared. Build every lesson screen from these tokens and components; never invent a palette or a font per lesson.

## The five bands
| Theme id | Grades | Name | Motto | Mascot | Imagery |
|---|---|---|---|---|---|
| `explorer` | 1–2. | Felfedező világ | Kíváncsiság • Játék • Alapok | yes | soft 3D storybook, the fox |
| `adventure` | 3–5. | Tudás kalandjai | Fedezz fel • Próbáld ki • Fejlődj | yes | painterly expedition landscapes |
| `studio` | 6–8. | Kreatív stúdió | Gondolkodj • Alkoss • Oldj meg | no | semi-realistic wonder (space, nature, technology) |
| `laboratory` | 9–10. | Digitális tudáslabor | Elemezz • Kísérletezz • Valósítsd meg | no | crisp realistic science and engineering |
| `future` | 11–12. | Jövőtervező | Tudás • Célok • Lehetőségek | no | cinematic, people only from behind |

Grade 0 (programming basics) uses `studio`. The band follows the lesson's grade, never the learner's taste; access to content is decided by the profile, not by the theme.

**The maturity axis.** Left to right the bands move together on six lines: picture (drawn mascot → cinematic photo), icon (glossy 3D → clean flat), density (four big tiles → data and charts), voice ("Szia!" → goals and quotes), colour (warm, saturated → dark ground with one teal accent), reward (stars → statistics). Keep every new screen on the same point of the axis as its band.

## Colour
- `surface` is the page; `panel` holds cards; `soft` tints chips, the selected tab and recap cards. Text is `ink`; secondary text `muted`; headings, grade and band name `title`.
- `accent` is the band's hue for fills, badges, progress and the selected-tab ring — never text on light grounds in `adventure` and `future`.
- Buttons use the measured pairs only: `strong`/`on-strong` (primary) and `secondary`/`on-secondary`.
- `accent-2` and `accent-3` are companion hues for chapter colours, step discs and charts, with `on-accent` for text on them.
- Feedback always carries a word or glyph: `success-bg`/`on-success-bg` with ✓, `warning-bg`/`on-warning-bg` titled 'Figyelj!', `danger` with the word.
- Every text pair is at least 4.5:1 in all five themes; the `accent` fill on `track` is at least 3:1.

## Type
- Nunito Sans for `explorer` and `adventure` (`font-young`), Inter for every other band (`font-lesson`), both self-hosted with full Hungarian coverage (ő, ű, Ő, Ű). No other face, no Google Fonts at runtime.
- Lesson text never drops below the band minimum: `body-explorer` 22px, `body-adventure` 19px, 17px in `studio`, `body` 16px in `laboratory` and `future`. `caption` (13px) is the floor for labels and never carries lesson content.
- Headings are heavy (800–900) with slight negative tracking: `lesson-title`, `band-name`, `grade`, `section-title`, `card-title`.
- Write in Hungarian, in the friendly second person singular ('Nézd meg', 'Próbáld ki'); the 1–5. bands may use 'Szia!' and exclamation marks, the 9–12. bands stay calm and precise.

## Imagery
- Only approved pictures from the Websuli catalogue (`source/shared/design-asset-catalog.ts`): MI-generated (Seedream 5.0 Pro) from the versioned prompts in `source/design-assets/`, each approved by the owner.
- Never text, letters or numbers inside a picture; the title stays on the card.
- Gender-neutral and stereotype-free; no recognisable real person; older bands show people only from behind or far away.
- The lesson picture is chosen by `pickLessonArt` and rotates, so lessons look varied: a topic cover whose keywords match the title; otherwise the band hero (double weight), the other heroes of the same age group and the same-subject covers of that age group. The choice is seeded by the lesson id, so one lesson always shows the same picture; the 1–5. and 6–12. age groups never mix.
- The fox mascot appears only in `explorer` and `adventure`, always the same character; its pose rotates per lesson, in a white `bubble` with `on-bubble` text. No mascot portrait over a picture that already shows the fox (`hero-explorer`).

## Icons
- Subject icons come from the catalogue: glossy 3D toy-like objects for the 1–5. bands (`-young`), clean soft 3D in the reference atom style for the 6–12. bands.
- UI glyphs (tabs, badge) are 2.2px-stroke line icons in `currentColor`; band badges are leaf, compass, brain, flask and rising chart.
- No emoji as decoration.

## Layout and shape
- Cards: `panel`, 1px `line` border, `radius-lg`, `shadow-card`; gaps `space-3`–`space-4`; card padding `space-5`.
- The band header uses `radius-xl`; chips and rails `radius-pill`; buttons `radius-sm`, at least 44px tall.
- Phones: one column, 16px gutters, the hero picture on top at 16:9; no horizontal scroll at 320–2560px.
- Focus: 3px `focus` outline with a 3px `focus-inner` ring — visible on every band.
- Motion: none required; nothing animates when `prefers-reduced-motion` is set.

## Keeping it current
Change a value here and in `source/shared/lesson-design.ts` + `lesson-design.css` together (the unit test `tests/lesson-design.test.ts` checks the pair and every contrast). New pictures: add a prompt to `source/design-assets/prompts.json`, run `scripts/design-assets/generate.ts`, approve on the review page, then `approve.ts` writes the catalogue.
