import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    // Only the browser end-to-end suites are Playwright's.
    // tests/*.test.ts are node:test unit suites (`node --import tsx --test`); Playwright's
    // default testMatch (**/*.@(spec|test).*) also matched those, and loading them during
    // collection actually *executed* the whole unit suite inside the Playwright run while
    // reporting zero tests from it.
    testMatch: '**/*.spec.ts',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:5000',
        trace: 'on-first-retry',
        screenshot: 'on',
        video: 'on-first-retry',
    },

    projects: [
        {
            name: 'chromium',
            // A telepített Google Chrome-ot használjuk (helyben és a GitHub ubuntu runneren
            // is elérhető), hogy ne függjünk a Playwright külön böngésző-letöltésétől.
            use: { ...devices['Desktop Chrome'], channel: 'chrome' },
        },
    ],

    // CI-JAVÍTÁS (2026-09-02): a Playwright maga indítja a buildelt szervert. Korábban a
    // webServer ki volt kommentezve, a CI-ben semmi nem indított szervert, ezért mind a 17
    // E2E teszt ERR_CONNECTION_REFUSED-dal bukott 2026-07-21 óta. Helyben, ha már fut a
    // dev-szerver az 5000-en, azt használja (reuseExistingServer).
    webServer: {
        // Közvetlenül a node-ot indítjuk (nem npm → cross-env → node láncot): Windows-on a
        // Playwright a futás végén a közbenső shell-folyamatokat nem tudta leállítani, a
        // szerver árván maradt az 5000-es porton, és a futás a timeoutig lógott.
        command: 'node dist/index.js',
        url: 'http://localhost:5000/api/health',
        // Mindig SAJÁT szervert indít: ha az 5000-es port foglalt, a Playwright hibával
        // megáll, nem egy idegen (pl. más worktree régi buildjét futtató) szervert tesztel.
        reuseExistingServer: false,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
        // A környezet változatlanul megy tovább: a CI-ben a job-szintű env adja a
        // DATABASE_URL/SESSION_SECRET-et, helyben a szerver a saját .env-jét tölti be
        // (dotenv/config) — itt NEM adunk alapértéket, mert az felülírná a .env-et.
        env: {
            ...process.env,
            NODE_ENV: 'production',
            PORT: '5000',
        },
    },
});
