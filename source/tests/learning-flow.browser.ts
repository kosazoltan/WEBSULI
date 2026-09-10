import { expect, test } from "@playwright/test";

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
