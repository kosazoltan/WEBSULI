import { test } from "node:test";
import assert from "node:assert/strict";
import { fusionFixture, compactFusionFixture } from "../shared/fixtures/lesson-fusion";
import { experienceSchema, experienceTheme } from "../shared/lesson-experience";
import { evaluateOpenAnswer, missingAnswerConcepts, normalizeAnswer, sampleIds, sampleTaskIds, scoreSummary } from "../shared/lesson-experience-score";
import { experienceProblems } from "../shared/lesson-experience-validation";
import { lessonSchema } from "../shared/lesson-schema";
import { applyBankPacketRepair, buildLessonExperience, resolveBankReview, type ExperienceCheckpoint } from "../server/studio/experience-builder";
import { exportQuizItemsFromChecks } from "../server/studio/quiz-export";
import { planLessonBank } from "../shared/lesson-bank-plan";

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
test("builder uses one coverage packet for a small source, retains evidence and resumes without paid repeats", async () => {
  const lesson = compactFusionFixture(); const e = lesson.experience!;
  let calls = 0; let checkpoint: ExperienceCheckpoint | undefined;
  const parts = [{ methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] }];
  const concepts = [{ localId: "area", term: "Terület", definition: "A szorzat fele", quote: "T = a · m / 2", examWeight: "core" as const }];
  const actual = await buildLessonExperience(lesson, concepts, { call: async (system) => { assert.ok(system.includes(concepts[0].quote)); assert.ok(system.includes(concepts[0].definition)); return parts[calls++]; }, save: async cp => { checkpoint = structuredClone(cp); } });
  assert.equal(calls, 1); assert.equal(actual.tasks.length, 2);
  assert.equal(actual.quiz.length, 2); assert.equal(actual.quiz[1].options.length, 4);
  await buildLessonExperience(lesson, concepts, { checkpoint, call: async () => { throw new Error("cache miss"); } });
  const reused = await buildLessonExperience(lesson, concepts, { previous: actual, call: async () => { throw new Error("unchanged packet rewritten"); } });
  assert.deepEqual(reused.quiz, actual.quiz);
});

test("compact bank enforces every taught concept, intent, oral/written mode and valid four-choice index", () => {
  const lesson = compactFusionFixture();
  assert.deepEqual(experienceProblems(lesson), []);
  const missingIntent = structuredClone(lesson.experience!); missingIntent.quiz[1].intent = "recall";
  assert.equal(experienceSchema.safeParse(missingIntent).success, false);
  const missingOral = structuredClone(lesson.experience!); missingOral.tasks[0].mode = "written";
  assert.equal(experienceSchema.safeParse(missingOral).success, false);
  const invalidIndex = structuredClone(lesson.experience!); invalidIndex.quiz[0].correctIndex = 3;
  assert.equal(experienceSchema.safeParse(invalidIndex).success, false);
  const incompletePlan = structuredClone(lesson); incompletePlan.sections[0].blocks.push({ kind: "explain", text: "A kerület az oldalak összege.", depth: "core", readAloud: false, coversConceptIds: ["perimeter"] });
  assert.match(experienceProblems(incompletePlan).join(" "), /összes fogalmat/);
});
test("bad bank gets a targeted retry then fails closed", async () => {
  let calls = 0;
  await assert.rejects(buildLessonExperience(fusionFixture(), [], { call: async (_system, user) => { if (++calls === 2) assert.match(user, /előző válasz hibái/); return {}; } }), /javító kör után/);
  assert.equal(calls, 2);
});

test("one repaired task preserves every previously generated method, task and quiz", async () => {
  const lesson = compactFusionFixture(), e = lesson.experience!;
  const first = { methods: e.methods, tasks: structuredClone(e.tasks), quiz: e.quiz, glossary: [] };
  // Production failure: one sample needed a rubric repair, the model returned only that task.
  first.tasks[0].sample = "Az alap és a magasság szorzata.";
  let calls = 0;
  const result = await buildLessonExperience(lesson, [], { call: async (_system, user) => {
    if (++calls === 1) return first;
    assert.match(user, /JAVÍTÁSI MÓD/);
    assert.match(user, /mintaválasz nem teljes pont/);
    return { methods: [], tasks: [e.tasks[0]], quiz: [], glossary: [] };
  } });
  assert.equal(calls, 2);
  assert.deepEqual(result.methods.map(m => m.prompt), e.methods.map(m => m.prompt));
  assert.deepEqual(result.tasks.map(t => t.q), e.tasks.map(t => t.q));
  assert.deepEqual(result.quiz.map(q => q.question), e.quiz.map(q => q.question));
  assert.deepEqual(experienceProblems(lesson, result), []);
});

test("bank patch rejects unknown/duplicate IDs, keeps absent banks and does not mutate the base", () => {
  const e = compactFusionFixture().experience!;
  const original = { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: e.glossary };
  const before = structuredClone(original);
  const replacement = { ...e.tasks[0], q: "Új, pontosított kérdés" };
  const merged = applyBankPacketRepair(original, { tasks: [replacement] });
  assert.equal(merged.tasks[0].q, replacement.q);
  assert.deepEqual(merged.methods, original.methods); assert.deepEqual(merged.quiz, original.quiz);
  assert.deepEqual(merged.glossary, original.glossary); assert.deepEqual(original, before);
  assert.throws(() => applyBankPacketRepair(original, { tasks: [{ ...replacement, id: "unknown" }] }), /létező/);
  assert.throws(() => applyBankPacketRepair(original, { tasks: [replacement, replacement] }), /egyedi/);
});

test("language task repair preserves the taught glossary when the repair sends an empty list", async () => {
  const lesson = compactFusionFixture(), e = lesson.experience!;
  lesson.subject = "angol";
  const glossary = [{ word: "water", translation: "víz", partOfSpeech: "főnév", example: "Plants need water.", exampleTranslation: "A növényeknek vízre van szükségük." }];
  const tasks = structuredClone(e.tasks); tasks[0].sample = "Az alap és a magasság szorzata.";
  let calls = 0;
  const result = await buildLessonExperience(lesson, [], { call: async () => ++calls === 1
    ? { methods: e.methods, tasks, quiz: e.quiz, glossary }
    : { methods: [], tasks: [e.tasks[0]], quiz: [], glossary: [] } });
  assert.equal(calls, 2); assert.equal(result.language, "en-GB");
  assert.deepEqual(result.glossary.map(({ sourceHash: _hash, ...entry }) => entry), glossary);
  const revised = [{ ...glossary[0], translation: "a víz" }];
  assert.deepEqual(applyBankPacketRepair({ methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary }, { glossary: revised }).glossary, revised);
});

test("a complete sentence needs no off-rubric filler and adding bonus terms cannot reduce its score", () => {
  const task = { ...fusionFixture().experience!.tasks[0], required: [["takarólevelek"], ["porzót", "porzó"], ["termőt", "termő"], ["védik", "védi"]],
    bonus: [["kívülről", "kívül"]], minWords: 4, needsSentence: true,
    sample: "A takarólevelek kívülről védik a porzót és a termőt." };
  assert.deepEqual(missingAnswerConcepts(task.sample, task), []);
  assert.equal(evaluateOpenAnswer(task.sample, { ...task, bonus: [] }).score, 1);
  assert.equal(evaluateOpenAnswer(task.sample, task).score, 1);
  assert.equal(evaluateOpenAnswer("A porzót és a termőt kívülről védik a takarólevelek.", task).score, 1);
  assert.equal(evaluateOpenAnswer("takarólevelek porzót termőt védik kívülről", task).score, 0.5);
  assert.equal(evaluateOpenAnswer("A takarólevelek a porzót védik.", task).score, 0.5);
  assert.equal(evaluateOpenAnswer("A takarólevelek nem védik a porzót és a termőt.", task).score, 0.5);
  assert.equal(evaluateOpenAnswer("", task).score, 0);
});

test("rubric repair preserves every required group and base form, including reordered overlapping groups", () => {
  const e = compactFusionFixture().experience!;
  const task = { ...e.tasks[0], required: [["gyökér"], ["mag"]] };
  const original = { methods: e.methods, tasks: [task], quiz: e.quiz, glossary: [] };
  for (const required of [[["gyökér"]], [["gyökér"], ["magra"]], [["gyökér", "mag", "magra"]]]) {
    assert.throws(() => applyBankPacketRepair(original, { tasks: [{ ...task, required }] }), /kötelező csoport/);
  }
  const required = [["mag", "magra"], ["gyökér", "gyökérre"]];
  assert.deepEqual(applyBankPacketRepair(original, { tasks: [{ ...task, required }] }).tasks[0].required, required);
  const overlapping = { ...task, required: [["víz"], ["víz", "vízre"]] };
  const swapped = [["víz", "vízre", "vízből"], ["víz"]];
  assert.deepEqual(applyBankPacketRepair({ ...original, tasks: [overlapping] }, { tasks: [{ ...overlapping, required: swapped }] }).tasks[0].required, swapped);
});

test("rubric repair names the exact missing short-word group and preserves the grading rule", async () => {
  const lesson = compactFusionFixture(), e = lesson.experience!;
  const task = { ...e.tasks[0], required: [["gyökér"], ["mag"]], bonus: [], minWords: 2, needsSentence: false,
    sample: "A növény gyökérre és magra tagolódik." };
  assert.equal(evaluateOpenAnswer(task.sample, task).score, 0.5);
  assert.deepEqual(missingAnswerConcepts(task.sample, task), [["mag"]]);
  assert.deepEqual(missingAnswerConcepts("GYÖKÉR és MAG", task), []);
  const corrected = { ...task, required: [["gyökér"], ["mag", "magra"]] };
  let calls = 0;
  const result = await buildLessonExperience(lesson, [], { call: async (_system, user) => {
    if (++calls === 1) return { methods: e.methods, tasks: [task, ...e.tasks.slice(1)], quiz: e.quiz, glossary: [] };
    assert.match(user, /fel nem ismert kötelező szinonimacsoportok: \[\["mag"\]\]/);
    assert.match(user, /ne töröld a hiányzó fogalmat/);
    return { tasks: [corrected] };
  } });
  assert.equal(calls, 2); assert.equal(evaluateOpenAnswer(task.sample, result.tasks[0]).score, 1);
  assert.equal(evaluateOpenAnswer("gyökér", result.tasks[0]).score, 0);
  assert.equal(evaluateOpenAnswer(task.sample, task).score, 0.5);
  assert.deepEqual(experienceProblems(lesson, result), []);
});

test("a partial repair still fails closed on invalid concept, answer or unchanged sample", async () => {
  const lesson = compactFusionFixture(), e = lesson.experience!;
  for (const repair of [
    { tasks: [] },
    { tasks: [{ ...e.tasks[0], coversConceptIds: ["unknown"] }] },
    { tasks: [e.tasks[0]], quiz: [{ ...e.quiz[0], correctIndex: 9 }] },
  ]) {
    let calls = 0, saves = 0;
    const tasks = structuredClone(e.tasks); tasks[0].sample = "Az alap és a magasság szorzata.";
    await assert.rejects(buildLessonExperience(lesson, [], {
      call: async () => ++calls === 1 ? { methods: e.methods, tasks, quiz: e.quiz, glossary: [] } : repair,
      save: async () => { saves++; },
    }), /javító kör után/);
    assert.equal(calls, 2); assert.equal(saves, 0);
  }
});

test("incomplete first packet requires a full replacement with actual counts in retry", async () => {
  const lesson = compactFusionFixture(), e = lesson.experience!;
  let calls = 0;
  const result = await buildLessonExperience(lesson, [], { call: async (_system, user) => {
    if (++calls === 1) return { methods: [], tasks: [], quiz: [], glossary: [] };
    assert.match(user, /methods=0, tasks=0, quiz=0/); assert.match(user, /TELJES csomagot/);
    assert.doesNotMatch(user, /JAVÍTÁSI MÓD/);
    return { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] };
  } });
  assert.equal(calls, 2); assert.deepEqual(experienceProblems(lesson, result), []);
});

test("programming classroom zero uses the older learner round rather than the first-grade limit", () => {
  const lesson = compactFusionFixture();
  const explain = lesson.sections[0].blocks.find(b => b.kind === "explain")!;
  if (explain.kind === "explain") explain.coversConceptIds = ["a", "b", "c", "d", "e", "f"];
  const early = planLessonBank({ ...lesson, classroom: 2 });
  const programming = planLessonBank({ ...lesson, classroom: 0 });
  assert.equal(early.taskRound, 3); assert.equal(early.quizRound, 5);
  assert.equal(programming.taskRound, 5); assert.equal(programming.quizRound, 10);
});

test("repair regenerates only the changed section and preserves other packet IDs", async () => {
  const lesson = compactFusionFixture();
  const second = structuredClone(lesson.sections[0]); second.heading = "Második összefüggés";
  second.blocks.forEach(b => { if ("coversConceptIds" in b) b.coversConceptIds = ["height"]; });
  lesson.sections.push(second);
  const packets = [0, 1].map(sectionIndex => {
    const e = structuredClone(compactFusionFixture().experience!);
    for (const i of [...e.methods, ...e.tasks, ...e.quiz]) { i.sectionIndex = sectionIndex; i.coversConceptIds = [sectionIndex ? "height" : "area"]; }
    if (sectionIndex) { e.tasks.forEach(t => { t.q = `Második fejezet: ${t.q}`; }); e.quiz.forEach(q => { q.question = `Második fejezet: ${q.question}`; }); }
    return { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] };
  });
  let calls = 0;
  const first = await buildLessonExperience(lesson, [], { call: async () => structuredClone(packets[calls++]) });
  assert.equal(calls, 2);
  const changed = structuredClone(lesson); changed.sections[1].heading = "Javított második összefüggés";
  calls = 0;
  const repaired = await buildLessonExperience(changed, [], { previous: first, call: async () => { calls++; return structuredClone(packets[1]); } });
  assert.equal(calls, 1);
  assert.deepEqual(repaired.quiz.filter(q => q.sectionIndex === 0), first.quiz.filter(q => q.sectionIndex === 0));
  assert.notEqual(repaired.quiz.find(q => q.sectionIndex === 1)!.id, first.quiz.find(q => q.sectionIndex === 1)!.id);
});

test("reviewed bank indices resolve before rewriting; unknown targets are global and admin-only notes excluded", () => {
  const lesson = compactFusionFixture();
  const feedback = resolveBankReview(lesson, [
    { kind: "language", blockPath: "experience.tasks.0.sample", message: "Javítsd a mondat alanyát." },
    { kind: "source_conflict", blockPath: "experience.quiz[1]", message: "Téves megoldás." },
    { kind: "language", blockPath: "experience.tasks.999", message: "Hibás hivatkozás." },
    { kind: "age", message: "Túl nehéz megfogalmazás." },
    { kind: "language", blockPath: "sections.0.blocks.1", message: "Tanítási hiba." },
    { kind: "source_conflict", subkind: "book_probably_wrong", blockPath: "experience.tasks.0", message: "Csak az adminnak." },
  ]);
  assert.equal(feedback.length, 4);
  assert.deepEqual(feedback[0].conceptIds, ["area"]);
  assert.deepEqual(feedback[1].previousItem, lesson.experience!.quiz[1]);
  assert.equal(feedback[2].conceptIds, undefined); assert.equal(feedback[3].conceptIds, undefined);
});

test("short sample repair receives actual and required word counts without lowering the threshold", async () => {
  const lesson = compactFusionFixture(), e = lesson.experience!;
  const short = { ...e.tasks[0], sample: "Az alap és a magasság szorzatának fele.", minWords: 10 };
  let calls = 0;
  const result = await buildLessonExperience(lesson, [], { call: async (_system, user) => {
    if (++calls === 1) return { methods: e.methods, tasks: [short, e.tasks[1]], quiz: e.quiz, glossary: [] };
    assert.match(user, /A minta szószáma: 7; minWords: 10/);
    return { tasks: [{ ...short, sample: "A háromszög területe az alap és a hozzá tartozó magasság szorzatának fele." }] };
  } });
  assert.equal(calls, 2); assert.equal(result.tasks[0].minWords, 10);
  assert.equal(evaluateOpenAnswer(result.tasks[0].sample, result.tasks[0]).score, 1);
});

test("bank review invalidates only its packet, resumes the repair and never revives the rejected base", async () => {
  const lesson = compactFusionFixture();
  const second = structuredClone(lesson.sections[0]); second.heading = "Második összefüggés";
  second.blocks.forEach(b => { if ("coversConceptIds" in b) b.coversConceptIds = ["height"]; });
  lesson.sections.push(second);
  const packets = [0, 1].map(sectionIndex => {
    const e = structuredClone(compactFusionFixture().experience!);
    for (const i of [...e.methods, ...e.tasks, ...e.quiz]) { i.sectionIndex = sectionIndex; i.coversConceptIds = [sectionIndex ? "height" : "area"]; }
    if (sectionIndex) { e.tasks.forEach(t => { t.q = `Második fejezet: ${t.q}`; }); e.quiz.forEach(q => { q.question = `Második fejezet: ${q.question}`; }); }
    return { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] };
  });
  let calls = 0, checkpoint: ExperienceCheckpoint | undefined;
  const save = async (cp: ExperienceCheckpoint) => { checkpoint = structuredClone(cp); };
  const first = await buildLessonExperience(lesson, [], { call: async () => structuredClone(packets[calls++]), save });
  lesson.experience = first;
  const reviewFeedback = resolveBankReview(lesson, [{ kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.tasks.2", message: "A kérdés több példát enged, a rubrika csak egyet fogad el." }]);
  calls = 0;
  const repaired = await buildLessonExperience(lesson, [], { checkpoint, reviewFeedback, save, call: async (system, user) => {
    calls++; assert.match(system, /rubrika csak egyet fogad el/); assert.match(system, /previousItem/); assert.match(user, /LEKTORI JAVÍTÁS/);
    return { tasks: [{ ...first.tasks[2], q: "Pontosított második kérdés a területről" }] };
  } });
  assert.equal(calls, 1);
  assert.deepEqual(repaired.quiz.filter(q => q.sectionIndex === 0), first.quiz.filter(q => q.sectionIndex === 0));
  assert.notEqual(repaired.tasks[2].q, first.tasks[2].q);
  const neverCall = async () => { throw new Error("A javított csomag már elkészült."); };
  assert.deepEqual(await buildLessonExperience(lesson, [], { checkpoint, reviewFeedback, call: neverCall }), repaired);
  assert.deepEqual(await buildLessonExperience(lesson, [], { checkpoint, call: neverCall }), repaired);
  const nextFeedback = resolveBankReview({ ...lesson, experience: repaired }, [{ kind: "language", blockPath: "experience.tasks.3", message: "A másik feladat nyelvi javítása." }]);
  const next = await buildLessonExperience(lesson, [], { checkpoint, reviewFeedback: nextFeedback, save, call: async () => ({ tasks: [{ ...repaired.tasks[3], q: "Másik feladat, pontosított megfogalmazással" }] }) });
  assert.equal(next.tasks[2].q, repaired.tasks[2].q, "korábbi lektori javítás a következő célzott javításban is megmarad");
  assert.equal(next.tasks[3].q, "Másik feladat, pontosított megfogalmazással");
  assert.deepEqual(await buildLessonExperience(lesson, [], { checkpoint, call: neverCall }), next);
  calls = 0;
  await buildLessonExperience(lesson, [], { checkpoint, reviewFeedback: [{ ...reviewFeedback[0], conceptIds: ["removed"] }], call: async system => {
    assert.match(system, /rubrika csak egyet fogad el/); return structuredClone(packets[calls++]);
  } });
  assert.equal(calls, 2, "feloldhatatlan fogalomhivatkozás nem veszhet el");
});

test("content review may fix the criticized rubric but cannot rewrite unrelated items or glossary", () => {
  const e = compactFusionFixture().experience!;
  const allowed = new Set([e.tasks[0].id]);
  const corrected = { ...e.tasks[0], q: "Egyértelmű kérdés", required: [["helyes"]] };
  assert.deepEqual(applyBankPacketRepair(e, { tasks: [corrected] }, allowed).tasks[0], corrected);
  assert.throws(() => applyBankPacketRepair(e, { tasks: [{ ...e.tasks[1], q: "Nem kért átírás" }] }, allowed), /nem érintett/);
  assert.throws(() => applyBankPacketRepair(e, { glossary: [{ word: "a", translation: "egy", partOfSpeech: "névelő", example: "A cat", exampleTranslation: "Egy macska" }] }, allowed), /szószedet/);
});
