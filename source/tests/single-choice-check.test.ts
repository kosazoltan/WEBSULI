import assert from "node:assert/strict";
import test from "node:test";

import { lessonSingleChoiceProblems, singleChoiceProblems } from "../shared/single-choice-check";

/** Spec 2026-09-29 (docs/specs/2026-09-29-egy-helyes-valasz.md), döntés 1: determinisztikus egy-helyes-válasz őr. */

test("E1: „Melyik szám osztható 9-cel?” 234/567/891/648 — mind a négy osztható → hiba", () => {
  const problems = singleChoiceProblems({ prompt: "Melyik szám osztható 9-cel?", options: ["234", "567", "891", "648"], correctIndex: 0 });
  assert.equal(problems.length, 1, JSON.stringify(problems));
  assert.match(problems[0], /4 opció/);
  for (const n of ["234", "567", "891", "648"]) assert.match(problems[0], new RegExp(n));
});

test("E2: oszthatóság — pontosan egy teljesítő opció, és az a kulcs → nincs hiba; „NEM osztható” is", () => {
  assert.deepEqual(singleChoiceProblems({ prompt: "Melyik szám NEM osztható 3-mal?", options: ["315", "472", "813", "126"], correctIndex: 1 }), []);
  assert.deepEqual(singleChoiceProblems({ prompt: "Melyik szám osztható 9-cel?", options: ["234", "568", "892", "649"], correctIndex: 0 }), []);
  assert.deepEqual(singleChoiceProblems({ prompt: "Válaszd ki a 4-gyel osztható számot!", options: ["1 024", "1 022", "1 018"], correctIndex: 0 }), [], "ezres szóköz");
  const wrongKey = singleChoiceProblems({ prompt: "Melyik szám NEM osztható 3-mal?", options: ["315", "472", "813", "126"], correctIndex: 0 });
  assert.equal(wrongKey.length, 1);
  assert.match(wrongKey[0], /472/);
  const none = singleChoiceProblems({ prompt: "Melyik szám osztható 5-tel?", options: ["12", "13", "14"], correctIndex: 0 });
  assert.equal(none.length, 1, "nulla teljesítő opció is hiba");
});

test("E2: számtani kérdés — a kiszámolt eredménnyel pontosan egy opció egyezik, és az a kulcs", () => {
  assert.deepEqual(singleChoiceProblems({ prompt: "Mennyi 12 · 3?", options: ["36", "38", "32", "34"], correctIndex: 0 }), []);
  assert.deepEqual(singleChoiceProblems({ prompt: "Mennyi az eredménye: 30 + 3 · 6 – 12 : 4?", options: ["43", "45", "48"], correctIndex: 1 }), []);
  assert.deepEqual(singleChoiceProblems({ prompt: "7 + 8 = ?", options: ["15", "16", "14"], correctIndex: 0 }), []);
  assert.deepEqual(singleChoiceProblems({ prompt: "Számold ki: 3/4 + 1/4 =", options: ["1", "4/8", "3/4"], correctIndex: 0 }), []);
  const wrongKey = singleChoiceProblems({ prompt: "Mennyi 12 · 3?", options: ["36", "38", "32", "34"], correctIndex: 1 });
  assert.equal(wrongKey.length, 1);
  assert.match(wrongKey[0], /36/);
  const noneRight = singleChoiceProblems({ prompt: "7 + 8 = ?", options: ["14", "16", "17"], correctIndex: 0 });
  assert.equal(noneRight.length, 1, "egyik opció sem a helyes eredmény");
});

test("döntés 1c: duplikált vagy egyenértékű opció → hiba", () => {
  assert.equal(singleChoiceProblems({ prompt: "Mennyi a fele?", options: ["0,5", "1/2", "2"], correctIndex: 0 }).length, 1);
  assert.equal(singleChoiceProblems({ prompt: "Mennyi 12 · 3?", options: ["36", "36,0", "32"], correctIndex: 0 }).length, 1);
  assert.equal(singleChoiceProblems({ prompt: "Melyik gyümölcs?", options: ["Alma", "alma ", "Répa"], correctIndex: 0 }).length, 1);
  assert.deepEqual(singleChoiceProblems({ prompt: "Melyik gyümölcs?", options: ["Alma", "Körte", "Répa"], correctIndex: 0 }), []);
});

test("nincs hamis riasztás a nem kiszámolható kérdésekre (történelem, angol, összetett feltétel)", () => {
  const silent = [
    { prompt: "Mikor volt a mohácsi csata?", options: ["1526", "1541", "1456", "1686"], correctIndex: 0 },
    { prompt: "Which word is a verb?", options: ["run", "table", "blue", "slowly"], correctIndex: 0 },
    { prompt: "Hány szám osztható 9-cel a következők közül: 18, 27, 30?", options: ["1", "2", "3"], correctIndex: 1 },
    { prompt: "Melyik a legkisebb 9-cel osztható háromjegyű szám?", options: ["108", "117", "999"], correctIndex: 0 },
    { prompt: "Melyik szám osztható 9-cel és páros?", options: ["18", "27", "81"], correctIndex: 0 },
    { prompt: "Mennyi (3 + 4) · 2?", options: ["14", "11", "10"], correctIndex: 0 },
    { prompt: "Melyik állítás igaz?", options: ["A 234 osztható 9-cel.", "A 235 osztható 9-cel.", "A 236 osztható 9-cel."], correctIndex: 0 },
    { prompt: "Mennyi a háromszög területe, ha az alap 6 cm, a magasság 4 cm?", options: ["12 cm²", "24 cm²", "10 cm²"], correctIndex: 0 },
    { prompt: "Melyik tört van egyszerűsített alakban?", options: ["2/4", "1/2", "3/6"], correctIndex: 1 },
    { prompt: "Melyik szám osztható 3-mal a 200 és 300 között?", options: ["201", "204", "207"], correctIndex: 0 },
  ];
  for (const item of silent) assert.deepEqual(singleChoiceProblems(item), [], item.prompt);
});

test("review R3: a tagadás az állításhoz kötött — egy szabad „Nem …” mondat nem fordítja meg a kérdést", () => {
  assert.deepEqual(singleChoiceProblems({ prompt: "Melyik szám osztható 3-mal? Nem kell indokolni.", options: ["12", "14", "16", "20"], correctIndex: 0 }), []);
  assert.equal(singleChoiceProblems({ prompt: "Melyik szám osztható 3-mal? Nem kell indokolni.", options: ["12", "15", "16", "20"], correctIndex: 0 }).length, 1, "két osztható opció így is hiba");
  assert.deepEqual(singleChoiceProblems({ prompt: "Melyik szám NEM 3-mal osztható?", options: ["315", "472", "813", "126"], correctIndex: 1 }), []);
  assert.equal(singleChoiceProblems({ prompt: "Melyik szám NEM 3-mal osztható?", options: ["315", "472", "813", "126"], correctIndex: 0 }).length, 1);
  assert.deepEqual(singleChoiceProblems({ prompt: "Melyik szám NEM osztható 3-mal?", options: ["315", "472", "813", "126"], correctIndex: 1 }), []);
  assert.equal(singleChoiceProblems({ prompt: "Melyik szám osztható 9-cel?", options: ["234", "567", "891", "648"], correctIndex: 0 }).length, 1);
});

test("lessonSingleChoiceProblems: check blokk, kvíz és választós módszer útvonallal", () => {
  const bad = { question: "Melyik szám osztható 9-cel?", options: ["234", "567", "891", "648"], correctIndex: 0 };
  const found = lessonSingleChoiceProblems({
    sections: [{ blocks: [{ kind: "explain" }, { kind: "check", ...bad }] }],
    experience: {
      quiz: [{ id: "q1", ...bad }, { id: "q2", question: "Mennyi 12 · 3?", options: ["36", "38", "32"], correctIndex: 0 }],
      methods: [{ id: "m1", prompt: bad.question, options: bad.options, correctIndex: 0 }, { id: "m2", prompt: "Nyitott" }],
    },
  });
  assert.deepEqual(found.map((f) => f.path), ["sections[0].blocks[1]", "experience.quiz[0]", "experience.methods[0]"]);
  assert.equal(found[1].id, "q1");
  assert.ok(found.every((f) => f.problems.length === 1));
});

test("review #193 (7): az „Egyik sem” nem kapcsolja ki az érték-egyezés vizsgálatát — a többi opció összehasonlítása marad", () => {
  const problems = singleChoiceProblems({ prompt: "Melyik szám egyenlő a nulla egésszel és öt tizeddel?", options: ["0,5", "2/4", "Egyik sem"], correctIndex: 0 });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ugyanazt jelenti/);
  // a gyűjtő-opció („Mind helyes”) továbbra is szándékossá teszi az egyenértékű alakokat
  assert.deepEqual(singleChoiceProblems({ prompt: "Melyik szám egyenlő a nulla egésszel és öt tizeddel?", options: ["0,5", "2/4", "Mind helyes"], correctIndex: 2 }), []);
});
