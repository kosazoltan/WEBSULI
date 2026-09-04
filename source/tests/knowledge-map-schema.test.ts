import assert from "node:assert/strict";
import test from "node:test";

import {
  conceptSchema,
  knowledgeMapSchema,
  CONCEPT_TYPES,
  EXAM_WEIGHTS,
} from "../shared/knowledge-map-schema";

/**
 * LS-1 — the KnowledgeMap contract.
 *
 * This schema is the boundary the LS-2 author will be held to, so the rules that
 * matter are the ones that keep a concept traceable to the source (D1): a concept
 * without a verbatim quote and a source reference is not a concept, it is an opinion.
 */

const validConcept = {
  id: "c1",
  term: "fotoszintézis",
  definition: "A növények fényenergiából szerves anyagot állítanak elő.",
  quote: "A fotoszintézis során a növény a fény energiáját használja fel.",
  sourceRef: { file: "bio7.pdf", page: 42 },
  type: "definition" as const,
  examWeight: "core" as const,
  relatedIds: [],
};

test("conceptSchema accepts a fully sourced concept", () => {
  const parsed = conceptSchema.parse(validConcept);
  assert.equal(parsed.term, "fotoszintézis");
  assert.equal(parsed.sourceRef.page, 42);
});

test("conceptSchema rejects a concept with no verbatim quote (D1)", () => {
  // The whole point of the map: an unquotable claim cannot enter the lesson.
  const { quote: _quote, ...noQuote } = validConcept;
  assert.throws(() => conceptSchema.parse(noQuote));
  assert.throws(() => conceptSchema.parse({ ...validConcept, quote: "" }));
  assert.throws(() => conceptSchema.parse({ ...validConcept, quote: "   " }));
});

test("conceptSchema rejects a concept with no source file", () => {
  assert.throws(() => conceptSchema.parse({ ...validConcept, sourceRef: {} }));
  assert.throws(() =>
    conceptSchema.parse({ ...validConcept, sourceRef: { file: "" } }),
  );
});

test("conceptSchema constrains type and examWeight to the known vocabulary", () => {
  for (const type of CONCEPT_TYPES) {
    assert.equal(conceptSchema.parse({ ...validConcept, type }).type, type);
  }
  for (const examWeight of EXAM_WEIGHTS) {
    assert.equal(
      conceptSchema.parse({ ...validConcept, examWeight }).examWeight,
      examWeight,
    );
  }
  assert.throws(() => conceptSchema.parse({ ...validConcept, type: "vibe" }));
  assert.throws(() =>
    conceptSchema.parse({ ...validConcept, examWeight: "important" }),
  );
});

test("conceptSchema trims whitespace so ' term ' and 'term' are one concept", () => {
  const parsed = conceptSchema.parse({ ...validConcept, term: "  fotoszintézis  " });
  assert.equal(parsed.term, "fotoszintézis");
});

test("conceptSchema defaults relatedIds to an empty list", () => {
  const { relatedIds: _r, ...withoutRelated } = validConcept;
  assert.deepEqual(conceptSchema.parse(withoutRelated).relatedIds, []);
});

const validMap = {
  title: "Fotoszintézis",
  subject: "biológia",
  classroom: 7,
  unit: "Növényi anyagcsere",
  sourceFiles: [{ name: "bio7.pdf", kind: "pdf" as const, pages: 3 }],
  concepts: [validConcept],
};

test("knowledgeMapSchema accepts a map and keeps its scope", () => {
  const parsed = knowledgeMapSchema.parse(validMap);
  assert.equal(parsed.classroom, 7);
  assert.equal(parsed.concepts.length, 1);
  assert.equal(parsed.status, "draft", "a fresh map starts as draft");
});

test("knowledgeMapSchema holds classroom inside the 0-12 range used site-wide", () => {
  // 0 = programozási alapismeretek, per shared/classrooms.ts
  assert.equal(knowledgeMapSchema.parse({ ...validMap, classroom: 0 }).classroom, 0);
  assert.equal(knowledgeMapSchema.parse({ ...validMap, classroom: 12 }).classroom, 12);
  assert.throws(() => knowledgeMapSchema.parse({ ...validMap, classroom: 13 }));
  assert.throws(() => knowledgeMapSchema.parse({ ...validMap, classroom: -1 }));
  assert.throws(() => knowledgeMapSchema.parse({ ...validMap, classroom: 4.5 }));
});

test("knowledgeMapSchema requires at least one source file (a map is source-bound)", () => {
  assert.throws(() => knowledgeMapSchema.parse({ ...validMap, sourceFiles: [] }));
});

test("knowledgeMapSchema rejects duplicate concept ids", () => {
  assert.throws(() =>
    knowledgeMapSchema.parse({
      ...validMap,
      concepts: [validConcept, { ...validConcept, term: "másik" }],
    }),
  );
});
