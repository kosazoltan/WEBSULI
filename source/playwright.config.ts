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
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    // Don't start webServer - we assume it's already running
    // webServer: {
    //   command: 'npm run dev',
    //   url: 'http://localhost:5000',
    //   reuseExistingServer: true,
    // },
});
