import { defineConfig, devices } from "@playwright/test";
// Spec docs/specs/2026-11-10-fejezet-kisfilmek.md: a fejezetenkénti kisfilmek lejátszója valódi böngészőben (próbaoldal, szerver nélkül).
export default defineConfig({
  timeout: 45000, globalTimeout: 240000,
  testDir: "./tests", testMatch: "lesson-clips.spec.ts", workers: 2, fullyParallel: true,
  use: { ...devices["Desktop Chrome"], channel: "chrome", serviceWorkers: "block", baseURL: "http://127.0.0.1:5193", screenshot: "only-on-failure" },
  webServer: { command: "npx cross-env VITE_ENABLE_RUNTIME_PROBE=1 vite --host 127.0.0.1 --port 5193 --strictPort", url: "http://127.0.0.1:5193", reuseExistingServer: false, timeout: 30000 },
});
