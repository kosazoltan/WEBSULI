import { z } from "zod";

import {
  conceptSchema,
  REVIEW_STATES,
  SOURCE_KINDS,
} from "../../shared/knowledge-map-schema";
import { checkVerbatim } from "./verbatim";

/**
 * Request parsing and update-building for the Studio endpoints.
 *
 * Extracted from studio/routes.ts so the decisions that matter can be tested without
 * booting Express or a database. The important one: `verbatimOk` is computed here from
 * the stored source text and is never taken from the request body — a client must not
 * be able to certify its own claim as source-faithful (D1).
 */

export const scopeSchema = z.object({
  subject: z.string().trim().min(1).max(120),
  classroom: z.number().int().min(0).max(12),
  unit: z.string().trim().min(1).max(255).optional(),
});

export const extractRequestSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  scope: scopeSchema,
  files: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(255),
        kind: z.enum(SOURCE_KINDS),
        content: z.string().min(1),
      }),
    )
    .min(1),
});

export type ExtractRequest = z.infer<typeof extractRequestSchema>;

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; issues: Array<{ path: string; message: string }> };

function toIssues(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

export function parseExtractRequest(body: unknown): ParseResult<ExtractRequest> {
  const parsed = extractRequestSchema.safeParse(body);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, issues: toIssues(parsed.error) };
}

export const conceptPatchSchema = conceptSchema
  .pick({ term: true, definition: true, quote: true, type: true, examWeight: true })
  .partial()
  .extend({
    reviewState: z.enum(REVIEW_STATES).optional(),
    orderIndex: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Üres módosítás." });

export type ConceptPatch = z.infer<typeof conceptPatchSchema>;

export function parseConceptPatch(body: unknown): ParseResult<ConceptPatch> {
  const parsed = conceptPatchSchema.safeParse(body);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, issues: toIssues(parsed.error) };
}

export type ConceptUpdate = {
  updatedAt: Date;
  term?: string;
  definition?: string;
  quote?: string;
  type?: string;
  examWeight?: string;
  reviewState?: string;
  orderIndex?: number;
  verbatimOk?: boolean;
  verbatimReason?: string | null;
};

/**
 * Translate a validated patch into a database update.
 *
 * Only fields the caller actually sent are written. `verbatimOk` appears in the result
 * exclusively when the quote changed, and is then derived from `sourceText` — any
 * `verbatimOk` in the incoming patch is ignored by construction, because the patch type
 * has no such field and the value is recomputed here.
 */
export function buildConceptUpdate(
  patch: Record<string, unknown>,
  sourceText: string,
): ConceptUpdate {
  const update: ConceptUpdate = { updatedAt: new Date() };

  if (typeof patch.term === "string") update.term = patch.term;
  if (typeof patch.definition === "string") update.definition = patch.definition;
  if (typeof patch.type === "string") update.type = patch.type;
  if (typeof patch.examWeight === "string") update.examWeight = patch.examWeight;
  if (typeof patch.reviewState === "string") update.reviewState = patch.reviewState;
  if (typeof patch.orderIndex === "number") update.orderIndex = patch.orderIndex;

  if (typeof patch.quote === "string") {
    update.quote = patch.quote;
    const verdict = checkVerbatim(patch.quote, sourceText);
    update.verbatimOk = verdict.ok;
    update.verbatimReason = verdict.ok ? null : verdict.reason;
  }

  return update;
}
