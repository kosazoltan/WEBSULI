import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInstructionCheckPrompt, instructionCheckHash, missingPoints, parseInstructionCheck, teachingText } from "../server/studio/instruction-check";
import type { Lesson } from "../shared/lesson-schema";

/** Spec 2026-09-30-tanari-ellenorzolista: a tanári kérés mérése, hallucináció-őrrel. */

const lesson = {
  title: "Mezopotámia", subject: "történelem", classroom: 5, mapId: "m1", sourceOnly: true, misconceptions: [],
  sections: [
    { heading: "Babilon", probaEnabled: false, blocks: [
      { kind: "explain", text: "**Babilon városa Kr. e. 2500 körül** szerepel a füzetben.", depth: "core", readAloud: true, coversConceptIds: ["c1"] },
      { kind: "recap", bullets: ["Babilon a folyóköz fontos városa volt."] },
    ] },
    { heading: "A zikkurat", probaEnabled: false, blocks: [
      { kind: "explain", text: "A zikkurat lépcsős toronytemplom, a tetején a szentély.", depth: "core", readAloud: true, coversConceptIds: ["c2"] },
    ] },
  ],
} as unknown as Lesson;

test("a tanítás szövege fejezet-sorszámmal; a prompt a skill-lel indul", () => {
  const text = teachingText(lesson);
  assert.match(text, /^\[0\] Babilon\n/);
  assert.match(text, /\[1\] A zikkurat/);
  const prompt = buildInstructionCheckPrompt("Taníts Babilonról és a zikkuratról.", lesson);
  assert.match(prompt.system, /SKILL/);
  assert.match(prompt.user, /Taníts Babilonról/);
});

test("hallucináció-őr: a „tanítja” csak betűhív bizonyítékkal marad; a fejezet-sorszám ellenőrzött", () => {
  const points = parseInstructionCheck({ points: [
    { point: "Babilon Kr. e. 2500 körül jött létre", taught: true, evidence: "Babilon városa Kr. e. 2500 körül jött létre", section: 0 },
    { point: "A zikkurat lépcsős toronytemplom", taught: true, evidence: "A zikkurat lépcsős toronytemplom, a tetején a szentély.", section: 1 },
    { point: "Az Istár kapu", taught: false, evidence: "", section: 7 },
    { point: "", taught: false },
    { point: "Csillagos bizonyíték", taught: true, evidence: "********", section: 0 },
  ] }, lesson);
  assert.deepEqual(points.map((p) => [p.taught, p.section]), [[false, 0], [true, 1], [false, null], [false, 0]]);
  assert.deepEqual(missingPoints(points).map((p) => p.point), ["Babilon Kr. e. 2500 körül jött létre", "Az Istár kapu", "Csillagos bizonyíték"]);
  assert.throws(() => parseInstructionCheck({ notes: [] }, lesson), /nem a kért alakú/);
});

test("a hash a kérés és a tanítás függvénye (változatlan leckére nincs új hívás)", () => {
  const a = instructionCheckHash("x", lesson);
  assert.equal(a, instructionCheckHash("x", lesson));
  assert.notEqual(a, instructionCheckHash("y", lesson));
});
