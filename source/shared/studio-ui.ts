/**
 * LS-2c — pure view-model layer for the Studio client components.
 *
 * The React components (JobMonitor, OutlineReview, LektorNotes) render what these
 * functions compute. Keeping the logic here means it is unit-testable without jsdom —
 * the same discipline the server pipeline follows — and the components stay thin.
 *
 * All user-facing strings are Hungarian; see docs/ls-2c-pipeline-hasznalat.md.
 */

import type { LektorNote, RawNote } from "../server/studio/lektor";
import type { OutlineSection } from "../server/studio/step-io";

/* ------------------------------------------------------------------ *
 * Job polling — the GET /api/studio/jobs/:id view model
 * ------------------------------------------------------------------ */

/** The job summary as GET /api/studio/jobs/:id returns it. */
export type JobSummary = {
  id: string;
  step: string;
  status: string;
  round: number;
  error: string | null;
  model?: string | null;
  createdAt?: string;
  finishedAt?: string | null;
};

/** Only a job that is being worked on is worth polling; parked/finished ones are not. */
export function isPollingStatus(status: string): boolean {
  return status === "pending" || status === "running";
}

/** The Hungarian step labels the monitor shows. */
const STEP_LABELS: Record<string, string> = {
  pedagogue: "Pedagógus",
  author: "Szerző",
  lektor: "Lektor",
  gate: "Kapu",
  done: "Kész",
  error: "Hiba",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Várakozás",
  running: "Dolgozik…",
  ok: "Elkészült",
  error: "Hiba",
};

export type JobMonitorView = {
  stepLabel: string;
  statusLabel: string;
  roundLabel: string | null;
  error: string | null;
  /** True while GET /jobs/:id should keep being polled (every 2s). */
  polling: boolean;
  /** The job has reached a state the client can stop watching. */
  finished: boolean;
  /** The pipeline is parked at the Author step waiting for the admin's outline approval. */
  waitingApproval: boolean;
};

/**
 * Derive everything the monitor renders from the raw job row.
 *
 * `waitingApproval` is not a status the server sends — it is inferred from
 * `step === "author"` plus a status that is not `running`, which is exactly how the
 * pipeline parks a job for the admin gate (routes `drive()` marks it `ok` when the next
 * step needs the admin).
 */
export function jobMonitorView(
  job: JobSummary,
  produced: { approvedOutline?: boolean } = {},
): JobMonitorView {
  const polling = isPollingStatus(job.status);
  const waitingApproval = job.step === "author" && !polling && produced.approvedOutline !== true;

  return {
    stepLabel: STEP_LABELS[job.step] ?? job.step,
    statusLabel: waitingApproval
      ? "Várakozás jóváhagyásra"
      : (STATUS_LABELS[job.status] ?? job.status),
    roundLabel: job.round > 0 ? `${job.round}. javítási kör` : null,
    error: job.error,
    polling,
    finished: !polling && job.step !== "author",
    waitingApproval,
  };
}

/* ------------------------------------------------------------------ *
 * Lektor notes — three severity lists + the admin-only D1 split
 * ------------------------------------------------------------------ */

/** What GET /api/studio/jobs/:id/notes returns. */
export type ApiNote = {
  id: string;
  kind: string;
  subkind: string | null;
  severity: string;
  message: string;
  blockPath: string | null;
  resolvedBy: string | null;
};

/** A note as one of the three lists renders it (resolved ones are filtered out). */
export type NoteView = {
  id: string;
  kind: string;
  subkind: string | null;
  message: string;
  blockPath: string | null;
};

export type GroupedNotes = {
  blocker: NoteView[];
  warn: NoteView[];
  info: NoteView[];
  adminOnly: NoteView[];
};

/** A resolved note is closed; the server sends resolvedBy when a human settled it. */
function isResolved(note: ApiNote): boolean {
  return note.resolvedBy !== null && note.resolvedBy !== undefined;
}

/**
 * Split the lektor's notes into the three severity lists the LektorNotes component
 * renders, plus `adminOnly` — the `book_probably_wrong` notes that are shown to the
 * admin and never reach the pupil (D1).
 *
 * Notes a human already resolved are dropped: the queue shows what still needs a
 * decision, not history.
 */
export function groupNotesBySeverity(notes: ApiNote[]): {
  blocker: NoteView[];
  warn: NoteView[];
  info: NoteView[];
  adminOnly: NoteView[];
} {
  const keep = notes.filter((n) => !isResolved(n));
  const toView = (n: ApiNote): NoteView => ({
    id: n.id,
    kind: n.kind,
    subkind: n.subkind,
    message: n.message,
    blockPath: n.blockPath,
  });

  const bySeverity = (severity: string): NoteView[] =>
    keep.filter((n) => n.severity === severity).map(toView);

  return {
    blocker: bySeverity("blocker"),
    warn: bySeverity("warn"),
    info: bySeverity("info"),
    adminOnly: keep.filter((n) => n.subkind === "book_probably_wrong").map(toView),
  };
}

/* ------------------------------------------------------------------ *
 * Outline reordering — the pure core of the @dnd-kit drag
 * ------------------------------------------------------------------ */

/** Move `from` before `to`; out-of-range indices are a no-op, the input is never mutated. */
export function reorderSections<T>(items: T[], from: number, to: number): T[] {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Client-side preview of what the sections will look like after a drag — same
 * array-move as reorderSections but on section objects.
 */
export function reorderOutline(sections: OutlineSection[], from: number, to: number): OutlineSection[] {
  return reorderSections(sections, from, to);
}

/** Hungarian severity labels shared by the notes UI. */
export const SEVERITY_LABELS: Record<string, string> = {
  blocker: "Blokkoló",
  warn: "Figyelmeztetés",
  info: "Információ",
};

/** Hungarian note-kind labels. */
export const NOTE_KIND_LABELS: Record<string, string> = {
  source_conflict: "Forrás-ütközés",
  coverage_gap: "Fedettségi hiány",
  language: "Nyelv",
  age: "Életkor",
};

export type { LektorNote, RawNote };
