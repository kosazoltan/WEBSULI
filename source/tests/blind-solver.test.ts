import { test } from "node:test";
import assert from "node:assert/strict";
import { blindSolutionsPromptBlock, NOT_ENOUGH, parseBlindSolutions, sourceHashOf } from "../server/studio/blind-solver";
import { buildLektorPrompt, lektorReportSchema } from "../server/studio/step-io";

/** Spec 2026-09-24 (lektor-tanítás a felvételi feladatlap öt futásából): vak megoldó + önálló megoldás. */

test("vak megoldó: a „NINCS ELÉG ADAT” válasz kimarad, a hibás alakú válasz üres listát ad", () => {
  const sols = parseBlindSolutions({ solutions: [
    { task: "Téglatest: élek", answer: "a = 7, b = 11, c = 6 egység" },
    { task: "Piac: Piri", answer: NOT_ENOUGH },
    { task: "Réka", answer: "nincs elég adat" },
  ] });
  assert.deepEqual(sols.map((s) => s.task), ["Téglatest: élek"]);
  assert.deepEqual(parseBlindSolutions({ foo: 1 }), []);
  assert.deepEqual(parseBlindSolutions(null), []);
  assert.equal(sourceHashOf("a"), sourceHashOf("a"));
  assert.notEqual(sourceHashOf("a"), sourceHashOf("b"));
});

test("lektor-prompt: a vak megoldások független bizonyítékként, az önálló megoldás és a teljes javítási irány kötelező", () => {
  const lesson = { title: "t", subject: "matematika", classroom: 6, mapId: "m", sourceOnly: true, misconceptions: [], sections: [
    { heading: "Téglatest", probaEnabled: true, blocks: [{ kind: "explain", text: "A téglatest 385 kockából áll.", depth: "core", readAloud: true, coversConceptIds: ["c1"] }] },
  ] } as never;
  const map = { subject: "matematika", classroom: 6, concepts: [] };
  const blind = { sourceHash: "h", model: "claude-opus-5-5", solutions: [{ task: "Téglatest: kockák", answer: "462" }] };
  const withBlind = buildLektorPrompt(lesson, map, [], undefined, blind);
  assert.match(withBlind, /FÜGGETLEN VAK MEGOLDÁSOK[^]*"answer":"462"/);
  assert.match(withBlind, /ÖNÁLLÓ MEGOLDÁS ELŐSZÖR/);
  assert.match(withBlind, /TELJES helyes válasz — listánál minden elem/);
  assert.match(withBlind, /"solutions": \[/);
  assert.doesNotMatch(buildLektorPrompt(lesson, map), /FÜGGETLEN VAK MEGOLDÁSOK/, "vak megoldás nélkül nincs blokk");
  assert.deepEqual(blindSolutionsPromptBlock(undefined), []);
  assert.deepEqual(blindSolutionsPromptBlock({ ...blind, solutions: [] }), []);
});

test("lektori jelentés: a solutions tárolódik; nélküle is érvényes (régi jelentések)", () => {
  const withSol = lektorReportSchema.parse({ solutions: [{ task: "élek", own: "6, 7, 11", lesson: "5, 7, 11", match: false }], notes: [] });
  assert.equal(withSol.solutions?.[0].match, false);
  assert.equal(lektorReportSchema.parse({ notes: [] }).solutions, undefined);
  assert.ok(!lektorReportSchema.safeParse({ solutions: [{ task: "x", own: "y", match: "igen" }], notes: [] }).success);
});
