import { defineConfig } from "@playwright/test";

/**
 * S2 — adatbázis nélküli, Vite-only futás a hét játék mobil-minőségi méréséhez
 * (`tests/game-mobile-quality.spec.ts`). Az eszközprofilt (Pixel 7) a spec maga állítja.
 * Port: GAME_MOBILE_PORT (alap 5184), hogy párhuzamos munkafák ne ütközzenek.
 */
const port = Number(process.env.GAME_MOBILE_PORT || 5184);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: ["game-mobile-quality.spec.ts"],
  timeout: 90000,
  workers: 1,
  use: { channel: "chrome", serviceWorkers: "block", baseURL, screenshot: "only-on-failure" },
  webServer: {
    command: `npx cross-env VITE_ENABLE_RUNTIME_PROBE=1 VITE_ENABLE_GAME_TEST_HOOKS=1 vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
