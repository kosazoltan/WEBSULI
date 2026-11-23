import { defineConfig, devices } from "@playwright/test";
// Osztály a tananyag címénél és a keresőben (docs/specs/2026-11-17-tananyag-cim-osztaly.md): főoldal + admin, ál-adattal, vite.
export default defineConfig({
  testDir: "./tests", testMatch: "material-title.spec.ts", timeout: 120_000, workers: 1,
  use: { ...devices["Desktop Chrome"], serviceWorkers: "block", baseURL: "http://127.0.0.1:5196" },
  webServer: { command: "npx cross-env VITE_ENABLE_RUNTIME_PROBE=1 vite --host 127.0.0.1 --port 5196 --strictPort", url: "http://127.0.0.1:5196", reuseExistingServer: false, timeout: 120_000 },
});
