import { defineConfig, devices } from "@playwright/test";
// A forrás-ábrák megjelenítői (docs/specs/2026-11-18-tananyag-gyartas-minoseg.md, S2a): táblázat, szabálydoboz, összehasonlító kártyák — vite, mérőlecke.
export default defineConfig({
  testDir: "./tests", testMatch: "source-visuals.spec.ts", timeout: 90_000, workers: 1,
  use: { ...devices["Desktop Chrome"], serviceWorkers: "block", baseURL: "http://127.0.0.1:5197" },
  webServer: { command: "npx cross-env VITE_ENABLE_RUNTIME_PROBE=1 vite --host 127.0.0.1 --port 5197 --strictPort", url: "http://127.0.0.1:5197", reuseExistingServer: false, timeout: 120_000 },
});
