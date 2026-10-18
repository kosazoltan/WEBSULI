import { expect, test } from "@playwright/test";

// Arculati bank S4 (docs/specs/2026-10-18-arculati-bank-s4.md): a visszajelzés ítélete a kódszótárból, a modell ítélet-előtagja
// megjelenítéskor kimarad; a nem ítélet-előtagú indoklás („Nem a gyökér: …”) változatlan.
test.use({ serviceWorkers: "block" });

for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
  test(`ítélet a szótárból, dupla előtag nélkül ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/__lesson-runtime-probe");
    await expect(page.getByTestId("lesson-runtime")).toBeVisible();
    const feedback = page.getByTestId("check-feedback");

    await page.getByTestId("check-option-1").click();
    await expect(feedback).toHaveAttribute("data-state", "wrong");
    await expect(feedback.locator(".lesson-verdict")).toHaveText("Még nem helyes.");
    await expect(feedback).toContainText("Nem a gyökér: az vizet");

    await page.getByTestId("check-option-0").click();
    await expect(feedback).toHaveAttribute("data-state", "right");
    await expect(feedback.locator(".lesson-verdict")).toHaveText("Helyes!");
    await expect(feedback).toContainText("A zöld színtestek, a kloroplasztiszok végzik a munkát.");
    await expect(feedback).not.toContainText("Így van");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}
