import { expect, test, type Locator } from "@playwright/test";
import { fusionFixture, compactFusionFixture } from "../shared/fixtures/lesson-fusion";

async function expectUncovered(part: Locator) {
  await part.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await expect(part).toBeInViewport({ ratio: 1 });
  expect(await part.evaluate(element => {
    const box = element.getBoundingClientRect();
    return [0.1, 0.5, 0.9].every(fraction => element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height * fraction)));
  })).toBe(true);
}

for (const [width, height] of [[320, 900], [390, 844], [844, 390], [1365, 612], [1440, 900]]) {
  test(`lesson cover and continuous exercise lists fit ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/__lesson-runtime-probe?fusion=1");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".lesson-cover-art")).toBeVisible();
    await page.screenshot({ path: `test-results/learning-cover-${width}x${height}.png` });
    await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
    const questions = page.locator("[data-quiz-id]");
    await expect(page.locator("[data-quiz-id]:visible")).toHaveCount(25);
    const quizPanel = page.getByRole("tabpanel", { name: "Kvíz", exact: true });
    await expect(quizPanel.locator(".learning-pager, .learning-mode")).toHaveCount(0);
    await expect(quizPanel.getByRole("button", { name: /Teljes kvíz|Következő kérdés|Előző kérdés/ })).toHaveCount(0);
    await questions.last().getByRole("button").first().click();
    await expect(questions.first().getByRole("button").first()).toBeEnabled();
    await questions.first().getByRole("button").first().click();
    await expect(questions.last().getByRole("button").first()).toHaveAttribute("aria-pressed", "true");
    await expect(questions.last().getByRole("button").nth(1)).toBeDisabled();
    await expect(quizPanel).toContainText("2 megválaszolva · 2 pont");
    await page.getByRole("button", { name: "Kvíz kiértékelése", exact: true }).click();
    await page.getByRole("button", { name: "Folytatom a kitöltést", exact: true }).click();
    await expect(questions.nth(1)).toBeFocused();
    await expect(questions.nth(1)).toBeInViewport();
    await expect(page.locator("[data-quiz-id]:visible")).toHaveCount(25);
    for (const question of [questions.first(), questions.nth(1), questions.last()]) {
      for (const part of [question.locator("h3"), ...await question.getByRole("button").all()]) await expectUncovered(part);
    }
    await expectUncovered(page.getByRole("button", { name: "Kvíz kiértékelése", exact: true }));
    expect(await questions.evaluateAll(elements => elements.every(element => element.scrollHeight <= element.clientHeight + 1 && !/auto|scroll/.test(getComputedStyle(element).overflowY)))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/learning-quiz-${width}x${height}.png` });
    await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
    const tasks = page.locator("[data-task-id]");
    await expect(page.locator("[data-task-id]:visible textarea:visible")).toHaveCount(15);
    const taskPanel = page.getByRole("tabpanel", { name: "Feladatok", exact: true });
    await expect(taskPanel.locator(".learning-pager, .learning-mode")).toHaveCount(0);
    await expect(taskPanel.getByRole("button", { name: /Teljes feladatsor|Következő feladat|Előző feladat/ })).toHaveCount(0);
    await tasks.last().locator("textarea").fill("Utolsó válasz először.");
    await tasks.first().locator("textarea").fill("Első válasz másodszor.");
    await page.getByRole("button", { name: "Feladatok kiértékelése", exact: true }).click();
    await page.getByRole("button", { name: "Folytatom a kitöltést", exact: true }).click();
    await expect(tasks.nth(1).locator("textarea")).toBeFocused();
    await expect(tasks.nth(1).locator("textarea")).toBeInViewport();
    await expect(page.locator("[data-task-id]:visible textarea:visible")).toHaveCount(15);
    await expect(tasks.last().locator("textarea")).toHaveValue("Utolsó válasz először.");
    for (const task of [tasks.first(), tasks.nth(1), tasks.last()]) await expectUncovered(task.locator("textarea"));
    expect(await tasks.evaluateAll(elements => elements.every(element => element.scrollHeight <= element.clientHeight + 1 && !/auto|scroll/.test(getComputedStyle(element).overflowY)))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/learning-tasks-${width}x${height}.png` });
  });
}

test("guided chapters and continuous exercises preserve answers", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const lesson = fusionFixture();
  lesson.sections.push({ ...lesson.sections[0], heading: "A magasság merőleges" });
  await page.route("**/tmp/lesson-fusion.json", route => route.fulfill({ json: lesson }));
  await page.goto("/__lesson-runtime-probe?candidate=1");
  await expect(page.locator('#section-1')).toBeVisible();
  await expect(page.locator('#section-2')).toBeVisible();
  await page.getByRole('combobox', { name: 'Fejezet', exact: true }).selectOption('0');
  await expect(page.locator('#section-2')).toBeHidden();
  await page.getByRole("button", { name: "Következő fejezet", exact: true }).click();
  await expect(page.locator('#section-2')).toBeVisible();
  await page.reload();
  await expect(page.locator('#section-2')).toBeVisible();
  await expect(page.locator("#section-1")).toBeVisible();
  await expect(page.locator('#section-1')).toBeVisible();
  await expect(page.locator('#section-2')).toBeVisible();
  await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
  await expect(page.locator('[data-task-id]:visible')).toHaveCount(15);
  const current = page.locator('[data-task-id]').first();
  const taskId = await current.getAttribute("data-task-id");
  await current.locator("textarea").fill("Saját, megőrzött válaszom.");
  await expect(page.locator('[data-task-id] textarea').nth(1)).toHaveValue("");
  await page.reload();
  await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
  await expect(page.locator(`[data-task-id="${taskId}"] textarea`)).toHaveValue("Saját, megőrzött válaszom.");
  await current.getByRole("button", { name: "Vissza a magyarázathoz", exact: true }).click();
  await expect(page.locator('#section-1')).toBeVisible();
  await expect(page.locator('#section-2')).toBeHidden();
  await page.getByRole("button", { name: "Csendes nézet", exact: true }).click();
  await expect(page.locator(".fusion-view")).toHaveAttribute("data-quiet", "true");
  await page.reload();
  await expect(page.locator(".fusion-view")).toHaveAttribute("data-quiet", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const [width, height] of [[390, 844], [844, 390]]) {
  test(`legacy two-question bank scores a fourth option and restores its first answer at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const legacy = compactFusionFixture();
    legacy.experience!.version = "fusion-7.4-2";
    legacy.experience!.tasks = legacy.experience!.tasks.slice(0, 2);
    legacy.experience!.quiz = legacy.experience!.quiz.slice(0, 2);
    legacy.experience!.bankPlan!.taskRound = 2; legacy.experience!.bankPlan!.quizRound = 2;
    await page.route("**/tmp/lesson-fusion.json", route => route.fulfill({ json: legacy }));
    await page.goto("/__lesson-runtime-probe?candidate=1");
    await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
    await expect(page.locator("[data-quiz-id]:visible")).toHaveCount(2);
    const question = page.locator('[data-quiz-id="q2"]');
    await expect(question.getByRole("button")).toHaveCount(4);
    for (const button of await question.getByRole("button").all()) {
      await expectUncovered(button);
    }
    await question.getByRole("button", { name: "D Kétszeres lesz" }).click();
    await expect(page.getByRole("tabpanel", { name: "Kvíz", exact: true })).toContainText("1 megválaszolva · 1 pont");
    await page.reload();
    await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
    await expect(page.getByRole("tabpanel", { name: "Kvíz", exact: true })).toContainText("1 megválaszolva · 1 pont");
    await page.getByRole("button", { name: "Kvíz kiértékelése", exact: true }).click();
    await page.getByRole("button", { name: "Lezárom a kihagyásokkal", exact: true }).click();
    await expect(page.getByRole("region", { name: "Kvíz eredmény" })).toContainText("1 / 2 pont");
  });
}

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
