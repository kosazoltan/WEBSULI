import test from "node:test";
import assert from "node:assert/strict";
import { bankPacketContract, experienceQuizSchema, QUIZ_FORMATS, quizDuplicateKey, quizFormatProblems } from "../shared/lesson-experience";
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
  // Kapulánc-javítás (V4): a format csak BE mellett része a szolgáltatói sémának — KI-ben a kérés bájtra a régi.
  const schema = strictPacketSchema({ methodMin: 0, taskCount: 0, taskTarget: 0, taskMax: 0, quizCount: 1, quizTarget: 1, quizMax: 1, language: false, quizFormats: true });
  const quizItem = { id: "q1", sectionIndex: 0, coversConceptIds: ["c1"], question: "Mennyi 2 + 3?", options: ["5", "6", "4"], correctIndex: 0, feedbackPerOption: ["a", "b", "c"], intent: "recall" };
  const strictQuiz = schema.shape.quiz.element;
  assert.equal(strictQuiz.safeParse({ ...quizItem, format: "number" }).success, true);
  assert.equal(strictQuiz.safeParse(quizItem).success, false, "a strict séma a mezőt kéri");
  const kiQuiz = strictPacketSchema({ methodMin: 0, taskCount: 0, taskTarget: 0, taskMax: 0, quizCount: 1, quizTarget: 1, quizMax: 1, language: false }).shape.quiz.element;
  assert.equal(kiQuiz.safeParse(quizItem).success, true, "KI: a régi séma (format nélkül)");
});

test("review #603: a számolós opció tört, vegyes tört és tagolt egész is lehet (mértékegységgel is)", () => {
  for (const options of [["1/2", "1/3", "2/3"], ["1/2 kg", "1/4 kg", "3/4 kg"], ["1 000", "10 000", "100"], ["2 1/2", "1 1/2", "3"], ["−3,5 °C", "3,5 °C", "0 °C"], ["5 km/h", "10 km/h", "15 km/h"]]) {
    const r = experienceQuizSchema.safeParse({ ...base, format: "number", options, question: "Mennyi?" });
    assert.equal(r.success, true, `${options.join(" | ")}: ${r.success ? "" : r.error.issues.map(i => i.message).join("; ")}`);
  }
  for (const options of [["fél", "harmad", "negyed"], ["kg", "g", "t"]]) {
    assert.equal(experienceQuizSchema.safeParse({ ...base, format: "number", options, question: "Mennyi?" }).success, false, options.join(" | "));
  }
});

test("review #603: a kakukktojás-kérdés kulcsa az opciókészlettel együtt (eltérő készlet nem ismétlődés; azonos készlet átrendezve igen)", () => {
  const q = (options: string[]) => ({ question: "Melyik nem illik a sorba?", options });
  assert.notEqual(quizDuplicateKey(q(["alma", "körte", "szilva", "répa"])), quizDuplicateKey(q(["kutya", "macska", "ló", "asztal"])));
  assert.equal(quizDuplicateKey(q(["alma", "körte", "szilva", "répa"])), quizDuplicateKey(q(["répa", "szilva", "körte", "alma"])));
  const odd = (question: string, options: string[]) => ({ question, options, format: "oddOneOut" });
  assert.notEqual(quizDuplicateKey(odd("Melyik a kakukktojás?", ["1", "3", "5", "6"])), quizDuplicateKey(odd("Melyik a kakukktojás?", ["2", "4", "7", "8"])));
});
