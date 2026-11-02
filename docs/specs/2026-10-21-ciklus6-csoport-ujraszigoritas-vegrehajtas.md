# Ciklus 6 — végrehajtás (AI-ügynöknek)

Terv: `docs/specs/2026-10-21-ciklus6-csoport-ujraszigoritas.md`.

1. **`shared/answer-key-calibrate.ts`:** `CalibrationOptions.noCoverGroup?: boolean`; a `coverGroup` hívás feltétele kiegészül vele.
2. **`server/studio/experience-builder.ts`:** a kalibráció `noCoverGroup: reviewedIds.has(t.id)` (a lektori javítókör kifogásolt azonosítói).
3. **`server/studio/legacy-migration.ts`:** `LEGACY_REDO` (htmlFileId → célzott utasítás); `legacySource(file, extra?)`; a `startFresh` átadja;
   a körben a hibás, listán lévő, `redo` nélküli sorelem egyszer újra sorba (`redo: true`, `attempt: 0`); `LEGACY_BATCH_LIMIT` 132.
4. **Teszt:** `tests/ciklus6-csoport-ujraszigoritas.test.ts` — `noCoverGroup` (az S3d-eset csoport nélkül), `legacySource` az utasítással,
   `shouldRedo`; a `regi-anyag-studio` rögzített korlátja 132 (dokumentált spec-változás).
5. **Review #357:** a kifogásolt feladatra SEMMILYEN gépi szigorítás (`lektorReviewed`, a `tighten` ki sem fut; a lazítás marad); a tiltás
   körökön átível (`ExperienceCheckpoint.lektorReviewedIds`, `rememberLektorReviewed`, `calibrationOptionsFor`); a célzott utasítás
   `PONTOZÁSI SZABÁLY:` sorként megy (`shared/scoring-rules.ts`), a banképítő `scoringRules`-ként a rendszerpromptba és a hash-be kapja;
   a listás anyag infrastruktúra-hiba miatti újraindítása is `redo`-jelzős (egyszeri).
6. **Review #357 (Vercel):** `hydrateCheckpoint(prev)` — a bank munkapéldánya a `lektorReviewedIds`-t is átveszi (különben a körök közti tiltás elveszne); teszt a valódi úton.
