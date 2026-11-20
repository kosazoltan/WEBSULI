import { defineConfig, devices } from "@playwright/test";
// Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (S5a; V7): kódszótári visszajelzés-nyitás a próbaoldalon, három nézetben.
export default defineConfig({
  testDir: "./tests", testMatch: "lesson-variety-feedback.browser.ts", timeout: 45000, workers: 1,
  use: { ...devices["Desktop Chrome"], channel: "chrome", serviceWorkers: "block", baseURL: "http://127.0.0.1:5198" },
  webServer: { command: "npx cross-env VITE_ENABLE_RUNTIME_PROBE=1 vite --host 127.0.0.1 --port 5198 --strictPort", url: "http://127.0.0.1:5198", reuseExistingServer: false },
});
