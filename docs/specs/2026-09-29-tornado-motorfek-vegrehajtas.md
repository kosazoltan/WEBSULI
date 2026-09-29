# Végrehajtási utasítás: Tornádó motorfék (2026-09-29)

Terv: `docs/specs/2026-09-29-tornado-motorfek.md`. Ág: `fix/tornado-motorfek` (alap: `origin/main`).
1. **Teszt ELŐBB:** új `source/tests/tornado-engine-brake.test.ts`.
   - E1: végsebességről gáz nélkül, 2,5 s szimuláció 30, 60 és 144 Hz-en → sebesség < 5% vmax. A régi kódon bukik (≈ 38%).
   - E2: teljes gázzal a végsebesség ugyanaz.
2. **Kód:** `source/client/src/lib/tornado/drive.ts` `stepVehicle`: `ENGINE_BRAKE_PER_S = 1.2`; ha `|throttle| < 0.05 && !brake`, akkor `speed *= exp(-ENGINE_BRAKE_PER_S · dt)`.
3. **Kapuk:** tsc ×2, lint, teljes unit-suite, build; a CI E2E (`games-touch-controls`).
