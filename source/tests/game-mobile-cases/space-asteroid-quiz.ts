import { expect, type Page } from "@playwright/test";

import type { GameMobileCase } from "../support/game-mobile-quality";

type GameTestWindow = { __websuliGame?: { forceState: (patch: Record<string, unknown>) => void } };

/**
 * J6a — Galaktikus Aszteroida (terv 9.: a mérő esetfájlja a „kvíz-állapotot” az új, nem blokkoló kérdés-állapotra cseréli; a
 * mérés nem lazul — M2/M3 a kérdés-állapotban is mér, 360×640-en is).
 *
 * - Játszható jel: a menet AZONNAL indul (nincs induló kvíz, nincs kapu) — a vezérlősáv (érintős eszközön) vagy a billentyű-súgó
 *   (egérrel) látszik, és nincs modális réteg (`[role="dialog"]` sincs).
 * - Kérdés-állapot: a lebegő KRISTÁLYOK (`sa-crystals` alatti `data-correct` gombok). A célpont a logikai helyén ÁLL (ujjal
 *   így könnyebb eltalálni; a lebegés a 3D kristály és a gomb fénye), ezért a stabil doboz mérése (`waitForStable`) érvényes.
 *   A `quizForce` (`forceState({ question: true })`) azonnal nyit egy kérdést.
 * - Rossz válasz: a rossz kristály; a magyarázókártya (`quiz-feedback`) már NEM nyílik magától (terv 9., J5) — a „Miért?” gomb
 *   nyitja, szünettel. A K1/K3 mérés (szünet menü a kártya fölött) így a „Miért?” kártyán fut.
 */
export const CASE: GameMobileCase = {
  id: "space-asteroid-quiz",
  path: "/games/space-asteroid-quiz",
  status: "full",
  startTestId: "sa-start",
  playReady: async (page: Page) => {
    await expect(page.locator('[data-testid="sa-touch-controls"], [data-testid="sa-keyboard-hint"]').first()).toBeVisible({
      timeout: 15_000,
    });
    // J6a: a játék kérdés-kapu nélkül indul — semmi nem takarja a pályát.
    await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);
  },
  touchControlsTestId: "sa-touch-controls",
  resultForce: { phase: "over", gameWon: true, correctCount: 12 },
  resultTestId: "sa-over",
  quizScope: '[data-testid="sa-crystals"]',
  quizForce: { question: true },
  answerWrong: async (page: Page) => {
    await page.waitForFunction(
      () => typeof (window as unknown as GameTestWindow).__websuliGame?.forceState === "function",
      undefined,
      { timeout: 15_000 },
    );
    await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame?.forceState({ question: true }));
    const wrong = page.locator('[data-testid="sa-crystals"] [data-correct="false"]').first();
    await expect(wrong).toBeVisible({ timeout: 10_000 });
    await wrong.click();
    await page.getByTestId("play-why").click();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible({ timeout: 10_000 });
  },
};
