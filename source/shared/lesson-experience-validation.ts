import { experienceSchema, lessonLanguage, LESSON_METHOD_VERSION } from "./lesson-experience";
import { planLessonBank } from "./lesson-bank-plan";
import { evaluateOpenAnswer } from "./lesson-experience-score";
import type { Lesson } from "./lesson-schema";

/** A bank may examine teaching, but may never stand in for missing teaching. */
export function experienceProblems(lesson: Lesson, experience: unknown = lesson.experience): string[] {
  const parsed = experienceSchema.safeParse(experience);
  if (!parsed.success) return parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`);
  const e = parsed.data;
  const reasons: string[] = [];
  if (e.version === LESSON_METHOD_VERSION) {
    const expected = planLessonBank(lesson);
    const actual = e.bankPlan!;
    const key = (units: typeof expected.units) => units.map(u => `${u.sectionIndex}:${[...u.conceptIds].sort().join(",")}`).sort().join(";");
    if (key(expected.units) !== key(actual.units) || expected.taskRound !== actual.taskRound || expected.quizRound !== actual.quizRound) reasons.push("A bankterv nem fedi a ténylegesen tanított összes fogalmat, vagy eltér a korosztály körméretétől.");
  }
  for (const item of [...e.methods, ...e.tasks, ...e.quiz]) {
    const section = lesson.sections[item.sectionIndex];
    const taught = new Set(section?.blocks.flatMap(b => b.kind === "explain" || b.kind === "example" ? b.coversConceptIds : []) ?? []);
    if (!section || item.coversConceptIds.some(id => !taught.has(id))) reasons.push(`${item.id}: a hivatkozott fejezet nem tanítja a megadott fogalmat.`);
  }
  for (const task of e.tasks) if (evaluateOpenAnswer(task.sample, task).state !== "ok") reasons.push(`${task.id}: a saját mintaválasz nem kap teljes pontot.`);
  const language = lessonLanguage(lesson.subject);
  if (language && (e.language !== language || !e.glossary.length)) reasons.push("A nyelvi lecke szószedete vagy felolvasási nyelve hiányzik/eltér.");
  return reasons;
}
