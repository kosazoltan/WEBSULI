import { createHash } from "node:crypto";

import {
  conceptSchema,
  type Concept,
  type ExamWeight,
  type ReviewState,
  type SourceKind,
} from "../../shared/knowledge-map-schema";
import { checkVerbatim } from "./verbatim";

/**
 * Turning uploaded source files into a reviewable KnowledgeMap.
 *
 * Two properties drive the design:
 *
 * 1. Extraction is a paid vision call over a whole document, so the same upload must
 *    never be billed twice — `computeInputHash` gives a content-addressed key and the
 *    caller short-circuits on a hit.
 * 2. The model's output is a proposal, not truth. Every concept is checked against the
 *    extracted source text (D1) and the map cannot be approved while a core concept is
 *    unquotable, no matter how confident the model sounded.
 *
 * IO lives in `deps` so the logic above can be tested without a network or a database.
 */

export type ExtractorFile = {
  name: string;
  kind: SourceKind;
  /** Extracted text for text-ish inputs, or a base64 data URL for images/PDF pages. */
  content: string;
};

export type ExtractorScope = {
  subject: string;
  classroom: number;
  unit?: string;
};

/** What the model is asked to return; validated before it is trusted. */
export type RawExtraction = {
  title: string;
  concepts: unknown[];
};

export type ExtractorDeps = {
  /** Returns a stored map for this hash, or null when nothing is cached. */
  findByHash: (hash: string) => Promise<{ id: string; [k: string]: unknown } | null>;
  save: (map: Record<string, unknown>) => Promise<unknown>;
  runModel: (input: {
    files: ExtractorFile[];
    scope: ExtractorScope;
  }) => Promise<RawExtraction>;
};

/**
 * Content-addressed key for one extraction job.
 *
 * Sorted by file name so re-uploading the same set in a different order is recognised
 * as the same job; scope is included because the same book extracted for a different
 * classroom is legitimately a different map.
 */
export function computeInputHash(
  files: Array<{ name: string; content: string }>,
  scope: ExtractorScope,
): string {
  const hash = createHash("sha256");
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, "hu"));
  for (const file of sorted) {
    hash.update(file.name);
    hash.update("\u0000");
    hash.update(file.content);
    hash.update("\u0000");
  }
  hash.update(
    JSON.stringify({
      subject: scope.subject,
      classroom: scope.classroom,
      unit: scope.unit ?? null,
    }),
  );
  return hash.digest("hex");
}

/** Plain text available for quote checking (images carry no checkable text). */
export function sourceTextOf(files: ExtractorFile[]): string {
  return files
    .filter((f) => f.kind === "text" || f.kind === "docx" || f.kind === "pdf")
    .map((f) => f.content)
    .join("\n");
}

type CheckableConcept = {
  id: string;
  quote: string;
  examWeight: ExamWeight;
  [k: string]: unknown;
};

/** Stamp each concept with whether its quote really occurs in the source (D1). */
export function applyVerbatimChecks<T extends CheckableConcept>(
  concepts: T[],
  sourceText: string,
): Array<T & { verbatimOk: boolean; verbatimReason?: string }> {
  return concepts.map((concept) => {
    const result = checkVerbatim(concept.quote, sourceText);
    return result.ok
      ? { ...concept, verbatimOk: true }
      : { ...concept, verbatimOk: false, verbatimReason: result.reason };
  });
}

export type CheckedConcept = Concept & { verbatimOk: boolean; verbatimReason?: string };

export type ExtractResult = {
  cached: boolean;
  /**
   * A cached row comes back as stored (concepts may live in a separate table and be
   * loaded separately), so `concepts` is optional here rather than force-cast.
   */
  map: Record<string, unknown> & { concepts?: CheckedConcept[]; inputHash?: string };
};

/**
 * Produce (or reuse) the KnowledgeMap for an upload.
 *
 * Concepts that fail schema validation are dropped rather than crashing the job: a
 * single malformed item from the model should not throw away a 40-concept extraction.
 * Concepts that fail the verbatim check are KEPT but flagged, because the teacher
 * needs to see what the model tried to claim.
 */
export async function extractKnowledgeMap(
  input: { files: ExtractorFile[]; scope: ExtractorScope },
  deps: ExtractorDeps,
): Promise<ExtractResult> {
  const inputHash = computeInputHash(input.files, input.scope);

  const cached = await deps.findByHash(inputHash);
  if (cached) {
    return { cached: true, map: cached as ExtractResult["map"] };
  }

  const raw = await deps.runModel(input);

  const valid = (raw.concepts ?? [])
    .map((c) => conceptSchema.safeParse(c))
    .filter((r): r is { success: true; data: Concept } => r.success)
    .map((r) => r.data);

  const checked = applyVerbatimChecks(valid, sourceTextOf(input.files));

  const map = {
    title: raw.title,
    subject: input.scope.subject,
    classroom: input.scope.classroom,
    unit: input.scope.unit,
    status: "draft" as const,
    inputHash,
    sourceFiles: input.files.map((f) => ({ name: f.name, kind: f.kind })),
    concepts: checked,
  };

  await deps.save(map);
  return { cached: false, map };
}

type ApprovableConcept = {
  id: string;
  examWeight: ExamWeight;
  verbatimOk: boolean;
  reviewState: ReviewState;
};

/**
 * The approval gate: what must hold before a map may bound a lesson.
 *
 * Rejected concepts are excluded first — striking a concept out is a teacher decision,
 * not an unresolved problem.
 */
export function canApprove(
  concepts: ApprovableConcept[],
): { ok: boolean; reason?: string } {
  const live = concepts.filter((c) => c.reviewState !== "rejected");

  if (live.length === 0) {
    return { ok: false, reason: "A térkép nem hagyható jóvá fogalmak nélkül." };
  }

  const pending = live.filter((c) => c.reviewState === "pending");
  if (pending.length > 0) {
    return {
      ok: false,
      reason: `Még ${pending.length} fogalom átnézésre vár.`,
    };
  }

  const unquoted = live.filter((c) => c.examWeight === "core" && !c.verbatimOk);
  if (unquoted.length > 0) {
    return {
      ok: false,
      reason:
        `${unquoted.length} kulcsfogalom nem vezethető vissza a forrásra ` +
        `(hiányzó vagy nem szó szerinti idézet).`,
    };
  }

  return { ok: true };
}
