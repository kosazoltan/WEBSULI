import { test } from "node:test";
import assert from "node:assert/strict";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { buildLessonExperience } from "../server/studio/experience-builder";
import { LESSON_OPENER_VERSION } from "../shared/lesson-opener";
import type { Lesson } from "../shared/lesson-schema";

// Spec 2026-11-08-nyitomese-jatekos-kerdezes, review #403: bekapcsolt nyitómesénél a javítás csak az azonos szerződés-verzióval
// készült korábbi csomagot veszi át (bankterv `opener` jelölő); kikapcsolva a viselkedés és a kimenet változatlan.
function twoSectionLesson(): { lesson: Lesson; packets: unknown[] } {
  const lesson = standardFusionFixture();
  const second = structuredClone(lesson.sections[0]); second.heading = "Második összefüggés";
  second.blocks.forEach(b => { if ("coversConceptIds" in b) b.coversConceptIds = ["height"]; });
  lesson.sections.push(second);
  const packets = [0, 1].map(sectionIndex => {
    const e = structuredClone(standardFusionFixture().experience!);
    for (const i of [...e.methods, ...e.tasks, ...e.quiz]) { i.sectionIndex = sectionIndex; i.coversConceptIds = [sectionIndex ? "height" : "area"]; }
    if (sectionIndex) { e.methods.forEach(m => { if (m.kind === "gate") m.prompt = `A magasság alkalmazása: ${m.prompt}`; }); e.tasks.forEach(t => { t.q = `Második fejezet: ${t.q}`; }); e.quiz.forEach(q => { q.question = `Második fejezet: ${q.question}`; }); }
    return { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] };
  });
  return { lesson, packets };
}

async function withFlag<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.STUDIO_LESSON_OPENER;
  try {
    if (value === undefined) delete process.env.STUDIO_LESSON_OPENER; else process.env.STUDIO_LESSON_OPENER = value;
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.STUDIO_LESSON_OPENER; else process.env.STUDIO_LESSON_OPENER = previous;
  }
}

test("kikapcsolva a bankterv egységein nincs opener jelölő (a kimenet változatlan)", async () => {
  const { lesson, packets } = twoSectionLesson();
  let calls = 0;
  const built = await withFlag(undefined, () => buildLessonExperience(lesson, [], { call: async () => structuredClone(packets[calls++]) }));
  assert.ok(built.bankPlan!.units.every(u => !("opener" in u)));
});

test("bekapcsolt javításnál a kapcsoló előtt gyártott (jelölő nélküli) változatlan fejezet bankja NEM kerül át", async () => {
  const { lesson, packets } = twoSectionLesson();
  let calls = 0;
  const first = await withFlag(undefined, () => buildLessonExperience(lesson, [], { call: async () => structuredClone(packets[calls++]) }));
  const changed = structuredClone(lesson); changed.sections[1].heading = "Javított második összefüggés";
  calls = 0;
  const repaired = await withFlag("on", () => buildLessonExperience(changed, [], { previous: first, previousSections: lesson.sections, call: async () => structuredClone(packets[calls++]) }));
  assert.equal(calls, 2, "mindkét fejezet csomagja az új szerződéssel gyártódik");
  assert.ok(repaired.bankPlan!.units.every(u => u.opener === LESSON_OPENER_VERSION));
});

test("bekapcsolt javításnál az azonos szerződés-verzióval gyártott változatlan fejezet bankja átkerül, azonos azonosítókkal", async () => {
  const { lesson, packets } = twoSectionLesson();
  let calls = 0;
  const first = await withFlag("on", () => buildLessonExperience(lesson, [], { call: async () => structuredClone(packets[calls++]) }));
  const changed = structuredClone(lesson); changed.sections[1].heading = "Javított második összefüggés";
  calls = 0;
  const repaired = await withFlag("on", () => buildLessonExperience(changed, [], { previous: first, previousSections: lesson.sections, call: async () => { calls++; return structuredClone(packets[1]); } }));
  assert.equal(calls, 1, "csak a megváltozott fejezet csomagja gyártódik újra");
  assert.deepEqual(repaired.quiz.filter(q => q.sectionIndex === 0), first.quiz.filter(q => q.sectionIndex === 0));
});
