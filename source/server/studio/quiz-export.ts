/**
 * LS-5 — a lecke check-blokkjainak exportja a játék-kvíz bankba (master plan §5).
 *
 * A check már kész kvíz-elem (kérdés + opciók + helyes válasz + magyarázat);
 * az export annyit tesz, hogy a játék bankjának sorformájára hozza, és az
 * ELSŐ fedett fogalom-azonosítót ráírja. Fogalom nélküli check KIMARAD:
 * a feedback-loop-ba köthetetlen elem csendben nem kerül be.
 */

import type { InsertGameQuizItem } from "../../shared/schema";
import type { Lesson } from "../../shared/lesson-schema";

export function exportQuizItemsFromChecks(
  lesson: Lesson,
  gameId: string,
  topic?: string,
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
        isActive: true,
      });
    }
  }
  return rows;
}
