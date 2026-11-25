import { expect, test } from "@playwright/test";

/** V4 (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): kvíztípusok a lecke-kvízben. */
test.use({ serviceWorkers: "block" });

test("kiegészítésnél a választott opció a hiányba kerül; a kakukktojás és a számolós kérdés címkét kap", async ({ page }) => {
  await page.goto("/__lesson-runtime-probe?fusion=1&quizFormats=1");
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  const gap = page.locator('[data-quiz-format="fillGap"]').first();
  await expect(gap).toBeVisible();
  await expect(gap.getByTestId("quiz-gap")).toHaveText("___");
  const first = gap.locator(".lesson-option").first();
  const text = (await first.textContent())!.trim();
  await first.click();
  await expect(gap.getByTestId("quiz-gap")).not.toHaveText("___");
  const fill = (await gap.getByTestId("quiz-gap").textContent())!.trim();
  expect(fill.length).toBeGreaterThan(0);
  expect(text).toContain(fill); // a gomb szövege a betűjelet (A/B/C) is tartalmazza
  await expect(page.locator('[data-quiz-format="oddOneOut"]').first()).toContainText("Kakukktojás");
  await expect(page.locator('[data-quiz-format="number"]').first()).toContainText("Számolós kérdés");
});
