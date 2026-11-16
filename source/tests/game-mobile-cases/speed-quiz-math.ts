import { expect, type Page } from "@playwright/test";

import type { GameMobileCase } from "../support/game-mobile-quality";

/** S7 — teljes mérés: a válaszrács a játszható állapot jele; rossz válasz a hook `data-correct="false"` gombja. */
export const CASE: GameMobileCase = {
  id: "speed-quiz-math",
  path: "/games/speed-quiz-math",
  status: "full",
  startTestId: "sq-start",
  playReady: async (page: Page) => {
    await expect(page.getByTestId("sq-answers")).toBeVisible({ timeout: 15_000 });
  },
  resultForce: { phase: "won", correctCount: 18 },
  resultTestId: "sq-won",
  quizScope: '[data-testid="sq-answers"]',
  answerWrong: async (page: Page) => {
    await page.locator('[data-testid="sq-answers"] [data-correct="false"]').first().click();
  },
};
