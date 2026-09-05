import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateConceptResults,
  weakConceptIds,
  type ConceptAggregate,
} from "../server/rewards/aggregate";

/**
 * LS-5 — concept_results aggregation (master plan §5).
 *
 * The feedback loop runs on per-concept outcomes collected during Próbas. The
 * aggregation is pure so the parent digest and the "fix this concept" trigger
 * share one audited computation.
 */

test("aggregateConceptResults: fogalmanként total/correct/rate", () => {
  const rows = [
    { conceptId: "c1", correct: true },
    { conceptId: "c1", correct: true },
    { conceptId: "c1", correct: false },
    { conceptId: "c2", correct: false },
  ];
  const out = aggregateConceptResults(rows);
  assert.deepEqual(out, [
    { conceptId: "c1", total: 3, correct: 2, rate: 2 / 3 },
    { conceptId: "c2", total: 1, correct: 0, rate: 0 },
  ]);
});

test("aggregateConceptResults: üres bemenet üres kimenet", () => {
  assert.deepEqual(aggregateConceptResults([]), []);
});

test("aggregateConceptResults: stabil sorrend a fogalom-azonosító szerint", () => {
  const out = aggregateConceptResults([
    { conceptId: "b", correct: true },
    { conceptId: "a", correct: true },
  ]);
  assert.deepEqual(out.map((c) => c.conceptId), ["a", "b"]);
});

test("weakConceptIds: a küszöb alatti rate-ű fogalmak megnevezve", () => {
  const agg: ConceptAggregate[] = [
    { conceptId: "c1", total: 10, correct: 9, rate: 0.9 },
    { conceptId: "c2", total: 10, correct: 5, rate: 0.5 },
    { conceptId: "c3", total: 1, correct: 1, rate: 1 },
  ];
  assert.deepEqual(weakConceptIds(agg, 0.7), ["c2"]);
});

test("weakConceptIds: kevés mérés nem kiabál (min-total)", () => {
  const agg: ConceptAggregate[] = [
    { conceptId: "c1", total: 1, correct: 0, rate: 0 },
    { conceptId: "c2", total: 8, correct: 4, rate: 0.5 },
  ];
  // A c1-nek egyetlen mérése van: a zajból nem csinálunk riasztást.
  assert.deepEqual(weakConceptIds(agg, 0.7, { minTotal: 5 }), ["c2"]);
});
