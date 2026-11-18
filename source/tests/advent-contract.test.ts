import assert from "node:assert/strict";
import test from "node:test";

import { adventAnswerBody, adventDayParam, adventDeviceId, adventGradeBody, adventIdentityBody, adventQuestionSchema } from "../shared/advent/contract";

/** Adventi naptár — adatszerződés (docs/specs/2026-11-18-adventi-naptar.md R8; A21). */

const DEVICE = "3f2b8c1e-9d4a-4f6b-8a2e-5c7d9e1f0a3b";

test("eszközazonosító: csak UUID-alak", () => {
  assert.equal(adventDeviceId.safeParse(DEVICE).success, true);
  for (const bad of ["", "abc", `${DEVICE}x`, "3f2b8c1e9d4a4f6b8a2e5c7d9e1f0a3b", "../../etc/passwd"]) {
    assert.equal(adventDeviceId.safeParse(bad).success, false, bad);
  }
});

test("azonosító-törzs: mindkét mező elhagyható, a hosszú token elutasítva", () => {
  assert.equal(adventIdentityBody.safeParse({}).success, true);
  assert.equal(adventIdentityBody.safeParse({ device: DEVICE }).success, true);
  assert.equal(adventIdentityBody.safeParse({ learner: "x".repeat(121) }).success, false);
  assert.equal(adventIdentityBody.safeParse({ device: "nem-uuid" }).success, false);
});

test("évfolyam: 1–12 egész", () => {
  for (const grade of [1, 2, 3, 12]) assert.equal(adventGradeBody.safeParse({ device: DEVICE, grade }).success, true, String(grade));
  for (const grade of [0, 13, 2.5, "7", null]) assert.equal(adventGradeBody.safeParse({ device: DEVICE, grade }).success, false, String(grade));
});

test("válasz: kérdésazonosító 1–32 karakter, a választás 0–3 egész", () => {
  assert.equal(adventAnswerBody.safeParse({ device: DEVICE, questionId: "g07-math-012", pick: 3 }).success, true);
  for (const pick of [-1, 4, 1.5, "1"]) assert.equal(adventAnswerBody.safeParse({ questionId: "q", pick }).success, false, String(pick));
  assert.equal(adventAnswerBody.safeParse({ questionId: "", pick: 0 }).success, false);
  assert.equal(adventAnswerBody.safeParse({ questionId: "x".repeat(33), pick: 0 }).success, false);
});

test("nap-paraméter: 1–24, vezető nulla és szemét nélkül", () => {
  for (const [raw, day] of [["1", 1], ["9", 9], ["10", 10], ["24", 24]] as const) {
    const parsed = adventDayParam.safeParse(raw);
    assert.equal(parsed.success && parsed.data, day);
  }
  for (const bad of ["0", "25", "01", "1.5", "-1", "abc", "", "99", "1e1"]) assert.equal(adventDayParam.safeParse(bad).success, false, bad);
});

test("a kliensnek adott kérdés alakja szigorú: helyes válasz vagy magyarázat nem fér bele (A21)", () => {
  const question = { id: "g07-math-012", subject: "math", prompt: "Mennyi 2 + 2?", options: ["3", "4", "5", "6"] };
  assert.equal(adventQuestionSchema.safeParse(question).success, true);
  assert.equal(adventQuestionSchema.safeParse({ ...question, correctIndex: 1 }).success, false);
  assert.equal(adventQuestionSchema.safeParse({ ...question, explanation: "mert" }).success, false);
  assert.equal(adventQuestionSchema.safeParse({ ...question, options: ["3", "4", "5"] }).success, false);
});
