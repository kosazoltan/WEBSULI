import { test, expect, type Page } from "@playwright/test";

/**
 * D2 — egyképernyős játékélmény mind a 7 játékra, több viewportra.
 * C1: Viharvadász szintlista. C2 assertok a games-pointer-controls.spec.ts-ben.
 */

test.use({ serviceWorkers: "block" });

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
  { width: 844, height: 390 },
  { width: 1366, height: 768 },
] as const;

const MENU_GAMES: Array<{ path: string; startTestId?: string; startName?: RegExp }> = [
  { path: "/games/speed-quiz-math", startTestId: "sq-start" },
  { path: "/games/word-ladder-hu-en", startTestId: "wl-start" },
  { path: "/games/block-craft-quiz", startTestId: "bc-start" },
  { path: "/games/tsunami-english", startName: /indít|indul|start|menekül|rajta/i },
  { path: "/games/brain-rot-steal", startName: /indít|indul|start|vadász|rajta/i },
  { path: "/games/space-asteroid-quiz", startTestId: "sa-start" },
  { path: "/games/tornado-hunter-200", startName: /vadászat|indítás|indul|start|rajta/i },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "4");
    localStorage.setItem("websuli.spaceQuiz.grade", "4");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") {
      data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 4, classrooms: [4] };
    }
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    if (p.includes("leaderboard") || p.includes("/api/game/score")) data = { ok: true };
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

async function clickStart(page: Page, g: (typeof MENU_GAMES)[number]) {
  if (g.startTestId) {
    await fullyVisible(page, g.startTestId);
    await page.getByTestId(g.startTestId).click();
    return;
  }
  const btn = page.getByRole("button", { name: g.startName! }).first();
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await btn.click();
}

async function startControlVisible(page: Page, g: (typeof MENU_GAMES)[number], vp: { width: number; height: number }) {
  const loc = g.startTestId
    ? page.getByTestId(g.startTestId)
    : page.getByRole("button", { name: g.startName! }).first();
  await expect(loc).toBeVisible({ timeout: 15_000 });
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  expect(box, "start control box").not.toBeNull();
  // Landscape short height: menu may require internal scroll; require the control
  // itself fits after scrollIntoView, not that the whole menu is unscrollable.
  expect(box!.height).toBeLessThanOrEqual(vp.height);
  expect(box!.y).toBeGreaterThanOrEqual(-2);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 4);
}

for (const vp of VIEWPORTS) {
  for (const g of MENU_GAMES) {
    test(`menü ${g.path} @ ${vp.width}x${vp.height}: nincs vízszintes túlcsordulás, indító elérhető`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      await page.goto(g.path);
      const overflow = await pageOverflow(page);
      expect(overflow.x, "vízszintes").toBeLessThanOrEqual(2);
      await startControlVisible(page, g, vp);
    });
  }
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

for (const vp of [
  { width: 390, height: 844 },
  { width: 1366, height: 768 },
] as const) {
  test(`C1 Viharvadász szintlista @ ${vp.width}x${vp.height}: nincs oldalgörgetés`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/games/tornado-hunter-200");
    await clickStart(page, MENU_GAMES.find((g) => g.path.includes("tornado"))!);
    await expect(page.getByRole("button", { name: /^1$/ }).first()).toBeVisible({ timeout: 15_000 });
    const overflow = await pageOverflow(page);
    expect(overflow.y, "document nem görög a szintlistán").toBeLessThanOrEqual(2);
    const heading = page.getByText(/Szintek|szint/i).first();
    await expect(heading).toBeVisible();
    const level1 = page.getByRole("button", { name: /^1$/ }).first();
    const box = await level1.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(-1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 2);
  });
}

test("győzelmi képernyő (hook): Matek sprint won nincs oldalgörgetés", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0]);
  await page.goto("/games/speed-quiz-math?seed=1");
  await expect
    .poll(async () => page.evaluate(() => Boolean((window as unknown as { __websuliGame?: { forceState: unknown } }).__websuliGame?.forceState)))
    .toBe(true);
  await page.evaluate(() => {
    (window as unknown as { __websuliGame: { forceState: (p: object) => void } }).__websuliGame.forceState({
      phase: "won",
      correctCount: 18,
    });
  });
  await expect(page.getByTestId("sq-won")).toBeVisible({ timeout: 10_000 });
  expect((await pageOverflow(page)).y).toBeLessThanOrEqual(2);
});
