import { z } from "zod";

/**
 * POST /api/studio/lessons/from-map/:mapId body.
 *
 * #180: the scope is OPTIONAL. The Studio panel promises "a lecke a térkép szerinti
 * tantárgyból és osztályba készül" and posts an empty body; the map is the single source
 * of truth, so no scope means "use the map's". A scope that IS given must be complete
 * and must agree with the map (startJobFromMap answers 409 otherwise). Lives in a
 * DB-free module so the unit test can import it.
 */
export const fromMapScope = z.object({
  subject: z.string().trim().min(1).max(120),
  classroom: z.number().int().min(0).max(12),
});

export const fromMapBody = fromMapScope.optional().or(z.object({}).strict());

export type FromMapScope = z.infer<typeof fromMapScope>;
