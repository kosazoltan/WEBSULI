import { test, expect, type Page } from "@playwright/test";

/**
 * Egyképernyős játékélmény — a 2026-09-07-i Chrome-próbán mért hibák.
 *
 * Nem elég a túllógást elrejteni: kérdés, válasz és indítógomb a viewporton
 * belül kell legyen, belső panelgörgetés nélkül. Nulla élet után nincs
 * Újrapróbálom, új futam tiszta pontot ad.
 */

test.use({ serviceWorkers: "block" });

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "4");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 4, classrooms: [4] };
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    if (p.includes("leaderboard") || p.includes("/api/games/score")) data = { ok: true };
    await route.fulfill({ json: data });
  });
});

async function pageOverflow(page: Page) {
  return page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    panel: (() => {
      const el = document.querySelector("[data-game-card-content]");
      if (!(el instanceof HTMLElement)) return 0;
      return el.scrollHeight - el.clientHeight;
    })(),
  }));
}

async function fullyVisible(page: Page, testId: string) {
  const loc = page.getByTestId(testId);
  await expect(loc).toBeVisible();
  const box = await loc.boundingBox();
  expect(box, `${testId} bounding box`).not.toBeNull();
  const vh = page.viewportSize()!.height;
  const vw = page.viewportSize()!.width;
  expect(box!.y, `${testId} top`).toBeGreaterThanOrEqual(-1);
  expect(box!.x, `${testId} left`).toBeGreaterThanOrEqual(-1);
  expect(box!.y + box!.height, `${testId} bottom`).toBeLessThanOrEqual(vh + 2);
  expect(box!.x + box!.width, `${testId} right`).toBeLessThanOrEqual(vw + 2);
}

test("Matek sprint: indítás, válaszok és nullaéletes újrapróba a viewporton", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize(VIEWPORTS[0]);
  await page.goto("/games/speed-quiz-math");
  await fullyVisible(page, "sq-start");
  await page.getByTestId("sq-start").click();
  await expect(page.getByTestId("sq-answers")).toBeVisible();
  await fullyVisible(page, "sq-answers");
  const overflow = await pageOverflow(page);
  expect(overflow.x, "vízszintes túlcsordulás").toBeLessThanOrEqual(1);
  expect(overflow.panel, "belső panelgörgetés a válaszok alatt").toBeLessThanOrEqual(8);

  let sawZeroLifeCard = false;
  for (let i = 0; i < 16; i += 1) {
    const feedback = page.getByTestId("quiz-feedback");
    if (await feedback.count()) {
      if ((await page.getByTestId("quiz-feedback-retry").count()) === 0) {
        sawZeroLifeCard = true;
        await expect(page.getByTestId("quiz-feedback-why")).not.toHaveText(/^$/);
        await page.getByTestId("quiz-feedback-dismiss").click();
        break;
      }
      await page.getByTestId("quiz-feedback-dismiss").click();
      await expect(feedback).toHaveCount(0);
    }
    const answers = page.getByTestId("sq-answers").getByRole("button");
    if ((await answers.count()) === 0) break;
    await answers.first().click();
  }
  expect(sawZeroLifeCard, "három élet elvesztése után a kártya ne adjon Újrapróbálom gombot").toBe(true);

  await expect(page.getByRole("button", { name: "Új futam" })).toBeVisible();
  await page.getByRole("button", { name: "Új futam" }).click();
  await expect(page.getByTestId("sq-score")).toContainText("Pont: 0");
  expect(errors.filter((e) => !/401|Failed to fetch/i.test(e))).toEqual([]);
});

test("Szólétra: kérdés és válaszok sötét lapon, viewporton belül", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[1]);
  await page.goto("/games/word-ladder-hu-en");
  await page.getByTestId("wl-start").click();
  const prompt = page.getByTestId("wl-prompt");
  await expect(prompt).toBeVisible();
  const quiz = page.getByTestId("wl-quiz");
  await expect(quiz).toBeVisible();
  const color = await prompt.evaluate((el) => getComputedStyle(el).color);
  const bg = await quiz.evaluate((el) => getComputedStyle(el).backgroundColor);
  const rgb = bg.match(/\d+/g)?.map(Number) ?? [255, 255, 255];
  expect(rgb[0] + rgb[1] + rgb[2], "a kvízlap legyen sötét, ne világos alapon fehér szöveg").toBeLessThan(180);
  const textRgb = color.match(/\d+/g)?.map(Number) ?? [0, 0, 0];
  expect(textRgb[0] + textRgb[1] + textRgb[2], "a kérdés szövege legyen világos").toBeGreaterThan(400);
  const overflow = await pageOverflow(page);
  expect(overflow.x).toBeLessThanOrEqual(1);
  const firstAnswer = quiz.getByRole("button").first();
  await expect(firstAnswer).toBeVisible();
  const box = await firstAnswer.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 2);
});

test("Kockavadász: az indítógomb görgetés nélkül elérhető", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
  await page.goto("/games/block-craft-quiz");
  await fullyVisible(page, "bc-start");
  const overflow = await pageOverflow(page);
  expect(overflow.x).toBeLessThanOrEqual(1);
});
