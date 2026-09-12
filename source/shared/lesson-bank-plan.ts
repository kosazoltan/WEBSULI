import type { Lesson } from "./lesson-schema";
import type { LessonBankPlan } from "./lesson-experience";

/** Plan from taught concepts, never from a filename or a target token count. */
export function planLessonBank(lesson: Pick<Lesson, "sections" | "classroom">): LessonBankPlan {
  const units: LessonBankPlan["units"] = [];
  lesson.sections.forEach((section, sectionIndex) => {
    const ids = [...new Set(section.blocks.flatMap(b => b.kind === "explain" || b.kind === "example" ? b.coversConceptIds : []))].sort();
    for (let i = 0; i < ids.length; i += 6) units.push({ sectionIndex, conceptIds: ids.slice(i, i + 6) });
  });
  const tasks = Math.max(15, units.reduce((n, u) => n + Math.max(2, u.conceptIds.length), 0));
  const quiz = Math.max(15, units.reduce((n, u) => n + 2 * u.conceptIds.length, 0));
  const earlyReader = lesson.classroom >= 1 && lesson.classroom <= 2;
  return { units, taskRound: Math.min(earlyReader ? 3 : 5, tasks), quizRound: Math.min(earlyReader ? 5 : 10, quiz) };
}
