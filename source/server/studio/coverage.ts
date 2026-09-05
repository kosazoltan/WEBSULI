import { conceptIdsOf, type Lesson } from "../../shared/lesson-schema";
import type { ExamWeight } from "../../shared/knowledge-map-schema";

/**
 * The publishing gate: does this lesson actually teach what the exam will ask?
 *
 * Coverage is deliberately measured against the *curated* map, not against whatever the
 * author model believed it was covering. Two distinct failures are caught here:
 *
 *  - a `core` concept nobody wrote a block for — the child would be asked something the
 *    lesson never taught;
 *  - a concept id that does not exist in the map at all — the model invented a binding,
 *    which is how an unreviewed claim would slip past D1 while looking well-formed.
 *
 * Pure functions with no IO, so the rule can be tested exactly and cheaply.
 */

/** Minimum share of `supporting` concepts a publishable lesson must cover. */
export const SUPPORTING_THRESHOLD = 0.9;

/** `id` = km_concepts.id (UUID) when loaded from the DB; prompt/coverage fixtures may omit it (#178). */
export type MapConcept = { id?: string; localId: string; examWeight: ExamWeight };

export type CoverageCount = { total: number; covered: number; ratio: number };

export type Coverage = {
  core: CoverageCount;
  supporting: CoverageCount;
  extraCovered: number;
  /** Ids the lesson references that the map does not contain. */
  unknownIds: string[];
};

function count(ids: Set<string>, concepts: MapConcept[], weight: ExamWeight): CoverageCount {
  const of = concepts.filter((c) => c.examWeight === weight);
  const covered = of.filter((c) => ids.has(c.localId)).length;
  return {
    total: of.length,
    covered,
    ratio: of.length === 0 ? 1 : covered / of.length,
  };
}

export function computeCoverage(lesson: Lesson, concepts: MapConcept[]): Coverage {
  const taught = new Set(conceptIdsOf(lesson));
  const known = new Set(concepts.map((c) => c.localId));

  return {
    core: count(taught, concepts, "core"),
    supporting: count(taught, concepts, "supporting"),
    extraCovered: concepts.filter((c) => c.examWeight === "extra" && taught.has(c.localId)).length,
    unknownIds: [...taught].filter((id) => !known.has(id)),
  };
}

export type CoverageGateResult = {
  ok: boolean;
  coverage: Coverage;
  missingCore: string[];
  unknownIds: string[];
  reasons: string[];
};

export function checkCoverageGate(
  lesson: Lesson,
  concepts: MapConcept[],
): CoverageGateResult {
  const coverage = computeCoverage(lesson, concepts);
  const taught = new Set(conceptIdsOf(lesson));
  const reasons: string[] = [];

  // An empty map would make every ratio 1/1 by arithmetic. Publishing against nothing
  // is not a pass, it is a missing prerequisite.
  if (concepts.length === 0) {
    reasons.push("A térkép nem tartalmaz fogalmat, így a lecke nem hagyható jóvá.");
  }

  const missingCore = concepts
    .filter((c) => c.examWeight === "core" && !taught.has(c.localId))
    .map((c) => c.localId);

  if (missingCore.length > 0) {
    reasons.push(
      `${missingCore.length} kulcsfogalmat egyetlen blokk sem tanít: ${missingCore.join(", ")}.`,
    );
  }

  if (coverage.supporting.ratio < SUPPORTING_THRESHOLD) {
    reasons.push(
      `A kiegészítő fogalmak fedettsége ${Math.round(coverage.supporting.ratio * 100)}%, ` +
        `a minimum ${Math.round(SUPPORTING_THRESHOLD * 100)}%.`,
    );
  }

  if (coverage.unknownIds.length > 0) {
    reasons.push(
      `A lecke olyan fogalomra hivatkozik, ami nem szerepel a térképen: ` +
        `${coverage.unknownIds.join(", ")}.`,
    );
  }

  return {
    ok: reasons.length === 0,
    coverage,
    missingCore,
    unknownIds: coverage.unknownIds,
    reasons,
  };
}
