/** Négyválaszos játék-kvíz (Szökőár, Szólétra, DB-bank) */
export type FourChoiceQuiz = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  /** T-1: a MIÉRT, amit a játék rossz válasznál megmutat. Régi tételeknél hiányzik. */
  explanation?: string;
};

export type GameQuizBankItemDTO = {
  id: string;
  tier: "easy" | "medium" | "hard";
  topic: string | null;
  prompt: string;
  options: string[];
  correctIndex: number;
  /** T-1: a lecke `check` blokkjának magyarázata, ha az export hozta. */
  explanation?: string | null;
  sourceMaterialId: string | null;
};

export type GameQuizBankResponse = {
  gameId: string;
  items: GameQuizBankItemDTO[];
};
