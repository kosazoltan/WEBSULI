import assert from "node:assert/strict";
import test from "node:test";

import {
  blockSchema,
  lessonSchema,
  ageBandForClassroom,
  ANIM_KINDS,
  TRY_KINDS,
} from "../shared/lesson-schema";

/**
 * LS-2 — the Lesson contract.
 *
 * A lesson is the thing a child actually reads, so the schema carries the two rules
 * that keep it honest: every claim is bound to a curated concept (D1), and the lesson
 * declares in its own data that it was written from the source only. A model that
 * wants to teach something the textbook does not contain cannot express it here.
 */

const explain = {
  kind: "explain" as const,
  text: "A fotoszintézis során a növény fényből szerves anyagot állít elő.",
  depth: "core" as const,
  readAloud: true,
  coversConceptIds: ["c1"],
};

const lesson = {
  title: "Fotoszintézis",
  subject: "biológia",
  classroom: 7,
  mapId: "km-1",
  sections: [{ heading: "Bevezetés", blocks: [explain] }],
  misconceptions: [{ conceptId: "c1", text: "Nem a gyökér végzi." }],
  sourceOnly: true as const,
};

test("lessonSchema accepts a source-bound lesson", () => {
  const parsed = lessonSchema.parse(lesson);
  assert.equal(parsed.sections.length, 1);
  assert.equal(parsed.sections[0].probaEnabled, true, "sections default to having a Próba");
});

test("lessonSchema REFUSES a lesson that does not declare sourceOnly (D1)", () => {
  const { sourceOnly: _s, ...without } = lesson;
  assert.throws(() => lessonSchema.parse(without));
  assert.throws(() => lessonSchema.parse({ ...lesson, sourceOnly: false }));
});

test("lessonSchema requires at least one section, and sections at least one block", () => {
  assert.throws(() => lessonSchema.parse({ ...lesson, sections: [] }));
  assert.throws(() =>
    lessonSchema.parse({ ...lesson, sections: [{ heading: "Üres", blocks: [] }] }),
  );
});

test("lessonSchema holds classroom in the site-wide 0-12 range", () => {
  assert.equal(lessonSchema.parse({ ...lesson, classroom: 0 }).classroom, 0);
  assert.throws(() => lessonSchema.parse({ ...lesson, classroom: 13 }));
});

test("every non-recap block must bind at least one concept (D1)", () => {
  const kinds: Array<Record<string, unknown>> = [
    { ...explain, coversConceptIds: [] },
    { kind: "example", problem: "2+2?", steps: ["össze"], answer: "4", coversConceptIds: [] },
    { kind: "animate", animKind: "numberLine", params: {}, caption: "x", coversConceptIds: [] },
    {
      kind: "check",
      question: "Hol zajlik?",
      options: ["kloroplasztisz", "mag"],
      correctIndex: 0,
      feedbackPerOption: ["jó", "nem"],
      coversConceptIds: [],
    },
    { kind: "try", tryKind: "dragSort", spec: {}, coversConceptIds: [] },
  ];
  for (const block of kinds) {
    assert.throws(() => blockSchema.parse(block), `${block.kind} must require a concept`);
  }
});

test("recap is the ONE block allowed with no concepts", () => {
  const recap = blockSchema.parse({ kind: "recap", bullets: ["A fotoszintézis fényt használ."] });
  assert.equal(recap.kind, "recap");
  assert.throws(() => blockSchema.parse({ kind: "recap", bullets: [] }));
});

test("check needs 2-5 options and exactly one feedback per option", () => {
  const base = {
    kind: "check" as const,
    question: "Hol zajlik?",
    correctIndex: 0,
    coversConceptIds: ["c1"],
  };
  assert.ok(blockSchema.parse({ ...base, options: ["a", "b"], feedbackPerOption: ["1", "2"] }));
  // one option is not a choice
  assert.throws(() => blockSchema.parse({ ...base, options: ["a"], feedbackPerOption: ["1"] }));
  // six is beyond what a child can weigh at once
  assert.throws(() =>
    blockSchema.parse({
      ...base,
      options: ["a", "b", "c", "d", "e", "f"],
      feedbackPerOption: ["1", "2", "3", "4", "5", "6"],
    }),
  );
  // silent option: no feedback written for it
  assert.throws(() =>
    blockSchema.parse({ ...base, options: ["a", "b", "c"], feedbackPerOption: ["1", "2"] }),
  );
});

test("check rejects a correctIndex that points outside the options", () => {
  const base = {
    kind: "check" as const,
    question: "Hol?",
    options: ["a", "b"],
    feedbackPerOption: ["1", "2"],
    coversConceptIds: ["c1"],
  };
  assert.ok(blockSchema.parse({ ...base, correctIndex: 1 }));
  assert.throws(() => blockSchema.parse({ ...base, correctIndex: 2 }));
  assert.throws(() => blockSchema.parse({ ...base, correctIndex: -1 }));
});

test("animate and try only accept the planned kinds", () => {
  for (const animKind of ANIM_KINDS) {
    assert.ok(
      blockSchema.parse({ kind: "animate", animKind, params: {}, caption: "c", coversConceptIds: ["c1"] }),
    );
  }
  assert.throws(() =>
    blockSchema.parse({ kind: "animate", animKind: "explosion", params: {}, caption: "c", coversConceptIds: ["c1"] }),
  );
  for (const tryKind of TRY_KINDS) {
    assert.ok(blockSchema.parse({ kind: "try", tryKind, spec: {}, coversConceptIds: ["c1"] }));
  }
  assert.throws(() => blockSchema.parse({ kind: "try", tryKind: "essay", spec: {}, coversConceptIds: ["c1"] }));
});

test("ageBandForClassroom derives the band and never needs storing twice", () => {
  assert.equal(ageBandForClassroom(0), "kid", "0 = programozási alapismeretek, kid register");
  assert.equal(ageBandForClassroom(1), "kid");
  assert.equal(ageBandForClassroom(4), "kid");
  assert.equal(ageBandForClassroom(5), "teen");
  assert.equal(ageBandForClassroom(8), "teen");
  assert.equal(ageBandForClassroom(9), "senior");
  assert.equal(ageBandForClassroom(12), "senior");
});
