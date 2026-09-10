import { defineConfig, devices } from "@playwright/test";

// Isolated frontend: no production database, migrations, jobs or email delivery.
export default defineConfig({
  testDir: "./tests",
  testMatch: "material-list-recovery.spec.ts",
  fullyParallel: true,
  workers: 2,
  // Playwright route mocks cannot intercept service-worker-owned fetches.
  use: { ...devices["Desktop Chrome"], channel: "chrome", serviceWorkers: "block", baseURL: "http://127.0.0.1:5178", screenshot: "only-on-failure" },
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 5178 --strictPort",
    url: "http://127.0.0.1:5178",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
