import { defineConfig } from "@playwright/test";
// Tételgyár T7.2: a döntőbíró kliensoldala valós böngészőben (Studio React-lejátszó + HTML-lecke), mockolt API-val.
export default defineConfig({
  timeout: 60000, testDir: "./tests", testMatch: "lesson-arbiter.browser.ts", workers: 1,
  use: { channel: "chrome", baseURL: "http://127.0.0.1:5188", screenshot: "only-on-failure", serviceWorkers: "block" },
  webServer: { command: "npm run build:client && npx vite preview --host 127.0.0.1 --port 5188 --strictPort", url: "http://127.0.0.1:5188", reuseExistingServer: false, timeout: 180000 },
});
