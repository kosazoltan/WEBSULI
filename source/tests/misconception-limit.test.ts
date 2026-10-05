import test from "node:test";
import assert from "node:assert/strict";
import { misconceptionRef, misconceptionPath } from "../shared/bank-item-ref";
import { removablePath, splitLimitBlockers } from "../server/studio/limit-policy";
import { mergeSectionPatches, parseMisconceptionsPatch, targetedRepairSections } from "../server/studio/section-patch";
import { resolveChoiceGate } from "../server/studio/step-runner";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import type { Lesson } from "../shared/lesson-schema";
import type { LektorNote } from "../server/studio/lektor";

/* Spec 2026-10-05-s9 (S9/6) — mért: job b3a7ecad, a `misconceptions[1]` ténybeli blokkolója a körlimitig maradt (a fejezet-folt nem
   érinthette, a limit-ág nem ismerte az útvonalat) → megállás. */

const lesson = (): Lesson => {
  const l = standardFusionFixture() as Lesson;
  return { ...l, misconceptions: [
    { conceptId: l.sections[0].blocks.find((b) => "coversConceptIds" in b)?.coversConceptIds?.[0] ?? "area", text: "Első tévhit." },
    { conceptId: l.sections[0].blocks.find((b) => "coversConceptIds" in b)?.coversConceptIds?.[0] ?? "area", text: "A zikkurat piramis – valójában…" },
  ] } as Lesson;
};
const note = (blockPath: string): LektorNote => ({ kind: "source_conflict", subkind: "contradicts_source", blockPath, message: "Mi hamis: a misconceptions[1] a forrásban nincs.", severity: "blocker", blocking: true } as LektorNote);

test("útvonal: misconceptions[1] / misconceptions.1 felismerve, normalizálva", () => {
  assert.equal(misconceptionRef("misconceptions[1]"), 1);
  assert.equal(misconceptionRef("misconceptions.1.text"), 1);
  assert.equal(misconceptionRef("experience.quiz[1]"), null);
  assert.equal(misconceptionPath(1), "misconceptions[1]");
});

test("körlimit: a tévhit-elemre mutató ténybeli blokkoló kivehető (nem állít meg); a nem létező index nem", () => {
  const l = lesson();
  assert.equal(removablePath(l, "misconceptions[1]"), "misconceptions[1]");
  assert.equal(removablePath(l, "misconceptions[9]"), null);
  const split = splitLimitBlockers(l, [note("misconceptions[1]")]);
  assert.equal(split.factual.length, 0);
  assert.deepEqual(split.removable.map((f) => f.path), ["misconceptions[1]"]);
});

test("kapu: a limit-eredetű tévhit-jelzés az elemet kiveszi, a többi tévhit és a tanítás változatlan", () => {
  const l = lesson();
  const res = resolveChoiceGate(l, [{ path: "misconceptions[1]", message: "tényhiba", origin: "limit" }]);
  assert.ok(!("error" in res), JSON.stringify(res));
  assert.deepEqual(res.lesson.misconceptions.map((m) => m.text), ["Első tévhit."]);
  assert.ok(res.removed.includes("misconceptions[1]"));
  assert.deepEqual(res.lesson.sections, l.sections);
});

test("folt: a tévhit-jegyzet nem kényszerít teljes újraírást; a folt a javított tévhit-listát is hozhatja", () => {
  const l = lesson();
  assert.deepEqual(targetedRepairSections(l, [note("misconceptions[1]"), { ...note("0.0") }], null), [0]);
  const merged = mergeSectionPatches(l, new Map([[0, l.sections[0]]]), [0], parseMisconceptionsPatch({ sections: { "0": l.sections[0] }, misconceptions: [l.misconceptions[0]] }));
  assert.deepEqual(merged.misconceptions, [l.misconceptions[0]]);
  assert.deepEqual(mergeSectionPatches(l, new Map([[0, l.sections[0]]]), [0]).misconceptions, l.misconceptions, "lista nélkül változatlan");
});
