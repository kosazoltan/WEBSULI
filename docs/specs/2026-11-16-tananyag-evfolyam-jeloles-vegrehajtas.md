# Végrehajtási utasítás — évfolyam-jelölés a tananyagkártyákon

**Állapot:** folyamatban – 2026-11-16, ág `fix/tananyag-evfolyam-jeloles`
Terv: `docs/specs/2026-11-16-tananyag-evfolyam-jeloles.md`

Minden útvonal a `source/` alatt értendő. Parancsok a `source/` könyvtárból.

## T1 — közös felirat-függvény

Fájl: `shared/classrooms.ts` (a meglévő exportok változatlanok).

1. Új export `NO_CLASSROOM_LABEL = "Nincs osztály"`, `PROGRAMMING_SHORT_LABEL = "Programozás"`.
2. Új `normalizeClassroom(value: unknown): number | null`: `typeof value === "number" && isValidClassroom(value)` → `value`, különben `null`.
3. Új `classroomDisplayLabel(value: unknown): string`: `null` → `NO_CLASSROOM_LABEL`; 0 → `PROGRAMMING_SHORT_LABEL`; 1–12 → `getClassroomLabel(n)`.

Teszt: `tests/classrooms.test.ts` új esetek — 0 → „Programozás”, 1 → „1. osztály”, 12 → „12. osztály”, 13 / -1 / 2.5 / NaN /
`null` / `undefined` / `"7"` → „Nincs osztály”; `normalizeClassroom` ugyanezekre.
Parancs: `node --import tsx --test tests/classrooms.test.ts` → minden eset pass.

## T2 — `ClassroomBadge` komponens

Új fájl: `client/src/components/ClassroomBadge.tsx`.

- Props: `classroom: unknown`, `warnMissing?: boolean`, `className?: string`.
- `normalizeClassroom` → `n`. Érvénytelen + `warnMissing`: borostyán keret/háttér, `AlertTriangle` ikon, `title="Az évfolyam hiányzik vagy érvénytelen — szerkesztéssel pótolható"`.
  Érvényes: semleges (narancs árnyalatú) keret, `GraduationCap` ikon.
- Szöveg: `classroomDisplayLabel(classroom)`; `data-testid="badge-classroom"`, `data-classroom={n ?? "none"}`.
- Ikon `aria-hidden`; a szöveg olvasható (legalább 11 px, `font-semibold`), `whitespace-nowrap`.

## T3 — admin kártya

- `client/src/components/FileCard.tsx`: új opcionális prop `classroom?: unknown`; ha a prop megadott (`classroom !== undefined` vagy
  `"classroom" in props` helyett: a hívó mindig átadja), a cím sora ALATT, a fejlécben: `<ClassroomBadge classroom={classroom} warnMissing={isAdmin} />`.
- `client/src/components/AdminFileDashboard.tsx` `SortableItem`: `classroom={file.classroom}`.
- `AdminFileDashboard.tsx` keresés: a `matchesSearch` a `classroomDisplayLabel(file.classroom)` szövegére is illeszt (pl. „8. osztály”).

## T4 — főoldali kártya

- `client/src/components/UserFileList.tsx` `renderCard`: a csip `normalizeClassroom(file.classroom)`; érvényes értéknél
  `<span className="home-card-grade" data-testid={`grade-file-${file.id}`}>{classroomDisplayLabel(n)}</span>`, érvénytelennél
  nincs csip. A téma (`homeCardTheme`) továbbra is a meglévő `classroom` változót kapja (a sáv színe nem változik).
- `client/src/index.css` `.home-card-grade`: 13 px, `font-weight: 800`, `padding: 3px 10px`, `max-width: calc(100% - 56px)`,
  `white-space: nowrap`, `overflow: hidden`, `text-overflow: ellipsis`, erős árnyék — az embléma (bal felső) mellett elfér.

## T5 — admin egy soros cserék (`classroomDisplayLabel`)

| Fájl:sor | Régi | Új |
|---|---|---|
| `client/src/components/MaterialImprover.tsx:524` | `({file.classroom}. osztály)` | `({classroomDisplayLabel(file.classroom)})` |
| `client/src/components/MaterialImprover.tsx:598` | `{file.classroom}. osztály` | `{classroomDisplayLabel(file.classroom)}` |
| `client/src/components/MaterialImprovementBackups.tsx:183` | `{backup.backupData.classroom}. osztály` | `{classroomDisplayLabel(backup.backupData.classroom)}` |
| `client/src/components/LessonRepairWorkbench.tsx:78` | ``{f.classroom ? ` · ${f.classroom}. osztály` : ""}`` | `` ` · ${classroomDisplayLabel(f.classroom)}` `` |
| `client/src/components/studio/DraftLessons.tsx:137` | ``{d.classroom ? ` · ${d.classroom}. osztály` : ""}`` | ``{d.classroom != null ? ` · ${classroomDisplayLabel(d.classroom)}` : ""}`` |
| `client/src/pages/admin.tsx:1029-1036` | `view.material?.classroom ? … {classroom}. osztály` | `view.material ? … {classroomDisplayLabel(view.material.classroom)}` |
| `client/src/pages/AdminStats.tsx:226` | `` `${classroom}. osztály: ${count}` `` | `` `${classroomDisplayLabel(classroom)}: ${count}` `` |

Mindegyikben import: `import { classroomDisplayLabel } from "@shared/classrooms";` (meglévő importhoz hozzáadva).

## T6 — böngészős próba (Playwright, ál-adat)

Új fájlok: `playwright.classroom-badge.config.ts` (vite, saját port 5193, Chrome) és `tests/classroom-badge.spec.ts`.
Az API a hálózaton ál-adat (`page.route("**/api/**")`), mint `tests/admin-responsive-helpers.ts` — a változás csak kliensoldali.
Ál-anyagok: 0, 4, 8, 12, érvénytelen (13) évfolyam, hosszú cím.

Esetek:
1. Főoldal asztali (1280×800) és mobil (360×640): minden érvényes kártyán `grade-file-<id>` = elvárt felirat; a 13-as kártyán nincs;
   a csip doboza a kártyán belül; nincs vízszintes kilógás; képernyőkép.
2. Admin `/admin?tab=files` „Összes”: minden kártyán `badge-classroom` a helyes szöveggel; a 13-as „Nincs osztály”,
   `data-classroom="none"`; szűrő (`filter-classroom-4`) után is jelvény; mobil 360×640: a jelvény nem takar gombot
   (`elementFromPoint` a gombok közepén a gombot adja), nincs kilógás; képernyőképek.
3. Tananyagjavító választó (`/admin?tab=lesson-repair`): a 0-s anyag sora „Programozás”.

Parancs: `npx playwright test --config playwright.classroom-badge.config.ts` → pass. Képek: `test-results/classroom-badge/*.png`,
átnézve (Read).

## T7 — ellenőrzés és lezárás

Külön parancsokban, külön kilépési kóddal: `npm run lint`, `npm run check`, `npm run check:test`, `npm test`,
`node scripts/qa/three-phase-check.mjs --base origin/main` (a repó gyökeréből). Push előtt `git fetch origin && git merge origin/main`,
friss `.audit-ok` a git-gyökérben és a munkafában. A terv állapotsora a végén: `kész – <dátum>, PR #<n>`.
