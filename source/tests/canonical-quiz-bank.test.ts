import test from "node:test";
import assert from "node:assert/strict";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { canonicalBanks, canonicalLessonQuiz, quizTopic, type CanonicalLessonRow } from "../server/studio/canonical-quiz-bank";
import { COUPON_GAME_IDS, exportQuizItemsForPublish } from "../server/studio/quiz-export";
import { uniqueQuizContent } from "../shared/game-quiz-contract";

function row(): CanonicalLessonRow { return { id: "lesson-a", json: fusionFixture(), htmlFileId: "material-a", version: 1 }; }
test("one physical fusion bank serves the same question identity in all coupon games", () => {
  const r = row();
  const bank = canonicalLessonQuiz(r)!;
  const lesson = fusionFixture();
  assert.equal(bank.length, lesson.experience!.quiz.length);
  for (const gameId of COUPON_GAME_IDS) {
    const items = canonicalLessonQuiz(r, gameId)!;
    assert.deepEqual(items.map(q => q.id), bank.map(q => q.id));
    assert.ok(items.every(q => q.gameId === gameId && q.id.length === 64));
  }
  assert.deepEqual(exportQuizItemsForPublish(lesson, r.id, () => null), []);
  assert.deepEqual(bank[0].feedbackPerOption, lesson.experience!.quiz[0].feedbackPerOption);
  assert.equal(bank[0].questionId, lesson.experience!.quiz[0].id);
  assert.equal(bank[0].sourceMaterialId, "material-a");
  assert.equal(bank[0].lessonId, "lesson-a");
});
test("answer, feedback and concept changes version the question; reorder and unrelated edits do not", () => {
  const original = canonicalLessonQuiz(row())!;
  const lesson = fusionFixture();
  lesson.experience!.quiz.reverse();
  lesson.title += " – új borító";
  assert.deepEqual(canonicalLessonQuiz({ ...row(), json: lesson, version: 2 })!.map(q => q.id), original.map(q => q.id).reverse());
  for (const change of ["feedback", "answer", "concept"] as const) {
    const changed = fusionFixture(); const q = changed.experience!.quiz[0];
    if (change === "feedback") q.feedbackPerOption[0] += " További magyarázat.";
    if (change === "answer") q.correctIndex = (q.correctIndex + 1) % q.options.length;
    // The fixture intentionally shares its binding array across questions. Replace
    // this question's binding, so the test really changes only one question.
    if (change === "concept") q.coversConceptIds = [...q.coversConceptIds, "another-concept"];
    const next = canonicalLessonQuiz({ ...row(), json: changed })!;
    assert.notEqual(next[0].id, original[0].id);
    assert.equal(next[1].id, original[1].id);
  }
});
test("different source lesson keeps a separate identity even for identical question wording", () => {
  assert.notEqual(canonicalLessonQuiz(row())![0].id, canonicalLessonQuiz({ ...row(), id: "lesson-b" })![0].id);
});
test("only the latest published version of each material supplies its shared bank", () => {
  const banks = canonicalBanks([{ ...row(), version: 2 }, row()]);
  assert.equal(banks.items.length, canonicalLessonQuiz(row())!.length);
  assert.deepEqual([...banks.materialIds], ["material-a"]);
  const legacy = fusionFixture(); delete legacy.experience;
  assert.equal(canonicalLessonQuiz({ ...row(), json: legacy }), null);
  assert.equal(canonicalBanks([{ ...row(), json: legacy, version: 3 }, row()]).items.length, 0);
});
test("the subject survives the adapter instead of every lesson becoming English", () => {
  assert.equal(quizTopic("Matematika"), "math");
  assert.equal(quizTopic("Természetismeret"), "nature");
  assert.equal(quizTopic("Angol nyelv"), "english");
  assert.equal(quizTopic("Történelem"), "Történelem");
});
test("invalid fusion banks fail closed as a whole and suppress stale legacy exports", () => {
  for (const problem of ["duplicate-option", "duplicate-id", "invalid-schema"] as const) {
    const json = fusionFixture();
    if (problem === "duplicate-option") json.experience!.quiz[0].options[1] = json.experience!.quiz[0].options[0];
    if (problem === "duplicate-id") json.experience!.quiz[1].id = json.experience!.quiz[0].id;
    if (problem === "invalid-schema") json.experience!.quiz = [];
    const result = canonicalBanks([{ ...row(), json }]);
    assert.deepEqual(result.items, []);
    assert.ok(result.materialIds.has("material-a"));
  }
});
test("canonical question identity preserves different concepts/feedback even for identical wording", () => {
  const q = canonicalLessonQuiz(row())![0];
  const another = { ...q, id: "another-version", questionVersion: "changed", coversConceptIds: ["another"] };
  assert.deepEqual(uniqueQuizContent([q, another, q]), [q, another]);
});
