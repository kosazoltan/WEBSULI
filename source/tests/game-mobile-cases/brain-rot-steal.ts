import { waitForPlaying, type GameMobileCase } from "../support/game-mobile-quality";

/** S2 alapállapot; az S8 állítja "full"-ra (pontos playReady, answerWrong). */
export const CASE: GameMobileCase = {
  id: "brain-rot-steal",
  path: "/games/brain-rot-steal",
  status: "baseline",
  startName: /indít|indul|start|vadász|rajta/i,
  playReady: waitForPlaying,
  resultForce: { phase: "over", correctCount: 7 },
  resultTestId: "br-over",
};
