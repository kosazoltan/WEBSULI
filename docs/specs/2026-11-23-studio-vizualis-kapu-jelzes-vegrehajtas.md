# Végrehajtás — vizuális ellenőrzés kihagyásának jelzése (terv: `docs/specs/2026-11-23-studio-vizualis-kapu-jelzes.md`)

1. RED — `source/tests/single-run-engine.test.ts`:
   - az „F12” tesztben `coverageGate` dobó injektálással: `result.warnings`, `quality.warnings`, `qualityNotes` pontosan egyszer
     tartalmazza a `VISUAL_CHECK_SKIPPED_WARNING` szöveget; ellenpróba: hibátlan kapunál nincs.
   - új teszt: az 1. állomás érvényesítője dob (a `sanitizeSourceVisuals` cseréje helyett a `judgeSourceVisuals` hibaág eredménye:
     `validatorError: true`), és a futás-szintű teszt egy `visualsValidatorError: 1` telemetriájú mentett kimenetből folytat →
     a figyelmeztetés egyszer (E2, E3).
   - új teszt: enforce, az első mérés bukik, a pótló forduló utáni mérés dob → közzététel, napló „elmaradt”, figyelmeztetés (E4).
   - Parancs: `cd source && env -u DATABASE_URL npx tsx --test tests/single-run-engine.test.ts` → az új állítások buknak.
2. GREEN — `source/shared/run-telemetry.ts`: `RunGates.visualsValidatorError?: number` + nézet-sor.
3. GREEN — `source/server/studio/single-run/engine.ts`:
   - `export const VISUAL_CHECK_SKIPPED_WARNING`.
   - `judgeSourceVisuals` hibaág: `validatorError: true`, naplósor „a vizuális ellenőrzés elmaradt”.
   - `readSourceStation`: `validatorError` → `telemetry.gates.visualsValidatorError = 1`.
   - `judge`: `null` → naplósor, `ok: true` helyett „skipped” út (nem átmenés-jelzés), a futás megy tovább.
   - a `done` mentés előtt: `gateErrors`/`visualsValidatorError` → `warnings` + `qualityNotes` (deduplikálva).
4. Mérés: a teszt-fájl zöld; `npm run gate:stage`, `npm run gate:push`, `node scripts/qa/gates/local-review.mjs`,
   `npm run gate:pr -- --body-file <fájl>`.

## Végrehajtási napló

- 2026-11-23 — terv és utasítás; kód utána.
