import { z } from "zod";
export const scopeClassificationSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
  confidence: z.enum(["low", "medium", "high"]),
  gradeRange: z.tuple([z.number().int().min(0).max(12), z.number().int().min(0).max(12)]).refine(([a, b]) => a <= b),
  mixedContent: z.boolean(),
});
export type ScopeClassification = z.infer<typeof scopeClassificationSchema>;
