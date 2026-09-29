import assert from "node:assert/strict";
import test from "node:test";

import { exportQuizItemsFromChecks } from "../server/studio/quiz-export";
import { validateGeneratedQuizItems } from "../server/gameQuizValidation";
import { verifyLessonSkillBank } from "../shared/lesson-skill-checks";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { buildLessonExperience } from "../server/studio/experience-builder";
import type { Lesson } from "../shared/lesson-schema";

/** Spec 2026-09-29 (docs/specs/2026-09-29-egy-helyes-valasz.md), döntés 2: az őr bekötése. */

const BAD = { question: "Melyik szám osztható 9-cel?", options: ["234", "567", "891", "648"], correctIndex: 0 };
const GOOD = { question: "Melyik szám NEM osztható 3-mal?", options: ["315", "472", "813", "126"], correctIndex: 1 };
const feedback = (n: number) => Array.from({ length: n }, (_, i) => `Visszajelzés ${i + 1}.`);

test("quiz-export: a több helyes opciós check blokk nem kerül a játékba", () => {
  const lesson = {
    title: "Oszthatóság", subject: "matematika", classroom: 5, mapId: "m", misconceptions: [], sourceOnly: true,
    sections: [{ heading: "Oszthatóság", blocks: [
      { kind: "check", ...BAD, feedbackPerOption: feedback(4), coversConceptIds: ["c1"] },
      { kind: "check", ...GOOD, feedbackPerOption: feedback(4), coversConceptIds: ["c1"] },
    ] }],
  } as unknown as Lesson;
  const rows = exportQuizItemsFromChecks(lesson, "tsunami-english");
  assert.deepEqual(rows.map((r) => r.prompt), [GOOD.question]);
});

test("játék-kvízgenerátor: a több helyes opciós generált tétel eldobva (skipped)", () => {
  const base = { explanation: "Mert a számjegyek összege osztható.", topic: "math" };
  const { valid, skipped } = validateGeneratedQuizItems([
    { ...base, prompt: BAD.question, options: BAD.options, correctIndex: 0 },
    { ...base, prompt: GOOD.question, options: GOOD.options, correctIndex: 1 },
  ]);
  assert.deepEqual(valid.map((v) => v.prompt), [GOOD.question]);
  assert.equal(skipped, 1);
});

test("7.4 ellenőrző: új `single_correct` — a bank és a lecke check blokkjai is", () => {
  const lesson = standardFusionFixture();
  assert.equal(verifyLessonSkillBank(lesson.experience, lesson.subject, lesson.sections).checks.find((c) => c.code === "single_correct")?.passed, true);
  const e = lesson.experience!;
  e.quiz[0] = { ...e.quiz[0], ...BAD, feedbackPerOption: feedback(4) };
  const bank = verifyLessonSkillBank(e, lesson.subject);
  assert.equal(bank.ok, false);
  const check = bank.checks.find((c) => c.code === "single_correct");
  assert.equal(check?.passed, false);
  assert.match(check!.problems[0], /^q1: /);

  const withSection = standardFusionFixture();
  withSection.sections[0].blocks.push({ kind: "check", ...BAD, feedbackPerOption: feedback(4), coversConceptIds: ["area"] });
  const sectionResult = verifyLessonSkillBank(withSection.experience, withSection.subject, withSection.sections);
  assert.equal(sectionResult.ok, false);
  assert.match(sectionResult.checks.find((c) => c.code === "single_correct")!.problems[0], /^sections\[0\]\.blocks\[4\]: /);
});

test("bankcsomag-validálás: a több helyes opciós kvíztétel javító kört kap a lektor előtt", async () => {
  const lesson = standardFusionFixture(), e = lesson.experience!;
  const bad = { methods: e.methods, tasks: e.tasks, quiz: e.quiz.map((q, i) => (i === 0 ? { ...q, ...BAD, feedbackPerOption: feedback(4) } : q)), glossary: [] };
  const good = { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] };
  const users: string[] = [];
  const result = await buildLessonExperience(lesson, [], { call: async (_s, user, attempt) => { users.push(user); return attempt === 0 ? bad : good; } });
  assert.equal(users.length, 2, "egy javító kör");
  assert.match(users[1], /q1: Egyválasztós tétel/);
  assert.equal(result.quiz[0].question, e.quiz[0].question);
});
