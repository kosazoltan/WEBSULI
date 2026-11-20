import { expect, test, type Locator, type Page } from "@playwright/test";
import { FEEDBACK_OPENERS } from "../shared/lesson-feedback-openers";

// Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (S5a; V5, V7): a jelölt leckén az ítélet után kódszótári nyitás áll, a modell
// régi előtagja nélkül; a jelöletlen lecke változatlan. Három nézet: 360×640, 844×390 (fekvő telefon), 1280×800; képernyőkép mindegyikről.

const VIEWPORTS = [{ width: 360, height: 640 }, { width: 844, height: 390 }, { width: 1280, height: 800 }] as const;
const ALL = new Set(Object.values(FEEDBACK_OPENERS).flatMap((b) => [...b.wrong, ...b.right]));

async function assertLayout(page: Page, el: Locator, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const box = await el.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5);
  expect(await el.evaluate((n) => n.scrollHeight <= n.clientHeight + 1 && n.scrollWidth <= n.clientWidth + 1)).toBe(true);
}

for (const viewport of VIEWPORTS) {
  test(`Tananyag lap: jelölt leckén kódnyitás ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/__lesson-runtime-probe?variety=1&classroom=3");
    const feedback = page.getByTestId("check-feedback");
    await page.getByTestId("check-option-1").click();
    await expect(feedback.locator(".lesson-verdict")).toHaveText("Még nem helyes.");
    const opener = feedback.getByTestId("verdict-opener");
    await expect(opener).toBeVisible();
    const wrongText = (await opener.textContent())!;
    expect(FEEDBACK_OPENERS.kid.wrong).toContain(wrongText);
    await expect(feedback).toContainText("Nem a gyökér: az vizet");
    await feedback.scrollIntoViewIfNeeded();
    await assertLayout(page, feedback, viewport.width);
    await page.screenshot({ path: `test-results/tgm-s5a/tananyag-hibas-${viewport.width}x${viewport.height}.png` });
    await page.getByTestId("check-option-0").click();
    await expect(feedback).toHaveAttribute("data-state", "right");
    expect(FEEDBACK_OPENERS.kid.right).toContain((await feedback.getByTestId("verdict-opener").textContent())!);
    // A modell régi „Így van!” előtagja nem jelenik meg az ítélet és a kódnyitás mellett.
    await expect(feedback).not.toContainText("Így van");
    await assertLayout(page, feedback, viewport.width);
    await page.screenshot({ path: `test-results/tgm-s5a/tananyag-helyes-${viewport.width}x${viewport.height}.png` });
    expect(errors).toEqual([]);
  });

  test(`Kvíz: jelölt leckén kódnyitás ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/__lesson-runtime-probe?fusion=1&variety=1");
    await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
    const quiz = page.locator(".fusion-quiz:visible").first();
    await quiz.locator(".lesson-option").first().click();
    const feedback = quiz.locator(".lesson-feedback");
    await expect(feedback).toBeVisible();
    const opener = feedback.getByTestId("verdict-opener");
    await expect(opener).toBeVisible();
    expect(ALL.has((await opener.textContent())!)).toBe(true);
    await feedback.scrollIntoViewIfNeeded();
    await assertLayout(page, feedback, viewport.width);
    await page.screenshot({ path: `test-results/tgm-s5a/kviz-${viewport.width}x${viewport.height}.png` });
  });
}

test("jelöletlen lecke: nincs kódnyitás (a mai kimenet)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/__lesson-runtime-probe?classroom=3");
  await page.getByTestId("check-option-1").click();
  const feedback = page.getByTestId("check-feedback");
  await expect(feedback.locator(".lesson-verdict")).toHaveText("Még nem helyes.");
  await expect(feedback.getByTestId("verdict-opener")).toHaveCount(0);
  await expect(feedback).toContainText("Nem a gyökér: az vizet");
});

// S5b (terv 11. szakasz; V11): a jelölt lecke nyitóblokkjának fejléce a kiosztott formából, három nézetben.
for (const viewport of VIEWPORTS) {
  test(`nyitóblokk fejléce a kiosztott formából ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/__lesson-runtime-probe?variety=1&opening=rejtely&classroom=6");
    await expect(page.getByText("A lecke célja", { exact: true })).toBeVisible();
    const label = page.getByText("Rejtély", { exact: true });
    await expect(label).toBeVisible();
    await label.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/tgm-s5b/nyitas-rejtely-${viewport.width}x${viewport.height}.png` });
  });
}

test("forma nélküli jelölt lecke: a régi „Történet” fejléc", async ({ page }) => {
  await page.goto("/__lesson-runtime-probe?variety=1&opening=ismeretlen&classroom=6");
  await expect(page.getByText("Történet", { exact: true })).toBeVisible();
});

// S6c (terv 14. szakasz; V21, V22): a négy újrarajzolt fajta és a jelölt lecke folyamat / idővonal ábrája három nézetben.
for (const viewport of VIEWPORTS) {
  test(`szebb ábrák a sáv színeivel ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/__lesson-runtime-probe?kinds=1&variety=1&classroom=6");
    for (const kind of ["fraction", "map", "wordBuilder", "sentenceParts", "process", "timeline"]) {
      const fig = page.locator(`figure[data-anim="${kind}"]`).first();
      await expect(fig).toBeVisible();
      await fig.scrollIntoViewIfNeeded();
      await assertLayout(page, fig, viewport.width);
      // A sáv színe ér el a rajzig (nem átlátszó, nem a böngésző alapértelmezett fekete).
      const tone = await fig.evaluate((n) => getComputedStyle(n.querySelector(".vv-tone-a, .vv-fill-a, .vv-cell-on") ?? n).getPropertyValue("--vv-tone").trim() || getComputedStyle(n.querySelector(".vv-fill-a, .vv-cell-on") ?? n).fill);
      expect(tone).not.toBe("");
      await fig.screenshot({ path: `test-results/tgm-s6c/${kind}-${viewport.width}x${viewport.height}.png` });
    }
    await expect(page.locator('figure[data-anim="process"][data-style="v2"]')).toHaveCount(1);
    await page.screenshot({ path: `test-results/tgm-s6c/oldal-${viewport.width}x${viewport.height}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test("jelöletlen lecke: a folyamat a régi megjelenítővel", async ({ page }) => {
  await page.goto("/__lesson-runtime-probe?kinds=1&classroom=6");
  await expect(page.locator('figure[data-anim="process"]').first()).toBeVisible();
  await expect(page.locator('figure[data-anim="process"][data-style="v2"]')).toHaveCount(0);
  await expect(page.locator('figure[data-anim="fraction"] .vv-pie')).toBeVisible();
});
