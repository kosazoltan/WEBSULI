import { test, expect } from '@playwright/test';

/**
 * Kanban #127 (docs/specs/2026-10-18-kliens-hibariport.md): a böngésző kezeletlen hibája a titok nélküli
 * /api/client-error végpontra megy, és 202-t kap (korábban a HMAC-os /api/error-report élesben 401-et adott).
 */
test('kezeletlen böngészős hiba → /api/client-error 202', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const reported = page.waitForResponse(
        (res) => res.url().endsWith('/api/client-error') && res.request().method() === 'POST',
        { timeout: 15000 },
    );
    await page.evaluate(() => {
        setTimeout(() => {
            throw new Error('e2e-client-error-probe');
        }, 0);
    });

    const res = await reported;
    expect(res.status()).toBe(202);
    const body = res.request().postDataJSON() as { errorType: string; message: string; userEmail?: string };
    expect(body.errorType).toBe('UnhandledError');
    expect(body.message).toContain('e2e-client-error-probe');
    expect(body.userEmail).toBeUndefined();
});
