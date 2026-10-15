import assert from "node:assert/strict";
import test from "node:test";

import { bankItemPath, bankItemRef, checkBlockPath, checkBlockRef } from "../shared/bank-item-ref";
import { bankUnitQuota } from "../shared/lesson-bank-plan";
import { LESSON_BANK_RESERVE, LESSON_BANK_SIZES } from "../shared/lesson-experience";

// Spec 2026-09-29-limit-banktetel-kivetel.

test("E1 bankItemRef: zárójeles, pontozott és al-útvonalas alak ugyanarra a tételre", () => {
  for (const path of ["experience.quiz[65]", "experience.quiz.65", "experience.quiz[65].options[2]", "experience.quiz.65.correctIndex"]) {
    assert.deepEqual(bankItemRef(path), { bank: "quiz", index: 65 }, path);
  }
  assert.deepEqual(bankItemRef("experience.tasks.13"), { bank: "tasks", index: 13 });
  assert.deepEqual(bankItemRef("experience.tasks[13].required"), { bank: "tasks", index: 13 });
  assert.deepEqual(bankItemRef("experience.methods[8]"), { bank: "methods", index: 8 });
});

test("E1 bankItemRef: nem banktétel → null", () => {
  for (const path of ["sections.0.blocks.0", "sections[1].blocks[2]", "experience", "experience.glossary[0]", "experience.quiz", "experience.quiz.x", "", undefined, null]) {
    assert.equal(bankItemRef(path as string), null, String(path));
  }
});

test("E1 bankItemPath: a normalizált (zárójeles) alak", () => {
  assert.equal(bankItemPath({ bank: "quiz", index: 65 }), "experience.quiz[65]");
  assert.equal(bankItemPath(bankItemRef("experience.tasks.13")!), "experience.tasks[13]");
});

test("E6 célkvóta: a tartalékkal együtt ≥ 45 + tartalék feladat és ≥ 75 + tartalék kvíz, a minimum változatlanul ≥ 45 / 75", () => {
  for (const size of [1, 2, 3, 6, 11, 40]) {
    const plan = { units: Array.from({ length: size }, (_, sectionIndex) => ({ sectionIndex, conceptIds: ["one", "two"] })), taskRound: 15, quizRound: 25 };
    const quotas = plan.units.map((_, i) => bankUnitQuota(plan, i));
    const sum = (k: "taskCount" | "quizCount" | "taskTarget" | "quizTarget") => quotas.reduce((n, q) => n + q[k], 0);
    // Tételgyár T1 (D1, dokumentált szerződésváltozás): a tartalék értéke a konstansból.
    assert.ok(sum("taskTarget") >= LESSON_BANK_SIZES.tasks + LESSON_BANK_RESERVE.tasks, `${size} egység: feladatcél ${sum("taskTarget")}`);
    assert.ok(sum("quizTarget") >= LESSON_BANK_SIZES.quiz + LESSON_BANK_RESERVE.quiz, `${size} egység: kvízcél ${sum("quizTarget")}`);
    assert.ok(sum("taskCount") >= 45 && sum("quizCount") >= 75);
    assert.ok(quotas.every((q) => q.taskTarget >= q.taskCount && q.quizTarget >= q.quizCount));
  }
});

test("spec limit-check (E1): checkBlockRef — zárójeles, pontozott, al-útvonalas alak ugyanarra a blokkra", () => {
  for (const path of ["sections[10].blocks[3]", "sections.10.blocks.3", "sections[10].blocks[3].options[1]", "sections.10.blocks.3.correctIndex"]) {
    assert.deepEqual(checkBlockRef(path), { section: 10, block: 3 }, path);
  }
  for (const path of ["experience.quiz[1]", "sections[1]", "sections.1.heading", "", null, undefined]) {
    assert.equal(checkBlockRef(path as string), null, String(path));
  }
  assert.equal(checkBlockPath({ section: 10, block: 3 }), "sections[10].blocks[3]");
});

test("spec limit-check (review): a lektor-jelentés a 32 karakternél hosszabb al-útvonalat a tétel szintjére normalizálja", async () => {
  const { lektorReportSchema } = await import("../server/studio/step-io");
  const parsed = lektorReportSchema.parse({ notes: [
    { kind: "source_conflict", message: "két helyes opció", blockPath: "sections[10].blocks[3].options[1]" },
    { kind: "source_conflict", message: "hibás kulcs", blockPath: "experience.quiz[65].correctIndex" },
    { kind: "source_conflict", message: "rövid", blockPath: "sections.2.blocks.1" },
  ] });
  assert.deepEqual(parsed.notes.map((n) => n.blockPath), ["sections[10].blocks[3]", "experience.quiz[65]", "sections[2].blocks[1]"]);
});

// Tételgyár T1 (tulajdonosi döntés D1, 130%; mért: job e2facc3f — 0 tartalékú fejezet csomagja egyetlen hibás tételen bukott,
// job 416ad01d — 48 − 4 = 44 < 45): a tartalék a TÉNYLEGES minimum fölé kerül, minden fejezetbe jut belőle.
test("T1: a tartalék a tényleges minimum ≥ 30%-a, és minden fejezet kap tartalékot (nagy alapkvótánál is)", () => {
  for (const size of [1, 2, 3, 5, 8, 12]) {
    for (const width of [2, 4, 6]) {
      const plan = { units: Array.from({ length: size }, (_, sectionIndex) => ({ sectionIndex, conceptIds: Array.from({ length: width }, (_, k) => `c${k}`) })), taskRound: 15, quizRound: 25 };
      const quotas = plan.units.map((_, i) => bankUnitQuota(plan, i));
      const sum = (k: "taskCount" | "quizCount" | "taskTarget" | "quizTarget") => quotas.reduce((n, q) => n + q[k], 0);
      const label = `${size} egység × ${width} fogalom`;
      assert.ok(sum("taskTarget") - sum("taskCount") >= Math.max(LESSON_BANK_RESERVE.tasks, Math.ceil(0.3 * sum("taskCount"))), `${label}: feladat-tartalék`);
      assert.ok(sum("quizTarget") - sum("quizCount") >= Math.max(LESSON_BANK_RESERVE.quiz, Math.ceil(0.3 * sum("quizCount"))), `${label}: kvíz-tartalék`);
      assert.ok(quotas.every((q) => q.taskTarget - q.taskCount >= 1 && q.quizTarget - q.quizCount >= 1), `${label}: minden fejezetben van tartalék`);
    }
  }
});
