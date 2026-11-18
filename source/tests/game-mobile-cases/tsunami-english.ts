import { expect, type Page } from "@playwright/test";

import type { GameMobileCase } from "../support/game-mobile-quality";

type GameTestWindow = { __websuliGame?: { forceState: (patch: Record<string, unknown>) => void } };

/**
 * S9 — Szökőár szökés, teljes mérés. Játszható: érintős eszközön a vezérlősáv, egérrel a billentyű-súgó
 * (érintővezérlés csak érintős eszközön — terv 4.6/1, M5).
 */
export const CASE: GameMobileCase = {
  id: "tsunami-english",
  /*
   * A játéklistán a Szökőár kártyája nem egy közös hivatkozás, hanem három nehézség-link
   * (`Games.tsx`: `/games/tsunami-english?difficulty=easy|normal|hard`). Az M8 („a listáról legfeljebb két
   * koppintás”) ezért a valós belépési úttal mér: „Könnyű” → „Indítás”.
   */
  path: "/games/tsunami-english?difficulty=easy",
  status: "full",
  startTestId: "button-tsunami-start",
  startName: /indít|indul|start|menekül|rajta/i,
  playReady: async (page: Page) => {
    await expect(page.locator('[data-testid="tsunami-touch-controls"], [data-testid="tsunami-key-hint"]').first()).toBeVisible({
      timeout: 15_000,
    });
  },
  touchControlsTestId: "tsunami-touch-controls",
  resultForce: { phase: "won", correctCount: 8 },
  resultTestId: "ts-won",
  /*
   * J1a (D-J1a-7): a `ts-quiz` a kapu-táblák csoportja (látható, érinthető `data-correct`-es gombok) a kérdés-sávval együtt;
   * a táblák a kérdés alatt egy helyben állnak (nem mozgó cél). A `phase: "quiz"` a `question: true` álneve (terv 9.).
   */
  quizScope: '[data-testid="ts-quiz"]',
  /*
   * Review #483 (M3, D-J1a-11): a kvíz-állapotú mérés (M2 / M3 / M10) a NEHEZEBB esetet nézi — a forrásokban talált
   * leghosszabb válaszokkal a kérdés-sáv „lista módban” mutatja a válaszokat; a rövid válaszos táblás módot a
   * `tsunami-play.spec.ts` méri mindhárom nézetben.
   */
  quizForce: { phase: "quiz", longAnswers: true },
  answerWrong: async (page: Page) => {
    await page.waitForFunction(
      () => typeof (window as unknown as GameTestWindow).__websuliGame?.forceState === "function",
      undefined,
      { timeout: 15_000 },
    );
    // D-J1a-18: a táblás hibás válasz kényszerített egysoros válaszokkal (fekvőben a kétsoros véletlen tétel jogosan lista mód).
    await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame?.forceState({ phase: "quiz", answers: ["cat", "dog", "sun"] }));
    const wrong = page.locator('[data-testid="ts-quiz"] .ts-gate[data-correct="false"]').first();
    await expect(wrong).toBeVisible({ timeout: 10_000 });
    await wrong.click();
    // SPEC-VÁLTOZÁS 2026-11-16 (terv 9.): a hibás válasz nem blokkol — a magyarázókártyát a „Miért?” nyitja.
    await page.getByTestId("play-why").first().click({ timeout: 10_000 });
    await expect(page.getByTestId("quiz-feedback")).toBeVisible({ timeout: 10_000 });
  },
};
