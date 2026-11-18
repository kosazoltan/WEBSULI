import { expect, test, type Page } from "@playwright/test";

/**
 * Spec 2026-11-17-szoveges-valasz-irasjel (E6): a kitöltős feladat a valódi lecke-futtatóban — a mondatvégi írásjel, a szóköz és a
 * kis- / nagybetű nem hiba; az ékezet és a más szó igen. A mérőoldal kulcsa: „levél”, „fény” (LessonRuntimeProbe).
 */

test.use({ serviceWorkers: "block" });

async function answer(page: Page, first: string, second: string) {
  const block = page.locator('[data-try="fillBlank"]');
  await block.getByTestId("fill-0").fill(first);
  await block.getByTestId("fill-1").fill(second);
  await block.getByTestId("try-check").click();
  return block;
}

test("a kitöltős feladat pont nélkül, ponttal, nagybetűvel és szóközzel is helyes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/__lesson-runtime-probe");
  await expect(page.getByTestId("lesson-runtime")).toBeVisible();
  for (const [first, second] of [["levél", "fény"], ["levél.", "fény."], ["  Levél ", "FÉNY!"], ["levél", "fény…"], ["„levél”", "fény ."]]) {
    const block = await answer(page, first, second);
    await expect(block.getByText("Helyes!"), `${first} | ${second}`).toBeVisible();
    await expect(block.getByTestId("try-feedback")).toHaveCount(0);
  }
});

test("az ékezethiba, a más szó és a csak írásjel továbbra is hibás", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/__lesson-runtime-probe");
  await expect(page.getByTestId("lesson-runtime")).toBeVisible();
  for (const [first, second] of [["level", "fény"], ["levél", "feny."], ["levelek", "fény"], [".", "fény"], ["levél", ""]]) {
    const block = await answer(page, first, second);
    await expect(block.getByTestId("try-feedback"), `${first} | ${second}`).toBeVisible();
    await expect(block.getByText("Helyes!")).toHaveCount(0);
  }
});
