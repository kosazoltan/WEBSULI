import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  timeout: 30000, globalTimeout: 180000,
  testDir: "./tests", testMatch: process.env.LESSON_LIVE_BROWSER === "1" ? "lesson-fusion-live.browser.ts" : "lesson-fusion.spec.ts", workers: 2, fullyParallel: true,
  use: { ...devices["Desktop Chrome"], channel: "chrome", serviceWorkers: "block", baseURL: "http://127.0.0.1:5184", screenshot: "only-on-failure" },
  webServer: { command: "npx cross-env VITE_ENABLE_RUNTIME_PROBE=1 vite --host 127.0.0.1 --port 5184 --strictPort", url: "http://127.0.0.1:5184", reuseExistingServer: false, timeout: 30000 },
});
