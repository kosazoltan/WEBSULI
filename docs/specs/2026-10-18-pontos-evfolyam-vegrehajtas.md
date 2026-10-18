# Pontos évfolyam a lecke fejlécében — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-18-pontos-evfolyam.md`. Munkakönyvtár: `source/`. Ág: `fix/pontos-evfolyam`.

1. **`client/src/lesson-runtime/LessonRuntime.tsx`:** a `ws-grade` bekezdés szövege `{getClassroomLabel(lesson.classroom)}`,
   import a `@shared/classrooms`-ból. A sáv neve (`ws-band-name`) és mottója változatlan.
2. **`client/src/components/studio/LessonArtSummary.tsx`:** a `{theme.grades} osztály · {theme.name}` helyett
   `{getClassroomLabel(data.classroom)} · {theme.name}`.
3. **Teszt:** `tests/lesson-design.spec.ts` sávonkénti ciklusában a `ws-bandhead` tartalmazza a próbalecke pontos évfolyamát,
   és nem tartalmaz `\d+–\d+\.` tartományt.
   - Új statikus őr: `tests/exact-grade.test.ts`, amely szerint a `LessonRuntime.tsx` és a `LessonArtSummary.tsx` nem írja ki a
     `.grades` mezőt.
4. **Ellenőrzés:**
   - `npx.cmd tsc --noEmit -p .`, `npm.cmd test`, `npx.cmd playwright test tests/lesson-design.spec.ts tests/lesson-responsive.spec.ts`;
   - élesben egy 5. évfolyamos lecke fejléce.
