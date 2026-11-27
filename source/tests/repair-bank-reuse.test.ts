import { test } from "node:test";
import assert from "node:assert/strict";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { buildLessonExperience } from "../server/studio/experience-builder";
import { conceptsChangedSince } from "../server/studio/structured-improvement";
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

test("review #379: a lecke utolsó írása után módosult fogalom kizárja az egységét (más lecke javítása, tanári szerkesztés)", () => {
  const written = new Date("2026-11-03T05:00:00Z");
  const rows = [
    { localId: "area", updatedAt: new Date("2026-11-02T10:00:00Z") },
    { localId: "height", updatedAt: new Date("2026-11-03T06:00:00Z") },
    { localId: "same", updatedAt: written },
  ];
  assert.deepEqual(conceptsChangedSince(rows, written), ["height"], "csak a később módosult; az azonos pillanatú (ugyanabban az alkalmazásban írt) nem");
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

// TG-P7a (docs/specs/2026-11-27-tananyag-gyakorlati-p7a-vegrehajtas.md): a meta-kérdés miatt csak a kifogásolt tétel cserélődik.
const META = "Hány pontot ér a feladatlapon a 3. feladat?";
const PRACTICAL = "Egy háromszög alapja 6 cm, magassága 4 cm. Mekkora a területe?";

test("TG-P7a: a csak meta-hibás régi csomagból célzott tételcsere — a többi tétel és azonosító stabil", async () => {
  const { lesson, packets } = twoSectionLesson();
  let calls = 0;
  const first = await buildLessonExperience(lesson, [], { memory: "M", call: async () => structuredClone(packets[calls++ % 2]) });
  const dirty = structuredClone(first);
  const victim = dirty.quiz.find(q => q.sectionIndex === 0)!;
  victim.question = META;
  const prompts: string[] = [];
  const repaired = await buildLessonExperience(lesson, [], {
    previous: dirty, previousSections: lesson.sections,
    call: async (_system, user) => {
      prompts.push(user);
      return { methods: [], tasks: [], quiz: [{ ...structuredClone(victim), question: PRACTICAL }], glossary: [] };
    },
  });
  assert.equal(prompts.length, 1, "egyetlen célzott modellhívás (a hibátlan fejezet modell nélkül átvéve)");
  assert.match(prompts[0], /JAVÍTÁSI MÓD/u);
  assert.match(prompts[0], new RegExp(victim.id), "a kifogásolt tétel azonosítója a javítási jogosultságban");
  const fixed = repaired.quiz.find(q => q.id === victim.id);
  assert.ok(fixed, "a lecserélt tétel az eredeti azonosítóján");
  assert.equal(fixed.question, PRACTICAL);
  const others = (e: typeof first) => e.quiz.filter(q => q.id !== victim.id);
  assert.deepEqual(others(repaired), others(first), "a többi kvíztétel tartalma és azonosítója változatlan");
  assert.deepEqual(repaired.tasks, first.tasks);
  assert.deepEqual(repaired.methods, first.methods);
  assert.deepEqual(repaired.bankPlan!.units.map(u => u.sourceHash), first.bankPlan!.units.map(u => u.sourceHash), "a csomag-hash marad (a következő javítás is megtalálja)");

  let again = 0;
  const rerun = await buildLessonExperience(lesson, [], { previous: repaired, previousSections: lesson.sections, call: async () => { again++; return structuredClone(packets[0]); } });
  assert.equal(again, 0, "azonos javítás újrafuttatása: nulla modellhívás");
  assert.deepEqual(rerun.quiz, repaired.quiz, "és nulla módosítás");
});

test("TG-P7a: meta MELLETT más kapuhibás régi csomag továbbra is teljes újragyártást kap", async () => {
  const { lesson, packets } = twoSectionLesson();
  let calls = 0;
  const first = await buildLessonExperience(lesson, [], { memory: "M", call: async () => structuredClone(packets[calls++ % 2]) });
  const dirty = structuredClone(first);
  const [a, b] = dirty.quiz.filter(q => q.sectionIndex === 0);
  a.question = META;
  b.correctIndex = b.options.length + 3;
  const prompts: string[] = [];
  await buildLessonExperience(lesson, [], { previous: dirty, previousSections: lesson.sections, call: async (_s, user) => { prompts.push(user); return structuredClone(packets[0]); } });
  assert.equal(prompts.length, 1);
  assert.doesNotMatch(prompts[0], /JAVÍTÁSI MÓD: a teljes csomag már megvan/u, "teljes csomagot kér");
});
