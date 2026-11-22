import { defineConfig, devices } from '@playwright/test';

// Az `npm run test:e2e` harness szabad portot ad (WEBSULI_E2E_PORT), hogy egy másik checkout 5000-es
// szervere ne akadályozza a futást; közvetlen `playwright test` (CI) esetén marad az 5000.
const port = process.env.WEBSULI_E2E_PORT || '5000';

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
        baseURL: `http://localhost:${port}`,
        trace: 'on-first-retry',
        screenshot: 'on',
        video: 'on-first-retry',
    },

    projects: [
        {
            name: 'chromium',
            // A Playwrighthoz rögzített Chromium fut (docs/specs/2026-11-22-playwright-csomagolt-chromium.md): a gépre
            // telepített Chrome a Playwrighttól függetlenül frissül (Chrome 158 + Playwright 1.57: összeomlás sandboxolt
            // iframe-nél). Helyben egyszer: `npx.cmd playwright install chromium`; a CI a `playwright install` lépéssel tölti le.
            use: { ...devices['Desktop Chrome'] },
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
        //
        // LS-2 (2026-09-04): a build ITT fut, a VITE_ENABLE_RUNTIME_PROBE=1 kapcsolóval,
        // hogy a lecke-futtató mérőoldala (/__lesson-runtime-probe) létezzen a tesztben.
        // Így a teszt maga gondoskodik a feltételéről: nem attól függ, hogy valaki
        // korábban milyen környezettel buildelt. Az éles build a kapcsoló nélkül fut,
        // ezért a mérőoldal a kiadott bundle-ben nincs benne (ellenőrizve: 0 találat).
        command: 'npm run build:e2e && node dist/index.js',
        url: `http://localhost:${port}/api/health`,
        // Mindig SAJÁT szervert indít: ha az 5000-es port foglalt, a Playwright hibával
        // megáll, nem egy idegen (pl. más worktree régi buildjét futtató) szervert tesztel.
        reuseExistingServer: false,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
        // docs/specs/2026-10-17-e2e-eldobhato-adatbazis.md: WEBSULI_E2E=1 mellett a szerver a
        // source/.env-et NEM tölti be (az éles Neon DATABASE_URL-t tartalmazza), csak 127.0.0.1/::1
        // adatbázishoz kapcsolódik (különben nem indul), és kihagyja az induláskori írásokat és a
        // háttérjobokat. A DATABASE_URL-t helyben az `npm run test:e2e` harness (saját postgres:17
        // konténer), a CI-ben a job-szintű env (service-konténer) adja.
        env: {
            ...process.env,
            NODE_ENV: 'production',
            PORT: port,
            WEBSULI_E2E: '1',
            // JM7c-1 (tests/admin-allowlist.spec.ts): az admin-engedélylista tesztértéke (kitalált cím), és csonk
            // Google-kliensazonosító — a Google-oldalt a teszt a böngészőben elfogja, valódi Google-hívás nem megy ki.
            ADMIN_ALLOWLIST: 'e2e-allowlisted-admin@websuli.example',
            GOOGLE_CLIENT_ID: 'e2e-google-client-id',
            GOOGLE_CLIENT_SECRET: 'e2e-google-client-secret',
        },
    },
});
