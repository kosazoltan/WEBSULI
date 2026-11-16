import { defineConfig, devices } from "@playwright/test";
// Évfolyam-jelölés a tananyagkártyákon (docs/specs/2026-11-16-tananyag-evfolyam-jeloles.md): főoldal + admin, ál-adattal, vite.
export default defineConfig({
  testDir: "./tests", testMatch: "classroom-badge.spec.ts", timeout: 120_000, workers: 2,
  use: { ...devices["Desktop Chrome"], channel: "chrome", serviceWorkers: "block", baseURL: "http://127.0.0.1:5193" },
  webServer: { command: "npx cross-env VITE_ENABLE_RUNTIME_PROBE=1 vite --host 127.0.0.1 --port 5193 --strictPort", url: "http://127.0.0.1:5193", reuseExistingServer: false, timeout: 120_000 },
});
