import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests", testMatch: "studio-creation-flow.browser.ts", timeout: 30000, workers: 2,
  use: { ...devices["Desktop Chrome"], channel: "chrome", serviceWorkers: "block", baseURL: "http://127.0.0.1:5186" },
  webServer: { command: "npx cross-env VITE_ENABLE_RUNTIME_PROBE=1 vite --host 127.0.0.1 --port 5186 --strictPort", url: "http://127.0.0.1:5186", reuseExistingServer: false },
});
