import assert from "node:assert/strict";
import test from "node:test";

import { computeCoverage, checkCoverageGate } from "../server/studio/coverage";
import type { Lesson } from "../shared/lesson-schema";

/**
 * LS-2 — the publishing gate.
 *
 * A lesson may only go live when it actually teaches what the exam will ask: every
 * `core` concept covered, and at least 90% of `supporting`. Just as important, it may
 * not reference a concept id the curated map does not contain — an invented id is how
 * a model would smuggle in a claim that never passed the teacher's review (D1).
 */

const MAP = [
  { localId: "c1", examWeight: "core" as const },
  { localId: "c2", examWeight: "core" as const },
  { localId: "s1", examWeight: "supporting" as const },
  { localId: "s2", examWeight: "supporting" as const },
  { localId: "s3", examWeight: "supporting" as const },
  { localId: "s4", examWeight: "supporting" as const },
  { localId: "s5", examWeight: "supporting" as const },
  { localId: "s6", examWeight: "supporting" as const },
  { localId: "s7", examWeight: "supporting" as const },
  { localId: "s8", examWeight: "supporting" as const },
  { localId: "s9", examWeight: "supporting" as const },
  { localId: "s10", examWeight: "supporting" as const },
  { localId: "x1", examWeight: "extra" as const },
];

/** A lesson whose blocks cover exactly the given concept ids. */
function lessonCovering(ids: string[]): Lesson {
  return {
    title: "Teszt",
    subject: "biológia",
    classroom: 7,
    mapId: "km-1",
    misconceptions: [],
    sourceOnly: true,
    sections: [
      {
        heading: "Szakasz",
        probaEnabled: true,
        blocks: ids.map((id) => ({
          kind: "explain" as const,
          text: `Szöveg ${id}`,
          depth: "core" as const,
          readAloud: true,
          coversConceptIds: [id],
        })),
      },
    ],
  };
}

const ALL_SUPPORTING = MAP.filter((c) => c.examWeight === "supporting").map((c) => c.localId);

test("computeCoverage counts core and supporting separately", () => {
  const cov = computeCoverage(lessonCovering(["c1", "c2", "s1", "s2"]), MAP);
  assert.equal(cov.core.total, 2);
  assert.equal(cov.core.covered, 2);
  assert.equal(cov.supporting.total, 10);
  assert.equal(cov.supporting.covered, 2);
});

test("computeCoverage ignores extra concepts (they never gate publishing)", () => {
  const cov = computeCoverage(lessonCovering(["c1", "c2", "x1"]), MAP);
  assert.equal(cov.core.covered, 2);
  assert.equal(cov.extraCovered, 1);
});

test("gate passes when every core and 90% of supporting is covered", () => {
  const ids = ["c1", "c2", ...ALL_SUPPORTING.slice(0, 9)]; // 9/10 = 90%
  const r = checkCoverageGate(lessonCovering(ids), MAP);
  assert.equal(r.ok, true, r.reasons.join(" | "));
});

test("gate REFUSES when one core concept is missing", () => {
  const r = checkCoverageGate(lessonCovering(["c1", ...ALL_SUPPORTING]), MAP);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => /kulcsfogalm/i.test(x)), r.reasons.join(" | "));
  assert.ok(r.missingCore.includes("c2"));
});

test("gate REFUSES at 80% supporting coverage", () => {
  const ids = ["c1", "c2", ...ALL_SUPPORTING.slice(0, 8)]; // 8/10 = 80%
  const r = checkCoverageGate(lessonCovering(ids), MAP);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => /kiegészítő/i.test(x)), r.reasons.join(" | "));
});

test("gate REFUSES a concept id that is not in the map (invented id)", () => {
  // The model echoing back a plausible-looking id it made up is exactly the failure
  // this catches: the id never passed the teacher's curation.
  const ids = ["c1", "c2", ...ALL_SUPPORTING.slice(0, 9), "kitalalt-fogalom"];
  const r = checkCoverageGate(lessonCovering(ids), MAP);
  assert.equal(r.ok, false);
  assert.ok(r.unknownIds.includes("kitalalt-fogalom"));
  assert.ok(r.reasons.some((x) => /nem szerepel/i.test(x)), r.reasons.join(" | "));
});

test("a recap block does not count as coverage and does not trip the unknown-id check", () => {
  const lesson = lessonCovering(["c1", "c2", ...ALL_SUPPORTING.slice(0, 9)]);
  lesson.sections[0].blocks.push({ kind: "recap", bullets: ["Összefoglalás"] });
  const r = checkCoverageGate(lesson, MAP);
  assert.equal(r.ok, true, r.reasons.join(" | "));
});

test("gate REFUSES an empty map rather than passing vacuously", () => {
  // 0 of 0 core concepts is 100% by arithmetic; publishing that would be nonsense.
  // The lesson below references no unknown id and misses no core concept, so ONLY the
  // dedicated empty-map guard can reject it. Reverse-mutation (2026-09-04, MUT-5)
  // showed the earlier version of this test passed without that guard.
  const recapOnly: Lesson = {
    title: "Üres",
    subject: "biológia",
    classroom: 7,
    mapId: "km-1",
    misconceptions: [],
    sourceOnly: true,
    sections: [
      { heading: "Szakasz", probaEnabled: true, blocks: [{ kind: "recap", bullets: ["Vége"] }] },
    ],
  };
  const r = checkCoverageGate(recapOnly, []);
  assert.equal(r.missingCore.length, 0, "precondition: nothing is missing");
  assert.equal(r.unknownIds.length, 0, "precondition: no invented ids");
  assert.equal(r.ok, false, "an empty map must still block publishing");
  assert.ok(r.reasons.some((x) => /nem tartalmaz fogalmat/i.test(x)), r.reasons.join(" | "));
});

test("coverage is computed per concept, not per block", () => {
  // Three blocks all teaching c1 must not read as three concepts covered.
  const lesson = lessonCovering(["c1", "c1", "c1"]);
  const cov = computeCoverage(lesson, MAP);
  assert.equal(cov.core.covered, 1);
  assert.equal(cov.core.total, 2);
  assert.equal(cov.core.ratio, 0.5, "1 of 2 core concepts, regardless of block count");
});
