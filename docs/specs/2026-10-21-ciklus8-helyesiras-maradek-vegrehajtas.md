# Ciklus 8 — végrehajtás (AI-ügynöknek)

Terv: `docs/specs/2026-10-21-ciklus8-helyesiras-maradek.md`.

1. **`shared/single-choice-check.ts`:** `textKey` kis- és nagybetű-megtartó (`caseKey`) az ismétlődés-vizsgálatban; a többi norm változatlan.
2. **`server/studio/legacy-migration.ts`:** `LEGACY_REDO_ROUND = 3`; `LEGACY_BATCH_LIMIT = 178`.
3. **Teszt:** a helyesírási opciók (Egri / egri; a Petőfi-iskola három írásmódja) nem ismétlődések, a szó szerinti ismétlődés az;
   a regi-anyag-studio és a ciklus6 teszt rögzített értékei (dokumentált spec-változás).
