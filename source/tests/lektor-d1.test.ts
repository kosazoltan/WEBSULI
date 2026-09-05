import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyNotes,
  applyLektorVerdict,
  NOTE_KINDS,
  SOURCE_CONFLICT_BLOCKING_SUBKINDS,
} from "../server/studio/lektor";
import type { Lesson } from "../shared/lesson-schema";

/**
 * LS-2 / D1 — the Lektor reviews, it never rewrites.
 *
 * Owner's decision, verbatim: "itt a forrásnak akkor is nyernie kell, ha hülyeség, mert
 * a tantervben az van benne." Hungarian schooling examines what the textbook says, so a
 * model noticing that the book is outdated may record that for the admin — and must not
 * touch a word of what the child reads. No footnote, no "corrected" badge, no silent fix.
 *
 * The test that matters: after a `book_probably_wrong` note, the lesson JSON is
 * byte-identical.
 */

const LESSON: Lesson = {
  title: "Naprendszer",
  subject: "természetismeret",
  classroom: 4,
  mapId: "km-1",
  misconceptions: [],
  sourceOnly: true,
  sections: [
    {
      heading: "Bolygók",
      probaEnabled: true,
      blocks: [
        {
          kind: "explain",
          text: "A Naprendszerben kilenc bolygó kering.",
          depth: "core",
          readAloud: true,
          coversConceptIds: ["c1"],
        },
      ],
    },
  ],
};

test("book_probably_wrong is info severity and never blocks", () => {
  const notes = classifyNotes([
    {
      kind: "source_conflict",
      subkind: "book_probably_wrong",
      message: "A Plútót 2006 óta nem tekintik bolygónak.",
      blockPath: "0.0",
    },
  ]);
  assert.equal(notes[0].severity, "info");
  assert.equal(notes[0].blocking, false);
});

test("book_probably_wrong leaves the lesson BYTE-IDENTICAL (D1)", () => {
  const before = JSON.stringify(LESSON);
  const result = applyLektorVerdict(LESSON, [
    {
      kind: "source_conflict",
      subkind: "book_probably_wrong",
      message: "A Plútót 2006 óta nem tekintik bolygónak.",
      blockPath: "0.0",
    },
  ]);
  assert.equal(JSON.stringify(result.lesson), before, "the child's text must not change");
  assert.equal(result.blockers.length, 0);
  assert.equal(result.adminNotes.length, 1, "the admin still gets told");
});

test("a claim not traceable to the map IS a blocker", () => {
  // Different failure entirely: the model taught something the curated map never had.
  const notes = classifyNotes([
    { kind: "source_conflict", subkind: "not_in_map", message: "Nincs ilyen fogalom.", blockPath: "0.0" },
  ]);
  assert.equal(notes[0].severity, "blocker");
  assert.equal(notes[0].blocking, true);
});

test("a claim contradicting the source IS a blocker", () => {
  const notes = classifyNotes([
    { kind: "source_conflict", subkind: "contradicts_source", message: "A forrás mást ír.", blockPath: "0.1" },
  ]);
  assert.equal(notes[0].severity, "blocker");
});

test("coverage_gap blocks for core, warns for supporting", () => {
  const [core, supporting] = classifyNotes([
    { kind: "coverage_gap", subkind: "core", message: "c2 hiányzik." },
    { kind: "coverage_gap", subkind: "supporting", message: "s7 hiányzik." },
  ]);
  assert.equal(core.severity, "blocker");
  assert.equal(supporting.severity, "warn");
  assert.equal(supporting.blocking, false);
});

test("language and age notes are advisory only", () => {
  const notes = classifyNotes([
    { kind: "language", message: "Túl hosszú mondat." },
    { kind: "age", message: "Negyedikeseknek nehéz szó." },
  ]);
  assert.deepEqual(notes.map((n) => n.severity), ["warn", "warn"]);
  assert.ok(notes.every((n) => !n.blocking));
});

test("an unknown note kind is not silently trusted", () => {
  // A model inventing its own note kind must not land as a harmless warn.
  const notes = classifyNotes([{ kind: "vibe_check", message: "Fura." } as never]);
  assert.equal(notes.length, 0, "unknown kinds are dropped, not accepted");
  assert.ok(!NOTE_KINDS.includes("vibe_check" as never));
});

test("an invented source_conflict subkind is a warn, never a blocker (#177)", () => {
  // Measured live (2026-09-05, run f415cc97): the Lektor reported
  // `source_conflict/missing_coversConceptIds` on a recap block in BOTH rounds. The
  // schema gives recap no coversConceptIds, so the Author could never "fix" it — a
  // phantom blocker burned every round. Only the documented D1 subkinds may block.
  const notes = classifyNotes([
    { kind: "source_conflict", subkind: "missing_coversConceptIds", message: "x", blockPath: "6.1" },
  ]);
  assert.equal(notes.length, 1, "the admin still sees the note");
  assert.equal(notes[0].severity, "warn");
  assert.equal(notes[0].blocking, false);
  assert.deepEqual(SOURCE_CONFLICT_BLOCKING_SUBKINDS, ["not_in_map", "contradicts_source"]);
});

test("a source_conflict without a subkind still blocks (conservative default)", () => {
  const [n] = classifyNotes([{ kind: "source_conflict", message: "Nem a forrásból van." }]);
  assert.equal(n.severity, "blocker");
});

test("applyLektorVerdict never mutates the lesson, whatever the notes say", () => {
  // Even a blocker only reports; rewriting is the Author's job in the next round.
  const before = JSON.stringify(LESSON);
  const result = applyLektorVerdict(LESSON, [
    { kind: "source_conflict", subkind: "not_in_map", message: "x", blockPath: "0.0" },
    { kind: "coverage_gap", subkind: "core", message: "y" },
    { kind: "language", message: "z" },
  ]);
  assert.equal(JSON.stringify(LESSON), before, "input object untouched");
  assert.equal(JSON.stringify(result.lesson), before, "returned lesson identical");
  assert.equal(result.blockers.length, 2);
});
