import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "admin-responsive.spec.ts", timeout: 240_000, workers: 2,
  use: { ...devices["Desktop Chrome"], channel: "chrome", serviceWorkers: "block", baseURL: "http://127.0.0.1:5190", hasTouch: true },
  webServer: { command: "npx cross-env VITE_ENABLE_RUNTIME_PROBE=1 vite --host 127.0.0.1 --port 5190 --strictPort", url: "http://127.0.0.1:5190", reuseExistingServer: false, timeout: 120_000 },
});
