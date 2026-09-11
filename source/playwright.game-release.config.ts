import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: ["game-viewport-experience.spec.ts", "game-win-paths.spec.ts", "coupon-lesson.browser.ts"],
  timeout: 60000, workers: 1,
  use: { ...devices["Desktop Chrome"], channel: "chrome", serviceWorkers: "block", baseURL: "http://127.0.0.1:5183", screenshot: "only-on-failure" },
  webServer: { command: "npx cross-env VITE_ENABLE_RUNTIME_PROBE=1 VITE_ENABLE_GAME_TEST_HOOKS=1 vite --host 127.0.0.1 --port 5183 --strictPort", url: "http://127.0.0.1:5183", reuseExistingServer: false },
});
