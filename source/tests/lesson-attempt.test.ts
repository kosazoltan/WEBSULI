import test from "node:test";
import assert from "node:assert/strict";
import { reviewState, selectPracticeQuestions } from "../shared/lesson-attempt";
const DAY = 86_400_000;
test("practice prioritizes unseen, wrong, due, then recent correct versions", () => {
  const bank = ["recent", "due", "wrong", "new"].map(id => ({ id }));
  const history = { recent: [{ at: 10 * DAY, correct: true, usedHint: false }], due: [{ at: DAY, correct: true, usedHint: false }], wrong: [{ at: 10 * DAY, correct: false, usedHint: false }] };
  assert.deepEqual(selectPracticeQuestions(bank, 3, history, 10 * DAY).map(q => q.id), ["new", "wrong", "due"]);
});
test("review intervals grow 1/3/7/14 days and reset after a wrong or assisted answer", () => {
  const history = [1, 2, 3, 4].map(at => ({ at: at * DAY, correct: true, usedHint: false }));
  for (const [count, interval] of [[1, 1], [2, 3], [3, 7], [4, 14]]) {
    assert.equal(reviewState(history.slice(0, count)).dueAt, (count + interval) * DAY);
  }
  assert.equal(reviewState([...history, { at: 5 * DAY, correct: true, usedHint: true }]).streak, 0);
  assert.equal(reviewState([...history, { at: 5 * DAY, correct: false, usedHint: false }]).dueAt, 6 * DAY);
});
test("selection stays inside the bank and an unseen changed question version gets a fresh position", () => {
  assert.deepEqual(selectPracticeQuestions([{ id: "new-version" }], 10, { "old-version": [{ at: 1, correct: true, usedHint: false }] }, 2), [{ id: "new-version" }]);
  assert.deepEqual(selectPracticeQuestions([], 10, {}, 2), []);
});
