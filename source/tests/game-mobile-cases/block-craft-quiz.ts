import { waitForPlaying, type GameMobileCase } from "../support/game-mobile-quality";

/** S2 alapállapot; az S11 állítja "full"-ra (pontos playReady, answerWrong). */
export const CASE: GameMobileCase = {
  id: "block-craft-quiz",
  path: "/games/block-craft-quiz",
  status: "baseline",
  startTestId: "bc-start",
  playReady: waitForPlaying,
  touchControlsTestId: "bc-touch-controls",
  resultForce: { phase: "levelComplete" },
  resultTestId: "bc-level-complete",
};
