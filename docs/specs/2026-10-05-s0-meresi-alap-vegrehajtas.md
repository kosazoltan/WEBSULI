# Végrehajtás — S0 mérési alap
1. `server/studio/run-metrics.ts`: `classifyFailure(error)`, `jobMetrics(row, notes)`, `subjectSummary(rows)` (tiszta).
2. `scripts/studio/baseline-metrics.mts`: olvasó lekérdezés (studio_jobs ⋈ knowledge_maps, lektor_notes aggregálva jobonként),
   kiírás `docs/measurements/2026-10-05-baseline.json` + konzol-táblázat.
3. `tests/run-metrics.test.ts`: osztályozás a mért hibaüzenet-mintákra, főkönyv + régi mezők, összesítés.
4. tsc, lint, teljes unit; a script futtatása és a JSON commitolása.
