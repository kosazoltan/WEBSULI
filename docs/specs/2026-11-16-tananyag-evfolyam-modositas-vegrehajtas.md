# Végrehajtási utasítás — következetes évfolyam-módosítás

**Állapot:** folyamatban – 2026-11-16, ág `fix/tananyag-evfolyam-modositas-kovetkezetes`
Terv: `docs/specs/2026-11-16-tananyag-evfolyam-modositas.md`

Útvonalak a `source/` alatt; parancsok a `source/`-ból. A kódolás a #459-et tartalmazó `origin/main`-ről indul (merge).

## T1 — közös függvény

Új fájl `server/material-classroom.ts`:

1. `export class MaterialClassroomError extends Error { constructor(message: string, public status: 400 | 404 | 409) }`.
2. `export function normalizeMaterialIds(ids: readonly string[]): string[]` — trim, üres kiszűrve, ismétlődés nélkül, sorrendtartó.
3. `export async function setMaterialClassroomTx(tx, ids, classroom)`:
   - `isValidClassroom(classroom)` hamis → `MaterialClassroomError(…, 400)`; üres lista → 400.
   - `SELECT … FROM html_files WHERE id IN ids FOR UPDATE`; darabszám ≠ → 404 (a hiányzók megnevezése nélkül adatot nem szivárogtat: „N anyag nem található”).
   - `improved_html_files` `status='processing'` az érintett anyagokra → 409.
   - `lessons WHERE html_file_id IN ids FOR UPDATE`; `studio_jobs` `lesson_id IN … AND status IN ('queued','running','processing')` → 409.
   - Ha `classroom !== 0`: leckénként, ha `json.classroom !== classroom`: `candidate = await withLessonArt({ ...json, classroom }, lesson.id, tx)`, `lessonSchema.parse(candidate)`, `UPDATE lessons SET json, version = version + 1, updated_at = now()`.
     A forrásjegyzékek (`DISTINCT map_id`): ha más, nem érintett anyaghoz kötött lecke is használja (`html_file_id IS NOT NULL AND html_file_id NOT IN ids`) → 409; különben `UPDATE knowledge_maps SET classroom, updated_at` (csak ha eltér).
   - `UPDATE html_files SET classroom WHERE id IN ids`.
   - Visszatérés: `{ files: number; lessons: number; maps: number }`.
4. `export function setMaterialClassroom(ids, classroom)` — `db.transaction(tx => setMaterialClassroomTx(tx, ids, classroom))`.

## T2 — a két végpont

- `server/routes.ts` `PATCH /api/html-files/:id`: ha `updates.classroom !== undefined`, `db.transaction`: `setMaterialClassroomTx(tx, [id], classroom)`, majd a többi mező (`title`, `description`, `displayOrder`) `tx.update(htmlFiles)…returning()`, különben `select`. `MaterialClassroomError` → a saját státusza; a 404 üzenete a meglévő. Évfolyam nélkül a régi út (`storage.updateHtmlFile`) változatlan.
- `server/routes.ts` `bulk-move`: `setMaterialClassroom(materialIds, classroom)`; `movedCount = result.files`; `invalidateHtmlFilesCache()` (ha a router hatókörében nem érhető el, a `getHtmlFilesCache().invalidate`-nek megfelelő meglévő segéd); hiba-státusz a `MaterialClassroomError`-ból.
- `bulkMoveSchema.materialIds`: `z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/)` (UUID is illeszkedik).

## T3 — egységteszt

`tests/material-classroom.test.ts`: `normalizeMaterialIds` (trim, ismétlődés, üres); `bulkMoveSchema`-egyezés helyett a regex a
meglévő azonosító-formákra (UUID, `p0zzBVSIV-xty-XWGB2ZC`) igaz, `../x`, üres, 65 karakter hamis — a sémát exportálni NEM kell:
a regexet a modul exportálja (`MATERIAL_ID_PATTERN`), a `routes.ts` azt használja.
Parancs: `node --import tsx --test tests/material-classroom.test.ts`.

## T4 — DB-integráció (eldobható Postgres)

Új `tests/material-classroom-db.integration.ts` a `tests/support/authz-db-harness.ts`-szel (valódi HTTP, admin `/api/login`), és
felvétele a `scripts/run-learning-db-tests.ts` listájába. Esetek:
1. PATCH: Studio-lecke 2 → 3: `html_files`, `lessons.json.classroom`, `knowledge_maps.classroom` = 3; verzió +1; a lecke
   szekciói bájtra azonosak; `GET /api/lessons/by-file/:id` a 3-at adja; a mellékmezők (cím) ugyanabban a kérésben.
2. PATCH 0-ra: csak `html_files` = 0, a lecke / forrásjegyzék marad.
3. Tömeges: lecke + sima HTML + régi (nem UUID) azonosító → mind egyezik, `movedCount` = 3.
4. Érvénytelen évfolyam (13) mindkét úton → 400, ujjlenyomat változatlan.
5. Részleges hiba: egy nem létező azonosító a tömegben → 404; futó Stúdió-job → 409; megosztott forrásjegyzék → 409 — mindháromnál ujjlenyomat változatlan.
6. Nem admin (vendég, nem admin felhasználó) → 401 / 403, ujjlenyomat változatlan.
Parancs: `npm run test:learning-db` → pass.

## T5 — böngészős próba

`tests/classroom-badge.spec.ts` bővítése (a #459 fájlja): az admin szerkesztőben a lecke évfolyamát átállítva a PATCH a kért
évfolyamot küldi, és a lecke oldala (`/preview/<id>`) a `GET /api/lessons/by-file` válaszából az új évfolyamot mutatja (ál-API,
a szerveroldali igazságot a T4 bizonyítja). Parancs: `npx playwright test --config playwright.classroom-badge.config.ts`.

## T6 — ellenőrzés, PR

Külön parancsokban: `npm run lint`, `npm run check`, `npm run check:test`, `npm test`, `npm run test:learning-db`, `npm run build`,
`node scripts/qa/three-phase-check.mjs --base origin/main`. Push előtt `git fetch origin && git merge origin/main`, `.audit-ok` a
gyökérben és a munkafában. PR, CI zöldig, review-szálak; merge nincs.
