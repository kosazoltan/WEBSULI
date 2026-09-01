import assert from "node:assert/strict";
import test from "node:test";

import { chatGptFileAnalysisSchema } from "../server/aiSchemas";
import { CLASSROOM_VALUES, MAX_CLASSROOM, MIN_CLASSROOM } from "../shared/classrooms";

/**
 * server/aiSchemas.ts — the response contract the Enhanced Material Creator holds the AI
 * providers to. Its classroom range must agree with shared/classrooms.ts, otherwise a
 * perfectly good suggestion for a secondary-school grade is rejected as invalid.
 */

const VALID_BASE = {
  extractedText: "Az egyenletek megoldása…",
  suggestedTitle: "Egyenletek",
  suggestedDescription: "Bevezetés az elsőfokú egyenletekbe",
  topics: ["algebra"],
};

test("a well-formed analysis response is accepted", () => {
  const result = chatGptFileAnalysisSchema.safeParse({ ...VALID_BASE, suggestedClassroom: 5 });
  assert.equal(result.success, true, JSON.stringify(result));
});

test("suggestedClassroom is optional", () => {
  assert.equal(chatGptFileAnalysisSchema.safeParse(VALID_BASE).success, true);
});

test("the schema accepts every classroom the application supports", () => {
  for (const classroom of CLASSROOM_VALUES) {
    const result = chatGptFileAnalysisSchema.safeParse({ ...VALID_BASE, suggestedClassroom: classroom });
    assert.equal(
      result.success,
      true,
      `classroom ${classroom} is valid in shared/classrooms.ts but rejected by the AI schema`,
    );
  }
});

test("the schema rejects classrooms outside the supported range", () => {
  for (const classroom of [MIN_CLASSROOM - 1, MAX_CLASSROOM + 1, 99]) {
    assert.equal(
      chatGptFileAnalysisSchema.safeParse({ ...VALID_BASE, suggestedClassroom: classroom }).success,
      false,
      `classroom ${classroom} should be rejected`,
    );
  }
});

test("the schema rejects a fractional classroom", () => {
  assert.equal(
    chatGptFileAnalysisSchema.safeParse({ ...VALID_BASE, suggestedClassroom: 4.5 }).success,
    false,
  );
});

test("required fields are enforced", () => {
  for (const missing of ["extractedText", "suggestedTitle", "suggestedDescription", "topics"] as const) {
    const body: Record<string, unknown> = { ...VALID_BASE };
    delete body[missing];
    assert.equal(
      chatGptFileAnalysisSchema.safeParse(body).success,
      false,
      `${missing} should be required`,
    );
  }
});

test("topics must be a string array", () => {
  assert.equal(chatGptFileAnalysisSchema.safeParse({ ...VALID_BASE, topics: "algebra" }).success, false);
  assert.equal(chatGptFileAnalysisSchema.safeParse({ ...VALID_BASE, topics: [1, 2] }).success, false);
  assert.equal(chatGptFileAnalysisSchema.safeParse({ ...VALID_BASE, topics: [] }).success, true);
});
