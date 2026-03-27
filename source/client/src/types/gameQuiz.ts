/** Négyválaszos játék-kvíz (Szökőár, Szólétra, DB-bank) */
export type FourChoiceQuiz = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
};

export type GameQuizBankItemDTO = {
  id: string;
  tier: "easy" | "medium" | "hard";
  topic: string | null;
  prompt: string;
  options: string[];
  correctIndex: number;
  sourceMaterialId: string | null;
};

export type GameQuizBankResponse = {
  gameId: string;
  items: GameQuizBankItemDTO[];
};
