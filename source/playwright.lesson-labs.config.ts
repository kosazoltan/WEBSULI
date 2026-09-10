import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "lesson-labs.browser.ts", timeout: 45000, workers: 1,
  use: { ...devices["Desktop Chrome"], channel: "chrome", hasTouch: true, serviceWorkers: "block", baseURL: "http://127.0.0.1:5187" },
  webServer: { command: "npx cross-env VITE_ENABLE_RUNTIME_PROBE=1 vite --host 127.0.0.1 --port 5187 --strictPort", url: "http://127.0.0.1:5187", reuseExistingServer: false },
});
