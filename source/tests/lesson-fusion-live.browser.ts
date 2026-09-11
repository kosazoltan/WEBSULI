import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { lessonSchema } from "../shared/lesson-schema";
import { experienceRoundSizes } from "../shared/lesson-experience";
const candidatePath = process.env.LESSON_CURRENT_BANK === "1" ? "../../tmp/lesson-bank-v2/candidate.json" : "../../tmp/lesson-fusion/candidate.json";
const lesson = lessonSchema.parse(JSON.parse(readFileSync(new URL(candidatePath, import.meta.url), "utf8")));
const { taskRound, quizRound } = experienceRoundSizes(lesson.experience!);
for (const [width, height] of [[390, 844], [844, 390], [1440, 900]]) {
  test(`real source lesson, four pages and actual answers at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await page.route("**/tmp/lesson-fusion.json", route => route.fulfill({ contentType: "application/json", body: JSON.stringify(lesson) }));
    await page.goto("/__lesson-runtime-probe?candidate=1");
    await expect(page.getByRole("heading", { name: lesson.title, exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("[data-band]")).toHaveCSS("font-family", '"Source Sans 3", sans-serif');
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
    const submit = await page.getByRole("button", { name: "Kvíz kiértékelése" }).boundingBox();
    const pager = await page.getByRole("navigation", { name: "kérdés lapozása" }).boundingBox();
    for (const box of [submit, pager]) {
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height);
    }
    await page.getByRole("button", { name: "Teljes kvíz", exact: true }).click();
    const quiz = page.locator("[data-quiz-id]");
    await expect(quiz).toHaveCount(quizRound);
    for (let i = 0; i < quizRound; i++) {
      const id = await quiz.nth(i).getAttribute("data-quiz-id");
      const q = lesson.experience!.quiz.find(q => q.id === id)!;
      await quiz.nth(i).getByRole("button").nth(q.correctIndex).click();
    }
    await page.getByRole("button", { name: "Kvíz kiértékelése" }).click();
    await expect(page.getByRole("region", { name: "Kvíz eredmény" })).toContainText(`${quizRound} / ${quizRound} pont`);
    await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
    await page.getByRole("button", { name: "Teljes feladatsor", exact: true }).click();
    const tasks = page.locator("[data-task-id]");
    await expect(tasks).toHaveCount(taskRound);
    for (let i = 0; i < taskRound; i++) {
      const id = await tasks.nth(i).getAttribute("data-task-id");
      await tasks.nth(i).locator("textarea").fill(lesson.experience!.tasks.find(t => t.id === id)!.sample);
    }
    await page.getByRole("button", { name: "Feladatok kiértékelése" }).click();
    await expect(page.getByRole("region", { name: "Feladatok eredmény" })).toContainText(`${taskRound} / ${taskRound} pont`);
    expect(errors).toEqual([]);
  });
}
