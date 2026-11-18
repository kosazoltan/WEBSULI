import { expect, type Page } from "@playwright/test";

import type { GameMobileCase } from "../support/game-mobile-quality";

type GameTestWindow = { __websuliGame?: { forceState: (patch: Record<string, unknown>) => void } };

/**
 * J5a — „Lény-aréna” (terv 9.: a mérő esetfájlja a „kvíz-állapotot” az új, nem blokkoló kérdés-állapotra cseréli; a mérés
 * nem lazul — M2/M3 a kérdés-állapotban is mér).
 *
 * - Játszható jel: a játéktér (`[data-collectible-world]`) és a HUD szünet gombja.
 * - Kérdés-állapot: a 4 KETREC (`br-cages` alatti `data-correct` gombok) — `forceState({ question: true })`: egy lény a
 *   vadász kezében, a ketrecek kinyílnak. A ketrecek egy helyben állnak (nem mozgó cél). A jó válasz (M10): a jó ketrecre
 *   bökve a vadász befut és megáll benne (a válasz a beállás, nem a koppintás).
 * - Rossz válasz: a rossz ketrecre bökve; a magyarázókártya (`quiz-feedback`) már NEM nyílik magától (terv 9., J5) — a
 *   „Miért?” gomb nyitja, szünettel. Így az M9, M10 és a K1/K3 mérés ugyanazt a kártyát méri, mint eddig.
 */
async function playReady(page: Page): Promise<void> {
  await expect(page.locator("[data-collectible-world]").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("game-pause")).toBeVisible();
}

async function openCages(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof (window as unknown as GameTestWindow).__websuliGame?.forceState === "function");
  await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame?.forceState({ question: true }));
  await expect(page.locator('[data-testid="br-cages"] [data-correct]')).toHaveCount(4, { timeout: 10_000 });
}

async function answerWrong(page: Page): Promise<void> {
  await openCages(page);
  await page.locator('[data-testid="br-cages"] [data-correct="false"]').first().click();
  // A vadász befut a rossz ketrecbe → a helyes ketrec zölden; „Miért?” → a kártya.
  await expect(page.locator('[data-testid="br-cages"] [data-correct="true"]')).toHaveAttribute("data-state", "correct", { timeout: 10_000 });
  await page.getByTestId("play-why").click();
  await expect(page.getByTestId("quiz-feedback")).toBeVisible({ timeout: 5_000 });
}

export const CASE: GameMobileCase = {
  id: "brain-rot-steal",
  path: "/games/brain-rot-steal",
  status: "full",
  startName: /indít|indul|start|vadász|rajta/i,
  playReady,
  touchControlsTestId: "br-touch-controls",
  resultForce: { phase: "over", correctCount: 7 },
  resultTestId: "br-over",
  quizScope: '[data-testid="br-cages"]',
  // Review #485 B2: a kérdés-állapot a LEGHOSSZABB válaszú tétellel (a kézi és az évfolyam-bankból programmal kikeresve) —
  // a mérő így a jelölt módot / a leghosszabb ketrecfeliratot is méri (M2, M3, átfedés) mindhárom nézetben. Review #485 Ú2:
  // a leghosszabb prompttal EGYÜTT (a legmélyebb ketrec-zóna).
  quizForce: { phase: "quiz-longboth" },
  answerWrong,
};
