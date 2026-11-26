import { expect, type Page } from "@playwright/test";

import type { GameMobileCase } from "../support/game-mobile-quality";

type GameTestWindow = { __websuliGame?: { forceState: (patch: Record<string, unknown>) => void } };

/** S11: játszható, ha az érintővezérlő (érintős eszközön) vagy a billentyű-tipp (egérnél) látszik. */
async function playReady(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="bc-touch-controls"], [data-testid="bc-keyboard-hint"]').first()).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * S11 (M9, M10): Rúna-zár kiváltása a teszt-API-val, majd egy rossz rúnakő.
 *
 * SPEC-VÁLTOZÁS 2026-11-17 (docs/specs/2026-11-16-jatekok-jatekelmeny.md 9.; végrehajtás J3a): a „Rúnabánya” nem blokkol —
 * rossz válaszra nem nyílik magától a magyarázókártya. A rossz válasz kiváltása ezért: rossz rúnakő → a helyes rúnakő
 * zölden látszik (`data-state="correct"`) → „Miért?” → a kártya (`quiz-feedback`). Így az M9, M10 és a K1/K3 mérés
 * ugyanazt a kártyát méri, mint eddig (a mérés nem lazul). A `bc-quiz` most a rúnakövek rétege (a válaszcélok), a
 * `forceState({ phase: "quiz" })` kompatibilis álnév (K.2): rúnaérc a játékos elé és azonnali Rúna-zár.
 */
async function answerWrong(page: Page): Promise<void> {
  await page.waitForFunction(
    () => typeof (window as unknown as GameTestWindow).__websuliGame?.forceState === "function",
    undefined,
    { timeout: 15_000 },
  );
  await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame?.forceState({ phase: "quiz" }));
  const wrong = page.locator('[data-testid="bc-quiz"] [data-correct="false"]').first();
  await expect(wrong).toBeVisible({ timeout: 10_000 });
  // Review #484 B1: a zár 400 ms élesítés után fogad választ.
  await expect(wrong).toHaveAttribute("data-armed", "true", { timeout: 10_000 });
  await wrong.click();
  await expect(page.locator('[data-testid="bc-quiz"] [data-state="correct"]').first()).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("play-why").click();
  await expect(page.getByTestId("quiz-feedback")).toBeVisible({ timeout: 5_000 });
}

/**
 * Review #484 (Vercel): a kérdés-állapot mérése a bank egyik LEGHOSSZABB válaszú tételével (az évfolyam-bank 2850 tételéből
 * programmal kikeresve: a válaszok összhossza itt a legnagyobb, 124 karakter; a leghosszabb egyedi válasz 38). Így az M2
 * (célméret, átfedés) és az M3 a legrosszabb valós feliratokon fut; a levágást a `blockcraft-play.spec.ts` méri.
 */
export const LONGEST_RUNE_QUIZ = {
  prompt: "Mi volt Bohr atommodelljének újdonsága Rutherfordéhoz képest?", // g12-science-014
  options: ["az atomnak pozitív magja van", "elektron csak adott pályán kering", "az atom tömör, oszthatatlan golyó", "az elektronok szétszórva ülnek"],
  correctIndex: 1,
};

/** Kockavadász „Rúnabánya” — S11 / J3a: teljes mobil-mérés (M1–M7, M9–M11), a kérdés-állapot a Rúna-zár. */
export const CASE: GameMobileCase = {
  id: "block-craft-quiz",
  path: "/games/block-craft-quiz",
  status: "full",
  startTestId: "bc-start",
  playReady,
  touchControlsTestId: "bc-touch-controls",
  resultForce: { phase: "levelComplete" },
  resultTestId: "bc-level-complete",
  quizScope: '[data-testid="bc-quiz"]',
  quizForce: { phase: "quiz", quiz: LONGEST_RUNE_QUIZ },
  answerWrong,
};
