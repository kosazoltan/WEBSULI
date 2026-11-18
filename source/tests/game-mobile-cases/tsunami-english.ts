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
   * SPEC-VÁLTOZÁS 2026-11-18 (docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md, D1): a kapu-táblák helyett a kérdés-sáv négy
   * gombja (a régi emelkedő víz). A `ts-quiz` a kérdés-sáv; a kvíz-állapotú mérés (M2 / M3 / M10) továbbra is a leghosszabb
   * válaszokkal (a nehezebb eset). A `phase: "quiz"` a `question: true` álneve (terv 9.).
   */
  // Állapotra várunk (a #500 CI-jának ingadozója, 2026-11-18): a hatókör csak a NYITOTT, élesített kérdés — a megoldás-
  // kijelzés (`data-state="reveal"`) alatt nincs kattintható „jó válasz”, így a közös `clearQuiz` a kijelzés végét várja meg,
  // nem kattint egy épp lecserélődő gombra. A kártya és a gombok az új elrendezésben nem fedik egymást (a játékos sem
  // kattint takart gombra — a `tsunami-play.spec.ts` elrendezés-esetei ezt mérik).
  quizScope: '[data-testid="ts-quiz"][data-state="open"][data-armed="true"]',
  quizForce: { phase: "quiz", longAnswers: true },
  answerWrong: async (page: Page) => {
    await page.waitForFunction(
      () => typeof (window as unknown as GameTestWindow).__websuliGame?.forceState === "function",
      undefined,
      { timeout: 15_000 },
    );
    await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame?.forceState({ phase: "quiz", answers: ["cat", "dog", "sun", "map"] }));
    const wrong = page.locator('[data-testid="ts-quiz"] .play-question-option[data-correct="false"]').first();
    await expect(wrong).toBeVisible({ timeout: 10_000 });
    await wrong.click();
    // SPEC-VÁLTOZÁS 2026-11-16 (terv 9.): a hibás válasz nem blokkol — a magyarázókártyát a „Miért?” nyitja.
    await page.getByTestId("play-why").first().click({ timeout: 10_000 });
    await expect(page.getByTestId("quiz-feedback")).toBeVisible({ timeout: 10_000 });
  },
};
