import { z } from "zod";

/**
 * D1H (docs/specs/2026-11-25-d1h-kivagott-kep.md, tulajdonosi döntés 2026-11-24: D1 HIBRID): a forrás fényképe / nehezen rajzolható
 * ábrája kivágott képként, forrásmegjelöléssel. A kép tartalomcímzett (sha256), a `GET /api/source-images/:id` adja.
 */
export const SOURCE_IMAGE_ID = /^[a-f0-9]{64}$/;
export const sourceImageParamsSchema = z.object({
  imageId: z.string().regex(SOURCE_IMAGE_ID),
  alt: z.string().trim().min(1).max(200),
  credit: z.string().trim().min(1).max(200),
  sourceUrl: z.string().max(2000).url().refine(u => u.startsWith("https://"), "Csak https forrás-URL.").optional(),
  page: z.number().int().min(1).max(2000).optional(),
}).strict();
export type SourceImageParams = z.infer<typeof sourceImageParamsSchema>;
export const sourceImageSrc = (id: string) => `/api/source-images/${id}`;
