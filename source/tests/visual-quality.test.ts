import { test } from "node:test";
import assert from "node:assert/strict";
import { weakVisuals, weakVisualsInstruction } from "../server/studio/visual-quality";
import type { Lesson } from "../shared/lesson-schema";

/** Spec 2026-09-24 (docs/specs/2026-09-24-magyarazo-abrak.md, 4. szelet): gyenge ábrák gépi felismerése. */

const section = (blocks: unknown[]) => ({ heading: "H", probaEnabled: true, blocks });
const example = { kind: "example", problem: "2+3·4", steps: ["3 · 4 = 12", "2 + 12 = 14"], answer: "14", coversConceptIds: ["c1"] };
const lesson = (blocks: unknown[]) => ({ title: "t", subject: "matematika", classroom: 5, mapId: "m", sourceOnly: true, misconceptions: [], sections: [section(blocks)] }) as unknown as Lesson;

test("a példa lépéseit ismétlő szövegdoboz, a puszta körvonal és a hiányos adat gyenge ábra", () => {
  const weak = weakVisuals(lesson([
    example,
    { kind: "animate", animKind: "process", params: { steps: ["3·4 = 12", "2+12=14"] }, caption: "A megoldás menete", coversConceptIds: ["c1"] },
    { kind: "animate", animKind: "geometry", params: { shape: "circle" }, caption: "A Hold", coversConceptIds: ["c1"] },
    { kind: "animate", animKind: "cycle", params: { phases: [{ label: "Újhold" }] }, caption: "Holdfázisok", coversConceptIds: ["c1"] },
  ]));
  assert.deepEqual(weak.map((w) => [w.blockIndex, w.kind]), [[1, "echo"], [2, "outline"], [3, "broken"]]);
  const instruction = weakVisualsInstruction(weak);
  assert.match(instruction, /0\. fejezet \(index\), 1\. blokk \(i\): a példa lépéseit ismétli/);
  assert.match(instruction, /"replace"/);
});

test("valódi ábra nem gyenge: saját eljárás, holdciklus, számegyenes; példa nélküli fejezet process-e sem", () => {
  assert.deepEqual(weakVisuals(lesson([
    example,
    { kind: "animate", animKind: "process", params: { steps: ["Először a szorzás", "Utána az összeadás"] }, caption: "Műveleti sorrend", coversConceptIds: ["c1"] },
    { kind: "animate", animKind: "numberLine", params: { from: 0, to: 14, jumps: [{ from: 2, to: 14, label: "+12" }] }, caption: "2 + 12", coversConceptIds: ["c1"] },
    { kind: "animate", animKind: "cycle", params: { phases: [{ label: "Újhold", moon: 0 }, { label: "Első negyed", moon: 0.5 }, { label: "Telihold", moon: 1 }] }, caption: "Hold", coversConceptIds: ["c1"] },
  ])), []);
  assert.deepEqual(weakVisuals(lesson([
    { kind: "animate", animKind: "process", params: { steps: ["Elmondják", "Lejegyzik"] }, caption: "Forrás", coversConceptIds: ["c1"] },
  ])), []);
});
