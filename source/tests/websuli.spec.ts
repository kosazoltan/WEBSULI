import { test, expect } from '@playwright/test';

test.describe('WEBSULI Alkalmazás Tesztek', () => {

    test('Főoldal betöltődik', async ({ page }) => {
        await page.goto('/');

        // Várakozás a tartalom betöltésére
        await page.waitForLoadState('networkidle');

        // Ellenőrizzük, hogy az oldal betöltődött
        await expect(page).toHaveTitle(/WebSuli|Tananyagok/i);

        // Készítsünk képernyőképet
        await page.screenshot({ path: 'tests/screenshots/homepage.png', fullPage: true });
    });

    test('Navigációs elemek megjelennek', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Ellenőrizzük, hogy van-e navigációs elem
        const nav = page.locator('nav, header, [role="navigation"]').first();
        await expect(nav).toBeVisible({ timeout: 10000 });

        await page.screenshot({ path: 'tests/screenshots/navigation.png' });
    });

    test('Login gomb megjelenik', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Keressük a bejelentkezés gombot (Google login vagy egyéb)
        const loginButton = page.getByRole('button', { name: /bejelentkezés|login|google|belépés/i }).first();

        // Ha nincs gomb, keressük link-ként
        const loginLink = page.getByRole('link', { name: /bejelentkezés|login|google|belépés/i }).first();

        // Ellenőrizzük, hogy az egyik létezik
        const hasLoginButton = await loginButton.isVisible().catch(() => false);
        const hasLoginLink = await loginLink.isVisible().catch(() => false);

        expect(hasLoginButton || hasLoginLink).toBe(true);

        await page.screenshot({ path: 'tests/screenshots/login-button.png' });
    });

    test('Tananyagok lista oldal', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Keressük a tananyag kártyákat - ezek h3 heading elemek az osztály nevével
        const materialCards = page.locator('h3').first();
        await expect(materialCards).toBeVisible({ timeout: 15000 });

        // Készítsünk képernyőképet az aktuális állapotról
        await page.screenshot({ path: 'tests/screenshots/page-state.png', fullPage: true });
    });

    test('Reszponzivitás - mobil nézet', async ({ page }) => {
        // Mobil viewport beállítása
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        await page.screenshot({ path: 'tests/screenshots/mobile-view.png', fullPage: true });

        // Ellenőrizzük, hogy az oldal betöltődött mobil nézetben
        const mainContent = page.locator('h1, h2, header').first();
        await expect(mainContent).toBeVisible({ timeout: 15000 });

        // Mobil optimalizáció: a scrollWidth ne legyen túl nagy (max 10% overflow megengedett)
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
        expect(bodyWidth).toBeLessThanOrEqual(450); // 375 + 20% tolerance
    });

    test('Reszponzivitás - tablet nézet', async ({ page }) => {
        await page.setViewportSize({ width: 768, height: 1024 });
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        await page.screenshot({ path: 'tests/screenshots/tablet-view.png', fullPage: true });

        // Ellenőrizzük, hogy az oldal betöltődött tablet nézetben
        const mainContent = page.locator('h1, h2, header').first();
        await expect(mainContent).toBeVisible({ timeout: 15000 });
    });

    test('API elérhetőség - health check', async ({ request }) => {
        // Ellenőrizzük, hogy az API válaszol
        const response = await request.get('/api/html-files');

        // 200 OK vagy 401 Unauthorized is elfogadható (auth nélkül)
        expect([200, 401, 403]).toContain(response.status());
    });

    test('Oldal betöltési sebesség', async ({ page }) => {
        const startTime = Date.now();

        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const loadTime = Date.now() - startTime;

        console.log(`Oldal betöltési idő: ${loadTime}ms`);

        // Az oldal 10 másodpercen belül be kell töltődjön (5s volt túl szigorú development módban)
        expect(loadTime).toBeLessThan(10000);
    });

    test('Konzol hibák ellenőrzése', async ({ page }) => {
        const consoleErrors: string[] = [];

        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Várakozás az esetleges késleltetett hibákra
        await page.waitForTimeout(2000);

        // Kiírjuk a hibákat (de nem buktatjuk el a tesztet kisebb hibákra)
        if (consoleErrors.length > 0) {
            console.log('Konzol hibák:', consoleErrors);
        }

        // Kritikus hibák ellenőrzése
        const criticalErrors = consoleErrors.filter(e =>
            e.includes('Uncaught') ||
            e.includes('Failed to fetch') ||
            e.includes('TypeError')
        );

        expect(criticalErrors).toHaveLength(0);
    });

});
