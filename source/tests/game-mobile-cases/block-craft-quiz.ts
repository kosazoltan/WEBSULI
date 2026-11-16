import { expect, type Page } from "@playwright/test";

import type { GameMobileCase } from "../support/game-mobile-quality";

type GameTestWindow = { __websuliGame?: { forceState: (patch: Record<string, unknown>) => void } };

/** S11: játszható, ha az érintővezérlő (érintős eszközön) vagy a billentyű-tipp (egérnél) látszik. */
async function playReady(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="bc-touch-controls"], [data-testid="bc-keyboard-hint"]').first()).toBeVisible({
    timeout: 15_000,
  });
}

/** S11 (M9, M10): kvíz kiváltása a teszt-API-val (blokk nélkül), majd egy rossz válasz. */
async function answerWrong(page: Page): Promise<void> {
  await page.waitForFunction(
    () => typeof (window as unknown as GameTestWindow).__websuliGame?.forceState === "function",
    undefined,
    { timeout: 15_000 },
  );
  await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame?.forceState({ phase: "quiz" }));
  const wrong = page.locator('[data-testid="bc-quiz"] [data-correct="false"]').first();
  await expect(wrong).toBeVisible({ timeout: 10_000 });
  await wrong.click();
}

/** Kockavadász kvíz — S11: teljes mobil-mérés (M1–M7, M9–M11). */
export const CASE: GameMobileCase = {
  id: "block-craft-quiz",
  path: "/games/block-craft-quiz",
  status: "full",
  startTestId: "bc-start",
  playReady,
  touchControlsTestId: "bc-touch-controls",
  resultForce: { phase: "levelComplete" },
  resultTestId: "bc-level-complete",
  answerWrong,
};
