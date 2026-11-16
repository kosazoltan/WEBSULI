import { expect, type Page } from "@playwright/test";

import type { GameMobileCase } from "../support/game-mobile-quality";

type GameTestWindow = { __websuliGame?: { forceState: (patch: Record<string, unknown>) => void } };

/** S8: a játéktér (`[data-collectible-world]`) és a HUD szünet gombja látszik. */
async function playReady(page: Page): Promise<void> {
  await expect(page.locator("[data-collectible-world]").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("game-pause")).toBeVisible();
}

/** S8: kvíz a lap tesztes API-jával (`forceState({ phase: "quiz" })`), majd az első rossz válasz. */
async function answerWrong(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof (window as unknown as GameTestWindow).__websuliGame?.forceState === "function");
  await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame?.forceState({ phase: "quiz" }));
  const wrong = page.locator('[data-testid="br-quiz"] [data-correct="false"]').first();
  await expect(wrong).toBeVisible({ timeout: 10_000 });
  await wrong.click();
}

export const CASE: GameMobileCase = {
  id: "brain-rot-steal",
  path: "/games/brain-rot-steal",
  status: "full",
  startName: /indít|indul|start|vadász|rajta/i,
  playReady,
  resultForce: { phase: "over", correctCount: 7 },
  resultTestId: "br-over",
  quizScope: '[data-testid="br-quiz"]',
  quizForce: { phase: "quiz" },
  answerWrong,
};
