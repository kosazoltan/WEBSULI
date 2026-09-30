import test from "node:test";
import assert from "node:assert/strict";
import { experiencePacketSchema, gateQuestionProblems, hasFigureReference, questionKey } from "../shared/lesson-experience";
import { lessonSchema } from "../shared/lesson-schema";
import { buildLessonExperience, type ExperienceCheckpoint } from "../server/studio/experience-builder";
import { openBankFindingFlags } from "../server/studio/step-runner";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* Spec 2026-09-30-utasitasrendszer-rendbetetel (U2a): H19, H35, H44, H52 determinisztikus része. */

test("H44: egy közös kérdés-kulcs — a műveleti jel számít, a szóköz és az írásjel nem", () => {
  assert.notEqual(questionKey("Mennyi 8 : 2?"), questionKey("Mennyi 8 · 2?"));
  assert.notEqual(questionKey("Mennyi 15 + 4?"), questionKey("Mennyi 15 · 4?"));
  assert.equal(questionKey("Mennyi 8:2?"), questionKey("Mennyi 8 : 2 ?"));
  assert.equal(questionKey("8 × 2"), questionKey("8 · 2"));
  assert.equal(questionKey("Mi a Nílus?"), questionKey("mi a nílus"));
  assert.deepEqual(gateQuestionProblems([{ kind: "gate", prompt: "Mennyi 8 : 2?" }, { kind: "gate", prompt: "Mennyi 8 · 2?" }]), []);
  assert.equal(gateQuestionProblems([{ kind: "gate", prompt: "Mennyi 8 : 2?" }, { kind: "gate", prompt: "Mennyi 8:2 ?" }]).length, 1);
  const e = standardFusionFixture().experience!;
  const dup = { ...e, quiz: e.quiz.map((q, i) => (i === 1 ? { ...q, question: `${e.quiz[0].question} ` } : q)) };
  assert.match(JSON.stringify(experiencePacketSchema.safeParse(dup)), /Ismétlődő kérdés/);
  const opDiff = { ...e, quiz: e.quiz.map((q, i) => (i === 0 ? { ...q, question: "Mennyi 8 : 2?" } : i === 1 ? { ...q, question: "Mennyi 8 · 2?" } : q)) };
  assert.doesNotMatch(JSON.stringify(experiencePacketSchema.safeParse(opDiff).success ? {} : experiencePacketSchema.safeParse(opDiff)), /Ismétlődő kérdés/);
});

test("ábra-hivatkozás felismerése: a bank csak a tanítás szövegére hivatkozhat", () => {
  for (const t of ["Nézd meg a 2. ábrát!", "Az ábrán látható folyó neve?", "Az ábra alapján számold ki", "Mit mutat az ábra?"]) assert.equal(hasFigureReference(t), true, t);
  for (const t of ["Mennyi 8 : 2?", "Az ábrázolás szó itt nem hivatkozás.", "A Nílus áradása termékeny iszapot hoz."]) assert.equal(hasFigureReference(t), false, t);
});

test("H35: a szerzői párosító (try.match) többértelmű, ha egy oldal ismétlődik", () => {
  const lesson = standardFusionFixture();
  const withMatch = (pairs: Array<{ left: string; right: string }>) => ({
    ...lesson, sections: lesson.sections.map((s, i) => (i === 0 ? { ...s, blocks: [...s.blocks, { kind: "try", tryKind: "match", spec: { pairs }, coversConceptIds: (s.blocks.find((b) => "coversConceptIds" in b) as { coversConceptIds: string[] }).coversConceptIds }] } : s)),
  });
  assert.equal(lessonSchema.safeParse(withMatch([{ left: "1/2", right: "fél" }, { left: "1/4", right: "negyed" }])).success, true);
  const ambiguous = lessonSchema.safeParse(withMatch([{ left: "1/2", right: "fél" }, { left: "2/4", right: "fél" }]));
  assert.equal(ambiguous.success, false);
  assert.match(JSON.stringify(ambiguous.success ? [] : ambiguous.error.issues), /többértelmű/);
});

test("H19: az ábra cseréje nem építi újra a bankcsomagot (a tartalom-kulcs ábra nélküli), a korábbi kapukérdések a promptban", async () => {
  const lesson = standardFusionFixture();
  const e = lesson.experience!;
  const concepts = [...new Set(e.bankPlan!.units.flatMap((u) => u.conceptIds))].map((localId) => ({ localId, term: localId, definition: `${localId} meghatározása`, quote: `${localId} idézet`, examWeight: "core" as const }));
  let calls = 0; let checkpoint: ExperienceCheckpoint | undefined; const systems: string[] = [];
  const deps = { call: async (system: string) => { calls++; systems.push(system); return { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] }; }, save: async (c: ExperienceCheckpoint) => { checkpoint = c; } };
  await buildLessonExperience(lesson, concepts, deps);
  const first = calls;
  assert.ok(first >= 1);
  assert.ok(!systems.some((s) => s.includes('"kind":"animate"')), "a bank bemenete nem tartalmaz ábrát");
  // ugyanaz a lecke, más ábra: a checkpoint találat, nincs új hívás
  const changedFigure = { ...lesson, sections: lesson.sections.map((s) => ({ ...s, blocks: s.blocks.map((b) => (b.kind === "animate" ? { ...b, caption: `${(b as { caption: string }).caption} (új ábra)` } : b)) })) };
  await buildLessonExperience(changedFigure, concepts, { ...deps, checkpoint, call: async () => { throw new Error("az ábracsere újraépítette a csomagot"); } });
  assert.equal(calls, first);
});

test("H52: a nyitott aritmetikai lelet a végleges tétel-azonosítóval jut a kapuhoz, és útvonalra oldódik", () => {
  const lesson = standardFusionFixture();
  const id = lesson.experience!.tasks[3].id;
  const flags = openBankFindingFlags(lesson, [{ sectionIndex: 0, itemId: id, message: `${id}: hibás számítás a mintában: 40 − 18 + 4 = 22 (helyesen: 26)` }, { sectionIndex: 0, itemId: "t-nincs-ilyen-0", message: "x" }]);
  assert.deepEqual(flags.map((f) => [f.path, f.origin]), [["experience.tasks[3]", "arithmetic"]]);
  assert.match(flags[0].message, /nyitott aritmetikai lelet/);
  assert.deepEqual(openBankFindingFlags(lesson, undefined), []);
});

test("review #160 (H35 korpusz-eset): az értékazonos számoldal (1/2, 2/4, 3/6) is többértelmű párosító", () => {
  const lesson = standardFusionFixture();
  const withMatch = (pairs: Array<{ left: string; right: string }>) => ({
    ...lesson, sections: lesson.sections.map((s, i) => (i === 0 ? { ...s, blocks: [...s.blocks, { kind: "try", tryKind: "match", spec: { pairs }, coversConceptIds: (s.blocks.find((b) => "coversConceptIds" in b) as { coversConceptIds: string[] }).coversConceptIds }] } : s)),
  });
  const numeric = lessonSchema.safeParse(withMatch([{ left: "1/2", right: "fél" }, { left: "2/4", right: "két negyed" }, { left: "3/6", right: "három hatod" }]));
  assert.equal(numeric.success, false, "job 986b7f82: 1/2, 2/4 és 3/6 három egyforma értékű bal oldal");
  assert.match(JSON.stringify(numeric.success ? [] : numeric.error.issues), /többértelmű/);
  assert.equal(lessonSchema.safeParse(withMatch([{ left: "1/2", right: "0,5" }, { left: "1/4", right: "0,25" }])).success, true, "különböző értékek rendben");
});

test("review #160: az ábra-hivatkozás a kvíz magyarázatában és a módszer megoldásában/lépéseiben is javító kört indít", async () => {
  const lesson = standardFusionFixture(), e = lesson.experience!;
  const bad = { methods: e.methods.map((m, i) => (i === 0 ? { ...m, answer: `${m.answer} Lásd az ábrán.` } : m)), tasks: e.tasks, quiz: e.quiz.map((q, i) => (i === 0 ? { ...q, feedbackPerOption: q.feedbackPerOption.map((f, k) => (k === 0 ? `${f} Nézd meg a 2. ábrát!` : f)) } : q)), glossary: [] };
  const users: string[] = [];
  await buildLessonExperience(lesson, [], { call: async (_s, user) => { users.push(user); return users.length === 1 ? bad : { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] }; } });
  assert.equal(users.length, 2);
  assert.match(users[1], /a kvíz ábrára hivatkozik/);
  assert.match(users[1], /a módszer ábrára hivatkozik/);
});
