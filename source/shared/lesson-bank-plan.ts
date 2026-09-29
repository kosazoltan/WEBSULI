import type { Lesson } from "./lesson-schema";
import { LESSON_METHOD_VERSION, LESSON_BANK_RESERVE, LESSON_BANK_SIZES, METHOD_KINDS, type LessonBankPlan } from "./lesson-experience";

/** Plan from taught concepts, never from a filename or a target token count. */
export function planLessonBank(lesson: Pick<Lesson, "sections" | "classroom">, version: string = LESSON_METHOD_VERSION): LessonBankPlan {
  const units: LessonBankPlan["units"] = [];
  lesson.sections.forEach((section, sectionIndex) => {
    const ids = [...new Set(section.blocks.flatMap(b => b.kind === "explain" || b.kind === "example" ? b.coversConceptIds : []))].sort();
    for (let i = 0; i < ids.length; i += 6) units.push({ sectionIndex, conceptIds: ids.slice(i, i + 6) });
  });
  if (version === LESSON_METHOD_VERSION) return { units, taskRound: LESSON_BANK_SIZES.taskRound, quizRound: LESSON_BANK_SIZES.quizRound };
  const tasks = Math.max(15, units.reduce((n, u) => n + Math.max(2, u.conceptIds.length), 0));
  const quiz = Math.max(15, units.reduce((n, u) => n + 2 * u.conceptIds.length, 0));
  const earlyReader = lesson.classroom >= 1 && lesson.classroom <= 2;
  return { units, taskRound: Math.min(earlyReader ? 3 : 5, tasks), quizRound: Math.min(earlyReader ? 5 : 10, quiz) };
}

/** Deterministic quotas are part of the checkpoint hash, including method coverage. */
export function bankUnitQuota(plan: LessonBankPlan, unitIndex: number) {
  const allocate = (kind: "tasks" | "quiz", reserve = 0) => {
    const base = plan.units.map(u => kind === "tasks" ? Math.max(2, u.conceptIds.length) : u.conceptIds.length * 2);
    const extra = Math.max(0, LESSON_BANK_SIZES[kind] + reserve - base.reduce((a, b) => a + b, 0));
    return base[unitIndex] + Math.floor(extra / base.length) + (unitIndex < extra % base.length ? 1 : 0);
  };
  const kinds = plan.units.map(() => [] as Array<typeof METHOD_KINDS[number]>);
  [...METHOD_KINDS, "gate" as const].forEach((kind, i) => kinds[i % kinds.length].push(kind));
  for (const [i, list] of kinds.entries()) {
    for (let k = i; new Set(list).size < 2; k++) if (!list.includes(METHOD_KINDS[k % METHOD_KINDS.length])) list.push(METHOD_KINDS[k % METHOD_KINDS.length]);
  }
  // Spec 2026-09-29-limit-banktetel-kivetel (5. döntés): a *Count az elfogadási minimum (a publikálási 45/75-höz),
  // a *Target a modelltől kért darabszám tartalékkal, hogy a kapu a hibás tételt a minimum megsértése nélkül kivehesse.
  return {
    taskCount: allocate("tasks"), quizCount: allocate("quiz"),
    taskTarget: allocate("tasks", LESSON_BANK_RESERVE.tasks), quizTarget: allocate("quiz", LESSON_BANK_RESERVE.quiz),
    methodKinds: kinds[unitIndex],
  };
}
