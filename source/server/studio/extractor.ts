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
  /** Server-derived document transcript; never the encoded binary payload. */
  extractedText?: string;
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
  /** Hash of the actual prompt/model configuration resolved for this request. */
  signature?: string;
  /** Returns a stored map for this hash, or null when nothing is cached. */
  findByHash: (hash: string) => Promise<{ id: string; [k: string]: unknown } | null>;
  save: (map: Record<string, unknown>) => Promise<unknown>;
  runModel: (input: {
    files: ExtractorFile[];
    scope: ExtractorScope;
    repair?: ExtractionRepair;
  }) => Promise<RawExtraction>;
};

/**
 * Content-addressed key for one extraction job.
 *
 * File names are provenance, not identity. Exact content digests are sorted; kind,
 * scope and extraction version remain significant. Cached maps keep their original
 * sourceFiles/sourceRef names together; a new upload must not rename old provenance.
 */
export const EXTRACTION_VERSION = "source-ledger-6-transcript";
export function extractionSignature(config: { model: string; systemPrompt: string; ocrModel: string; ocrPrompt: string; provider: string }): string {
  return createHash("sha256").update(JSON.stringify([EXTRACTION_VERSION, config.model, config.systemPrompt, config.ocrModel, config.ocrPrompt, config.provider])).digest("hex");
}
export function computeInputHash(
  files: Array<{ name: string; content: string; kind?: SourceKind }>,
  scope: ExtractorScope,
  version = EXTRACTION_VERSION,
): string {
  const hash = createHash("sha256");
  const contentKeys = files.map(file => [file.kind ?? "text", createHash("sha256").update(file.content).digest("hex")].join(":"));
  hash.update(JSON.stringify({ version, files: contentKeys.sort() }));
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
    .map((f) => f.extractedText ?? (f.content.startsWith("data:") ? "" : f.content))
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
 * Malformed concepts receive one bounded repair. Valid proposals stay untouched;
 * an unresolved malformed item must not silently disappear from the taught source.
 * Concepts that fail the verbatim check are KEPT but flagged, because the teacher
 * needs to see what the model tried to claim.
 */
/** Page numbers have no meaning for unpaginated text/image uploads. Keep PDF validation strict. */
export function parseExtractorConcept(raw: unknown, files: ExtractorFile[]) {
  if (raw && typeof raw === "object" && "sourceRef" in raw) {
    const ref = raw.sourceRef;
    if (ref && typeof ref === "object" && "file" in ref) {
      const file = files.find((f) => f.name === ref.file);
      if (file && (file.kind === "text" || file.kind === "image")) {
        const { page: _page, ...unpaginatedRef } = ref as Record<string, unknown>;
        return conceptSchema.safeParse({ ...raw, sourceRef: unpaginatedRef });
      }
    }
  }
  return conceptSchema.safeParse(raw);
}

export type ExtractionIssue = { index: number; fields: string[] };
export type ExtractionRepair = { concepts: unknown[]; issues: ExtractionIssue[] };
export class ExtractionShapeError extends Error {
  constructor(public readonly issues: ExtractionIssue[]) {
    super(`A forrásjegyzék ${issues.length} hibás fogalmát nem sikerült javítani. A hiányos jegyzék nem lett elmentve. Érintett elemek: ${issues.map(i => `${i.index + 1}. (${i.fields.join(", ")})`).join("; ")}.`);
    this.name = "ExtractionShapeError";
  }
}

/** Original order and every valid concept survive a targeted repair unchanged. */
export async function completeExtractionConcepts(raw: RawExtraction, files: ExtractorFile[], repair: (input: ExtractionRepair) => Promise<RawExtraction>): Promise<Concept[]> {
  const inspect = (items: unknown[]) => {
    const seen = new Set<string>();
    const issues: ExtractionIssue[] = [];
    const concepts: Concept[] = [];
    items.forEach((item, index) => {
      const parsed = parseExtractorConcept(item, files);
      if (!parsed.success) { issues.push({ index, fields: [...new Set(parsed.error.issues.map(i => i.path.join(".")))] }); return; }
      const fields = [];
      if (seen.has(parsed.data.id)) fields.push("id: ismétlődés");
      if (!files.some(f => f.name === parsed.data.sourceRef.file)) fields.push("sourceRef.file: ismeretlen forrás");
      if (fields.length) { issues.push({ index, fields }); return; }
      seen.add(parsed.data.id);
      concepts.push(parsed.data);
    });
    return { issues, concepts };
  };
  const first = inspect(raw.concepts);
  if (!first.issues.length) return first.concepts;
  const fixed = await repair({ concepts: first.issues.map(i => raw.concepts[i.index]), issues: first.issues });
  if (!Array.isArray(fixed.concepts) || fixed.concepts.length !== first.issues.length) throw new ExtractionShapeError(first.issues);
  const combined = [...raw.concepts];
  first.issues.forEach((issue, n) => { combined[issue.index] = fixed.concepts[n]; });
  const result = inspect(combined);
  if (result.issues.length) throw new ExtractionShapeError(result.issues);
  return result.concepts;
}

/** One independent source pass supplements omissions; it cannot replace valid originals. */
export async function completeSourceCoverage(concepts: Concept[], files: ExtractorFile[], audit: (existing: Concept[]) => Promise<RawExtraction>): Promise<Concept[]> {
  const missing = await audit(concepts);
  const ids = new Set(concepts.map(c => c.id));
  const additions = missing.concepts.map((item, index) => {
    const parsed = parseExtractorConcept(item, files);
    if (!parsed.success || !files.some(f => f.name === parsed.data.sourceRef.file)) {
      throw new Error("A forrásfedettség ellenőrzése hibás pótlást adott. Hiányos jegyzék nem menthető.");
    }
    let id = parsed.data.id;
    let suffix = 0;
    while (ids.has(id)) id = `coverage-${index + 1}-${++suffix}`;
    ids.add(id);
    return { ...parsed.data, id };
  });
  return [...concepts, ...additions];
}

export async function extractKnowledgeMap(
  input: { files: ExtractorFile[]; scope: ExtractorScope },
  deps: ExtractorDeps,
): Promise<ExtractResult> {
  const inputHash = computeInputHash(input.files, input.scope, deps.signature);

  const cached = await deps.findByHash(inputHash);
  if (cached) {
    return { cached: true, map: cached as ExtractResult["map"] };
  }

  const raw = await deps.runModel(input);

  const valid = await completeExtractionConcepts(raw, input.files, repair => deps.runModel({ ...input, repair }));
  const emptyReason = emptyExtractionReason(raw.concepts.length, valid.length);
  if (emptyReason) throw new Error(emptyReason);

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

/**
 * Pure: why an extraction result must not become a map. `null` = fine. Lives here (DB-free module) so the
 * unit test can import it; run-extraction.ts throws with this message so the job/run shows the teacher a
 * real cause instead of a silent empty map.
 */
export function emptyExtractionReason(rawCount: number, checkedCount: number): string | null {
  if (rawCount === 0) {
    return "A modell egyetlen fogalmat sem adott vissza — a forrás valószínűleg olvashatatlan vagy üres. Próbáld jobb minőségű képpel / szöveggel.";
  }
  if (checkedCount === 0) {
    return `A modell ${rawCount} fogalmat adott, de egyik sem volt alakilag érvényes — a kivonatolás nem menthető.`;
  }
  return null;
}
