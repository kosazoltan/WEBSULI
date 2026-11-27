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

// Review #635: a célzott meta-csere a nyílt feladat rubrikáját is cserélheti, a szószedet és az érintetlen tételek kapui nem futnak újra.
async function dirtyTaskLesson() {
  const { lesson, packets } = twoSectionLesson();
  let calls = 0;
  const first = await buildLessonExperience(lesson, [], { memory: "M", call: async () => structuredClone(packets[calls++ % 2]) });
  const dirty = structuredClone(first);
  const victim = dirty.tasks.find(t => t.sectionIndex === 0)!;
  victim.q = "Hány pontot ér a feladatlapon a 2. feladat, és milyen feladattípus?";
  return { lesson, first, dirty, victim };
}

test("review #635: a meta-feladat új rubrikával (más kötelező válasszal) is lecserélhető; a szószedet nem cserélődik", async () => {
  const { lesson, first, dirty, victim } = await dirtyTaskLesson();
  const replacement = { ...structuredClone(victim), q: "Egy háromszög alapja 6 cm, magassága 8 cm. Mekkora a területe?", required: [["24"]], bonus: [], sample: "A terület 24 cm².", minWords: 1, needsSentence: false };
  delete (replacement as { typedAnswers?: unknown }).typedAnswers;
  delete (replacement as { requiredPhrases?: unknown }).requiredPhrases;
  delete (replacement as { requiredOrder?: unknown }).requiredOrder;
  const repaired = await buildLessonExperience(lesson, [], {
    previous: dirty, previousSections: lesson.sections,
    call: async () => ({ methods: [], tasks: [replacement], quiz: [], glossary: [{ word: "x", translation: "y", partOfSpeech: "n", example: "x", exampleTranslation: "y" }] }),
  });
  const fixed = repaired.tasks.find(t => t.id === victim.id)!;
  assert.equal(fixed.q, replacement.q);
  assert.deepEqual(fixed.required, [["24"]]);
  assert.deepEqual(repaired.glossary, first.glossary, "a szószedet az eredeti");
  assert.deepEqual(repaired.tasks.filter(t => t.id !== victim.id), first.tasks.filter(t => t.id !== victim.id));
});

test("review #635: a célzott javításnál a válaszkulcs-teszt és a vak kvízszűrő csak a lecserélt tételt kapja", async () => {
  const { lesson, dirty, victim } = await dirtyTaskLesson();
  const keyed: string[][] = [];
  const blind: string[][] = [];
  await buildLessonExperience(lesson, [], {
    previous: dirty, previousSections: lesson.sections,
    call: async () => ({ methods: [], tasks: [{ ...structuredClone(victim), q: "Egy háromszög alapja 6 cm, magassága 4 cm. Mekkora a területe?" }], quiz: [], glossary: [] }),
    answerKeys: async (tasks) => { keyed.push(tasks.map(t => t.id)); return new Map(); },
    quizBlind: async (quiz) => { blind.push(quiz.map(q => q.id)); return new Map(); },
  });
  assert.ok(keyed.length >= 1);
  for (const ids of keyed) assert.deepEqual(ids.filter(id => dirty.tasks.some(t => t.id === id && t.sectionIndex === 0)), [victim.id], "csak a lecserélt feladat");
  for (const ids of blind) assert.deepEqual(ids, [], "a kvíz nem változott — nincs vak újraellenőrzés");
});

test("review #635: STUDIO_PRACTICE_QUOTA=on mellett is célzott a meta-csere (az arányeltérés nem kényszerít teljes újragyártást)", async () => {
  const { lesson, packets } = twoSectionLesson();
  let calls = 0;
  const first = await buildLessonExperience(lesson, [], { memory: "M", call: async () => structuredClone(packets[calls++ % 2]) });
  const prev = process.env.STUDIO_PRACTICE_QUOTA;
  process.env.STUDIO_PRACTICE_QUOTA = "on";
  try {
    const dirty = structuredClone(first);
    const victim = dirty.quiz.find(q => q.sectionIndex === 0)!;
    victim.question = META;
    const prompts: string[] = [];
    const repaired = await buildLessonExperience(lesson, [], { previous: dirty, previousSections: lesson.sections,
      call: async (_s, user) => { prompts.push(user); return { methods: [], tasks: [], quiz: [{ ...structuredClone(victim), question: PRACTICAL }], glossary: [] }; } });
    assert.ok(prompts.length >= 1 && prompts.every(p => /JAVÍTÁSI MÓD/u.test(p)), "csak célzott hívás");
    assert.deepEqual(repaired.quiz.filter(q => q.id !== victim.id), first.quiz.filter(q => q.id !== victim.id));
  } finally {
    if (prev === undefined) delete process.env.STUDIO_PRACTICE_QUOTA; else process.env.STUDIO_PRACTICE_QUOTA = prev;
  }
});

test("review #635/2: kvóta mellett a célzott csere ÚJ számítási hibája javítókört kap (nem megy át az arányeltéréssel)", async () => {
  const { lesson, packets } = twoSectionLesson();
  let calls = 0;
  const first = await buildLessonExperience(lesson, [], { memory: "M", call: async () => structuredClone(packets[calls++ % 2]) });
  const prev = process.env.STUDIO_PRACTICE_QUOTA;
  process.env.STUDIO_PRACTICE_QUOTA = "on";
  try {
    const dirty = structuredClone(first);
    const victim = dirty.quiz.find(q => q.sectionIndex === 0)!;
    victim.question = META;
    const prompts: string[] = [];
    // Az első célzott válasz hamis számítást állít (6 · 4 / 2 = 13), a második helyes.
    const wrong = { ...structuredClone(victim), question: "Egy háromszög alapja 6 cm, magassága 4 cm, így a területe 6 · 4 : 2 = 13 cm². Igaz-e?" };
    const repaired = await buildLessonExperience(lesson, [], { previous: dirty, previousSections: lesson.sections,
      call: async (_s, user) => { prompts.push(user); return { methods: [], tasks: [], quiz: [prompts.length === 1 ? wrong : { ...structuredClone(victim), question: PRACTICAL }], glossary: [] }; } });
    assert.equal(prompts.length, 2, "a számítási hiba javítókört kapott");
    assert.equal(repaired.quiz.find(q => q.id === victim.id)?.question, PRACTICAL);
  } finally {
    if (prev === undefined) delete process.env.STUDIO_PRACTICE_QUOTA; else process.env.STUDIO_PRACTICE_QUOTA = prev;
  }
});

// P7B-TANITAS-MEGORZES: a csak-bank javítás (keepLegacy) a régi, hibátlan csomagot — bekapcsolt nyitómesénél is — érintetlenül hagyja.
async function withOpener<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.STUDIO_LESSON_OPENER;
  process.env.STUDIO_LESSON_OPENER = "on";
  try { return await fn(); } finally { if (prev === undefined) delete process.env.STUDIO_LESSON_OPENER; else process.env.STUDIO_LESSON_OPENER = prev; }
}
async function legacyFirst() {
  const { lesson, packets } = twoSectionLesson();
  let calls = 0;
  // A nyitómese ELŐTT gyártott bank (a kapcsoló ki): a bankterv egységein nincs `opener`.
  const first = await buildLessonExperience(lesson, [], { memory: "M", call: async () => structuredClone(packets[calls++ % 2]) });
  return { lesson, packets, first };
}

test("P7B: bekapcsolt nyitómesénél a keepLegacy a hibátlan régi bankot modellhívás nélkül, azonosítóival veszi át", async () => {
  const { lesson, packets, first } = await legacyFirst();
  let calls = 0;
  const kept = await withOpener(() => buildLessonExperience(lesson, [], { previous: first, previousSections: lesson.sections, keepLegacy: true, call: async () => { calls++; return structuredClone(packets[0]); } }));
  assert.equal(calls, 0, "nincs modellhívás");
  assert.deepEqual(kept.quiz, first.quiz);
  assert.deepEqual(kept.tasks, first.tasks);
  let control = 0;
  await withOpener(() => buildLessonExperience(lesson, [], { previous: first, previousSections: lesson.sections, call: async () => structuredClone(packets[control++ % 2]) }));
  assert.equal(control, 2, "keepLegacy nélkül (szerzői javítás) a C döntés szerint újragyártódik");
});

test("P7B: bekapcsolt nyitómesénél a meta-hibás régi csomagban csak a kifogásolt tétel cserélődik, a másik fejezet érintetlen", async () => {
  const { lesson, first } = await legacyFirst();
  const dirty = structuredClone(first);
  const victim = dirty.quiz.find(q => q.sectionIndex === 0)!;
  victim.question = META;
  const prompts: string[] = [];
  const repaired = await withOpener(() => buildLessonExperience(lesson, [], { previous: dirty, previousSections: lesson.sections, keepLegacy: true,
    call: async (_s, user) => { prompts.push(user); return { methods: [], tasks: [], quiz: [{ ...structuredClone(victim), question: PRACTICAL }], glossary: [] }; } }));
  assert.equal(prompts.length, 1, "egy célzott hívás");
  assert.equal(repaired.quiz.find(q => q.id === victim.id)?.question, PRACTICAL);
  assert.deepEqual(repaired.quiz.filter(q => q.id !== victim.id), first.quiz.filter(q => q.id !== victim.id), "a többi kvíztétel és azonosító változatlan");
  assert.deepEqual(repaired.tasks, first.tasks);
});

test("P7B: sémán bukó (érvénytelen kulcsú) régi csomag újragyártódik, de keepLegacy mellett a MÁSIK fejezet bankja érintetlen", async () => {
  const { lesson, packets, first } = await legacyFirst();
  const dirty = structuredClone(first);
  const [a, b] = dirty.quiz.filter(q => q.sectionIndex === 0);
  a.question = META;
  b.correctIndex = b.options.length + 3;
  let calls = 0;
  const repaired = await withOpener(() => buildLessonExperience(lesson, [], { previous: dirty, previousSections: lesson.sections, keepLegacy: true,
    call: async () => { calls++; return structuredClone(packets[0]); } }));
  assert.equal(calls, 1, "csak a hibás fejezet csomagja gyártódik újra (a sémán bukó csomag nem célzott alap)");
  assert.deepEqual(inSection(repaired.quiz, 1), inSection(first.quiz, 1), "a másik fejezet kvíztételei és azonosítói változatlanok");
  assert.deepEqual(inSection(repaired.tasks, 1), inSection(first.tasks, 1));
});

test("review #645: az átvett régi csomag egysége a SAJÁT (hiányzó) nyitómese-jelölőjét tartja — a következő szerzői javítás újragyártja", async () => {
  const { lesson, packets, first } = await legacyFirst();
  const kept = await withOpener(() => buildLessonExperience(lesson, [], { previous: first, previousSections: lesson.sections, keepLegacy: true, call: async () => structuredClone(packets[0]) }));
  assert.ok(kept.bankPlan!.units.every(u => u.opener === undefined), "nincs aktuális opener-jelölő az átvett egységen");
  let author = 0;
  await withOpener(() => buildLessonExperience(lesson, [], { previous: kept, previousSections: lesson.sections, call: async () => structuredClone(packets[author++ % 2]) }));
  assert.equal(author, 2, "a szerzői javítás (C döntés) a régi szerződésű bankot újragyártja");
});

test("review #645: örökölt eltérés mellett is lefut a válaszkulcs-kapu a célzottan cserélt feladaton", async () => {
  const { lesson, first } = await legacyFirst();
  const dirty = structuredClone(first);
  const victim = dirty.tasks.find(t => t.sectionIndex === 0)!;
  victim.q = "Hány pontot ér a feladatlapon a 2. feladat, és milyen feladattípus?";
  const keyed: string[] = [];
  await withOpener(() => buildLessonExperience(lesson, [], { previous: dirty, previousSections: lesson.sections, keepLegacy: true,
    answerKeys: async (tasks) => { keyed.push(...tasks.map(t => t.id)); return new Map(); },
    call: async () => ({ methods: [], tasks: [{ ...structuredClone(first.tasks.find(t => t.id === victim.id)!) }], quiz: [], glossary: [] }) }));
  assert.ok(keyed.includes(victim.id), "a cserélt feladat a válaszkulcs-kapun átment");
});

