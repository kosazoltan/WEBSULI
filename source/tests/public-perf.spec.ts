import { expect, test } from "@playwright/test";

// Spec: docs/specs/2026-10-18-nyilvanos-oldal-sebesseg.md — valós render: nincs végtelen kártya-animáció, nincs tömeges homályosítás.
test.use({ serviceWorkers: "block" });

const FILES = Array.from({ length: 210 }, (_, i) => ({ id: `f${i}`, userId: null, content: "", description: "", title: `Tananyag ${i}`, classroom: (i % 9) + 1, createdAt: new Date(Date.UTC(2026, 9, 1) - i * 3_600_000).toISOString(), curriculum: null }));

for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
  test(`a főoldal tétlenül nem animál kártyákat, és nincs tömeges homályosítás ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route("**/api/**", route => route.fulfill({ json: {} }));
    await page.route("**/api/auth/user", route => route.fulfill({ json: null }));
    await page.route("**/api/html-files", route => route.fulfill({ json: FILES }));
    await page.goto("/");
    await expect(page.locator('[data-testid^="link-file-"]').first()).toBeVisible();
    await expect(page.locator('[data-testid^="link-file-"]')).toHaveCount(210);
    const m = await page.evaluate(() => ({
      infinite: document.getAnimations().filter(a => a.effect?.getTiming().iterations === Infinity).length,
      blur: [...document.querySelectorAll("*")].filter(e => getComputedStyle(e).backdropFilter !== "none").length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(m.infinite, "végtelen animáció (a szivárvány-felirat és a nyíl is véges)").toBe(0);
    expect(m.blur, "homályosított elemek").toBeLessThanOrEqual(10);
    expect(m.overflow).toBeLessThanOrEqual(0);
    // a lista végén lévő kártya is elérhető és kattintható marad (content-visibility mellett)
    const last = page.getByTestId("link-file-f209");
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeVisible();
  });
}
