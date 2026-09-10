import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "learning-flow.browser.ts", timeout: 45000, workers: 1,
  use: { ...devices["Desktop Chrome"], channel: "chrome", serviceWorkers: "block", baseURL: "http://127.0.0.1:5182" },
  webServer: { command: "npx cross-env VITE_ENABLE_RUNTIME_PROBE=1 vite --host 127.0.0.1 --port 5182 --strictPort", url: "http://127.0.0.1:5182", reuseExistingServer: false },
});
