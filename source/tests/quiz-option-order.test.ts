import test from "node:test";
import assert from "node:assert/strict";
import { quizOptionIndices } from "../shared/lesson-experience-score";

test("quiz display mixes positions without changing option identity or persisted picks", () => {
  for (const count of [3, 4]) {
    const positions = new Set<number>();
    for (let i = 0; i < 75; i++) {
      const question = { id: `q${i}`, question: `Melyik magyarázat helyes a ${i}. helyzetben?`, options: Array.from({ length: count }, (_, j) => `Válasz ${j}`) };
      const original = structuredClone(question);
      const order = quizOptionIndices(question);
      assert.deepEqual([...order].sort(), Array.from({ length: count }, (_, j) => j));
      assert.deepEqual(quizOptionIndices(structuredClone(question)), order);
      assert.deepEqual(question, original);
      for (let savedPick = 0; savedPick < count; savedPick++) assert.equal(order.filter(index => index === savedPick).length, 1);
      positions.add(order.indexOf(0));
    }
    assert.equal(positions.size, count);
  }
});
