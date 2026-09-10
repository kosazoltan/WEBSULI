import { z } from "zod";
import { lessonSchema } from "./lesson-schema";

/** A reviewable candidate, never HTML disguised as a structured lesson. */
export const lessonRepairSchema = z.object({
  kind: z.literal("lesson-repair-fusion-1"),
  lessonId: z.string().min(1), baseVersion: z.number().int().positive(),
  baselineHash: z.string().length(64), baselineMaterialHash: z.string().length(64), sourceHash: z.string().length(64),
  previousLesson: lessonSchema, candidate: lessonSchema,
});
export type LessonRepair = z.infer<typeof lessonRepairSchema>;
export function parseLessonRepair(content?: string): LessonRepair | null {
  if (!content?.trim().startsWith("{")) return null;
  try { const parsed = lessonRepairSchema.safeParse(JSON.parse(content)); return parsed.success ? parsed.data : null; }
  catch { return null; }
}
