import { test } from "node:test";
import assert from "node:assert/strict";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { experienceSchema, experienceTheme } from "../shared/lesson-experience";
import { evaluateOpenAnswer, normalizeAnswer, sampleIds, sampleTaskIds, scoreSummary } from "../shared/lesson-experience-score";
import { experienceProblems } from "../shared/lesson-experience-validation";
import { lessonSchema } from "../shared/lesson-schema";
import { buildLessonExperience, type ExperienceCheckpoint } from "../server/studio/experience-builder";
import { exportQuizItemsFromChecks } from "../server/studio/quiz-export";

test("legacy lessons survive; new banks retain their data and reject incomplete/duplicate content", () => {
  const lesson = fusionFixture();
  assert.ok(lessonSchema.safeParse({ ...lesson, experience: undefined }).success);
  assert.equal(lessonSchema.parse(lesson).experience?.quiz.length, 75);
  assert.deepEqual(experienceProblems(lesson), []);
  assert.equal(experienceSchema.safeParse({ ...lesson.experience, tasks: lesson.experience!.tasks.slice(1) }).success, false);
  const repeated = structuredClone(lesson.experience!); repeated.quiz[1] = repeated.quiz[0];
  assert.equal(experienceSchema.safeParse(repeated).success, false);
  const duplicateChoices = structuredClone(lesson.experience!); duplicateChoices.methods.find(m => m.kind === "gate")!.options = ["A", "A"];
  assert.equal(experienceSchema.safeParse(duplicateChoices).success, false);
});
test("rubric gives empty/wrong/keyword/typo/synonym answers their actual grade", () => {
  const task = { ...fusionFixture().experience!.tasks[0], required: [["magasság", "magassága"], ["merőleges"]], sample: "A magasság merőleges az alapra, mert így mérjük a távolságot.", minWords: 2, needsSentence: true };
  assert.equal(evaluateOpenAnswer("", task).score, 0);
  assert.equal(evaluateOpenAnswer("kék bicikli", task).score, 0);
  assert.equal(evaluateOpenAnswer("magasság merőleges", task).score, .5);
  assert.equal(evaluateOpenAnswer(task.sample, task).score, 1);
  assert.equal(evaluateOpenAnswer("A magassag meröleges az alapra, mert így mérjük a távolságot.", task).score, 1);
  assert.equal(evaluateOpenAnswer("A magasság nem merőleges az alapra, mert így mérjük a távolságot.", task).score, .5);
  assert.equal(evaluateOpenAnswer("40 cm²", fusionFixture().experience!.tasks[0]).score, 0);
  const inflected = { ...task, required: [["egységesít"], ["alap"]], sample: "Az alaphoz egységesítjük a mértékegységet, mert így számolhatunk." };
  assert.equal(evaluateOpenAnswer(inflected.sample, inflected).score, 1);
  assert.equal(evaluateOpenAnswer("alap egységesít", inflected).score, .5);
  assert.equal(evaluateOpenAnswer("kalap a fejeden", inflected).score, 0);
});
test("bindings must refer to teaching; each sample passes; real bank exported to games", () => {
  const lesson = fusionFixture();
  lesson.experience!.tasks[0].coversConceptIds = ["invented"];
  assert.match(experienceProblems(lesson).join(" "), /nem tanítja/);
  assert.equal(exportQuizItemsFromChecks(fusionFixture(), "block-craft-quiz").length, 75);
});
test("numeric grading keeps sign and decimal precision; oral practice is always sampled", () => {
  const task = { ...fusionFixture().experience!.tasks[0], required: [["4.5"]], sample: "4.5 cm²" };
  assert.equal(evaluateOpenAnswer("4,5 cm²", task).score, 1);
  for (const answer of ["-4.5", "−4,5", "4 5", "45"]) assert.equal(evaluateOpenAnswer(answer, task).score, 0, answer);
  assert.equal(normalizeAnswer("+4,5"), "4.5");
  const bank = fusionFixture().experience!.tasks;
  for (const random of [() => 0, () => .5, () => .9999]) {
    const ids = sampleTaskIds(bank, 15, random);
    assert.equal(new Set(ids).size, 15);
    assert.ok(bank.filter(t => ids.includes(t.id) && t.mode === "oral").length >= 2);
  }
});
test("sampling has no duplicates; half points and grade thresholds are exact; themes vary", () => {
  assert.equal(new Set(sampleIds(fusionFixture().experience!.quiz, 25)).size, 25);
  assert.deepEqual(scoreSummary(13.5, 15), { points: 13.5, total: 15, percent: 90, grade: 5, label: "Jeles" });
  assert.equal(scoreSummary(0, 0).percent, 0);
  assert.ok(new Set(Array.from({ length: 20 }, (_, i) => experienceTheme(`Téma ${i}`))).size >= 4);
});
test("builder uses seven bounded validated parts, retains evidence, and resumes without paid repeats", async () => {
  const lesson = fusionFixture(); const e = lesson.experience!;
  let calls = 0; let checkpoint: ExperienceCheckpoint | undefined;
  const parts = [{ methods: e.methods, glossary: [] }, ...[0, 15, 30].map(i => ({ tasks: e.tasks.slice(i, i + 15) })), ...[0, 25, 50].map(i => ({ quiz: e.quiz.slice(i, i + 25) }))];
  const concepts = [{ localId: "area", term: "Terület", definition: "A szorzat fele", quote: "T = a · m / 2", examWeight: "core" as const }];
  const actual = await buildLessonExperience(lesson, concepts, { call: async (system) => { assert.ok(system.includes(concepts[0].quote)); assert.ok(system.includes(concepts[0].definition)); return parts[calls++]; }, save: async cp => { checkpoint = structuredClone(cp); } });
  assert.equal(calls, 7); assert.equal(actual.tasks.length, 45);
  await buildLessonExperience(lesson, concepts, { checkpoint, call: async () => { throw new Error("cache miss"); } });
});
test("bad bank gets a targeted retry then fails closed", async () => {
  let calls = 0;
  await assert.rejects(buildLessonExperience(fusionFixture(), [], { call: async (_system, user) => { if (++calls === 2) assert.match(user, /előző válasz hibái/); return {}; } }), /javító kör után/);
  assert.equal(calls, 2);
});
