/**
 * LS-5 — a lecke check-blokkjainak exportja a játék-kvíz bankba (master plan §5).
 *
 * A check már kész kvíz-elem (kérdés + opciók + helyes válasz + magyarázat);
 * az export annyit tesz, hogy a játék bankjának sorformájára hozza, és az
 * ELSŐ fedett fogalom DB-azonosítóját ráírja. Fogalom nélküli check KIMARAD:
 * a feedback-loop-ba köthetetlen elem csendben nem kerül be.
 *
 * Audit 2026-09-05 (szelet A): a publikálási kapu a 4 kupon-motoros játékra
 * exportál, leckéhez kötve (`lessonId`), hogy az újra-publikálás idempotens legyen.
 *
 * #178 (measured live, run 0c2d09ad): the lesson's `coversConceptIds` are the map's
 * LOCAL slugs (km_concepts.local_id), while `game_quiz_items.concept_id` is an FK to
 * km_concepts.id (UUID). The slug must be resolved through the map; an unresolved slug
 * yields `conceptId: null` (the FK is ON DELETE SET NULL, so null is the legal "unbound"
 * state) — the quiz row itself is kept, the child still gets the question.
 */

import type { InsertGameQuizItem } from "../../shared/schema";
import type { Lesson } from "../../shared/lesson-schema";
import type { MapConcept } from "./coverage";

/** A játékok, amelyek a kupon-motoron futnak (useCouponSession) — a lecke kvízei ide mennek publikáláskor. */
export const COUPON_GAME_IDS = [
  "tsunami-english",
  "block-craft-quiz",
  "space-asteroid-quiz",
  "brain-rot-steal",
] as const;

/** localId (lesson slug) → km_concepts.id (UUID), or null when the map has no such concept. */
export type ConceptIdResolver = (localId: string) => string | null;

export function conceptIdResolver(concepts: readonly Pick<MapConcept, "id" | "localId">[]): ConceptIdResolver {
  const byLocal = new Map<string, string>();
  for (const c of concepts) if (c.id) byLocal.set(c.localId, c.id);
  return (localId) => byLocal.get(localId) ?? null;
}

export function exportQuizItemsFromChecks(
  lesson: Lesson,
  gameId: string,
  topic?: string,
  lessonId?: string,
  resolveConceptId?: ConceptIdResolver,
): InsertGameQuizItem[] {
  const rows: InsertGameQuizItem[] = [];
  for (const section of lesson.sections) {
    for (const block of section.blocks) {
      if (block.kind !== "check") continue;
      const primaryLocalId = block.coversConceptIds[0];
      if (!primaryLocalId) continue;
      rows.push({
        gameId,
        tier: "1",
        topic: topic ?? null,
        prompt: block.question,
        options: block.options,
        correctIndex: block.correctIndex,
        // Never the raw slug: it is not a km_concepts.id and the FK insert would fail.
        conceptId: resolveConceptId ? resolveConceptId(primaryLocalId) : null,
        lessonId: lessonId ?? null,
        isActive: true,
      });
    }
  }
  return rows;
}

/** Publikáláskori export: minden kupon-motoros játékra, a lecke címével topic-ként. */
export function exportQuizItemsForPublish(
  lesson: Lesson,
  lessonId: string,
  resolveConceptId: ConceptIdResolver,
): InsertGameQuizItem[] {
  return COUPON_GAME_IDS.flatMap((gameId) =>
    exportQuizItemsFromChecks(lesson, gameId, lesson.title.slice(0, 128), lessonId, resolveConceptId),
  );
}
