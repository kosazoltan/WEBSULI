import { test } from "node:test";
import assert from "node:assert/strict";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { buildLessonExperience } from "../server/studio/experience-builder";
import type { Lesson } from "../shared/lesson-schema";

// Spec 2026-11-03-javitas-bank-megorzes: a javítás a tanításában változatlan fejezet bankját a gyártási konfigurációtól függetlenül
// megtartja (mérve: e nélkül egy egymondatos javítás mind a 7 fejezet bankját újragyártotta, gyengébb rubrikákkal).
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

const inSection = <T extends { sectionIndex: number }>(items: T[], sectionIndex: number) => items.filter(i => i.sectionIndex === sectionIndex);

test("eltérő gyártási konfiguráció (memória) mellett is megmarad a változatlan fejezet bankja, azonos azonosítókkal", async () => {
  const { lesson, packets } = twoSectionLesson();
  let calls = 0;
  const first = await buildLessonExperience(lesson, [], { memory: "TANTÁRGYI MEMÓRIA v1", call: async () => structuredClone(packets[calls++]) });
  assert.equal(calls, 2);
  const changed = structuredClone(lesson); changed.sections[1].heading = "Javított második összefüggés";
  calls = 0;
  const repaired = await buildLessonExperience(changed, [], { previous: first, previousSections: lesson.sections, call: async () => { calls++; return structuredClone(packets[1]); } });
  assert.equal(calls, 1, "csak a megváltozott fejezet csomagja gyártódik újra");
  assert.deepEqual(inSection(repaired.methods, 0), inSection(first.methods, 0), "módszerek: a 0. fejezet tételei és azonosítói változatlanok");
  assert.deepEqual(inSection(repaired.tasks, 0), inSection(first.tasks, 0), "feladatok: a 0. fejezet tételei és azonosítói változatlanok");
  assert.deepEqual(inSection(repaired.quiz, 0), inSection(first.quiz, 0), "kvíz: a 0. fejezet tételei és azonosítói változatlanok");
  const keptUnit = repaired.bankPlan!.units.find(u => u.sectionIndex === 0)!;
  assert.equal(keptUnit.sourceHash, first.bankPlan!.units.find(u => u.sectionIndex === 0)!.sourceHash, "a következő javítás is megtalálja");
  assert.notEqual(inSection(repaired.quiz, 1)[0].id, inSection(first.quiz, 1)[0].id);
});

test("a tartalom szerinti átvétel nélkül (previousSections hiányzik) a konfigváltás a régi viselkedést adja: újragyártás", async () => {
  const { lesson, packets } = twoSectionLesson();
  let calls = 0;
  const first = await buildLessonExperience(lesson, [], { memory: "TANTÁRGYI MEMÓRIA v1", call: async () => structuredClone(packets[calls++ % 2]) });
  calls = 0;
  await buildLessonExperience(lesson, [], { previous: first, call: async () => structuredClone(packets[calls++ % 2]) });
  assert.equal(calls, 2);
});

test("review #379: a lektori kivétel miatt hézagos régi csomag átvételkor a tételek a SAJÁT azonosítójukat tartják", async () => {
  const { lesson, packets } = twoSectionLesson();
  let calls = 0;
  const first = await buildLessonExperience(lesson, [], { memory: "M", call: async () => structuredClone(packets[calls++ % 2]) });
  const gapped = structuredClone(first);
  const removed = inSection(gapped.tasks, 0)[1].id;
  gapped.tasks = gapped.tasks.filter(t => t.id !== removed);
  const changed = structuredClone(lesson); changed.sections[1].heading = "Javított második összefüggés";
  calls = 0;
  const repaired = await buildLessonExperience(changed, [], { previous: gapped, previousSections: lesson.sections, call: async () => { calls++; return structuredClone(packets[1]); } });
  assert.equal(calls, 1);
  assert.deepEqual(inSection(repaired.tasks, 0).map(t => t.id), inSection(gapped.tasks, 0).map(t => t.id), "a hézag nem számozódik át");
  assert.ok(!repaired.tasks.some(t => t.id === removed), "a kivett tétel azonosítója nem kerül másik kérdésre");
});

test("review #379: a forrás-helyesbítés fogalmának egysége újragyártódik, a többi megmarad (reuseExcludedConceptIds)", async () => {
  const { lesson, packets } = twoSectionLesson();
  let calls = 0;
  const first = await buildLessonExperience(lesson, [], { memory: "M", call: async () => structuredClone(packets[calls++ % 2]) });
  calls = 0;
  const repaired = await buildLessonExperience(lesson, [], { previous: first, previousSections: lesson.sections, reuseExcludedConceptIds: new Set(["height"]), call: async () => { calls++; return structuredClone(packets[1]); } });
  assert.equal(calls, 1, "csak a helyesbített fogalom egysége");
  assert.deepEqual(inSection(repaired.quiz, 0), inSection(first.quiz, 0));
});

test("a kihagyott fejezet (forrás-helyesbítés: undefined) és a mostani kapun bukó régi csomag újragyártódik", async () => {
  const { lesson, packets } = twoSectionLesson();
  let calls = 0;
  const first = await buildLessonExperience(lesson, [], { memory: "M", call: async () => structuredClone(packets[calls++ % 2]) });
  calls = 0;
  await buildLessonExperience(lesson, [], { previous: first, previousSections: [undefined, lesson.sections[1]], call: async () => { calls++; return structuredClone(packets[0]); } });
  assert.equal(calls, 1, "a helyesbített fogalmat tanító fejezet nem vehető át");
  const broken = structuredClone(first);
  const victim = broken.quiz.find(q => q.sectionIndex === 0)!;
  victim.correctIndex = victim.options.length + 3;
  calls = 0;
  await buildLessonExperience(lesson, [], { previous: broken, previousSections: lesson.sections, call: async () => { calls++; return structuredClone(packets[0]); } });
  assert.equal(calls, 1, "a mostani kapun bukó régi csomag helyett új készül");
});
