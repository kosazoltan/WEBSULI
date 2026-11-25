# Végrehajtás: 6-osztályos gimnáziumi felvételi csoport (#1986)

Terv: `docs/specs/2026-11-24-gimi-felveteli-csoport.md`

1. Bukó DB-teszt: `source/tests/tracks-db.integration.ts` (E1–E4), regisztrálva a `run-learning-db-tests.ts`-ben a 0046-os migrációval együtt.
2. Adatmodell és API:
   - `shared/tracks.ts`;
   - `migrations/0046_material_tracks.sql`;
   - `shared/schema.ts`: `html_files.tracks`, `track_assignments`;
   - `server/tracks-routes.ts`: `GET /api/tracks/mine`, `PUT /api/html-files/:id/tracks`;
   - `storage.getAllHtmlFiles`: `tracks`.
3. Főoldal: bukó e2e (`gimi-track-home.spec.ts`), majd a „Gimi felv.” csip a „Prog.” után, szűrés és kiemelés (`UserFileList.tsx`).
4. Admin: jelölő a fájlszerkesztőben; tananyagkészítő-cél (évfolyam 6, matematika vagy magyar), közzétételkor `tracks`.
5. Próbahibák:
   - a játékoscím fiókkulcs nélkül → E2 bukik;
   - a csoportszűrő kiiktatásával az e2e bukik.
6. Kapulánc: `gate:stage` → `gate:push` → helyi ellenőr → `gate:pr` → PR.
