import { test } from "node:test";
import assert from "node:assert/strict";
import { SIGNED_NUMBER_RULES_HU, buildLessonExperience, needsSignedNumberRules } from "../server/studio/experience-builder";
import { arithmeticClaimProblems, signAmbiguousRubricProblems } from "../server/studio/tools/arithmetic-claims";
import { repairPermissions } from "../server/studio/bank-repair";
import { singleChoiceProblems } from "../shared/single-choice-check";
import { LESSON_BANK_SIZES } from "../shared/lesson-experience";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import type { MapConcept } from "../server/studio/coverage";

/* Spec 2026-10-04 (docs/specs/2026-10-04-bank-tartalek-es-elojel.md): kötelező banktartalék + előjel-szabályok és -őrök. */

const concepts = [{ localId: "area", term: "háromszög területe", examWeight: "core" } as MapConcept];

test("egyválasztós őr: két igaz, azonos értékű egyenlőség-opció (előjeles zárójel) ugyanazt jelenti — a mért quiz[73]", () => {
  const problems = singleChoiceProblems({ prompt: "Melyik számolás helyes?", options: ["-8-6=-14", "-8-(+6)=-14", "-8+6=-14"], correctIndex: 0 });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /„-8-6=-14”, „-8-\(\+6\)=-14” opció ugyanazt jelenti/);
  // Unicode mínusz és eredmény-jelölő „+”.
  assert.match(singleChoiceProblems({ prompt: "Melyik igaz?", options: ["9 − (−6) = +15", "9 + 6 = 15", "9 − 6 = 15"], correctIndex: 0 }).join(" "), /ugyanazt jelenti/);
});

test("egyválasztós őr: a hamis disztraktor-egyenlőség, a különböző értékű igaz egyenlőség és az alak-kérdés nem jelez", () => {
  assert.deepEqual(singleChoiceProblems({ prompt: "Melyik számolás helyes?", options: ["-8-6=-14", "-8-6=-2", "-8-6=14"], correctIndex: 0 }), []);
  assert.deepEqual(singleChoiceProblems({ prompt: "Melyik számolás helyes?", options: ["-8-6=-14", "3+4=7", "-8-6=2"], correctIndex: 0 }), []);
  assert.deepEqual(singleChoiceProblems({ prompt: "Melyik írásmód helyes ugyanarra a kivonásra?", options: ["-8-6=-14", "-8-(+6)=-14", "-8-6=2"], correctIndex: 0 }), []);
  // Szöveges opció: nem kiértékelhető, hallgat.
  assert.deepEqual(singleChoiceProblems({ prompt: "Mit jelent?", options: ["balra lépünk = -14", "jobbra lépünk = -14", "-8-6=-14"], correctIndex: 2 }), []);
});

test("rubrika-őr: egy VAGY-csoportban a szám és az ellentettje előjel-kétértelmű — a mért tasks[22]", () => {
  assert.match(signAmbiguousRubricProblems({ id: "t22", required: [["-13", "13"]] }).join(" "), /^t22: előjel-kétértelmű rubrika: .*13.*-13/);
  assert.equal(signAmbiguousRubricProblems({ id: "t1", required: [["−13", "+13"]] }).length, 1, "unicode mínusz és plusz");
  assert.equal(signAmbiguousRubricProblems({ id: "t2", required: [["-13"]], bonus: [["13", "-13"]] }).length, 1, "a bonus is");
  assert.deepEqual(signAmbiguousRubricProblems({ id: "t3", required: [["-13"], ["13"]] }), [], "külön csoport (ÉS) jogos");
  assert.deepEqual(signAmbiguousRubricProblems({ id: "t4", required: [["0", "-0"], ["mínusz tizenhárom", "-13"]] }), [], "nulla és szöveg nem jelez");
  assert.deepEqual(signAmbiguousRubricProblems({ id: "t5", required: [["-13", "−13"]] }), [], "ugyanaz az előjel két írásmóddal");
  // A csomag-ellenőrzés része, és a javító mód a rubrikát engedi cserélni.
  const issues = arithmeticClaimProblems({ tasks: [{ id: "t22", q: "Mennyi -5-(+8)?", sample: "-13", required: [["-13", "13"]] }] });
  assert.equal(issues.length, 1);
  const plan = repairPermissions(issues, { methods: [], tasks: [{ id: "t22" }], quiz: [] });
  assert.deepEqual(plan.packetLevel, []);
  assert.ok(Array.isArray(plan.allows[0].fields) && plan.allows[0].fields.includes("required"));
});

test("előjel-blokk: csak negatív számot tanító matematika-fejezetnél kerül a bankpromptba", async () => {
  assert.equal(needsSignedNumberRules("matematika", { blocks: [{ text: "-8 - 6 = -14" }] }), true);
  assert.equal(needsSignedNumberRules("Matek", { blocks: [{ text: "A negatív számok kivonása" }] }), true);
  assert.equal(needsSignedNumberRules("matematika", { blocks: [{ text: "12 - 5 = 7, a különbség 7." }] }), false, "kivonás szóközzel nem negatív szám");
  assert.equal(needsSignedNumberRules("történelem", { blocks: [{ text: "Kr. e. -3000 körül" }] }), false);

  const signed = standardFusionFixture(); signed.mapId = "m1";
  signed.sections[0].blocks.push({ kind: "explain", text: "Negatív számok: -8 - 6 = -14.", depth: "core", readAloud: false, coversConceptIds: ["area"] });
  const systems: string[] = [];
  await buildLessonExperience({ ...signed, experience: undefined }, concepts, { call: async (system) => { systems.push(system); return standardFusionFixture().experience!; } });
  assert.ok(systems[0].includes(SIGNED_NUMBER_RULES_HU));
  const plain = standardFusionFixture(); plain.mapId = "m1";
  systems.length = 0;
  await buildLessonExperience({ ...plain, experience: undefined }, concepts, { call: async (system) => { systems.push(system); return standardFusionFixture().experience!; } });
  assert.equal(systems[0].includes("ELŐJELES SZÁMOK"), false);
});

test("kötelező tartalék: a minimum-darabszámú (45/75) csomag elutasított kísérlet, a tartalékos átmegy", async () => {
  const lesson = standardFusionFixture(); lesson.mapId = "m1";
  const full = standardFusionFixture().experience!;
  const minimum = { ...structuredClone(full), tasks: full.tasks.slice(0, LESSON_BANK_SIZES.tasks), quiz: full.quiz.slice(0, LESSON_BANK_SIZES.quiz) };
  const failures: string[] = [];
  let calls = 0;
  const built = await buildLessonExperience({ ...lesson, experience: undefined }, concepts, {
    call: async () => (calls++ === 0 ? minimum : full),
    onAttemptFailure: (_section, _attempt, reason) => failures.push(reason),
  });
  assert.equal(calls, 2, "a tartalék nélküli első válasz nem fogadható el");
  assert.match(failures[0], /tasks: Array must contain at least 48 element\(s\); quiz: Array must contain at least 80 element\(s\)/);
  assert.equal(built.tasks.length, 48);
  assert.equal(built.quiz.length, 80);
});
