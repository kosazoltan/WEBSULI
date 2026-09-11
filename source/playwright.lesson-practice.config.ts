import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "lesson-practice.browser.ts", timeout: 45000, workers: 1,
  use: { ...devices["Desktop Chrome"], channel: "chrome", hasTouch: true, serviceWorkers: "block", baseURL: "http://127.0.0.1:5188" },
  webServer: { command: "npx cross-env VITE_ENABLE_RUNTIME_PROBE=1 vite --host 127.0.0.1 --port 5188 --strictPort", url: "http://127.0.0.1:5188", reuseExistingServer: false },
});
