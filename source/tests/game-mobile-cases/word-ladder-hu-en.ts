import { expect } from "@playwright/test";

import type { GameMobileCase } from "../support/game-mobile-quality";

/**
 * S6 — Szólétra, teljes mobil-mérés (végrehajtás S6/9. lépés). Nincs külön érintővezérlője (M5): a kapaszkodók
 * (válaszcélok) minden eszközön látszanak, ezért `touchControlsTestId` nincs.
 *
 * SPEC-VÁLTOZÁS 2026-11-16 (docs/specs/2026-11-16-jatekok-jatekelmeny.md 9.; végrehajtás J2a): a „Szikla-verseny”
 * nem blokkol — rossz fogásra nem nyílik magától a magyarázókártya. A rossz válasz kiváltása ezért: rossz kapaszkodó →
 * a helyes kapaszkodó zölden látszik (`data-state="correct"`) → „Miért?” → a kártya (`quiz-feedback`). Így az M9, M10 és
 * a K1/K3 mérés ugyanazt a kártyát méri, mint eddig (a mérés nem lazul). A `wl-quiz` most a fal kapaszkodó-sávja (a
 * `wl-option-<i>` gombokkal), a kvíz-állapot a játék alapállapota (a játék magától kérdez).
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
  quizScope: '[data-testid="wl-quiz"]',
  answerWrong: async (page) => {
    const wrong = page.locator('[data-testid^="wl-option-"][data-correct="false"]').first();
    await expect(wrong).toBeEnabled({ timeout: 15_000 });
    await wrong.click();
    await expect(page.locator('[data-testid^="wl-option-"][data-state="correct"]').first()).toBeVisible({ timeout: 2_000 });
    await page.getByTestId("play-why").click();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible({ timeout: 5_000 });
  },
};
