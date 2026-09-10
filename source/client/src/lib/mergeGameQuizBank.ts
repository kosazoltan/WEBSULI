import { isPlayableQuestion } from "@shared/game-quiz-contract";
import type { FourChoiceQuiz, GameQuizBankItemDTO } from "@/types/gameQuiz";

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
    if (!isPlayableQuestion(it)) continue;
    const q: FourChoiceQuiz = {
      id: `db:${it.id}`,
      prompt: it.prompt,
      options: [...it.options],
      correctIndex: it.correctIndex,
      explanation: it.explanation ?? undefined,
    };
    const t = it.tier.toLowerCase();
    if (t === "easy" || t === "1") easy.push(q);
    else if (t === "medium" || t === "med" || t === "2") medium.push(q);
    else if (t === "hard" || t === "3") hard.push(q);
  }
  return { easy, medium, hard };
}
