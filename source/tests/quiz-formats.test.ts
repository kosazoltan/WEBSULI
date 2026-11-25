import test from "node:test";
import assert from "node:assert/strict";
import { bankPacketContract, experienceQuizSchema, QUIZ_FORMATS, quizFormatProblems } from "../shared/lesson-experience";
import { gradeQuiz } from "../shared/lesson-result-email";
import { strictPacketSchema } from "../server/studio/bank-schema";

/** V4 (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): kvízkérdés-típusok keverése. */
const bind = { id: "q1", sectionIndex: 0, coversConceptIds: ["c1"] };
const base = { ...bind, question: "Mennyi 2 + 3?", options: ["5", "6", "4"], correctIndex: 0, feedbackPerOption: ["Jó.", "Nem.", "Nem."] };

test("a négy típus; hiányzó format = choice (régi bank érvényes)", () => {
  assert.deepEqual([...QUIZ_FORMATS], ["choice", "fillGap", "oddOneOut", "number"]);
  assert.equal(experienceQuizSchema.safeParse(base).success, true);
});

test("séma típusonként: kiegészítés pontosan egy ___; kakukktojás 4 opció; számolós csak szám opció", () => {
  const ok = (q: object) => experienceQuizSchema.safeParse({ ...base, ...q }).success;
  assert.equal(ok({ format: "fillGap", question: "A háromszög területe = alap × magasság ÷ ___." }), true);
  assert.equal(ok({ format: "fillGap", question: "Nincs hiány." }), false);
  assert.equal(ok({ format: "fillGap", question: "Két ___ hiány ___." }), false);
  assert.equal(ok({ format: "oddOneOut", question: "Melyik nem illik a sorba?", options: ["alma", "körte", "szilva", "répa"], feedbackPerOption: ["a", "b", "c", "d"], correctIndex: 3 }), true);
  assert.equal(ok({ format: "oddOneOut", question: "Melyik nem illik a sorba?" }), false, "3 opció kevés");
  assert.equal(ok({ format: "number", options: ["5", "6,5", "4 cm"] }), true);
  assert.equal(ok({ format: "number", options: ["öt", "6", "4"] }), false);
});

test("keverési szabály: ≥ 6 kérdésnél legalább 2 típus; kevesebbnél nincs megkötés", () => {
  const items = (formats: Array<string | undefined>) => formats.map((format, i) => ({ id: `q${i}`, ...(format ? { format } : {}) }));
  assert.ok(quizFormatProblems(items([undefined, "choice", undefined, "choice", undefined, "choice"])).length > 0);
  assert.deepEqual(quizFormatProblems(items([undefined, "fillGap", undefined, "choice", undefined, "choice"])), []);
  assert.deepEqual(quizFormatProblems(items([undefined, undefined, undefined])), []);
});

test("a pontozás index-alapú, típustól független", () => {
  const quiz = [{ ...base, format: "number" as const }, { ...base, id: "q2", format: "fillGap" as const, question: "2 + 3 = ___" }];
  const g = gradeQuiz(quiz, { q1: 0, q2: 1 });
  assert.equal(g.rows[0].ok, true);
  assert.equal(g.rows[1].ok, false);
});

test("a szerződés a típusokat és a keverést kéri (változatosság BE); a szigorú csomagséma a format mezőt kéri", () => {
  const c = bankPacketContract({ sectionIndex: 0, conceptIds: ["c1"], methodKinds: ["gate"], taskCount: 1, taskTarget: 1, quizCount: 6, quizTarget: 6, quizFormats: true });
  assert.match(c, /fillGap/);
  assert.match(c, /oddOneOut/);
  assert.match(c, /legalább 2 különböző/);
  assert.doesNotMatch(bankPacketContract({ sectionIndex: 0, conceptIds: ["c1"], methodKinds: ["gate"], taskCount: 1, taskTarget: 1, quizCount: 6, quizTarget: 6 }), /oddOneOut/);
  const schema = strictPacketSchema({ methodMin: 0, taskCount: 0, taskTarget: 0, taskMax: 0, quizCount: 1, quizTarget: 1, quizMax: 1, language: false });
  const quizItem = { id: "q1", sectionIndex: 0, coversConceptIds: ["c1"], question: "Mennyi 2 + 3?", options: ["5", "6", "4"], correctIndex: 0, feedbackPerOption: ["a", "b", "c"], intent: "recall" };
  assert.equal(schema.safeParse({ methods: [], tasks: [], quiz: [{ ...quizItem, format: "number" }], glossary: [] }).success, true);
  assert.equal(schema.safeParse({ methods: [], tasks: [], quiz: [quizItem], glossary: [] }).success, false, "a strict séma a mezőt kéri");
});
