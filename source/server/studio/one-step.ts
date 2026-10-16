/**
 * LS-6 (#164) — az egylépéses gyártás kérése (feltöltés → kész lecke) és a piszkozatlista döntése.
 * docs/specs/2026-10-16-egy-futas.md (S4b): a tantárgy / évfolyam felismerése az egyfutásos motor 1. állomásán történik — a külön
 * besoroló-modellhívás kivezetve.
 */

import { z } from "zod";
import { SOURCE_KINDS } from "../../shared/knowledge-map-schema";

/* ---------------------------- request schema ---------------------------- */

const scopeSchema = z.object({
  subject: z.string().trim().min(1).max(120),
  classroom: z.number().int().min(0).max(12),
  unit: z.string().trim().min(1).max(255).optional(),
});

export const oneStepRequestSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  // Spec 2026-09-23: the teacher's free-text request to the agent (normalised by normalizeOwnerInstruction).
  instructions: z.string().max(4000).optional(),
  scope: scopeSchema.optional(), // legacy metadata accepted; never used to select grade
  // docs/specs/2026-10-15-hiba-gombok.md (E3): kifejezett újragyártás — a megszakadt piszkozat helyett új gyártás (a régi félretéve).
  forceNew: z.boolean().optional(),
  files: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(255),
        kind: z.enum(SOURCE_KINDS),
        content: z.string().min(1),
      }),
    )
    .min(1)
    .refine(files => new Set(files.map(file => file.name)).size === files.length, {
      message: "Azonos nevű forrásfájlok nem tölthetők fel együtt. Nevezd át az egyik fájlt.",
    }),
});

export type OneStepRequest = z.infer<typeof oneStepRequestSchema>;

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; issues: Array<{ path: string; message: string }> };

export function parseOneStepRequest(body: unknown): ParseResult<OneStepRequest> {
  const parsed = oneStepRequestSchema.safeParse(body);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : {
        ok: false,
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      };
}

/* --------------------------- drive decisions ---------------------------- */

export type OneStepJobSnapshot = {
  step: string;
  status: string;
  output: Record<string, unknown> | null;
};

export type OneStepAction = "approve" | "continue" | "stop";

/**
 * What the one-step driver does with a job between pipeline steps. "approve"
 * fires ONLY on the author-park with a pedagogue outline present and no
 * approval yet — everywhere else the loop either keeps driving or stops
 * exactly like the manual flow would.
 */
export function decideOneStepAction(job: OneStepJobSnapshot): OneStepAction {
  if (job.step === "error" || job.step === "done") return "stop";
  const output = job.output ?? {};
  if (job.step === "author" && output.approvedOutline === undefined) {
    return output.outline !== undefined && job.status === "ok" ? "approve" : "stop";
  }
  return "continue";
}
