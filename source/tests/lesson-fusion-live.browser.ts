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
    const quizPanel = page.getByRole("tabpanel", { name: "Kvíz", exact: true });
    await expect(quizPanel.locator(".learning-pager, .learning-mode")).toHaveCount(0);
    const submitButton = page.getByRole("button", { name: "Kvíz kiértékelése" });
    await submitButton.scrollIntoViewIfNeeded();
    const submit = await submitButton.boundingBox();
    expect(submit).not.toBeNull();
    expect(submit!.y).toBeGreaterThanOrEqual(0);
    expect(submit!.y + submit!.height).toBeLessThanOrEqual(height);
    const quiz = page.locator("[data-quiz-id]:visible");
    await expect(quiz).toHaveCount(quizRound);
    expect(await quiz.evaluateAll(elements => elements.every(element => element.scrollHeight <= element.clientHeight + 1 && !/auto|scroll/.test(getComputedStyle(element).overflowY)))).toBe(true);
    for (let questionIndex = quizRound - 1; questionIndex >= 0; questionIndex--) {
      const id = await quiz.nth(questionIndex).getAttribute("data-quiz-id");
      const question = lesson.experience!.quiz.find(question => question.id === id)!;
      await quiz.nth(questionIndex).getByRole("button").nth(question.correctIndex).click();
    }
    await page.getByRole("button", { name: "Kvíz kiértékelése" }).click();
    await expect(page.getByRole("region", { name: "Kvíz eredmény" })).toContainText(`${quizRound} / ${quizRound} pont`);
    await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
    await expect(page.getByRole("tabpanel", { name: "Feladatok", exact: true }).locator(".learning-pager, .learning-mode")).toHaveCount(0);
    const tasks = page.locator("[data-task-id]:visible");
    await expect(tasks).toHaveCount(taskRound);
    await expect(tasks.locator("textarea:visible")).toHaveCount(taskRound);
    expect(await tasks.evaluateAll(elements => elements.every(element => element.scrollHeight <= element.clientHeight + 1 && !/auto|scroll/.test(getComputedStyle(element).overflowY)))).toBe(true);
    for (let i = 0; i < taskRound; i++) {
      const id = await tasks.nth(i).getAttribute("data-task-id");
      await tasks.nth(i).locator("textarea").fill(lesson.experience!.tasks.find(t => t.id === id)!.sample);
    }
    await page.getByRole("button", { name: "Feladatok kiértékelése" }).click();
    await expect(page.getByRole("region", { name: "Feladatok eredmény" })).toContainText(`${taskRound} / ${taskRound} pont`);
    expect(errors).toEqual([]);
  });
}
