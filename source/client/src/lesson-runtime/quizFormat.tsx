/** V4: a kvíztípus címkéje és a kiegészítés hiánya — a helyi és a mentett (bejelentkezett) kvíz közös megjelenítése. */
export const QUIZ_FORMAT_LABEL: Record<string, string> = { fillGap: "Egészítsd ki!", oddOneOut: "Kakukktojás: melyik nem illik a sorba?", number: "Számolós kérdés" };

export function GapQuestion({ text, fill }: { text: string; fill?: string }) {
  const [before, after = ""] = text.split(/_{3,}/);
  return <>{before}<span data-testid="quiz-gap" className="fusion-gap" style={{ borderBottom: "2px solid currentColor", padding: "0 .25em", fontWeight: 700 }}>{fill ?? "___"}</span>{after}</>;
}

/** A mentett kör kérdésének típusa a lecke azonos kérdéséből (questionId + azonos szöveg) — eltérő szövegnél (frissült lecke) nincs típus. */
export type QuizFormatLookup = Record<string, { format: string; question: string }>;
export const savedQuestionFormat = (lookup: QuizFormatLookup | undefined, questionId: string, prompt: string): string =>
  lookup?.[questionId]?.question === prompt ? lookup[questionId]!.format : "choice";
