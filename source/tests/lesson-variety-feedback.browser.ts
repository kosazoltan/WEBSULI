import { expect, test, type Locator, type Page } from "@playwright/test";
import { FEEDBACK_OPENERS, startsWithLegacyOpener } from "../shared/lesson-feedback-openers";

// Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (S5a; V5, V7): a jelölt leckén az ítélet után kódszótári nyitás áll, ha a modell
// szövege nem nyitással kezdődik; a modell szövege változatlan (tulajdonosi döntés 2026-11-22); a jelöletlen lecke változatlan. Három nézet: 360×640, 844×390 (fekvő telefon), 1280×800; képernyőkép mindegyikről.

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
    // S5a vak kör 1 (L3): az előre felcsatolt udvarias élő régió a teljes friss visszajelzést kapja; a fókusz a választott gombon marad.
    const live = page.getByTestId("verdict-announcer");
    await expect(live).toHaveAttribute("aria-live", "polite");
    await expect(live).toHaveText(`Még nem helyes. ${wrongText} ${(await feedback.textContent())!.split(wrongText)[1].trim()}`);
    await feedback.scrollIntoViewIfNeeded();
    await assertLayout(page, feedback, viewport.width);
    await page.screenshot({ path: `test-results/tgm-s5a/tananyag-hibas-${viewport.width}x${viewport.height}.png` });
    await page.getByTestId("check-option-0").click();
    await expect(feedback).toHaveAttribute("data-state", "right");
    // Tulajdonosi döntés 2026-11-22 („NINCS LEVÁGÁS”, dokumentált spec-változás): a modell „Így van!” kezdetű szövege már nyitással
    // kezdődik → nincs kódnyitás, a szöveg változatlanul (az előtaggal együtt) jelenik meg.
    await expect(feedback.getByTestId("verdict-opener")).toHaveCount(0);
    expect(startsWithLegacyOpener((await feedback.textContent())!.replace(/^Helyes!\s*/u, ""))).toBe(true);
    await expect(feedback).toContainText("Így van");
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
    const verdict = (await feedback.locator(".lesson-verdict").textContent())!;
    if (await opener.count()) expect(ALL.has((await opener.textContent())!)).toBe(true);
    // Kódnyitás nélkül a modell szövege már nyitással kezdődik (és változatlan).
    else expect(startsWithLegacyOpener((await feedback.textContent())!.slice(verdict.length).trim())).toBe(true);
    // Friss válasz után az élő régió a visszajelzést kapja.
    await expect(page.getByTestId("verdict-announcer")).not.toHaveText("");
    await feedback.scrollIntoViewIfNeeded();
    await assertLayout(page, feedback, viewport.width);
    await page.screenshot({ path: `test-results/tgm-s5a/kviz-${viewport.width}x${viewport.height}.png` });
  });
}

test("vak kör 2, L4: újratöltéskor a mentett (rejtett) kvízválasz NEM kerül az élő régióba — csak friss válasz után", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/__lesson-runtime-probe?fusion=1&variety=1");
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  const quiz = page.locator(".fusion-quiz:visible").first();
  await quiz.locator(".lesson-option").first().click();
  await expect(quiz.locator(".lesson-feedback")).toBeVisible();
  await expect(page.getByTestId("verdict-announcer")).not.toHaveText("");
  await page.reload();
  await expect(page.getByTestId("verdict-announcer")).toHaveCount(1);
  // A mentett válasz visszaállt (a rejtett kvízpanelben a visszajelzés a DOM-ban van) — mégsem jelentődik be.
  await expect(page.locator(".fusion-quiz .lesson-feedback").first()).toHaveCount(1);
  await page.waitForTimeout(500);
  await expect(page.getByTestId("verdict-announcer")).toHaveText("");
});

test("jelöletlen lecke: nincs kódnyitás (a mai kimenet)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/__lesson-runtime-probe?classroom=3");
  await page.getByTestId("check-option-1").click();
  const feedback = page.getByTestId("check-feedback");
  await expect(feedback.locator(".lesson-verdict")).toHaveText("Még nem helyes.");
  await expect(feedback.getByTestId("verdict-opener")).toHaveCount(0);
  await expect(feedback).toContainText("Nem a gyökér: az vizet");
  // Jelöletlen leckén nincs élő régió (a DOM a régi).
  await expect(page.getByTestId("verdict-announcer")).toHaveCount(0);
});
