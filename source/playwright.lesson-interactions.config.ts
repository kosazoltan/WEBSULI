import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "lesson-interactions.browser.ts", workers: 1,
  use: { ...devices["Desktop Chrome"], channel: "chrome", baseURL: "http://127.0.0.1:5186", screenshot: "only-on-failure" },
  webServer: { command: "npm run build:client && npx vite preview --host 127.0.0.1 --port 5186 --strictPort", url: "http://127.0.0.1:5186", reuseExistingServer: false, timeout: 120000 },
});
