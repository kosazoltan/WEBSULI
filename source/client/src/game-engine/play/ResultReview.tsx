import { Check, X } from "lucide-react";

import type { FourChoiceQuiz } from "@/types/gameQuiz";

/**
 * J0c — „Gyakorold még” lista az eredményképernyőn (végrehajtás J0c „Szerződés”; terv 4.1/7, 9., J16).
 *
 * A `ResultScreen` `extra` slotjába kerül: `extra={<ResultReview items={q.director.wrongList()} />}`. Tételenként a
 * kérdés, a választott válasz (áthúzva — időtúllépésnél „nem jelöltél”) és a helyes válasz, a magyarázat legfeljebb
 * 160 karakterrel. Üres listánál nem rajzol semmit. Bátorító hangnem (terv 4.2): nincs „hibás”, „rossz” felirat.
 */
export type ResultReviewProps = { items: readonly { quiz: FourChoiceQuiz; pickedOriginalIndex: number | null }[]; max?: number /* alap 5 */ };

export const RESULT_REVIEW_EXPLANATION_MAX = 160;

export function clipExplanation(text: string | undefined, max = RESULT_REVIEW_EXPLANATION_MAX): string {
  const t = (text ?? "").trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:–-]+$/, "")}…`;
}

export default function ResultReview({ items, max = 5 }: ResultReviewProps) {
  // A legutóbbi hibák a lista elején (a `wrongList` a hiba sorrendjében adja).
  const list = items.slice(-Math.max(0, max)).reverse();
  if (list.length === 0) return null;
  return (
    <section className="play-review" data-testid="result-review" aria-labelledby="play-review-title">
      <h3 id="play-review-title" className="play-review-title">Gyakorold még</h3>
      <ol className="play-review-list">
        {list.map(({ quiz, pickedOriginalIndex }, k) => {
          const correct = quiz.options[quiz.correctIndex] ?? "";
          const picked = pickedOriginalIndex === null ? null : quiz.options[pickedOriginalIndex] ?? null;
          const why = clipExplanation(quiz.explanation);
          return (
            <li key={`${quiz.id ?? quiz.prompt}-${k}`} className="play-review-item" data-testid="result-review-item">
              <p className="play-review-prompt">{quiz.prompt}</p>
              <p className="play-review-answers">
                {picked !== null && picked !== correct ? (
                  <span className="play-review-picked">
                    <X aria-hidden="true" />
                    <s>{picked}</s>
                    <span className="sr-only"> (ezt választottad)</span>
                  </span>
                ) : picked === null ? (
                  <span className="play-review-picked play-review-timeout">nem jelöltél</span>
                ) : null}
                <span className="play-review-correct">
                  <Check aria-hidden="true" />
                  <strong>{correct}</strong>
                  <span className="sr-only"> (a jó válasz)</span>
                </span>
              </p>
              {why && <p className="play-review-why">{why}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
