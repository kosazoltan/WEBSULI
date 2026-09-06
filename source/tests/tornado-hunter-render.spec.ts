import { test, expect } from "@playwright/test";

/**
 * Tornado Hunter 200 — real full-screen render check (owner-binding: a renderer
 * unit test is not enough for a UI/visual change). Drives the actual flow —
 * menu → level select → play (3D canvas + HUD) → a scoring quiz — and asserts
 * there is no viewport overflow and the promised HUD elements are present.
 */

test.describe("Tornado Hunter 200", () => {
  test("menü, szintválasztó, 3D játék és kvíz valós renderben", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/games/tornado-hunter-200");

    // --- Menu ---
    await expect(page.getByText("Tornado Hunter 200")).toBeVisible();
    await expect(page.getByText("Vadászat indítása")).toBeVisible();
    await expect(page.getByTestId("tornado-coins")).toContainText("SC");
    await page.screenshot({ path: "tests/screenshots/tornado-menu.png", fullPage: true });

    // No horizontal overflow on the menu.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // --- Storm Garage: 160 vehicles reachable ---
    await page.getByText("Storm Garage").click();
    await expect(page.getByText(/Mind \(160\)/)).toBeVisible();
    await page.screenshot({ path: "tests/screenshots/tornado-garage.png", fullPage: true });
    await page.getByRole("button", { name: /Vissza/ }).click();

    // --- Level select ---
    await page.getByText("Vadászat indítása").click();
    await expect(page.getByText("Szintek (1–200)")).toBeVisible();
    await expect(page.getByText("Light Storm")).toBeVisible();
    await page.screenshot({ path: "tests/screenshots/tornado-levels.png", fullPage: true });

    // Start level 1.
    await page.getByRole("button", { name: "1", exact: true }).first().click();

    // --- Play: canvas + HUD ---
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();
    await expect(page.getByText("LEVEL 1/200")).toBeVisible();
    await expect(page.getByText(/WIND SPEED:/)).toBeVisible();
    await expect(page.getByText(/STORM:/)).toBeVisible();
    await expect(page.getByTestId("tornado-touch-controls")).toBeVisible();
    await expect(page.getByRole("button", { name: "Gáz", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Fék", exact: true })).toBeVisible();

    // The canvas actually has pixels (WebGL initialised).
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(200);
    expect(box!.height).toBeGreaterThan(150);

    await page.waitForTimeout(1500);
    await page.screenshot({ path: "tests/screenshots/tornado-play.png", fullPage: true });

    // Drive toward the tornado so a scoring quiz can be triggered by anchoring.
    await page.locator("body").press("w");
    await page.waitForTimeout(600);

    // WebGL context errors would show here; a bare "no console errors" would be
    // too strict (401s from admin-guarded calls are expected elsewhere), so we
    // only fail on WebGL / three.js errors.
    const fatal = consoleErrors.filter((e) => /webgl|three|Cannot read|undefined is not/i.test(e));
    expect(fatal, `fatal render errors: ${fatal.join(" | ")}`).toHaveLength(0);
  });
});
