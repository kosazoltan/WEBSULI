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

/**
 * Rossz válasz (M9, M10, K1/K3): a teszt-kampó kérdést nyit (J7b: turbó-kérdés a nem blokkoló kérdés-sávon, gomb-mód),
 * a gyerek az első rossz válaszra koppint. A magyarázókártya (`quiz-feedback`) már NEM nyílik magától (terv 9., J5) — a
 * „Miért?” gomb nyitja, szünettel; a K1/K3 mérés így a „Miért?” kártyán fut.
 */
async function answerWrong(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof (window as unknown as GameTestWindow).__websuliGame?.forceState === "function");
  await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame?.forceState({ screen: "play", phase: "quiz" }));
  const quiz = page.getByTestId("tornado-quiz");
  await expect(quiz).toBeVisible({ timeout: 10_000 });
  await quiz.locator('[data-correct="false"]').first().click();
  await page.getByTestId("play-why").click();
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
  // J7b (a független ellenőrzés M3 lelete után): a mért kérdés-állapot az ELÁGAZÁS a bank leghosszabb válaszaival
  // (`forceState({ junction: "long" })`) — a koppintható, a kamerával együtt mozgó táblák (`quizMoving`): érintési méret,
  // képernyőn belül, nem fedik egymást; a betűméret (M3) a táblákon és a teljes válaszok listáján is mérve.
  quizScope: '[data-tornado-signs="open"]',
  quizForce: { screen: "play", junction: "long" },
  quizMoving: true,
  answerWrong,
  orientation: "landscape",
};
