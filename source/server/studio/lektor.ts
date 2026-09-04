import type { Lesson } from "../../shared/lesson-schema";

/**
 * The Lektor: an independent reader that reports, and never rewrites.
 *
 * It runs on a different model family than the Author (see the master plan §11) because
 * a model does not reliably see its own mistakes. Its single blocking question is the
 * D1 one: can this claim be traced back to a curated concept?
 *
 * The rule that shapes this whole module comes from the owner, verbatim:
 *
 *   "itt a forrásnak akkor is nyernie kell, ha hülyeség, mert a tantervben az van benne"
 *
 * Hungarian schooling examines the textbook, so when the book is outdated the child must
 * still learn what the book says. The Lektor may record that observation for the admin —
 * `book_probably_wrong`, severity `info` — but nothing about the lesson changes: no
 * footnote, no "corrected" badge, no quiet edit. `applyLektorVerdict` therefore returns
 * the lesson it was given, unmodified, by construction rather than by discipline.
 */

export const NOTE_KINDS = ["source_conflict", "coverage_gap", "language", "age"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export type Severity = "blocker" | "warn" | "info";

export type RawNote = {
  kind: NoteKind;
  /**
   * Narrows the kind: for `source_conflict` one of `not_in_map` | `contradicts_source` |
   * `book_probably_wrong`; for `coverage_gap` the exam weight that is missing.
   */
  subkind?: string;
  message: string;
  /** "sectionIndex.blockIndex", when the note points at one block. */
  blockPath?: string;
};

export type LektorNote = RawNote & {
  severity: Severity;
  blocking: boolean;
  /** True when the note is for the admin only and must never reach the pupil (D1). */
  adminOnly: boolean;
};

function severityOf(note: RawNote): Severity {
  switch (note.kind) {
    case "source_conflict":
      // The one exception, and the reason this function exists: noticing that the book
      // is wrong is information for the admin, not grounds to change the lesson.
      return note.subkind === "book_probably_wrong" ? "info" : "blocker";
    case "coverage_gap":
      return note.subkind === "core" ? "blocker" : "warn";
    case "language":
    case "age":
      return "warn";
  }
}

/**
 * Turn the model's raw notes into classified ones.
 *
 * Unknown kinds are dropped rather than defaulted to `warn`: a model that invents its
 * own note kind should not get a quiet pass into the admin's queue.
 */
export function classifyNotes(raw: RawNote[]): LektorNote[] {
  return raw
    .filter((note) => (NOTE_KINDS as readonly string[]).includes(note.kind))
    .map((note) => {
      const severity = severityOf(note);
      return {
        ...note,
        severity,
        blocking: severity === "blocker",
        adminOnly: note.subkind === "book_probably_wrong",
      };
    });
}

export type LektorVerdict = {
  /** The same lesson that came in. Present so callers cannot forget to carry it. */
  lesson: Lesson;
  blockers: LektorNote[];
  warnings: LektorNote[];
  adminNotes: LektorNote[];
};

/**
 * Record the verdict without touching the lesson.
 *
 * There is intentionally no code path here that edits `lesson`. When a blocker stands,
 * the pipeline sends the lesson back to the Author for another round — rewriting is the
 * Author's job, under the same source constraints, never a silent patch by the reviewer.
 */
export function applyLektorVerdict(lesson: Lesson, raw: RawNote[]): LektorVerdict {
  const notes = classifyNotes(raw);
  return {
    lesson,
    blockers: notes.filter((n) => n.blocking),
    warnings: notes.filter((n) => n.severity === "warn"),
    adminNotes: notes.filter((n) => n.adminOnly),
  };
}
