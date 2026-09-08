import { expect, test, type Page } from "@playwright/test";

/**
 * D1 — determinisztikus győzelmi / szintlezárási utak a test hookokkal.
 * Csak build:e2e (VITE_ENABLE_GAME_TEST_HOOKS=1) alatt él.
 */

test.use({ serviceWorkers: "block" });

const GAMES: Array<{
  path: string;
  force: Record<string, unknown>;
  resultTestId: string;
}> = [
  { path: "/games/speed-quiz-math", force: { phase: "won", correctCount: 18 }, resultTestId: "sq-won" },
  { path: "/games/word-ladder-hu-en", force: { phase: "won" }, resultTestId: "wl-won" },
  { path: "/games/tsunami-english", force: { phase: "won", correctCount: 8 }, resultTestId: "ts-won" },
  { path: "/games/brain-rot-steal", force: { phase: "over", correctCount: 7 }, resultTestId: "br-over" },
  { path: "/games/block-craft-quiz", force: { phase: "levelComplete" }, resultTestId: "bc-level-complete" },
  { path: "/games/space-asteroid-quiz", force: { phase: "over", gameWon: true, correctCount: 12 }, resultTestId: "sa-over" },
  { path: "/games/tornado-hunter-200", force: { screen: "play", phase: "result_win" }, resultTestId: "th-result" },
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

async function pageOverflowY(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
}

async function forceWin(page: Page, path: string, force: Record<string, unknown>) {
  await page.goto(`${path}?seed=42`);
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          Boolean(
            (window as unknown as { __websuliGame?: { forceState: unknown } }).__websuliGame?.forceState,
          ),
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
  await page.evaluate((patch) => {
    (window as unknown as { __websuliGame: { forceState: (p: Record<string, unknown>) => void } }).__websuliGame.forceState(
      patch,
    );
  }, force);
}

for (const g of GAMES) {
  test(`${g.path}: győzelmi/lezáró képernyő viewporton, gombok ≥44px`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await forceWin(page, g.path, g.force);
    const result = page.getByTestId(g.resultTestId);
    await expect(result).toBeVisible({ timeout: 10_000 });
    expect(await pageOverflowY(page)).toBeLessThanOrEqual(2);

    const buttons = result.getByRole("button");
    const count = await buttons.count();
    expect(count, "legalább egy gomb a jutalomképernyőn").toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const box = await buttons.nth(i).boundingBox();
      expect(box, `gomb ${i}`).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 2);
    }
  });
}

test("Szólétra: data-correct attribútum a hook alatt", async ({ page }) => {
  await page.goto("/games/word-ladder-hu-en?seed=7");
  await page.getByTestId("wl-start").click();
  const correct = page.locator('[data-testid^="wl-option-"][data-correct="true"]');
  await expect(correct).toHaveCount(1);
  await correct.click();
});
