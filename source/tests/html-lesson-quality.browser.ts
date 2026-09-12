import { test, expect } from "@playwright/test";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { withLessonTypography } from "../shared/lesson-typography";
import { teachingHtml } from "./helpers/teaching-html";
import { mkdir } from "node:fs/promises";

for (const width of [320, 390, 844, 1366]) test(`full 7.4 HTML banks and age presentation ${width}`, async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
  const backgrounds: string[] = [];
  for (const classroom of [2, 10]) {
    const data = { classroom, classroomEvidence: "Szintetikus megjelenítési próba, nem tananyagminősítés.", subject: "matematika", experience: standardFusionFixture().experience };
    const html = withLessonTypography(`<!doctype html><html lang="hu"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>A háromszög területe</h1><nav>${["teaching", "methods", "tasks", "quiz"].map(name => `<button data-lesson-tab="${name}">${name}</button>`).join("")}</nav>${["teaching", "methods", "tasks", "quiz"].map(name => `<section data-lesson-panel="${name}">${name === "teaching" ? teachingHtml : ""}</section>`).join("")}<script id="websuli-lesson-data" type="application/json">${JSON.stringify(data)}</script></body></html>`);
    await page.route(`**/quality-${classroom}`, route => route.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
    await page.goto(`/quality-${classroom}`);
    await expect(page.locator("body")).toHaveAttribute("data-learning-age", classroom === 2 ? "1-2" : "9+");
    await expect(page.locator("[data-teaching-example]")).toBeVisible();
    backgrounds.push(await page.locator("body").evaluate(el => getComputedStyle(el).backgroundColor));
    await mkdir("../tmp/quality-browser", { recursive: true });
    await page.screenshot({ path: `../tmp/quality-browser/age-${classroom}-${width}.png` });
    for (const [tab, count, bankSize] of [["tasks", 15, 45], ["quiz", 25, 75]] as const) {
      await page.locator(`[data-lesson-tab="${tab}"]`).click();
      const panel = page.locator(`[data-lesson-panel="${tab}"]`);
      const seen = new Set<string>();
      for (let i = 0; i < count; i++) {
        const question = panel.locator("article:visible");
        await expect(question).toHaveCount(1);
        seen.add(await question.locator("h3").innerText());
        if (i < count - 1) await panel.getByRole("button", { name: "Következő kérdés", exact: true }).click();
      }
      expect(seen.size).toBe(count);
      await panel.getByRole("button", { name: /Teljes .*bank/ }).click();
      await panel.getByRole("button", { name: "Új kör indítása", exact: true }).click();
      await panel.getByRole("button", { name: "Összes kérdés áttekintése", exact: true }).click();
      await expect(panel.locator("article:visible")).toHaveCount(bankSize);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.locator('[data-lesson-tab="methods"]').click();
    const methods = page.locator('[data-lesson-panel="methods"]');
    await methods.locator('[data-method="gate"]').first().getByRole("button").first().click();
    await expect(methods.locator('[data-method]')).toHaveCount(11);
    await methods.getByRole("button", { name: "Kérem a villámkérdést" }).click();
    await expect(methods.getByRole("dialog")).toBeVisible();
    await methods.getByRole("button", { name: "Bezárom a villámkérdést" }).click();
    await methods.locator('[data-method="sorting"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `../tmp/quality-browser/methods-${classroom}-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(backgrounds[0]).not.toBe(backgrounds[1]);
  expect(errors).toEqual([]);
});
