import { z } from "zod";
import { lessonSchema } from "./lesson-schema";

/** A reviewable candidate, never HTML disguised as a structured lesson. */
export const lessonRepairSchema = z.object({
  kind: z.literal("lesson-repair-fusion-1"),
  lessonId: z.string().min(1), baseVersion: z.number().int().positive(),
  baselineHash: z.string().length(64), baselineMaterialHash: z.string().length(64), sourceHash: z.string().length(64),
  previousLesson: lessonSchema, candidate: lessonSchema,
  // Admin audit data; never part of the pupil's lesson or a source rewrite.
  reviewNotes: z.array(z.object({
    kind: z.enum(["source_conflict", "coverage_gap", "language", "age"]),
    subkind: z.string().optional(), message: z.string(), blockPath: z.string().optional(),
  })).optional(),
  // Spec 2026-09-23: the teacher's request and the documented source corrections it justified; written
  // to the map rows only when the reviewed candidate is applied (the quote never changes).
  ownerInstruction: z.string().max(4000).optional(),
  sourceCorrections: z.array(z.object({
    localId: z.string().min(1), term: z.string().min(1).optional(), definition: z.string().min(1).optional(),
    basis: z.enum(["owner", "transcription"]), reason: z.string(),
    from: z.object({ term: z.string().optional(), definition: z.string().optional() }),
  })).optional(),
  classroom: z.number().int().min(1).max(12).optional(),
});
export type LessonRepair = z.infer<typeof lessonRepairSchema>;
export function parseLessonRepair(content?: string): LessonRepair | null {
  if (!content?.trim().startsWith("{")) return null;
  try { const parsed = lessonRepairSchema.safeParse(JSON.parse(content)); return parsed.success ? parsed.data : null; }
  catch { return null; }
}
