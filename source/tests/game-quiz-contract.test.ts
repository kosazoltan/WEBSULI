import assert from "node:assert/strict";
import test from "node:test";
import { isPlayableQuestion, uniqueQuizContent } from "../shared/game-quiz-contract";
import { splitBankItemsByTier } from "../client/src/lib/mergeGameQuizBank";
import { materialToQuestions, shuffleOptions } from "../client/src/lib/tornado/questions";
import type { GameQuizBankItemDTO } from "../client/src/types/gameQuiz";

const row: GameQuizBankItemDTO = { id: "source-question", prompt: "Melyik a terület mértékegysége?", options: ["cm", "cm²", "cm³"], correctIndex: 1, explanation: "A területet négyzetegységgel mérjük.", tier: "easy", topic: "math", sourceMaterialId: "lesson-material" };

test("three and four original options pass; malformed answers cannot enter the games", () => {
  assert.ok(isPlayableQuestion(row));
  assert.ok(isPlayableQuestion({ ...row, options: [...row.options, "kg"], correctIndex: 3 }));
  for (const bad of [null, {}, { ...row, prompt: " " }, { ...row, options: ["cm", "cm²"] },
    { ...row, options: ["a", "b", "c", "d", "e"] }, { ...row, options: ["", "b", "c"] },
    { ...row, options: ["a", 2, "c"] }, { ...row, options: ["Ő", "O\u030b", "b"] },
    { ...row, correctIndex: 3 }, { ...row, correctIndex: -1 }, { ...row, correctIndex: 0.5 }]) {
    assert.equal(isPlayableQuestion(bad), false, JSON.stringify(bad));
  }
});
test("legacy copies are collapsed only within the same source and exact content", () => {
  const copy = { ...row, id: "other-game-copy" };
  const otherSource = { ...copy, sourceMaterialId: "different-lesson" };
  const changed = { ...copy, explanation: "Más magyarázat." };
  const near = { ...copy, prompt: row.prompt + " Miért?" };
  assert.deepEqual(uniqueQuizContent([row, copy, otherSource, changed, near]), [row, otherSource, changed, near]);
});
test("bank adapters preserve three choices, their answer, stable ID and explanation", () => {
  const result = splitBankItemsByTier([row]);
  assert.deepEqual(result.easy[0], { id: `db:${row.id}`, prompt: row.prompt, options: row.options, correctIndex: row.correctIndex, explanation: row.explanation });
  assert.equal(result.easy[0].options.length, 3);
  const tornado = materialToQuestions([row], 4)[0];
  assert.equal(tornado.id, row.id);
  assert.equal(tornado.explanation, row.explanation);
  const shuffled = shuffleOptions(tornado, () => 0.5);
  assert.equal(shuffled.options.length, 3);
  assert.equal(shuffled.options[shuffled.correctIndex], row.options[row.correctIndex]);
  assert.deepEqual([...shuffled.options].sort(), [...row.options].sort());
});
test("old numeric difficulty aliases remain usable without losing explanations", () => {
  // Historical DB payloads predate the normalized DTO union.
  const legacy = ["1", "2", "3"].map(tier => ({ ...row, tier })) as GameQuizBankItemDTO[];
  const pools = splitBankItemsByTier(legacy);
  for (const tier of ["easy", "medium", "hard"] as const) {
    assert.equal(pools[tier].length, 1);
    assert.equal(pools[tier][0].explanation, row.explanation);
  }
});
