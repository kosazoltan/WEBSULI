/**
 * LS-6 (#164) — one-step lesson manufacturing (owner decision, 2026-09-05).
 *
 * The two-step flow (build a map, then separately start a lesson) exists for
 * governance, not for the teacher's benefit. This module keeps every REAL gate
 * (verbatim check, coverage check, lektor) and removes only the manual clicks:
 *
 *   upload → infer scope from source → extraction (existing, hash-idempotent)
 *          → lesson job starts immediately → outline auto-approved IFF the
 *            mechanical coverage check passes → author → animator → lektor.
 *
 * Pure decision logic lives here (unit-tested); the loop that applies it sits
 * in lesson-pipeline-routes.ts next to the existing drive().
 */

import { z } from "zod";
import { readDocxText } from "./document-source";
import { SOURCE_KINDS } from "../../shared/knowledge-map-schema";
import type { ExtractorFile, ExtractorScope } from "./extractor";
import { scopeClassificationSchema, type ScopeClassification } from "../../shared/source-classification";

/* ---------------------------- request schema ---------------------------- */

const scopeSchema = z.object({
  subject: z.string().trim().min(1).max(120),
  classroom: z.number().int().min(0).max(12),
  unit: z.string().trim().min(1).max(255).optional(),
});

export const oneStepRequestSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  scope: scopeSchema.optional(), // legacy metadata accepted; never used to select grade
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

/** Owner policy: legacy caller metadata never determines a manufactured lesson's grade. */
export function inferOneStepScope(data: OneStepRequest, callModel: ScopeModelFn): Promise<ScopeInference> {
  return inferScope(data.files as ExtractorFile[], callModel);
}

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
  | { ok: true; scope: ExtractorScope; title?: string; classification: ScopeClassification }
  | { ok: false; reason: string };

export type ScopeModelFn = (files: ExtractorFile[]) => Promise<string>;


const SCOPE_PROMPT = [
  "You are given a Hungarian primary/secondary school teaching source (text and/or images).",
  'Answer with a single JSON object, nothing else: {"subject": "<tantárgy magyarul>",',
  '"classroom": <0-12 integer>, "title": "<rövid magyar cím>", "classification": {"reason": "<magyar indoklás konkrét forrásbeli témákkal>", "confidence": "low|medium|high", "gradeRange": [<min>, <max>], "mixedContent": <boolean>}}.',
  // #196 (mérve élesben): a korábbi „Pick the classroom the material is most
  // likely written for" találgatásra hívott. A 8. osztályos geometria-forrásra
  // (háromszög területe, kör kerülete, körgyűrű, (n-2)·180°) a modell 4-et adott,
  // és a lecke végig 4. osztályos szinten készült el.
  "Determine the classroom ONLY from the mathematical/technical content that is actually",
  "visible in the source. Ignore handwriting quality and page layout — a messy page is not",
  "a sign of a younger pupil.",
  "Use the dominant learning goals, prerequisite knowledge and depth of actual exercises together.",
  "A passing mention of an advanced word is not a requirement to assign the hardest grade.",
  "Examples of Hungarian curriculum anchors (use these as evidence, not a rigid keyword rule):",
  "  area/perimeter formulas with variables (T = a·m/2), π, circle area/circumference,",
  "  Pythagoras, powers, irrational numbers → grades 7-8, NOT grade 3-4;",
  "  place value, written addition/subtraction, simple fractions → grades 2-4.",
  "When ambiguous, report a plausible grade range and lower confidence with a reason; do not automatically choose the higher grade.",
  "Mark mixedContent when sources contain substantially different levels or subjects. Still choose the best supported main grade autonomously.",
].join(" ");

/** Parse the model's scope guess; clamp classroom; never throw. */
export async function inferScope(files: ExtractorFile[], callModel: ScopeModelFn): Promise<ScopeInference> {
  try {
    const answer = await callModel(files);
    const match = answer.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, reason: "A modell válaszában nincs JSON." };
    const parsed = JSON.parse(match[0]) as { subject?: unknown; classroom?: unknown; title?: unknown; classification?: unknown };
    const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : "";
    const classroomRaw = typeof parsed.classroom === "number" ? Math.round(parsed.classroom) : NaN;
    if (subject === "" || Number.isNaN(classroomRaw)) {
      return { ok: false, reason: "A modell nem adott tantárgyat/osztályt." };
    }
    const classroom = Math.min(12, Math.max(0, classroomRaw));
    const title = typeof parsed.title === "string" && parsed.title.trim() !== "" ? parsed.title.trim() : undefined;
    const checked = scopeClassificationSchema.safeParse(parsed.classification);
    const classification: ScopeClassification = checked.success && checked.data.gradeRange[0] <= classroom && classroom <= checked.data.gradeRange[1]
      ? checked.data : { reason: "A besoroláshoz nem érkezett ellenőrizhető indoklás; bizonytalan gépi javaslat.", confidence: "low", gradeRange: [classroom, classroom], mixedContent: false };
    return { ok: true, scope: { subject, classroom }, title, classification };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

type ScopeContentPart =
  | { type: "text"; text: string }
  | { type: "file"; file: { filename: string; file_data: string } }
  | { type: "image_url"; image_url: { url: string; detail: "low" | "high" } };

/** Classify document content, never a truncated base64 string. */
export async function scopeContentParts(
  files: ExtractorFile[],
  readDocx: (content: string) => Promise<string> = readDocxText,
): Promise<ScopeContentPart[]> {
  const parts: ScopeContentPart[] = [];
  for (const file of files) {
    if (file.extractedText !== undefined) parts.push({ type: "text", text: file.extractedText });
    else if (file.kind === "image") parts.push({ type: "image_url", image_url: { url: file.content, detail: "high" } });
    else if (file.kind === "pdf" && file.content.startsWith("data:")) parts.push({ type: "file", file: { filename: file.name, file_data: file.content } });
    else {
      const text = file.kind === "docx" ? await readDocx(file.content) : file.content;
      if (!text.trim()) throw new Error("A dokumentumból nem olvasható tananyagszöveg.");
      parts.push({ type: "text", text });
    }
  }
  return parts;
}

/**
 * A scope-hívás kérés-paraméterei — külön függvényben, mert a #165 gyökér-ok
 * pontosan itt volt: a glm-flash osztálynál a reasoning kötelező, és a szűk
 * (300) token-keretet teljesen elette (finish=length, content=null). Mérve:
 * effort:low + 2000 keret mellett a válasz stabilan megjön.
 */
export function scopeRequestParams(model: string, parts: ScopeContentPart[]) {
  return {
    model,
    messages: [
      { role: "system" as const, content: SCOPE_PROMPT },
      { role: "user" as const, content: parts },
    ],
    max_completion_tokens: 2000,
    reasoning: { effort: "low" as const },
  };
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

  const parts = await scopeContentParts(files);

  const params = scopeRequestParams(model, parts);
  // A `reasoning` OpenRouter-bővítés; az openai SDK típusa nem ismeri.
  const response = await client.chat.completions.create(
    params as unknown as Parameters<typeof client.chat.completions.create>[0],
  );
  if ("choices" in response) return response.choices[0]?.message?.content ?? "";
  return "";
}
