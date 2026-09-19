import test from "node:test";
import assert from "node:assert/strict";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { verifyLessonSkillBank, LESSON_SKILL_CHECK_VERSION } from "../shared/lesson-skill-checks";
import { runtimeKnowledge } from "../shared/runtime-knowledge";
import { skillSnapshot } from "../server/workflows/learning";

test("7.4 ellenőrző tényleges pontozást mér, nem modell-önértékelést", () => {
  const lesson = standardFusionFixture();
  const result = verifyLessonSkillBank(lesson.experience, lesson.subject);
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  assert.equal(result.version, LESSON_SKILL_CHECK_VERSION);
  assert.equal(result.checks.find(c => c.code === "sample_full_score")?.passed, true);
  assert.equal(result.checks.find(c => c.code === "empty_zero_score")?.passed, true);
  lesson.experience!.tasks[0].sample = "Nem kapcsolódó szöveg.";
  const failed = verifyLessonSkillBank(lesson.experience, lesson.subject);
  assert.equal(failed.ok, false);
  assert.equal(failed.checks.find(c => c.code === "sample_full_score")?.passed, false);
});

test("7.4 hiányzó bank, régi verzióval csökkentett minimum, módszer és kör nem juthat át", () => {
  assert.equal(verifyLessonSkillBank(undefined, "matematika").ok, false);
  for (const change of [
    (e: NonNullable<ReturnType<typeof standardFusionFixture>["experience"]>) => { e.tasks.pop(); },
    (e: NonNullable<ReturnType<typeof standardFusionFixture>["experience"]>) => { e.quiz.pop(); },
    (e: NonNullable<ReturnType<typeof standardFusionFixture>["experience"]>) => { e.methods = e.methods.filter(m => m.kind !== "analogy"); },
    (e: NonNullable<ReturnType<typeof standardFusionFixture>["experience"]>) => { e.bankPlan!.taskRound = 1; },
  ]) {
    const lesson = standardFusionFixture();
    lesson.experience!.version = "fusion-7.4-3";
    change(lesson.experience!);
    assert.equal(verifyLessonSkillBank(lesson.experience, lesson.subject).ok, false);
  }
});

test("nyelvi és RUNBOOK feltételek kötelezőek, rendereredményt nem állít a statikus kapu", () => {
  const lesson = standardFusionFixture();
  assert.equal(verifyLessonSkillBank(lesson.experience, "angol").ok, false);
  const doc = runtimeKnowledge(skillSnapshot("upload", []), []).documents["RUNBOOK.md"];
  assert.match(doc, /KÖTELEZŐ TANANYAGKÉSZÍTŐ 7.4 ELLENŐRZŐ/);
  assert.match(doc, /Statikus kapu nem bizonyít böngészős sikert/);
});