import assert from "node:assert/strict";
import test from "node:test";

import { bankUnitQuota } from "../shared/lesson-bank-plan";
import { METHOD_KINDS } from "../shared/lesson-experience";
import { seedFrom } from "../shared/seeded";

// Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (11. szakasz 4. pont; V8, V10): a módszerek sorrendje a magból keveredik.

const plan = (n: number) => ({ units: Array.from({ length: n }, (_, sectionIndex) => ({ sectionIndex, conceptIds: ["a", "b"] })), taskRound: 15, quizRound: 25 });
const kinds = (n: number, seed?: number) => plan(n).units.map((_, i) => bankUnitQuota(plan(n), i, seed).methodKinds);

test("V8: mag nélkül a kiosztás a régi (rögzített példák)", () => {
  assert.deepEqual(kinds(1), [["prediction", "gate", "myth", "sorting", "causeEffect", "conflict", "selfCheck", "popup", "timeline", "analogy", "gate"]]);
  assert.deepEqual(kinds(3), [["prediction", "sorting", "selfCheck", "analogy"], ["gate", "causeEffect", "popup", "gate"], ["myth", "conflict", "timeline"]]);
  assert.deepEqual(kinds(5), [["prediction", "conflict", "gate"], ["gate", "selfCheck"], ["myth", "popup"], ["sorting", "timeline"], ["causeEffect", "analogy"]]);
  assert.deepEqual(kinds(3, undefined), kinds(3));
});

test("V10: maggal mind a tíz fajta és két kapukérdés megmarad, csomagonként ≥ 2 fajta; az első módszer ≥ 6-féle", () => {
  const first = new Set<string>();
  for (let s = 0; s < 50; s++) {
    const seed = seedFrom(`map-${s}`);
    for (const n of [1, 2, 3, 5, 8]) {
      const all = kinds(n, seed);
      const flat = all.flat();
      for (const k of METHOD_KINDS) assert.ok(flat.includes(k), `${n}/${s}: hiányzik ${k}`);
      assert.ok(flat.filter((k) => k === "gate").length >= 2, `${n}/${s}: kevés kapukérdés`);
      for (const list of all) assert.ok(new Set(list).size >= 2, `${n}/${s}: egyfajtás csomag`);
      assert.deepEqual(all, kinds(n, seed), "determinisztikus");
    }
    first.add(kinds(3, seed)[0][0]);
  }
  assert.ok(first.size >= 6, `az első módszer csak ${first.size}-féle`);
});
