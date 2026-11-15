import { expect } from "@playwright/test";

import type { GameMobileCase } from "../support/game-mobile-quality";

/**
 * S6 — Szólétra, teljes mobil-mérés (végrehajtás S6/9. lépés). Nincs külön érintővezérlője (M5): a válaszgombok
 * minden eszközön látszanak, ezért `touchControlsTestId` nincs.
 */
export const CASE: GameMobileCase = {
  id: "word-ladder-hu-en",
  path: "/games/word-ladder-hu-en",
  status: "full",
  startTestId: "wl-start",
  playReady: async (page) => {
    await expect(page.getByTestId("wl-quiz")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid^="wl-option-"]').first()).toBeEnabled({ timeout: 15_000 });
  },
  resultForce: { phase: "won" },
  resultTestId: "wl-won",
  answerWrong: async (page) => {
    const wrong = page.locator('[data-testid^="wl-option-"][data-correct="false"]').first();
    await expect(wrong).toBeEnabled({ timeout: 15_000 });
    await wrong.click();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible({ timeout: 5_000 });
  },
};
