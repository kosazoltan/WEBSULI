import type { FourChoiceQuiz, GameQuizBankItemDTO } from "@/types/gameQuiz";

function isValidItem(it: GameQuizBankItemDTO): boolean {
  return (
    Array.isArray(it.options) &&
    it.options.length === 4 &&
    typeof it.correctIndex === "number" &&
    it.correctIndex >= 0 &&
    it.correctIndex <= 3 &&
    typeof it.prompt === "string" &&
    it.prompt.length > 0
  );
}

/** API-ból érkező sorok → tier szerinti poolok (medium = közép). */
export function splitBankItemsByTier(items: GameQuizBankItemDTO[] | undefined): {
  easy: FourChoiceQuiz[];
  medium: FourChoiceQuiz[];
  hard: FourChoiceQuiz[];
} {
  const easy: FourChoiceQuiz[] = [];
  const medium: FourChoiceQuiz[] = [];
  const hard: FourChoiceQuiz[] = [];
  if (!items?.length) return { easy, medium, hard };

  for (const it of items) {
    if (!isValidItem(it)) continue;
    const q: FourChoiceQuiz = {
      id: `db:${it.id}`,
      prompt: it.prompt,
      options: [...it.options],
      correctIndex: it.correctIndex,
    };
    const t = it.tier.toLowerCase();
    if (t === "easy") easy.push(q);
    else if (t === "medium" || t === "med") medium.push(q);
    else if (t === "hard") hard.push(q);
  }
  return { easy, medium, hard };
}
