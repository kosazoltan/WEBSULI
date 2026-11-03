# Végrehajtás — alkalmazás utáni visszaolvasás (terv: `docs/specs/2026-11-03-apply-visszaolvasas.md`)

Munkakönyvtár: `source/`.

## T1 — tiszta ellenőrző
- `server/workflows/apply.ts`: új exportált `appliedLessonMatches(json, candidate, backups, improvedFileId)` — a legkorábbi,
  `improvedFileId`-hez tartozó mentés `backupData.expectedCurrentHash`-e egyezik `repairHash(json)`-nal, ÉS
  `repairHash(json art nélkül) === repairHash(candidate art nélkül)`.
- A lecke-ág visszaolvasása ezt hívja a `storage.getAllMaterialImprovementBackups(original.id)` eredményével.

## T2 — teszt
- Új `tests/apply-readback.test.ts`: art-eltérés + egyező mentés-hash → igaz; tartalmi eltérés → hamis; nincs mentés → hamis;
  két mentés (alkalmazás + későbbi visszaállítás, csökkenő időrendben) → a legkorábbi számít.
- Ellenőrzés: `node --import tsx --test tests/apply-readback.test.ts` → `ℹ fail 0`; `npx tsc --noEmit`,
  `npx eslint client/src server --max-warnings 0`, `npm test` → zöld.

## T3 — élesítés
- PR → CI → merge; Render-revízió = merge commit.
- Élesben `POST /api/admin/improved-files/bb9dca4d-07a4-4284-9a17-af09e66db90f/apply` (admin munkamenetből) → 200
  `success: true`; a lecke verziója marad 2 (nincs dupla alkalmazás); a mentések száma marad 1.
