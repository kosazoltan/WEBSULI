/**
 * Central model routing for the Lesson Studio pipeline (LS-0d).
 *
 * Why this file exists: model ids used to be string literals inside routes.ts, so
 * changing a model meant editing request handlers, and nothing could check that two
 * pipeline steps were not accidentally the same model.
 *
 * The D1 rule ("the source always wins") is enforced by a Lektor that re-reads the
 * Author's lesson against the KnowledgeMap. If both run on the same model family the
 * review is worthless — a model rarely catches its own fabrication. `assertDistinctFamilies`
 * makes that a startup error rather than a silent quality loss.
 *
 * Owner decision 2026-09-04: no local models. The workstation GPU is dead, so every id
 * here is a hosted OpenRouter id; a local Ollama tag (`name:tag`) must never appear.
 */

export const STUDIO_STEPS = [
  "extract",
  "pedagogue",
  "author",
  "animator",
  "lektor",
  "gateHelper",
  "quizPolish",
] as const;

export type StudioStep = (typeof STUDIO_STEPS)[number];

/** Environment-variable name that overrides a step, e.g. STUDIO_MODEL_AUTHOR. */
function envVarName(step: StudioStep): string {
  return `STUDIO_MODEL_${step.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`;
}

/**
 * Primary model per pipeline step (verified against OpenRouter /api/v1/models, 2026-09-04).
 * Fallbacks live in FALLBACK_MODELS and are used by the provider factory on failure.
 */
const DEFAULT_MODELS: Record<StudioStep, string> = {
  extract: "openai/gpt-5.6-terra", // vision + verbatim quoting
  pedagogue: "x-ai/grok-4.6", // planning, misconceptions
  author: "openai/gpt-5.6-terra", // long structured Hungarian output
  animator: "qwen/qwen3.8-flash", // bounded transform, cheap
  lektor: "qwen/qwen3.8-max", // MUST differ in family from author
  gateHelper: "z-ai/glm-5.3-flash", // cheap classification
  quizPolish: "z-ai/glm-5.3-flash",
};

export const FALLBACK_MODELS: Partial<Record<StudioStep, string>> = {
  extract: "x-ai/grok-4.6",
  pedagogue: "openai/gpt-5.6-terra",
  author: "qwen/qwen3.8-max",
  animator: "z-ai/glm-5.3-flash",
  lektor: "z-ai/glm-5.3",
};

/**
 * Model ids the pre-Studio routes already used. Kept verbatim so moving them out of
 * routes.ts changes no behaviour; they are NOT OpenRouter ids (they go to the
 * vendor SDKs directly).
 */
export const LEGACY_MODELS = {
  /** adminRouter POST /html-fix/errors — Claude JSON HTML repair (routes.ts ~1203) */
  htmlFix: "claude-3-5-sonnet-20241022",
  /** adminRouter POST /html-fix/theme — Claude JSON theme rewrite (routes.ts ~1293) */
  htmlTheme: "claude-3-5-sonnet-20241022",
  /** Enhanced Creator SSE two-phase OpenAI HTML fix (routes.ts ~1456, ~1485) */
  htmlFixStream: "gpt-5",
  /** Enhanced Creator Claude chat stream, full HTML generation (routes.ts ~1767) */
  claudeChat: "claude-3-5-sonnet-20241022",
  /** Vision analysis of uploaded files (routes.ts ~1919 multi, ~2032 single) */
  analyzeFiles: "gpt-5",
} as const;

type EnvLike = Record<string, string | undefined>;

/** Resolves the model for a step, honouring a non-blank environment override. */
export function resolveStudioModel(step: StudioStep, env: EnvLike = process.env): string {
  const override = env[envVarName(step)];
  if (typeof override === "string" && override.trim().length > 0) {
    return override.trim();
  }
  return DEFAULT_MODELS[step];
}

/** Vendor prefix of an OpenRouter id (`openai/gpt-5` → `openai`). */
export function modelFamily(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash === -1 ? modelId : modelId.slice(0, slash);
}

/**
 * Fails fast when the Author and the Lektor would run on the same vendor family,
 * which would silently disable the independent D1 source-fidelity review.
 */
export function assertDistinctFamilies(env: EnvLike = process.env): void {
  const author = resolveStudioModel("author", env);
  const lektor = resolveStudioModel("lektor", env);
  if (modelFamily(author) === modelFamily(lektor)) {
    throw new Error(
      `Studio model routing: author (${author}) and lektor (${lektor}) resolve to the ` +
        `same model family "${modelFamily(author)}". The Lektor is the independent ` +
        `source-fidelity check (D1) and must come from a different vendor family. ` +
        `Set STUDIO_MODEL_LEKTOR or STUDIO_MODEL_AUTHOR to fix.`,
    );
  }
}

/** All resolved step→model pairs; used by the Studio UI and by startup logging. */
export function studioModelMap(env: EnvLike = process.env): Record<StudioStep, string> {
  return Object.fromEntries(
    STUDIO_STEPS.map((step) => [step, resolveStudioModel(step, env)]),
  ) as Record<StudioStep, string>;
}
