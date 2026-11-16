import type { GameWinCase } from "./types";

/** A `game-win-paths.spec.ts` esete (J0c: játékonkénti esetfájl — K.1/7: ezt a fájlt csak a játék saját szelete módosítja). */
const winCase: GameWinCase = { path: "/games/space-asteroid-quiz", force: { phase: "over", gameWon: true, correctCount: 12 }, resultTestId: "sa-over" };

export default winCase;
