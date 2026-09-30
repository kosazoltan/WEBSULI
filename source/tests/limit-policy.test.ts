import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyNotes, noteSectionKey } from "../server/studio/lektor";
import { classifyReviewNotes, downgradeAtLimit, limitAcceptance, splitLimitBlockers } from "../server/studio/limit-policy";
import type { Lesson } from "../shared/lesson-schema";
import type { MapConcept } from "../server/studio/coverage";

/** Spec 2026-09-30 (docs/specs/2026-09-30-nem-elakado-kozzetetel.md): a körlimit közös szabályai. */

const lesson = {
  title: "T", subject: "történelem", classroom: 5, mapId: "m1", sourceOnly: true, misconceptions: [],
  sections: [{ heading: "A", probaEnabled: false, blocks: [
    { kind: "explain", text: "A zikkurat toronytemplom.", depth: "core", readAloud: true, coversConceptIds: ["c1", "c2"] },
    { kind: "animate", animKind: "process", params: { steps: ["a", "b"] }, caption: "zikkurat", coversConceptIds: ["c1"] },
    { kind: "check", question: "?", options: ["a", "b"], correctIndex: 0, feedbackPerOption: ["i", "n"], coversConceptIds: ["c1"] },
  ] }],
  experience: { methods: [], tasks: [], quiz: [{ id: "q1" }] },
} as unknown as Lesson;

test("a lektor-séma zárójeles útvonala is fejezet-kulcs (a konvergencia fejezet-szintű)", () => {
  assert.equal(noteSectionKey("sections[3].blocks[1]"), "sections.3");
  assert.equal(noteSectionKey("sections.3.blocks.0"), "sections.3");
});

test("classifyReviewNotes = a lektor lépés besorolása (konvergenciával)", () => {
  const raw = [{ kind: "coverage_gap" as const, subkind: "core", blockPath: "sections[0].blocks[0]", message: "késői hiány" }];
  assert.equal(classifyNotes(raw)[0].blocking, true);
  assert.equal(classifyReviewNotes(raw, [], 1)[0].blocking, false, "új fejezet késői hiánya figyelmeztetés");
  assert.equal(classifyReviewNotes(raw, [{ kind: "coverage_gap", subkind: "core", blockPath: "sections.0.blocks.2", message: "x" }], 1)[0].blocking, true, "ugyanaz a fejezet: blokkoló marad");
});

test("downgradeAtLimit: csak a limiten, csak a coverage_gap", () => {
  const notes = classifyNotes([
    { kind: "coverage_gap", subkind: "core", blockPath: "sections[0].blocks[0]", message: "hiány" },
    { kind: "source_conflict", subkind: "contradicts_source", blockPath: "sections[0].blocks[0]", message: "tényhiba" },
  ]);
  assert.deepEqual(downgradeAtLimit(notes, false).map((n) => n.blocking), [true, true]);
  const at = downgradeAtLimit(notes, true);
  assert.deepEqual(at.map((n) => n.blocking), [false, true]);
  assert.match(at[0].message, /^Körlimiten hiányként továbbvitt/);
});

test("splitLimitBlockers: ábra/check/banktétel kivehető, coverage_gap hiány, a tanítás tényhibája nem kivehető", () => {
  const notes = classifyNotes([
    { kind: "source_conflict", subkind: "contradicts_source", blockPath: "sections[0].blocks[1]", message: "ábra" },
    { kind: "source_conflict", subkind: "contradicts_source", blockPath: "sections[0].blocks[2]", message: "check" },
    { kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.quiz[0]", message: "bank" },
    { kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.quiz[9]", message: "nincs ilyen" },
    { kind: "source_conflict", subkind: "contradicts_source", blockPath: "sections[0].blocks[0]", message: "tanítás" },
    { kind: "coverage_gap", subkind: "core", blockPath: "sections[0].blocks[0]", message: "hiány" },
  ]);
  const split = splitLimitBlockers(lesson, notes);
  assert.deepEqual(split.removable.map((f) => [f.path, f.origin]), [["sections[0].blocks[1]", "limit"], ["sections[0].blocks[2]", "limit"], ["experience.quiz[0]", "limit"]]);
  assert.deepEqual(split.incomplete.map((n) => n.message), ["hiány"]);
  assert.deepEqual(split.factual.map((n) => n.message), ["nincs ilyen", "tanítás"]);
});

test("limitAcceptance: a megalapozatlan címke lekerül, a fedettség a megalapozottból, 95/80-as küszöb", () => {
  const concepts = [
    { localId: "c1", examWeight: "core" }, { localId: "c2", examWeight: "supporting" },
  ] as MapConcept[];
  const ok = limitAcceptance(lesson, concepts, { unknownIds: [], ungrounded: [] });
  assert.deepEqual([ok.ok, ok.core, ok.supporting, ok.stripped], [true, 1, 1, 0]);
  // c2 az explain blokkon (flat index 0) megalapozatlan → lekerül, a kiegészítő fedettség 0 → nem publikálható.
  const stripped = limitAcceptance(lesson, concepts, { unknownIds: [], ungrounded: [{ blockIndex: 0, conceptId: "c2", kind: "explain", term: "x", excerpt: "" }] });
  assert.deepEqual([stripped.ok, stripped.supporting, stripped.stripped], [false, 0, 1]);
  assert.deepEqual((stripped.lesson.sections[0].blocks[0] as { coversConceptIds: string[] }).coversConceptIds, ["c1"]);
  assert.deepEqual((lesson.sections[0].blocks[0] as { coversConceptIds: string[] }).coversConceptIds, ["c1", "c2"], "az eredeti érintetlen");
  // Az egyetlen címke nem vehető le (séma: min. 1), de a fedettségbe sem számít.
  const only = limitAcceptance(lesson, concepts, { unknownIds: [], ungrounded: [{ blockIndex: 1, conceptId: "c1", kind: "animate", term: "x", excerpt: "" }, { blockIndex: 2, conceptId: "c1", kind: "check", term: "x", excerpt: "" }, { blockIndex: 0, conceptId: "c1", kind: "explain", term: "x", excerpt: "" }] });
  assert.equal(only.core, 0);
  assert.equal(only.ok, false);
  assert.equal(limitAcceptance(lesson, concepts, { unknownIds: ["zz"], ungrounded: [] }).ok, false, "ismeretlen azonosítóval soha");
});

test("review #151 (P1): a kivehető elemre (bank, check, ábra) mutató coverage_gap NEM minősül le — a kivétel kapja", () => {
  const notes = classifyNotes([
    { kind: "coverage_gap", subkind: "core", blockPath: "experience.quiz[0]", message: "bank-hiány" },
    { kind: "coverage_gap", subkind: "core", blockPath: "sections[0].blocks[1]", message: "ábra-hiány" },
    { kind: "coverage_gap", subkind: "core", blockPath: "sections[0].blocks[0]", message: "tanítási hiány" },
  ]);
  const at = downgradeAtLimit(notes, true, lesson);
  assert.deepEqual(at.map((n) => n.blocking), [true, true, false]);
  const split = splitLimitBlockers(lesson, at.filter((n) => n.blocking));
  assert.deepEqual(split.removable.map((f) => f.path), ["experience.quiz[0]", "sections[0].blocks[1]"]);
});
