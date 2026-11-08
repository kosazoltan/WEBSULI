# Végrehajtás: ellenőrző kérdés és záró összefoglaló fejléce a tartalomból

> Spec: `docs/specs/2026-11-08-tartalmi-fejlecek-2.md` · Ág: `feat/tartalmi-fejlecek-2` · Kanban: #8

## T1 — `source/shared/lesson-block-label.ts`
1. Új export:
   ```ts
   export const CHECK_FORMS: ReadonlyArray<readonly [RegExp, string]> = [
     [/igaz vagy hamis/i, "Igaz vagy hamis?"],
     [/kakukktojás|nem illik (?:közé|a sorba)/i, "Kakukktojás"],
     [/találós/i, "Találós kérdés"],
     [/analógia|úgy aránylik|úgy viszonyul/i, "Analógia"],
     [/sorminta|következő elem/i, "Sorminta"],
     [/melyik (?:állítás )?hamis/i, "Melyik hamis?"],
     [/\bha\b[^.?!]*\bakkor\b/i, "Következtetés"],
   ];
   export function checkFormLabel(question: string): string | null { … első egyező címke, különben null }
   ```
2. `blockLabel(blocks, index, sectionIdx, band, classroom?, isLastSection?)`:
   - `check`: `checkFormLabel(block.question) ?? theme.labels.check`;
   - `recap`: ha `isLastSection` és a fejezetben ez az utolsó `recap` → „A lecke tanulsága”, különben `theme.labels.recap`.

## T2 — `source/client/src/lesson-runtime/LessonRuntime.tsx`
1. A `CheckBlock` és a `RecapBlock` opcionális `label` propot kap (alap a mai sáv-címke); a `LessonBlock` továbbadja.
2. `LessonSection` új `isLastSection: boolean` prop; a két hívóhely `si === lesson.sections.length - 1`-et ad; a `blockLabel` hívás megkapja.

## T3 — Teszt: `source/tests/lesson-block-label.test.ts` bővítése új `test` blokkokkal (meglévő állítás nem változik)
- `check` formák: mind a hét forma + egy sima kérdés (sáv-címke) + „Ha …. Akkor” két mondatban → nem „Következtetés”.
- `recap`: utolsó fejezet utolsó recap → „A lecke tanulsága”; utolsó fejezet nem utolsó recap → sáv-címke; nem utolsó fejezet → sáv-címke;
  `isLastSection` nélkül → sáv-címke.

## T4 — Ellenőrzés és szállítás
- `node --import tsx --test tests/lesson-block-label.test.ts`; `npm.cmd run check`, `lint`, `check:test`, `npm.cmd test`.
- Push, PR, Vercel-előnézet (megosztható link) az élő „Harasztok…” leckén: a `check` fejlécek formák szerint, az utolsó recap „A lecke tanulsága”,
  nincs vízszintes túlcsordulás. Review-botok a legutolsó kódcommitra, automatikus összevonás, `verify-render-revision`, élő ellenőrzés.
