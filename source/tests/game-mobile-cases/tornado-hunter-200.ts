import { waitForPlaying, type GameMobileCase } from "../support/game-mobile-quality";

/** S2 alapállapot; az S12 állítja "full"-ra (pontos playReady, answerWrong, fekvő tájolás). */
export const CASE: GameMobileCase = {
  id: "tornado-hunter-200",
  path: "/games/tornado-hunter-200",
  status: "baseline",
  startName: /vadászat|indítás|indul|start|rajta/i,
  playReady: waitForPlaying,
  touchControlsTestId: "tornado-touch-controls",
  resultForce: { screen: "play", phase: "result_win" },
  resultTestId: "th-result",
};
