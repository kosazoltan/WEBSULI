import assert from "node:assert/strict";
import test from "node:test";

import {
  QUESTION_BANK,
  makeRng,
  materialSubject,
  materialToQuestions,
  pickQuestion,
  type Question,
  type SchoolLevel,
} from "../client/src/lib/tornado/questions";
import type { GradeQuizItem } from "../client/src/data/gradeQuizBank/types";

/**
 * J7a — a „csak matek” módban nincs angol tétel, és az angol módban nincs matek (terv 5.7 „Javítás”, MATH_4).
 *
 * A mérés a MATH_4 (4. osztályos matek) listán indult: tartalmi vizsgálattal minden benne lévő tétel számtani;
 * az angol tételek a saját (angol) bankban vannak. A teszt mindezt a bankra ÉS a választó útvonalaira (szóbank,
 * évfolyam-bank, tananyag-sor) rögzíti, hogy egy későbbi átrendezés ne vihessen angol tételt a matek ágra.
 */

const ENGLISH_MARKERS = /magyarul|ellentéte:|___|\b(the|are|was|were|have|has)\b/i;

test("a 4. osztályos matek bank (MATH_4): 10 számtani tétel, angol nincs köztük", () => {
  const math4 = QUESTION_BANK.filter((q) => q.subject === "math" && q.grade === 4);
  assert.equal(math4.length, 10);
  for (const q of math4) {
    assert.match(q.id, /^math-4-\d+$/);
    assert.doesNotMatch(q.prompt + q.options.join(" "), ENGLISH_MARKERS, `angol tétel a matek bankban: ${q.prompt}`);
    assert.match(q.prompt + " " + q.options.join(" "), /\d/, `számjegy nélküli „matek” tétel: ${q.prompt}`);
  }
  assert.ok(math4.some((q) => q.prompt.includes("432 ÷ 8")), "a MATH_4 saját tétele megvan");
});

test("a teljes bank: minden matek tétel számtani, minden angol tétel az angol ágon, azonosító szerint is", () => {
  for (const q of QUESTION_BANK) {
    if (q.subject === "math") {
      assert.ok(q.id.startsWith("math-"), q.id);
      assert.doesNotMatch(q.prompt + q.options.join(" "), ENGLISH_MARKERS, q.prompt);
    } else {
      assert.ok(q.id.startsWith("english-"), q.id);
      assert.doesNotMatch(q.prompt, /^(Mennyi|Hány) \d/, `számtani tétel az angol bankban: ${q.prompt}`);
    }
  }
  for (const grade of [1, 2, 3, 4, 5, 6]) {
    assert.ok(QUESTION_BANK.filter((q) => q.subject === "math" && q.grade === grade).length >= 6, `${grade}. o. matek`);
    assert.ok(QUESTION_BANK.filter((q) => q.subject === "english" && q.grade === grade).length >= 6, `${grade}. o. angol`);
  }
});

const GRADE_FIXTURE: GradeQuizItem[] = [7, 9, 12].flatMap((grade) =>
  (["math", "english"] as const).flatMap((subject) =>
    [1, 2, 3].map((n): GradeQuizItem => ({
      id: `g${grade}-${subject}-00${n}`,
      grade,
      subject,
      tier: 2,
      prompt: subject === "math" ? `Mennyi ${grade} + ${n}?` : `Fixture question ${n} for grade ${grade}`,
      options: ["a", "b", "c", "d"],
      correctIndex: 1,
      explanation: "A fixture magyarázata, legalább harminc karakter hosszan.",
    })),
  ),
);

const MATERIAL_ROWS = [
  { id: "m-1", prompt: "Mennyi 6 × 7?", options: ["40", "42", "44", "46"], correctIndex: 1, topic: "Szorzás" },
  { id: "m-2", prompt: "Weather magyarul:", options: ["idő", "víz", "szél", "nap"], correctIndex: 0, topic: "Angol szavak" },
  { id: "m-3", prompt: "Wetter magyarul:", options: ["idő", "víz", "szél", "nap"], correctIndex: 0, topic: "Német – időjárás" },
  { id: "m-4", prompt: "Tempête magyarul:", options: ["vihar", "víz", "szél", "nap"], correctIndex: 0, topic: null },
  { id: "m-5", prompt: "Sunny magyarul:", options: ["napos", "víz", "szél", "nap"], correctIndex: 0, topic: "Past Simple (English)" },
];

const ENGLISH_VOCAB: Question = {
  id: "vocab:fixture:en",
  subject: "english",
  grade: 4,
  prompt: "Storm magyarul:",
  options: ["vihar", "víz", "szél", "nap"],
  correctIndex: 0,
  difficulty: 2,
  source: "bank",
};

test("tananyag-sor tárgya: nyelvi téma és szóbank-szerű kérdés az angol ágra kerül", () => {
  assert.equal(materialSubject("szorzás", "Mennyi 6 × 7?"), "math");
  assert.equal(materialSubject("angol szavak", "Weather magyarul:"), "english");
  assert.equal(materialSubject("német – időjárás", "Wetter magyarul:"), "english");
  assert.equal(materialSubject("", "Tempête magyarul:"), "english");
  assert.equal(materialSubject("ismeretlen", "Mennyi 2 + 2?"), "math", "ismeretlen téma matek marad");
  const mapped = materialToQuestions(MATERIAL_ROWS, 4);
  assert.deepEqual(mapped.map((q) => q.subject), ["math", "english", "english", "english", "english"]);
});

test("„csak matek” módban egyetlen húzás sem angol — bank, évfolyam-bank, tananyag, szóbank mellett sem", () => {
  const material = materialToQuestions(MATERIAL_ROWS, 4);
  const schools: SchoolLevel[] = ["auto", 1, 2, 3, 4, 5, 6, 7, 9, 12];
  let draws = 0;
  for (const school of schools) {
    for (const level of [1, 25, 55, 90, 125, 160, 200]) {
      for (let seed = 1; seed <= 12; seed++) {
        const rng = makeRng(seed * 7919 + level);
        for (let i = 0; i < 8; i++) {
          const q = pickQuestion({
            level,
            school,
            mode: "math",
            material,
            gradeBank: GRADE_FIXTURE,
            vocab: { next: () => ENGLISH_VOCAB },
            rng,
          });
          draws += 1;
          assert.equal(q.subject, "math", `${school}/${level}: angol tétel matek módban: ${q.id} ${q.prompt}`);
          assert.doesNotMatch(q.prompt, ENGLISH_MARKERS, q.prompt);
        }
      }
    }
  }
  assert.ok(draws > 5000);
});

test("kupon módban (tananyag, vegyes) viszont mindkét tárgy előfordul — a szűrés nem vág túl", () => {
  const material = materialToQuestions(MATERIAL_ROWS, 4);
  const subjects = new Set<string>();
  for (let seed = 1; seed <= 60; seed++) {
    const rng = makeRng(seed);
    subjects.add(pickQuestion({ level: 30, school: "auto", mode: "mixed", material, materialOnly: true, rng }).subject);
  }
  assert.deepEqual([...subjects].sort(), ["english", "math"]);
});

test("angol módban egyetlen húzás sem matek", () => {
  for (const school of ["auto", 3, 4, 6, 9] as SchoolLevel[]) {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = makeRng(seed * 31);
      const q = pickQuestion({ level: 60, school, mode: "english", gradeBank: GRADE_FIXTURE, rng });
      assert.equal(q.subject, "english", `${school}: ${q.id} ${q.prompt}`);
    }
  }
});
