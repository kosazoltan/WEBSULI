import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { lessonSchema } from "../shared/lesson-schema";
const lesson = lessonSchema.parse(JSON.parse(readFileSync(new URL("../../tmp/lesson-fusion/candidate.json", import.meta.url), "utf8")));
for (const [width, height] of [[390, 844], [844, 390], [1440, 900]]) {
  test(`real source lesson, four pages and actual answers at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await page.route("**/tmp/lesson-fusion.json", route => route.fulfill({ contentType: "application/json", body: JSON.stringify(lesson) }));
    await page.goto("/__lesson-runtime-probe?candidate=1");
    await expect(page.getByRole("heading", { name: lesson.title, exact: true })).toBeVisible();
    for (const tab of ["Tananyag", "Módszerek", "Feladatok", "Kvíz"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      // A short, gated Methods page can fit without scrolling on desktop. Clamp the
      // target to the document's actual scroll range instead of demanding y=0 there.
      await expect.poll(() => page.locator(".fusion-tabs").evaluate(nav => {
        const top = nav.getBoundingClientRect().top;
        const viewTop = nav.parentElement!.getBoundingClientRect().top + scrollY;
        const maxScroll = document.documentElement.scrollHeight - innerHeight;
        return Math.abs(top - Math.max(0, viewTop - maxScroll));
      })).toBeLessThanOrEqual(1);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/real-fusion-${width}-${tab}.png`, fullPage: false });
    }
    const quiz = page.locator("[data-quiz-id]");
    for (let i = 0; i < 25; i++) {
      const id = await quiz.nth(i).getAttribute("data-quiz-id");
      const q = lesson.experience!.quiz.find(q => q.id === id)!;
      await quiz.nth(i).getByRole("button").nth(q.correctIndex).click();
    }
    await page.getByRole("button", { name: "Kvíz kiértékelése" }).click();
    await expect(page.getByRole("region", { name: "Kvíz eredmény" })).toContainText("25 / 25 pont");
    await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
    const tasks = page.locator("[data-task-id]");
    for (let i = 0; i < 15; i++) {
      const id = await tasks.nth(i).getAttribute("data-task-id");
      await tasks.nth(i).locator("textarea").fill(lesson.experience!.tasks.find(t => t.id === id)!.sample);
    }
    await page.getByRole("button", { name: "Feladatok kiértékelése" }).click();
    await expect(page.getByRole("region", { name: "Feladatok eredmény" })).toContainText("15 / 15 pont");
    expect(errors).toEqual([]);
  });
}
