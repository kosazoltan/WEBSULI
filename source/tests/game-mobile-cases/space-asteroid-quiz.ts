import { expect, type Page } from "@playwright/test";

import { GRADE_QUIZ_ITEMS } from "../../client/src/data/gradeQuizBank";
import type { GameMobileCase } from "../support/game-mobile-quality";

type GameTestWindow = { __websuliGame?: { forceState: (patch: Record<string, unknown>) => void } };

/**
 * J6a — Galaktikus Aszteroida (terv 9.: a mérő esetfájlja a „kvíz-állapotot” az új, nem blokkoló kérdés-állapotra cseréli; a
 * mérés nem lazul — M2/M3 a kérdés-állapotban is mér, 360×640-en is).
 *
 * - Játszható jel: a menet AZONNAL indul (nincs induló kvíz, nincs kapu) — a vezérlősáv (érintős eszközön) vagy a billentyű-súgó
 *   (egérrel) látszik, és nincs modális réteg (`[role="dialog"]` sincs).
 * - Kérdés-állapot: a KRISTÁLYOK (`sa-crystals` alatti `data-correct` gombok). A célpont a logikai helyén ÁLL (ujjal így
 *   könnyebb eltalálni; a lebegés a 3D kristály és a gomb fénye), a kérdés-zóna viszont a kérdés-kártya mért aljához igazodik
 *   (~1 mp alatt beáll), és a kártya belépő animációja alatt a sáv gombjai törtpixelesek (47,6 px — mért flake). Ezért
 *   `quizMoving: true`: a mérő megvárja, hogy a célok 6 egymást követő képkockán érintési méretűek és a képernyőn belül
 *   legyenek, majd több mintán (≈ 1 mp) méri az átfedést — a mérce (≥ 48 px, nincs átfedés) NEM lazul, csak a mérés ideje
 *   kerül az animáció és a beállás utánra. A `quizForce` (`forceState({ question: true })`) azonnal nyit egy kérdést.
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
  quizMoving: true,
  answerWrong: async (page: Page) => {
    await page.waitForFunction(
      () => typeof (window as unknown as GameTestWindow).__websuliGame?.forceState === "function",
      undefined,
      { timeout: 15_000 },
    );
    await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame?.forceState({ question: true }));
    const wrong = page.locator('[data-testid="sa-crystals"] [data-correct="false"]').first();
    await expect(wrong).toBeVisible({ timeout: 10_000 });
    // Review #486: nincs `force` — a kristály élesedése (500 ms) után, mozdulatlanul kattintható gombra kattintunk.
    await expect(page.getByTestId("sa-crystals")).toHaveAttribute("data-armed", "true", { timeout: 10_000 });
    await wrong.click();
    await page.getByTestId("play-why").click();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible({ timeout: 10_000 });
  },
};

/**
 * Review #486: a LEGHOSSZABB banki válaszú tétel — a kristályokon sorszám, a TELJES szövegek a „Válaszok” listán (`sa-answers`).
 * A közös mérő (`game-mobile-quality.spec.ts`) egyetlen `CASE`-t importál játékonként: ezt a második esetet az orkesztrátor köti
 * be (ORCHESTRÁTOR-KÉRÉS); addig a `space-asteroid-play.spec.ts` ugyanezt méri mindhárom nézetben (>= 48 px, nincs átfedés,
 * nincs vágás, a lista a nézeten belül).
 */
const LONGEST = [...GRADE_QUIZ_ITEMS].sort((a, b) => b.options.reduce((n, o) => n + o.length, 0) - a.options.reduce((n, o) => n + o.length, 0))[0]!;
export const CASE_LONG_ANSWERS: GameMobileCase = {
  ...CASE,
  id: "space-asteroid-quiz",
  quizScope: '[data-testid="sa-answers"]',
  quizForce: { question: true, questionItem: { id: "long-answers", prompt: LONGEST.prompt, options: [...LONGEST.options], correctIndex: LONGEST.correctIndex } },
  quizMoving: false,
  answerWrong: async (page: Page) => {
    await page.waitForFunction(() => typeof (window as unknown as GameTestWindow).__websuliGame?.forceState === "function", undefined, { timeout: 15_000 });
    await page.evaluate(
      (item) => (window as unknown as GameTestWindow).__websuliGame?.forceState({ question: true, questionItem: item }),
      { id: "long-answers", prompt: LONGEST.prompt, options: [...LONGEST.options], correctIndex: LONGEST.correctIndex },
    );
    await expect(page.getByTestId("sa-crystals")).toHaveAttribute("data-armed", "true", { timeout: 10_000 });
    await page.getByTestId("sa-answers-open").click();
    const wrongText = LONGEST.options[(LONGEST.correctIndex + 1) % LONGEST.options.length]!;
    await page.locator(".sa-answer", { has: page.getByText(wrongText, { exact: true }) }).click();
    await page.getByTestId("play-why").click();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible({ timeout: 10_000 });
  },
};
