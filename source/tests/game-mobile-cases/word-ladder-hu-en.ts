import { waitForPlaying, type GameMobileCase } from "../support/game-mobile-quality";

/** S2 alapállapot; az S6 állítja "full"-ra (pontos playReady, answerWrong). */
export const CASE: GameMobileCase = {
  id: "word-ladder-hu-en",
  path: "/games/word-ladder-hu-en",
  status: "baseline",
  startTestId: "wl-start",
  playReady: waitForPlaying,
  resultForce: { phase: "won" },
  resultTestId: "wl-won",
};
