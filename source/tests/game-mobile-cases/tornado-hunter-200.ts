import { expect, type Page } from "@playwright/test";

import type { GameMobileCase } from "../support/game-mobile-quality";

type GameTestWindow = { __websuliGame?: { forceState: (patch: Record<string, unknown>) => void } };

/**
 * S12 — a játszható állapot: a közös keret `data-game-state="playing"`, a 3D vászon látszik, és érintős eszközön
 * (`data-touch="true"`) az érintővezérlő is. A játék fekvő tájolást kér: álló nézetben a forgatási kérésen a
 * játékos „Így is játszom”-ot választ — ahogy egy gyerek tenné —, különben a kérés eltakarná a HUD-ot.
 */
async function playReady(page: Page): Promise<void> {
  const root = page.locator('[data-game="TornadoHunter200"]');
  await expect(root).toHaveAttribute("data-game-state", "playing", { timeout: 20_000 });
  await expect(page.locator("[data-tornado-play] canvas")).toBeVisible();
  const rotate = page.getByTestId("game-rotate-continue");
  if (await rotate.isVisible()) await rotate.click();
  if ((await root.getAttribute("data-touch")) === "true") {
    await expect(page.getByTestId("tornado-touch-controls")).toBeVisible();
  }
}

/** Rossz válasz (M9, M10): a teszt-kampó kvízt dob fel, és az első rossz válaszgombra koppint. */
async function answerWrong(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof (window as unknown as GameTestWindow).__websuliGame?.forceState === "function");
  await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame?.forceState({ screen: "play", phase: "quiz" }));
  const quiz = page.getByTestId("tornado-quiz");
  await expect(quiz).toBeVisible({ timeout: 10_000 });
  await quiz.locator('[data-correct="false"]').first().click();
}

export const CASE: GameMobileCase = {
  id: "tornado-hunter-200",
  path: "/games/tornado-hunter-200",
  status: "full",
  // Egy koppintás a kezdőképernyőről a játékig (M8); a „Vadászat indítása” a szintlistára visz (meglévő e2e-k).
  startTestId: "tornado-quick-start",
  startName: /vadászat|indítás|indul|start|rajta/i,
  playReady,
  touchControlsTestId: "tornado-touch-controls",
  resultForce: { screen: "play", phase: "result_win" },
  resultTestId: "th-result",
  quizScope: '[data-testid="tornado-quiz"]',
  quizForce: { screen: "play", phase: "quiz" },
  answerWrong,
  orientation: "landscape",
};
