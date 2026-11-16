import { expect, type Page } from "@playwright/test";

import type { GameMobileCase } from "../support/game-mobile-quality";

/**
 * J4a — „Neon védőtorony” (terv 9.: a mérő esetfájlja a „kvíz-állapotot” az új, nem blokkoló kérdés-állapotra cseréli;
 * a mérés nem lazul — M2/M3 a kérdés-állapotban is mér).
 *
 * - Játszható jel: a játéktér számdrón-rétege (`sq-answers`) — a menet alatt mindig ott van.
 * - Kérdés-állapot: a számdrónok (`sq-answers` alatti `data-correct` gombok) a játékvilágban; a drón a belépő repülés
 *   (~0,5 s) után egy helyben lebeg, így a mérő `waitForStable`-je és a Playwright `click`-je beáll. A kérdést a
 *   `quizForce` (`forceState({ question: true })`) azonnal nyitja, nem kell az ütemezőre várni.
 * - Rossz válasz: a rossz drón; a magyarázókártya (`quiz-feedback`) már NEM nyílik magától (terv 9., J5) — a „Miért?”
 *   gomb nyitja, szünettel. A K1/K3 mérés (szünet menü a kártya fölött) így a „Miért?” kártyán fut.
 */
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
  quizForce: { question: true },
  quizScope: '[data-testid="sq-answers"]',
  answerWrong: async (page: Page) => {
    await page.waitForFunction(
      () => typeof (window as unknown as { __websuliGame?: { forceState?: unknown } }).__websuliGame?.forceState === "function",
      undefined,
      { timeout: 15_000 },
    );
    await page.evaluate(() => (window as unknown as { __websuliGame: { forceState: (p: object) => void } }).__websuliGame.forceState({ question: true }));
    await page.locator('[data-testid="sq-answers"] [data-correct="false"]').first().click();
    await page.getByTestId("play-why").click();
  },
};
