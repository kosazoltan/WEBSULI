import type { Lesson } from "../../shared/lesson-schema";

/**
 * LS-3a — grading a section Próba on the server.
 *
 * The result buys screen time, which makes the browser an interested party: anything
 * scored in the page can be rewritten by anyone who opens the dev tools. So the request
 * carries only which option the child tapped, and the correct answers are read from the
 * stored lesson JSON here. There is deliberately no `score` field in the input type.
 *
 * Pure by design — no database, no clock, no session — so the rules can be tested
 * directly rather than through a live endpoint.
 */

/** One tapped answer: which block in the section, and which option. */
export type ProbaAnswer = {
  blockIndex: number;
  pickedIndex: number;
};

export type ProbaGrade = {
  /** 0–100. A section without questions scores 0: there is nothing to reward. */
  score: number;
  correctCount: number;
  /** How many questions the section has — not how many were answered. */
  total: number;
  /** Concepts of the questions answered wrongly or skipped; the runtime reopens these. */
  weakConceptIds: string[];
  /** Per-question outcome, for the `concept_results` rows. */
  perConcept: { conceptId: string; correct: boolean }[];
  isLessonFinal: boolean;
};

const EMPTY = (isLessonFinal: boolean): ProbaGrade => ({
  score: 0,
  correctCount: 0,
  total: 0,
  weakConceptIds: [],
  perConcept: [],
  isLessonFinal,
});

/**
 * Score one section of a lesson.
 *
 * A question left unanswered counts as wrong rather than being skipped from the total:
 * the coupon rewards knowing the section, so leaving the hard half blank cannot be a
 * route to a perfect score.
 */
export function gradeProba(
  lesson: Lesson,
  sectionIdx: number,
  answers: ProbaAnswer[],
): ProbaGrade {
  const isLessonFinal = sectionIdx === lesson.sections.length - 1;
  const section = lesson.sections[sectionIdx];
  if (!section) return EMPTY(false);

  const picked = new Map<number, number>();
  for (const answer of answers) {
    if (typeof answer?.blockIndex === "number" && typeof answer?.pickedIndex === "number") {
      picked.set(answer.blockIndex, answer.pickedIndex);
    }
  }

  const perConcept: { conceptId: string; correct: boolean }[] = [];
  const weak = new Set<string>();
  let correctCount = 0;
  let total = 0;

  section.blocks.forEach((block, blockIndex) => {
    if (block.kind !== "check") return;
    total += 1;

    const correct = picked.get(blockIndex) === block.correctIndex;
    if (correct) correctCount += 1;

    for (const conceptId of block.coversConceptIds) {
      perConcept.push({ conceptId, correct });
      if (!correct) weak.add(conceptId);
    }
  });

  if (total === 0) return EMPTY(isLessonFinal);

  return {
    score: Math.round((correctCount / total) * 100),
    correctCount,
    total,
    weakConceptIds: [...weak],
    perConcept,
    isLessonFinal,
  };
}
