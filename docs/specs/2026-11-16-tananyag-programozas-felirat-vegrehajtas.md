# Végrehajtási utasítás — „Programozás” felirat + e2e-mentés

**Állapot:** folyamatban – 2026-11-16, ág `fix/tananyag-programozas-felirat`
Terv: `docs/specs/2026-11-16-tananyag-programozas-felirat.md`

Útvonalak a `source/` alatt.

## T1 — felirat-függvény

`shared/classrooms.ts`: `export function lessonHeaderGradeLabel(lessonClassroom: number, categoryClassroom?: number | null): string`
— `categoryClassroom === 0` → `classroomDisplayLabel(0)`; különben `getClassroomLabel(lessonClassroom)`.
Teszt `tests/classrooms.test.ts`: (8, 0) és (9, 0) → „Programozás”; (4, 4), (4, undefined), (4, null) → „4. osztály”; (7, 5) → „7. osztály”
(a felirat a lecke évfolyama, ha a kategória nem programozás); 1–12-re sosem sávtartomány.
Parancs: `node --import tsx --test tests/classrooms.test.ts`.

## T2 — lecke oldala

- `client/src/lesson-runtime/LessonRuntime.tsx`: prop `categoryClassroom?: number | null`; `:563` és `:578` →
  `lessonHeaderGradeLabel(lesson.classroom, categoryClassroom)`.
- `client/src/lesson-runtime/LessonView.tsx:82`: `categoryClassroom={material.classroom}`.
- `tests/exact-grade.test.ts`: a `LessonRuntime.tsx`-re a minta `lessonHeaderGradeLabel\(lesson\.classroom` (SPEC-VÁLTOZÁS 2026-11-16
  megjegyzéssel); a `LessonArtSummary.tsx`-re változatlan.

## T3 — böngészős próba

`tests/classroom-badge.spec.ts`: `/preview/<id>` ál-API-val — programozási anyag (kategória 0, lecke 8) → `.ws-grade` és `.lesson-chip`
„Programozás”; rendes (kategória 4, lecke 4) → „4. osztály”; 360×640 és 1280×800 képernyőkép, kilógás nélkül.
Parancs: `npx playwright test --config playwright.classroom-badge.config.ts`.

## T4 — eseményalapú mentés

`server/autoBackup.ts`: `triggerEventBackup(opts: { env?: NodeJS.ProcessEnv; create?: () => Promise<unknown> } = {})` —
`isE2eMode(env)` → `"skipped-e2e"` (nincs fájl, nincs időzítő); különben a régi logika a `create`-tel → `"started"` / `"scheduled"`.
`export function cancelPendingEventBackup(): boolean`.
Teszt `tests/auto-backup-event.test.ts`: e2e → a `create` nem hívódik, nincs időzítő; nem e2e → az első hívás `create`, a második
`"scheduled"`, `cancelPendingEventBackup()` → `true`, a `create` nem hívódik újra.
`tests/material-classroom-db.integration.ts`: a kényszerített `process.exit` törlése (a harness `WEBSULI_E2E=1`-et állít).

## T5 — ellenőrzés, PR

`npm run lint`, `check`, `check:test`, `npm test`, `npm run test:learning-db`, `build`, `node scripts/qa/three-phase-check.mjs --base origin/main`;
PR, CI zöldig, review-szálak; merge nincs.
