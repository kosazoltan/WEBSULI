import { expect, test } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

for (const [width, height] of [[390, 844], [844, 390], [1440, 900]]) {
  test(`lesson cover and single exercise controls fit ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/__lesson-runtime-probe?fusion=1");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".lesson-cover-art")).toBeVisible();
    await page.screenshot({ path: `test-results/learning-cover-${width}x${height}.png` });
    await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
    await expect(page.locator("[data-quiz-id]:visible")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Következő kérdés", exact: true })).toBeInViewport();
    await page.getByRole("button", { name: "Következő kérdés", exact: true }).click();
    await expect(page.locator("[data-quiz-id]:visible .fusion-eyebrow")).toHaveText("2. kérdés");
    const question = page.locator("[data-quiz-id]:visible");
    const pager = page.getByRole("navigation", { name: "kérdés lapozása", exact: true });
    for (const part of [question.locator("h3"), ...await question.getByRole("button").all(), page.getByRole("button", { name: "Kvíz kiértékelése", exact: true })]) {
      const box = await part.boundingBox();
      const pagerBox = await pager.boundingBox();
      expect(box).not.toBeNull(); expect(pagerBox).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height);
      // The controls must not cover a question or an answer, even when sticky.
      expect(box!.y + box!.height <= pagerBox!.y || box!.y >= pagerBox!.y + pagerBox!.height || box!.x >= pagerBox!.x + pagerBox!.width).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/learning-quiz-${width}x${height}.png` });
  });
}

test("guided chapters and individual exercises preserve answers and provide an overview", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const lesson = fusionFixture();
  lesson.sections.push({ ...lesson.sections[0], heading: "A magasság merőleges" });
  await page.route("**/tmp/lesson-fusion.json", route => route.fulfill({ json: lesson }));
  await page.goto("/__lesson-runtime-probe?candidate=1");
  await expect(page.locator('#section-1')).toBeVisible();
  await expect(page.locator('#section-2')).toBeHidden();
  await page.getByRole("button", { name: "Következő fejezet", exact: true }).click();
  await expect(page.locator('#section-2')).toBeVisible();
  await page.reload();
  await expect(page.locator('#section-2')).toBeVisible();
  await page.getByRole("button", { name: "Teljes tananyag", exact: true }).click();
  await expect(page.locator('#section-1')).toBeVisible();
  await expect(page.locator('#section-2')).toBeVisible();
  await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
  await expect(page.locator('[data-task-id]:visible')).toHaveCount(1);
  const current = page.locator('[data-task-id]:visible');
  await current.locator("textarea").fill("Saját, megőrzött válaszom.");
  await page.getByRole("button", { name: "Következő feladat", exact: true }).click();
  await expect(page.locator('[data-task-id]:visible textarea')).toHaveValue("");
  await page.getByRole("button", { name: "Előző feladat", exact: true }).click();
  await expect(page.locator('[data-task-id]:visible textarea')).toHaveValue("Saját, megőrzött válaszom.");
  await page.getByRole("button", { name: "Vissza a magyarázathoz", exact: true }).click();
  await expect(page.locator('#section-1')).toBeVisible();
  await expect(page.locator('#section-2')).toBeHidden();
  await page.getByRole("button", { name: "Csendes nézet", exact: true }).click();
  await expect(page.locator(".fusion-view")).toHaveAttribute("data-quiet", "true");
  await page.reload();
  await expect(page.locator(".fusion-view")).toHaveAttribute("data-quiet", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const [width, height] of [[390, 844], [844, 390]]) {
  test(`a three-choice lesson question is playable with its explanation at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => { localStorage.setItem("websuli.classroomGrade", "7"); localStorage.setItem("websuli.spaceQuiz.grade", "7"); });
    await page.route("**/api/**", route => {
      const p = new URL(route.request().url()).pathname;
      let data: unknown = [];
      if (p === "/api/auth/user") data = { id: "fixture", classroom: 7, classrooms: [7] };
      if (p.includes("quiz-bank")) data = { items: [] };
      if (p.includes("material-quizzes")) data = { classroom: 7, materials: [{ id: "fixture-material", title: "Terület", createdAt: "2026-09-10" }], items: [{ id: "fixture-quiz", sourceMaterialId: "fixture-material", prompt: "Melyik a terület mértékegysége?", options: ["cm", "cm²", "cm³"], correctIndex: 1, topic: "math", explanation: "A területet négyzetegységgel mérjük." }] };
      return route.fulfill({ json: data });
    });
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    const loaded = page.waitForResponse(r => r.url().includes("material-quizzes"));
    await page.goto("/games/space-asteroid-quiz"); await loaded;
    await page.getByRole("button", { name: /Indulhat —/ }).click();
    const quiz = page.getByRole("dialog", { name: "Mini-teszt", exact: true });
    await expect(quiz).toContainText("Melyik a terület mértékegysége?");
    await expect(quiz).toHaveCSS("opacity", "1");
    await expect(quiz.locator("..")).toHaveCSS("opacity", "1");
    await expect(quiz.getByRole("button")).toHaveCount(3);
    for (const answer of ["cm", "cm²", "cm³"]) await expect(quiz.getByRole("button", { name: answer, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/shared-bank-${width}x${height}.png` });
    await quiz.getByRole("button", { name: "cm", exact: true }).click();
    await expect(page.getByTestId("quiz-feedback-why")).toHaveText("A területet négyzetegységgel mérjük.");
    await expect(page.getByRole("button", { name: "Értem, megyek tovább" })).toBeInViewport();
    expect(errors).toEqual([]);
  });
}
