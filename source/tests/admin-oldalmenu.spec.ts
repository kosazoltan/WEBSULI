import { expect, test } from "@playwright/test";

/**
 * Admin oldalmenü (tulajdonosi kérés 2026-11-24, feladat #1985): asztalon a csoportos fülsor ragadós, összecsukható
 * oldalsó (hamburger) menü; a tartalom mellette görgethető, összecsukva teljes szélességű. Az állapot újratöltés után megmarad.
 */
test.use({ serviceWorkers: "block" });

test.describe("asztal 1366×768", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("oldalsó, ragadós menü; összecsukva a tartalom kiszélesedik; az állapot megmarad", async ({ page }) => {
    await page.goto("/__admin-tabs-probe");
    await page.evaluate(() => localStorage.removeItem("websuli.admin.nav.collapsed"));
    await page.reload();
    const nav = page.getByTestId("admin-tab-groups");
    const panel = page.getByTestId("probe-panel");
    await expect(nav).toBeVisible();
    await expect(panel).toBeVisible();

    const n = (await nav.boundingBox())!;
    const p = (await panel.boundingBox())!;
    expect(n.x + n.width, "a menü a tartalomtól balra").toBeLessThanOrEqual(p.x + 1);
    expect(Math.abs(n.y - p.y), "a menü és a tartalom teteje egy vonalban").toBeLessThanOrEqual(8);
    expect(n.height, "függőleges menü").toBeGreaterThan(n.width);
    expect(n.width, "kinyitva a feliratok olvashatók").toBeGreaterThanOrEqual(200);
    await expect(nav.getByTestId("tab-lesson-studio")).toContainText("Tananyag készítése");

    // ragadós: legörgetve is látszik
    await page.mouse.wheel(0, 2500);
    await page.waitForTimeout(200);
    const scrolled = (await nav.boundingBox())!;
    expect(scrolled.y, "görgetés után is a nézetben").toBeGreaterThanOrEqual(-1);
    expect(scrolled.y).toBeLessThan(80);
    await expect(nav.getByTestId("tab-users")).toBeInViewport();
    await nav.getByTestId("tab-users").click();
    await expect(page.getByTestId("probe-active-tab")).toHaveText("users");

    // összecsukás: keskeny ikonsáv, a tartalom szélesebb; a fülek továbbra is elérhetők (akadálymentes névvel)
    const toggle = page.getByTestId("admin-nav-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const nc = (await nav.boundingBox())!;
    const pc = (await panel.boundingBox())!;
    expect(nc.width, "összecsukva keskeny ikonsáv").toBeLessThanOrEqual(72);
    expect(pc.width, "a tartalom kiszélesedett").toBeGreaterThanOrEqual(p.width + 140);
    await expect(nav.getByRole("tab", { name: "Tananyag készítése" })).toBeVisible();
    await nav.getByRole("tab", { name: "Adatbázis" }).click();
    await expect(page.getByTestId("probe-active-tab")).toHaveText("database");

    await page.reload();
    await expect(page.getByTestId("admin-nav-toggle")).toHaveAttribute("aria-expanded", "false");
    await page.getByTestId("admin-nav-toggle").click();
    await expect(page.getByTestId("admin-nav-toggle")).toHaveAttribute("aria-expanded", "true");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "nincs vízszintes túlcsordulás").toBeLessThanOrEqual(0);
  });
});
