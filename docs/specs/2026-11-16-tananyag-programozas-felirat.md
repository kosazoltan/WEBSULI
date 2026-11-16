# „Programozás” felirat a programozási lecke oldalán + eseményalapú mentés e2e-módban (kanban #54, 3. szelet)

**Állapot:** folyamatban – 2026-11-16, ág `fix/tananyag-programozas-felirat`
Végrehajtási utasítás: [`2026-11-16-tananyag-programozas-felirat-vegrehajtas.md`](2026-11-16-tananyag-programozas-felirat-vegrehajtas.md)
Előzmény: [`2026-11-16-tananyag-evfolyam-modositas.md`](2026-11-16-tananyag-evfolyam-modositas.md) (PR #465)

## Cél

1. Tulajdonosi döntés (2026-11-16, űrlap): „Igen, ott is »Programozás«”. A programozási kategóriába (`html_files.classroom = 0`)
   tartozó Studio-lecke megnyitott oldalának fejléce a tartalmi évfolyam („8. osztály”) helyett „Programozás” feliratot mutasson,
   a közös `classroomDisplayLabel`-lel. A lecke ADATA nem változik (a tartalmi évfolyam marad: arculat-sáv, betűpár, korosztály,
   gyártás, tanmenet abból számol).
2. `server/autoBackup.ts`: e2e-módban (`WEBSULI_E2E=1`, `server/lib/e2e-mode.ts` `isE2eMode`) a `triggerEventBackup` ne írjon
   mentésfájlt és ne hagyjon nyitott időzítőt; legyen leállító függvénye (`cancelPendingEventBackup`). Éles viselkedés változatlan.
   A #465 DB-tesztjének kényszerített kilépése rendes kilépésre áll vissza.

## Nem-cél

- A lecke adatának / tartalmi évfolyamának módosítása; az eredmény-e-mail (csak leltár); szerveroldali API-bővítés (nem kell).
- Az admin-szerkesztő és a főoldal (már „Programozás”, PR #459).

## A felmérés tényei (fájl:sor, `source/` alatt)

- A lecke oldala: `client/src/pages/Preview.tsx:272` → `LessonView material={material}`; a `material` a `GET /api/html-files/:id`
  teljes sora (`server/routes.ts` ~1678–1684), benne a `classroom` (kategória). → **Szerveroldali bővítés nem kell**: a
  `LessonView` már ismeri (`lesson-runtime/LessonView.tsx:22,37`), csak nem adja tovább a `LessonRuntime`-nak (`LessonView.tsx:82`).
- Évfolyam-kiírás a lecke oldalán: `lesson-runtime/LessonRuntime.tsx:563` (`.ws-grade` a fejléc-sávban,
  `getClassroomLabel(lesson.classroom)`) és `:578` (`.lesson-chip` a hős-blokkban, `${lesson.classroom}. osztály`) → mindkettő a kategória szerint.
- Tartalmi évfolyamot használó, nem felirat jellegű helyek (maradnak): `LessonRuntime.tsx:496-510` (korosztály-sáv, arculat-téma,
  betűpár), `:555` (`data-learning-age`), `:587,605` (`LessonSection classroom` — blokkfeliratok a korosztályhoz), `LessonLoading.tsx:14`
  (a betöltő téma-színe a kategóriából — változatlan).
- Más `LessonRuntime`-hívók (kategória nélkül, változatlanok): `MaterialImprover.tsx:693,725` (javítás-előnézet), `LessonRuntimeProbe.tsx:254`.
- Megosztás / nyomtatás: a lecke oldalán nincs évfolyamot író megosztási szöveg; a böngészőfül címe a tananyag címe.
- Leltár (nem módosul): a Studio-lecke eredmény-e-mailje (`shared/lesson-result-email.ts` `buildResultEmail`, törzs: „Évfolyam: N. osztály”,
  a lecke ADATÁBÓL: `server/lesson-result-email.ts:62` `lesson.data.classroom`) → programozási leckénél a tartalmi évfolyamot írja.
- `tests/exact-grade.test.ts`: a fejléc a pontos évfolyamot írja (nem sávtartományt) — a `getClassroomLabel(lesson.classroom)` mintát
  keresi a `LessonRuntime.tsx`-ben. Tervezett spec-változás: a felirat a közös `lessonHeaderGradeLabel`-ből jön, amely 1–12-re a pontos
  évfolyamot adja (egységteszt) — a szigor megmarad.
- `server/autoBackup.ts:164-188` `triggerEventBackup`: azonnali `createAutoBackup('event')` (fájl a `backups/` mappába) vagy 5 perces
  `setTimeout`; nincs leállító. Hívók: `server/routes.ts` (feltöltés, szerkesztés, törlés).

## A megoldás

- `shared/classrooms.ts`: `lessonHeaderGradeLabel(lessonClassroom, categoryClassroom?)` — kategória 0 → `classroomDisplayLabel(0)`
  („Programozás”); különben `getClassroomLabel(lessonClassroom)`.
- `LessonRuntime`: új opcionális prop `categoryClassroom`; a két felirat ebből. `LessonView` átadja a `material.classroom`-ot.
- `autoBackup.ts`: `triggerEventBackup(opts = {})` (`env`, `create` befecskendezhető; visszatér: `"skipped-e2e" | "started" | "scheduled"`),
  e2e-módban azonnal kilép; új `cancelPendingEventBackup()`.

## EARS elfogadás

<!-- acceptance-checklist -->

- [ ] P1 WHEN egy programozási kategóriájú (`html_files.classroom = 0`) Studio-lecke oldala megnyílik THEN the system SHALL a fejléc-sávban
  és a hős-blokk csipjében „Programozás” feliratot mutatni; a lecke arculata (sáv, téma) változatlan.
- [ ] P2 WHEN rendes (1–12) lecke nyílik meg THEN the system SHALL a felirata változatlan („N. osztály”, a lecke évfolyama).
- [ ] P3 The system SHALL a lecke adatát nem módosítani; API-bővítés nincs.
- [ ] P4 WHEN `WEBSULI_E2E=1` THEN the system SHALL az eseményalapú mentést kihagyni (nincs fájl, nincs időzítő); egyébként változatlan.
- [ ] P5 The system SHALL a #465 DB-tesztjét kényszerített kilépés nélkül, rendesen lezárni.
