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

/* ------------------------------------------------------------------ *
 * LS-5b — feedback panel view-model (concept stats, fix, quiz export)
 * ------------------------------------------------------------------ */

/** A row of GET /api/studio/lessons/:id/concept-stats. */
export type ConceptStat = { conceptId: string; total: number; correct: number; rate: number };

export type ConceptStatRow = {
  conceptId: string;
  /** pl. "c2 — 3/8 (38%)" */
  label: string;
  /** A küszöb alatt ÉS elég méréssel — a sor pirosan jelölhető. */
  weak: boolean;
  /** A "javítsd ezt a fogalmat" gomb kérhető rá (mindig, ha van sor). */
  fixable: boolean;
};

/**
 * A fogalom-statisztika sorai. A `weak` ugyanazzal a szabállyal számol, mint a
 * szerver-oldali weakConceptIds (küszöb + minTotal) — a kliens csak megjeleníti,
 * de a jelölésnek egyeznie kell azzal, amit a szerver gyengének tartana.
 */
export function conceptStatRows(
  stats: ConceptStat[],
  threshold: number,
  opts: { minTotal?: number } = {},
): ConceptStatRow[] {
  const minTotal = opts.minTotal ?? 3;
  return stats.map((s) => ({
    conceptId: s.conceptId,
    label: `${s.conceptId} — ${s.correct}/${s.total} (${Math.round(s.rate * 100)}%)`,
    weak: s.total >= minTotal && s.rate < threshold,
    fixable: true,
  }));
}

/** A visszacsatolási panel csak KÉSZ lecke mellett értelmes. */
export function feedbackPanelVisible(step: string, lessonId: string | null): boolean {
  return step === "done" && lessonId !== null;
}

/** Az export gomb tiltásának indoka; null = engedélyezett. */
export function quizExportDisabledReason(gameId: string, stats: ConceptStat[]): string | null {
  if (gameId === "") return "Válassz játékot az exporthoz.";
  if (stats.length === 0) return "Ehhez a leckéhez még nincs fogalom-eredmény.";
  return null;
}

/* ------------------------------------------------------------------ *
 * LS-2a-fix — source upload for map extraction (board #157)
 * ------------------------------------------------------------------ */

/** A server-side SOURCE_KINDS tükre — a payload ezt a szűk halmazt küldheti. */
export type SourceFileKind = "pdf" | "image" | "docx" | "text";

export type SourceFile = { name: string; kind: SourceFileKind; content: string };

const KIND_BY_EXT: Record<string, SourceFileKind> = {
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  docx: "docx",
  txt: "text",
  md: "text",
};

/** Fájlnév → forrás-fajta; nem támogatott kiterjesztésre null (nem megy át csendben). */
export function fileKindOf(fileName: string): SourceFileKind | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return KIND_BY_EXT[ext] ?? null;
}

/**
 * A beolvasott fájlból a szerver felé küldhető forrás-objektum: szövegfélék
 * nyers szövegként, kép/PDF data-URL-ként (az extractor így várja). Ismeretlen
 * fajtára null — a hívó dolga a hibát megmutatni.
 */
export function sourceFileFromRead(fileName: string, content: string): SourceFile | null {
  const kind = fileKindOf(fileName);
  if (!kind) return null;
  return { name: fileName, kind, content };
}

/** A POST /api/studio/maps/extract törzse — a szerver extractRequestSchema alakja. */
export function buildExtractPayload(input: {
  title: string;
  subject: string;
  classroom: number;
  files: SourceFile[];
}): { title?: string; scope: { subject: string; classroom: number }; files: SourceFile[] } {
  const title = input.title.trim();
  return {
    ...(title !== "" ? { title } : {}),
    scope: { subject: input.subject, classroom: input.classroom },
    files: input.files,
  };
}

/** A kivonatolás gomb tiltásának indoka; null = mehet. */
export function extractSubmitDisabledReason(
  subject: string,
  classroom: number,
  fileCount: number,
): string | null {
  if (subject.trim() === "") return "Add meg a tantárgyat.";
  if (!Number.isInteger(classroom) || classroom < 0 || classroom > 12) return "Az osztály 0 és 12 között lehet.";
  if (fileCount === 0) return "Tölts fel legalább egy forrásfájlt.";
  return null;
}

export type { LektorNote, RawNote };
