import { z } from "zod";

/**
 * The KnowledgeMap: what a source document actually says, in structured form.
 *
 * This is the contract the lesson author (LS-2) is bound by. Its central rule comes
 * from D1 — the source always wins: every concept carries a verbatim quote and a
 * pointer to where it came from. A claim that cannot be quoted cannot be taught,
 * which is what keeps generated lessons answerable in a Hungarian oral exam.
 */

export const CONCEPT_TYPES = [
  "definition",
  "fact",
  "date",
  "formula",
  "procedure",
  "person",
  "place",
] as const;

/** How much the concept matters for an exam — drives the LS-2 coverage gate. */
export const EXAM_WEIGHTS = ["core", "supporting", "extra"] as const;

export const SOURCE_KINDS = ["pdf", "image", "docx", "text"] as const;

export const REVIEW_STATES = ["pending", "kept", "edited", "rejected"] as const;

export const MAP_STATUSES = ["draft", "review", "approved"] as const;

export type ConceptType = (typeof CONCEPT_TYPES)[number];
export type ExamWeight = (typeof EXAM_WEIGHTS)[number];
export type SourceKind = (typeof SOURCE_KINDS)[number];
export type ReviewState = (typeof REVIEW_STATES)[number];
export type MapStatus = (typeof MAP_STATUSES)[number];

/** Non-empty after trimming — a blank quote is the failure mode we care about. */
const filledString = (max: number) => z.string().trim().min(1).max(max);

export const sourceRefSchema = z.object({
  file: filledString(255),
  /** 1-based page for PDFs; absent for a plain image or text paste. */
  page: z.number().int().positive().optional(),
  /** Optional crop on the page image, as fractions of width/height. */
  region: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      w: z.number().min(0).max(1),
      h: z.number().min(0).max(1),
    })
    .optional(),
});

export const conceptSchema = z.object({
  id: filledString(64),
  term: filledString(200),
  definition: filledString(2000),
  /**
   * Verbatim slice of the extracted source text. Checked against the source by
   * server/studio/verbatim.ts — the schema only guarantees that something is there.
   */
  quote: filledString(2000),
  sourceRef: sourceRefSchema,
  type: z.enum(CONCEPT_TYPES),
  examWeight: z.enum(EXAM_WEIGHTS),
  relatedIds: z.array(z.string()).default([]),
});

export const sourceFileSchema = z.object({
  name: filledString(255),
  kind: z.enum(SOURCE_KINDS),
  pages: z.number().int().positive().optional(),
});

export const knowledgeMapSchema = z.object({
  title: filledString(255),
  subject: filledString(120),
  /** 0-12, matching shared/classrooms.ts (0 = programozási alapismeretek). */
  classroom: z.number().int().min(0).max(12),
  unit: filledString(255).optional(),
  status: z.enum(MAP_STATUSES).default("draft"),
  sourceFiles: z.array(sourceFileSchema).min(1),
  concepts: z
    .array(conceptSchema)
    .refine(
      (list) => new Set(list.map((c) => c.id)).size === list.length,
      { message: "A fogalom-azonosítók nem ismétlődhetnek." },
    ),
});

export type Concept = z.infer<typeof conceptSchema>;
export type SourceRef = z.infer<typeof sourceRefSchema>;
export type SourceFile = z.infer<typeof sourceFileSchema>;
export type KnowledgeMap = z.infer<typeof knowledgeMapSchema>;
