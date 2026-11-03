# Végrehajtás — alkalmazás utáni visszaolvasás (terv: `docs/specs/2026-11-03-apply-visszaolvasas.md`)

Munkakönyvtár: `source/`.

## T1 — tiszta ellenőrző
- `server/lib/canonical-hash.ts`: `canonicalJson` + `repairHash` (a `step-io` és a `structured-improvement` innen importál és
  továbbexportál).
- `server/workflows/apply.ts`: exportált `appliedLessonMatches(json, candidate, backups, improvedFileId)` — van az
  `improvedFileId`-hez olyan mentés, amelynek `backupData.expectedCurrentHash`-e = `repairHash(json)`, ÉS
  `repairHash(json art nélkül) === repairHash(candidate art nélkül)`.
- A lecke-ág a leckét és a javítás mentéseit egy `repeatable read`, `read only` tranzakcióban olvassa, majd ezt hívja.

## T2 — teszt
- Új `tests/apply-readback.test.ts`: art-eltérés + egyező mentés-hash → igaz; tartalmi eltérés → hamis; nincs mentés → hamis;
  alkalmazás + visszaállítás mentése bármely sorrendben → igaz az alkalmazott, hamis a visszaállított leckére.
- Ellenőrzés: `node --import tsx --test tests/apply-readback.test.ts` → `ℹ fail 0`; `npx tsc --noEmit`,
  `npx eslint client/src server --max-warnings 0`, `npm test` → zöld.

## T3 — élesítés (kockázatkezeléssel)
- Visszaállítási pont: a merge előtti `main` commit (Render-revízió); hibánál `git revert` a merge commitra → új deploy.
  Az adatot a módosítás nem írja (csak a visszaolvasást), a lecke mentése a 2026-11-03-i alkalmazás `material_improvement_backups`
  sora (admin „Biztonsági mentések” → visszaállítás).
- PR → CI → merge; Render-revízió = merge commit (`/api/health`).
- Élesben az admin munkamenetből `POST /api/admin/improved-files/<javítás-azonosító>/apply` → 200 `success: true`.
  Kockázat: nincs — `status = applied` ágon nem ír (nincs dupla alkalmazás). Ellenőrzés: a lecke verziója változatlan,
  a mentések száma változatlan (1).
