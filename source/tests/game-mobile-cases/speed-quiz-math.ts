import { expect, type Page } from "@playwright/test";

import type { GameMobileCase } from "../support/game-mobile-quality";

/**
 * J4a — „Neon védőtorony” (terv 9.: a mérő esetfájlja a „kvíz-állapotot” az új, nem blokkoló kérdés-állapotra cseréli;
 * a mérés nem lazul — M2/M3 a kérdés-állapotban is mér).
 *
 * - Játszható jel: a játéktér számdrón-rétege (`sq-answers`) — a menet alatt mindig ott van.
 * - Kérdés-állapot (J4b): a Zéró-robot gyenge pontjai (`sq-answers` alatti `data-correct` gombok) — a főellenféllel
 *   együtt folyamatosan mozognak, ezért `quizMoving: true` (érintési méret + képernyőn belül N mintán; a jó válasz a
 *   pillanatnyi helyre kattint). A `quizForce` (`forceState({ phase: "boss" })`) azonnal a harcba visz.
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
  // J4b: a kérdés-állapotot a Zéró-robot harcán mérjük — a gyenge pontok a főellenféllel együtt FOLYAMATOSAN mozognak
  // (az első valóban mozgó célú eset a mérőben: `quizMoving`, közös utójavítás d).
  quizForce: { phase: "boss" },
  quizMoving: true,
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
