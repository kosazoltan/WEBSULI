import { waitForPlaying, type GameMobileCase } from "../support/game-mobile-quality";

/** S2 alapállapot; az S9 állítja "full"-ra (pontos playReady, érintővezérlő, answerWrong). */
export const CASE: GameMobileCase = {
  id: "tsunami-english",
  path: "/games/tsunami-english",
  status: "baseline",
  startName: /indít|indul|start|menekül|rajta/i,
  playReady: waitForPlaying,
  resultForce: { phase: "won", correctCount: 8 },
  resultTestId: "ts-won",
};
