/**
 * LS-6 (#164) — one-step lesson manufacturing (owner decision, 2026-09-05).
 *
 * The two-step flow (build a map, then separately start a lesson) exists for
 * governance, not for the teacher's benefit. This module keeps every REAL gate
 * (verbatim check, coverage check, lektor) and removes only the manual clicks:
 *
 *   upload → [infer scope if omitted] → extraction (existing, hash-idempotent)
 *          → lesson job starts immediately → outline auto-approved IFF the
 *            mechanical coverage check passes → author → animator → lektor.
 *
 * Pure decision logic lives here (unit-tested); the loop that applies it sits
 * in lesson-pipeline-routes.ts next to the existing drive().
 */

import { z } from "zod";
import { SOURCE_KINDS } from "../../shared/knowledge-map-schema";
import type { ExtractorFile, ExtractorScope } from "./extractor";

/* ---------------------------- request schema ---------------------------- */

const scopeSchema = z.object({
  subject: z.string().trim().min(1).max(120),
  classroom: z.number().int().min(0).max(12),
  unit: z.string().trim().min(1).max(255).optional(),
});

export const oneStepRequestSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  scope: scopeSchema.optional(), // omitted → inferred from the sources
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

/* ----------------------------- scope inference -------------------------- */

export type ScopeInference =
  | { ok: true; scope: ExtractorScope; title?: string }
  | { ok: false; reason: string };

export type ScopeModelFn = (files: ExtractorFile[]) => Promise<string>;

const SCOPE_PROMPT = [
  "You are given a Hungarian primary/secondary school teaching source (text and/or images).",
  'Answer with a single JSON object, nothing else: {"subject": "<tantárgy magyarul>",',
  '"classroom": <0-12 integer>, "title": "<rövid magyar cím>"}.',
  "Pick the classroom the material is most likely written for.",
].join(" ");

/** Parse the model's scope guess; clamp classroom; never throw. */
export async function inferScope(files: ExtractorFile[], callModel: ScopeModelFn): Promise<ScopeInference> {
  try {
    const answer = await callModel(files);
    const match = answer.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, reason: "A modell válaszában nincs JSON." };
    const parsed = JSON.parse(match[0]) as { subject?: unknown; classroom?: unknown; title?: unknown };
    const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : "";
    const classroomRaw = typeof parsed.classroom === "number" ? Math.round(parsed.classroom) : NaN;
    if (subject === "" || Number.isNaN(classroomRaw)) {
      return { ok: false, reason: "A modell nem adott tantárgyat/osztályt." };
    }
    const classroom = Math.min(12, Math.max(0, classroomRaw));
    const title = typeof parsed.title === "string" && parsed.title.trim() !== "" ? parsed.title.trim() : undefined;
    return { ok: true, scope: { subject, classroom }, title };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Default scope model call: one cheap vision call over all sources. */
export async function callScopeModel(files: ExtractorFile[], model: string): Promise<string> {
  const OpenAI = (await import("openai")).default;
  const useOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);
  const client = new OpenAI(
    useOpenRouter
      ? { baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY, timeout: 120000 }
      : {
          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
          apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
          timeout: 120000,
        },
  );

  const parts: Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "low" } }
  > = [];
  for (const file of files) {
    if (file.kind === "image") parts.push({ type: "image_url", image_url: { url: file.content, detail: "low" } });
    else parts.push({ type: "text", text: file.content.slice(0, 4000) });
  }

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SCOPE_PROMPT },
      { role: "user", content: parts },
    ],
    max_completion_tokens: 300,
  });
  return response.choices[0]?.message?.content ?? "";
}
