import { expect, type Page } from "@playwright/test";

import type { GameMobileCase } from "../support/game-mobile-quality";

type GameTestWindow = { __websuliGame?: { forceState: (patch: Record<string, unknown>) => void } };

/**
 * S10 — Galaktikus Aszteroida, teljes mérés. A futás egy hullám-kvízzel indul (a kvízréteg a teljes képernyőt
 * takarja), ezért a játszható állapot: a kvíz helyes válasza után a vezérlősáv (érintős eszközön) vagy a
 * billentyű-súgó (egérrel) látszik, és a kvízréteg eltűnt.
 */
export const CASE: GameMobileCase = {
  id: "space-asteroid-quiz",
  path: "/games/space-asteroid-quiz",
  status: "full",
  startTestId: "sa-start",
  playReady: async (page: Page) => {
    const quiz = page.getByRole("dialog", { name: "Mini-teszt", exact: true });
    await expect(quiz).toBeVisible({ timeout: 15_000 });
    await quiz.locator('[data-correct="true"]').first().click();
    await expect(quiz).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator('[data-testid="sa-touch-controls"], [data-testid="sa-keyboard-hint"]').first()).toBeVisible({
      timeout: 15_000,
    });
  },
  touchControlsTestId: "sa-touch-controls",
  resultForce: { phase: "over", gameWon: true, correctCount: 12 },
  resultTestId: "sa-over",
  answerWrong: async (page: Page) => {
    await page.waitForFunction(
      () => typeof (window as unknown as GameTestWindow).__websuliGame?.forceState === "function",
      undefined,
      { timeout: 15_000 },
    );
    await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame?.forceState({ phase: "quiz" }));
    const wrong = page.getByRole("dialog", { name: "Mini-teszt", exact: true }).locator('[data-correct="false"]').first();
    await expect(wrong).toBeVisible({ timeout: 10_000 });
    await wrong.click();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible({ timeout: 10_000 });
  },
};
