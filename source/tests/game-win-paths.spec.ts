import { expect, test, type Page } from "@playwright/test";

import blockCraftQuiz from "./game-win-cases/block-craft-quiz";
import brainRotSteal from "./game-win-cases/brain-rot-steal";
import spaceAsteroidQuiz from "./game-win-cases/space-asteroid-quiz";
import speedQuizMath from "./game-win-cases/speed-quiz-math";
import tornadoHunter200 from "./game-win-cases/tornado-hunter-200";
import tsunamiEnglish from "./game-win-cases/tsunami-english";
import type { GameWinCase } from "./game-win-cases/types";
import wordLadderHuEn from "./game-win-cases/word-ladder-hu-en";

/**
 * D1 — determinisztikus győzelmi / szintlezárási utak a test hookokkal.
 * Csak build:e2e (VITE_ENABLE_GAME_TEST_HOOKS=1) alatt él.
 *
 * J0c (végrehajtás K.1/7): az esetek játékonként a `tests/game-win-cases/<id>.ts` fájlokban állnak (tiszta átrendezés,
 * az értékek és az elvárások változatlanok); a játékszeletek csak a saját esetfájljukat módosítják.
 */

test.use({ serviceWorkers: "block" });

const GAMES: GameWinCase[] = [
  speedQuizMath,
  wordLadderHuEn,
  tsunamiEnglish,
  brainRotSteal,
  blockCraftQuiz,
  spaceAsteroidQuiz,
  tornadoHunter200,
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
