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

const row = (id: string, prompt: string, topic: string | null) => ({
  id,
  prompt,
  options: ["a", "b", "c", "d"],
  correctIndex: 1,
  topic,
});

/** A valós témaformák (review #482): AI-generátor szó, kanonikus tantárgy-felirat, régi Stúdió-lecke CÍME. */
const MATERIAL_ROWS = [
  row("m-1", "Mennyi 6 × 7?", "math"),
  row("m-2", "Weather magyarul:", "english"),
  row("m-3", "Wetter magyarul:", "Német – időjárás"),
  row("m-4", "Tempête magyarul:", null),
  row("m-5", "Sunny magyarul:", "Past Simple (English)"),
];

/** Cím-témák: a tantárgy nem bizonyítható belőlük → csak vegyes / kupon módban jöhetnek. */
const TITLE_TOPICS = [
  "Present Simple", "Irregular verbs", "Colours", "My family", "latin", "orosz", "deutsch", "spanish",
  "A francia forradalom", "Német egység", "Angol polgári forradalom", "Spanyolország földrajza", "Olaszország",
  "Angola", "Valószínűség – francia kártya", "nature", "hungarian", "Természetismeret", "Magyar nyelvtan",
  "Szorzás", "Törtek", "Past Simple (English)",
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

test("tananyag-sor tárgya: csak a bizonyítható téma számít biztosnak, minden más bizonytalan", () => {
  const cases: Array<[string, string, "math" | "english", boolean]> = [
    ["math", "Mennyi 6 × 7?", "math", true],
    ["Matek – törtek", "Mennyi 1/2 + 1/4?", "math", true],
    ["matematika", "Mennyi 2 + 2?", "math", true],
    ["english", "Weather magyarul:", "english", true],
    ["Angol nyelv", "Weather magyarul:", "english", true],
    // SPEC-VÁLTOZÁS 2026-11-17 (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md „J7b döntések” 9., kanban #84 — a review
    // két maradék hamis pozitívja): az „X magyarul:” kérdés-alak nem bizonyít angolt (a „Hund magyarul:” német), és a
    // matek-előtag mellett más tantárgy szava bizonytalan. A szigor nő: kevesebb tétel számít biztosnak; a tantárgyat a szerver adja.
    ["", "Tempête magyarul:", "math", false],
    ["", "Hund magyarul:", "math", false],
    ["matek: angol számnevek", "Hogy mondod angolul: 7?", "math", false],
    // Review (vercel): kifejezett matek témát a kérdés szövege nem ír át.
    ["math", "Mi a 7 ellentéte: 7 vagy -7?", "math", true],
    ["math", "Hogy mondod magyarul: 3 × 4 = ?", "math", true],
    // Bizonytalan (K1): se matek-, se angol-bizonyíték.
    ["", "Mi a 7 ellentéte: 7 vagy -7?", "math", false],
    ["Valószínűség – francia kártya", "Mennyi az esély?", "math", false],
    ["A francia forradalom", "Mikor volt?", "math", false],
    ["Angola", "Hol van?", "math", false],
    ["Present Simple", "went magyarul:", "math", false],
    ["nature", "Mi a víz?", "math", false],
    ["hungarian", "Melyik főnév?", "math", false],
  ];
  for (const [topic, prompt, subject, certain] of cases) {
    assert.deepEqual(materialSubject(topic, prompt), { subject, certain }, `${topic} | ${prompt}`);
  }
  const mapped = materialToQuestions(MATERIAL_ROWS, 4);
  // SPEC-VÁLTOZÁS 2026-11-17 (lásd fent): a téma nélküli „Tempête magyarul:” (m-4) már nem biztos angol.
  assert.deepEqual(mapped.map((q) => q.subject), ["math", "english", "math", "math", "math"]);
  assert.deepEqual(mapped.map((q) => q.certain), [true, true, false, false, false]);
});

test("a 22 valós cím-téma: „csak matek” és „csak angol” módban soha, vegyes módban igen", () => {
  const material = materialToQuestions(TITLE_TOPICS.map((t, i) => row(`t-${i}`, `Kérdés ${i}?`, t)), 5);
  // A bizonyítottan matek ('Szorzás' és 'Törtek' nem az: nincs matek-előtag) → mind bizonytalan.
  assert.ok(material.every((q) => q.certain === false), "cím-téma nem lehet biztos tantárgyú");
  const ids = new Set(material.map((q) => q.id));
  for (const mode of ["math", "english"] as const) {
    for (let seed = 1; seed <= 40; seed++) {
      const q = pickQuestion({ level: 70, school: 5, mode, material, rng: makeRng(seed) });
      assert.ok(!ids.has(q.id), `${mode} módban cím-témájú tananyag jött: ${q.id}`);
    }
  }
  const seen = new Set<string>();
  for (let seed = 1; seed <= 400; seed++) {
    const q = pickQuestion({ level: 70, school: 5, mode: "mixed", material, rng: makeRng(seed), recent: [...seen] });
    if (ids.has(q.id)) seen.add(q.id);
  }
  assert.ok(seen.size > 0, "vegyes módban a bizonytalan tananyag is megjelenik");
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
