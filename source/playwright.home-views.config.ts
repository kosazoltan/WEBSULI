import { defineConfig, devices } from "@playwright/test";
// Spec 2026-11-03-fooldal-nezetek: a főoldali nézetek (mockolt API, vite) — a tanmenet-sorrend tesztje is fut, hogy az alapnézet változatlan.
export default defineConfig({
  testDir: "./tests", testMatch: ["home-views.spec.ts", "curriculum-order.spec.ts"], timeout: 60_000, workers: 2,
  use: { ...devices["Desktop Chrome"], channel: "chrome", serviceWorkers: "block", baseURL: "http://127.0.0.1:5191" },
  webServer: { command: "npx cross-env VITE_ENABLE_RUNTIME_PROBE=1 vite --host 127.0.0.1 --port 5191 --strictPort", url: "http://127.0.0.1:5191", reuseExistingServer: false, timeout: 120_000 },
});
