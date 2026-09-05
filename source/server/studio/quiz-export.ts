/**
 * LS-5 — a lecke check-blokkjainak exportja a játék-kvíz bankba (master plan §5).
 *
 * A check már kész kvíz-elem (kérdés + opciók + helyes válasz + magyarázat);
 * az export annyit tesz, hogy a játék bankjának sorformájára hozza, és az
 * ELSŐ fedett fogalom-azonosítót ráírja. Fogalom nélküli check KIMARAD:
 * a feedback-loop-ba köthetetlen elem csendben nem kerül be.
 *
 * Audit 2026-09-05 (szelet A): a publikálási kapu a 4 kupon-motoros játékra
 * exportál, leckéhez kötve (`lessonId`), hogy az újra-publikálás idempotens legyen.
 */

import type { InsertGameQuizItem } from "../../shared/schema";
import type { Lesson } from "../../shared/lesson-schema";

/** A játékok, amelyek a kupon-motoron futnak (useCouponSession) — a lecke kvízei ide mennek publikáláskor. */
export const COUPON_GAME_IDS = [
  "tsunami-english",
  "block-craft-quiz",
  "space-asteroid-quiz",
  "brain-rot-steal",
] as const;

export function exportQuizItemsFromChecks(
  lesson: Lesson,
  gameId: string,
  topic?: string,
  lessonId?: string,
): InsertGameQuizItem[] {
  const rows: InsertGameQuizItem[] = [];
  for (const section of lesson.sections) {
    for (const block of section.blocks) {
      if (block.kind !== "check") continue;
      const primaryConceptId = block.coversConceptIds[0];
      if (!primaryConceptId) continue;
      rows.push({
        gameId,
        tier: "1",
        topic: topic ?? null,
        prompt: block.question,
        options: block.options,
        correctIndex: block.correctIndex,
        conceptId: primaryConceptId,
        lessonId: lessonId ?? null,
        isActive: true,
      });
    }
  }
  return rows;
}

/** Publikáláskori export: minden kupon-motoros játékra, a lecke címével topic-ként. */
export function exportQuizItemsForPublish(lesson: Lesson, lessonId: string): InsertGameQuizItem[] {
  return COUPON_GAME_IDS.flatMap((gameId) =>
    exportQuizItemsFromChecks(lesson, gameId, lesson.title.slice(0, 128), lessonId),
  );
}
