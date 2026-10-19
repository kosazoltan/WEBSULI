import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "lesson-band-colors.spec.ts", timeout: 45_000, workers: 1,
  use: { ...devices["Desktop Chrome"], channel: "chrome", serviceWorkers: "block", baseURL: "http://127.0.0.1:5189" },
  webServer: { command: "npx cross-env VITE_ENABLE_RUNTIME_PROBE=1 vite --host 127.0.0.1 --port 5189 --strictPort", url: "http://127.0.0.1:5189", reuseExistingServer: false, timeout: 120_000 },
});
