import { test, expect } from "@playwright/test";

// Spec: docs/specs/2026-10-19-mai-felfedezes-hirlevel.md (S1) — a „Tanulók” fül érdeklődés-szerkesztője valós renderben.
// A service worker (#207) a regisztrálása után a kéréseket a page.route elfogója mellett vinné el — itt nem kell.
test.use({ serviceWorkers: "block" });
const learners = [
  { id: "l1", name: "Teszt Tanuló", grade: 5, emails: 1, pairLink: "https://example.test/?t=x", interests: ["történelem"], newsletter: false,
    report: { lastActive: null, activeDays7: 0, views7: 0, results: [] } },
];

for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 800 }]) {
  test(`érdeklődés és hírlevél-kapcsoló mentése ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    let patched: unknown = null;
    await page.route("**/api/admin/learners", (route) => route.fulfill({ json: learners }));
    await page.route("**/api/csrf-token", (route) => route.fulfill({ json: { csrfToken: "probe" } }));
    await page.route("**/api/admin/learners/l1", async (route) => {
      patched = route.request().postDataJSON();
      await route.fulfill({ json: { interests: ["történelem", "repülők"], newsletter: true } });
    });
    await page.goto("/__learners-panel-probe");
    const box = page.getByTestId("learner-newsletter-l1");
    await expect(box).toBeVisible();
    const input = box.getByRole("textbox");
    await expect(input).toHaveValue("történelem");
    await input.fill("történelem, repülők");
    await box.getByRole("switch").click();
    await box.getByRole("button", { name: "Mentés" }).click();
    await expect.poll(() => patched).toEqual({ interests: ["történelem", "repülők"], newsletter: true });
    // Nincs vízszintes kilógás és levágott szerkesztő.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const b = await box.boundingBox();
    expect(b && b.x >= 0 && b.x + b.width <= viewport.width).toBeTruthy();
    await page.screenshot({ path: `test-results/learners-newsletter-${viewport.width}.png`, fullPage: true });
  });
}
