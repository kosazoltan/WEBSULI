import { defineConfig, devices } from "@playwright/test";

// Isolated service-worker lifecycle test: a tiny static server over client/public,
// no database, no app build. Real (non-mocked) service-worker support is required here; Playwright's
// pinned Chromium provides it — no machine-installed Chrome needed (docs/specs/2026-11-22-playwright-csomagolt-chromium.md).
export default defineConfig({
  testDir: "./tests",
  testMatch: "service-worker-install.browser.ts",
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    serviceWorkers: "allow",
    baseURL: "http://127.0.0.1:5179",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node tests/support/service-worker-static-server.mjs",
    url: "http://127.0.0.1:5179/__sw-test/reset",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
