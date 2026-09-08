import { expect, test } from "@playwright/test";

/**
 * B7 — lecke válaszok túlélik a page.reload()-ot.
 */

test.use({ serviceWorkers: "block" });

test("check válasz megmarad frissítés után", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/__lesson-runtime-probe");
  await expect(page.getByTestId("lesson-runtime")).toBeVisible();

  await page.getByTestId("check-option-0").click();
  await expect(page.getByTestId("check-feedback")).toBeVisible();
  await expect(page.getByTestId("check-option-0")).toHaveAttribute("data-state", "right");

  // Debounce mentés (200 ms) + pagehide flush.
  await page.waitForTimeout(350);
  await page.reload();
  await expect(page.getByTestId("lesson-runtime")).toBeVisible();
  await expect(page.getByTestId("check-option-0")).toHaveAttribute("data-state", "right");
  await expect(page.getByTestId("check-feedback")).toBeVisible();
});

test("fillBlank try állapot megmarad frissítés után", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/__lesson-runtime-probe");
  await page.getByTestId("fill-0").fill("levél");
  await page.getByTestId("fill-1").fill("fény");
  await page.waitForTimeout(350);
  await page.reload();
  await expect(page.getByTestId("fill-0")).toHaveValue("levél");
  await expect(page.getByTestId("fill-1")).toHaveValue("fény");
});
