import { waitForPlaying, type GameMobileCase } from "../support/game-mobile-quality";

/** S2 alapállapot; az S7 állítja "full"-ra (pontos playReady, answerWrong). */
export const CASE: GameMobileCase = {
  id: "speed-quiz-math",
  path: "/games/speed-quiz-math",
  status: "baseline",
  startTestId: "sq-start",
  playReady: waitForPlaying,
  resultForce: { phase: "won", correctCount: 18 },
  resultTestId: "sq-won",
};
