import { expect, test } from "@playwright/test";

const material = { id: "recovery-test", userId: null, title: "Kapcsolat után visszatért tananyag", content: "", description: "Geometria", classroom: 7, createdAt: "2026-09-10T10:00:00Z" };

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", route => route.fulfill({ json: {} }));
  await page.route("**/api/auth/user", route => route.fulfill({ json: null }));
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
  test(`hiba és kézi helyreállítás ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    let healthy = false;
    let requests = 0;
    await page.route("**/api/html-files", route => {
      requests++;
      return healthy ? route.fulfill({ json: [material] }) : route.fulfill({ status: 500, json: { message: "test outage" } });
    });
    await page.goto("/");
    const alert = page.getByRole("alert").filter({ hasText: "A tananyagokat most nem sikerült betölteni" });
    await expect(alert).toBeVisible({ timeout: 15000 });
    expect(requests).toBe(3);
    await expect(page.getByText("Még nincsenek anyagok", { exact: true })).toHaveCount(0);
    const retry = page.getByRole("button", { name: "Újrapróbálom", exact: true });
    await expect(retry).toBeInViewport();
    const box = await retry.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: `test-results/material-error-${viewport.width}.png`, fullPage: true });
    healthy = true;
    await retry.click();
    await expect(page.getByText(material.title, { exact: true })).toBeVisible();
    await expect(alert).toHaveCount(0);
  });
}

test("sikeres üres válasz valódi üres állapot", async ({ page }) => {
  await page.route("**/api/html-files", route => route.fulfill({ json: [] }));
  await page.goto("/");
  await expect(page.getByText("Még nincsenek anyagok", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Újrapróbálom", exact: true })).toHaveCount(0);
});

test("hálózat helyreállása újratölti a listát", async ({ page, context }) => {
  let healthy = false;
  await page.route("**/api/html-files", route => healthy ? route.fulfill({ json: [material] }) : route.abort("failed"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Újrapróbálom", exact: true })).toBeVisible({ timeout: 15000 });
  await context.setOffline(true);
  healthy = true;
  await context.setOffline(false);
  await expect(page.getByText(material.title, { exact: true })).toBeVisible();
});

test("hibás frissítés megtartja a korábban betöltött tananyagokat", async ({ page, context }) => {
  await page.clock.install();
  let healthy = true;
  await page.route("**/api/html-files", route => healthy ? route.fulfill({ json: [material] }) : route.fulfill({ status: 503, json: { message: "test outage" } }));
  await page.goto("/");
  await expect(page.getByText(material.title, { exact: true })).toBeVisible();
  healthy = false;
  await page.clock.fastForward(31000);
  await context.setOffline(true);
  await context.setOffline(false);
  await expect(page.getByText("A tananyagokat most nem sikerült betölteni", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(material.title, { exact: true })).toBeVisible();
  await expect(page.getByText("Még nincsenek anyagok", { exact: true })).toHaveCount(0);
});
