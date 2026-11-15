import { waitForPlaying, type GameMobileCase } from "../support/game-mobile-quality";

/** S2 alapállapot; az S10 állítja "full"-ra (pontos playReady, answerWrong). */
export const CASE: GameMobileCase = {
  id: "space-asteroid-quiz",
  path: "/games/space-asteroid-quiz",
  status: "baseline",
  startTestId: "sa-start",
  playReady: waitForPlaying,
  touchControlsTestId: "sa-touch-controls",
  resultForce: { phase: "over", gameWon: true, correctCount: 12 },
  resultTestId: "sa-over",
};
