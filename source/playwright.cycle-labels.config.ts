import { defineConfig, devices } from "@playwright/test";
// Spec 2026-09-30 (körforgás-felirat ütközés): a mérőoldal helyi vite-szerveren (alap: 5188, mint a
// `.claude/launch.json` „websuli-visual-probe”). Ha az 5188-at más checkout foglalja: CYCLE_PROBE_PORT=5190.
const port = Number(process.env.CYCLE_PROBE_PORT ?? 5188);
export default defineConfig({
  testDir: "./tests", testMatch: ["cycle-labels.spec.ts", "explanatory-visuals.spec.ts"], timeout: 45000,
  workers: 1, use: { ...devices["Desktop Chrome"], channel: "chrome", serviceWorkers: "block", baseURL: `http://127.0.0.1:${port}` },
  webServer: { command: `npx cross-env VITE_ENABLE_RUNTIME_PROBE=1 vite --host 127.0.0.1 --port ${port} --strictPort`, url: `http://127.0.0.1:${port}`, reuseExistingServer: false },
});
