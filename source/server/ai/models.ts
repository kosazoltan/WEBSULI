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
  "ocr",
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
  ocr: "z-ai/glm-5.3-flash", // #163: cheap vision transcription of image sources
  pedagogue: "x-ai/grok-4.6", // planning, misconceptions
  author: "openai/gpt-5.6-terra", // long structured Hungarian output
  animator: "qwen/qwen3.8-flash", // bounded transform, cheap
  lektor: "qwen/qwen3.8-max", // MUST differ in family from author
  gateHelper: "z-ai/glm-5.3-flash", // cheap classification
  quizPolish: "z-ai/glm-5.3-flash",
};

export const FALLBACK_MODELS: Partial<Record<StudioStep, string>> = {
  extract: "x-ai/grok-4.6",
  ocr: "qwen/qwen3.8-flash", // vision-capable, same cheap class
  pedagogue: "openai/gpt-5.6-terra",
  // Audit 2026-09-05 (D): was qwen/qwen3.8-max == the lektor PRIMARY — on author failover
  // the same model would have reviewed itself (D1 broken silently). x-ai differs from
  // both lektor rungs (qwen, z-ai).
  author: "x-ai/grok-4.6",
  animator: "z-ai/glm-5.3-flash",
  lektor: "z-ai/glm-5.3",
};

/**
 * Model ids the pre-Studio routes already used.
 *
 * These are vendor SDK ids (Anthropic / OpenAI direct) plus one OpenRouter id, not a
 * single family — the admin features predate the Studio and call the vendors straight.
 * They live here for the same reason the Studio ids do: a model change must be one edit
 * in one file, not a hunt through 5,600 lines of request handlers.
 *
 * Refreshed 2026-09-04 (owner decision). The previous generation — `gpt-5`, `gpt-4o`,
 * `claude-sonnet-4`, `claude-3-5-sonnet`, `claude-3-5-haiku` — had aged out; the haiku
 * fallback in particular was weak enough to make a "successful" retry produce worse
 * material than no retry at all. Every id below was verified against the vendor's live
 * model list and answered a real request before being written here.
 */
export const LEGACY_MODELS = {
  /** adminRouter POST /html-fix/errors — Claude JSON HTML repair (routes.ts ~1226) */
  htmlFix: "claude-opus-5",
  /** adminRouter POST /html-fix/theme — Claude JSON theme rewrite (routes.ts ~1316) */
  htmlTheme: "claude-opus-5",
  /** Enhanced Creator SSE two-phase OpenAI HTML fix (routes.ts ~1479, ~1508) */
  htmlFixStream: "gpt-5.6-sol",
  /** Enhanced Creator Claude chat stream, full HTML generation (routes.ts ~1790) */
  claudeChat: "claude-opus-5",
  /** Vision analysis of uploaded files (routes.ts ~1942 multi, ~2055 single) */
  analyzeFiles: "gpt-5.6-sol",
  /** Enhanced Creator ChatGPT chat stream (routes.ts ~2212) */
  chatgptChat: "gpt-5.6-sol",
  /** Enhanced Creator Claude HTML generation stream (routes.ts ~2417) */
  claudeHtml: "claude-opus-5",
  /**
   * The "okosítás" (improveAsync.ts): full HTML modernisation, ordered by preference.
   *
   * A list rather than one id because the primary is regularly overloaded; the runner
   * walks down it. The fallback is `z-ai/glm-5.3-flash` **via OpenRouter** (owner
   * decision) rather than another Anthropic model: when Anthropic is the thing that is
   * overloaded, a second Anthropic id is not a fallback, and the old haiku fallback
   * produced material worse than the input.
   */
  improve: ["claude-opus-5", "z-ai/glm-5.3-flash"],
  /** Quiz item generation from a material (gameQuizGeneratorService.ts) */
  quizGenerator: "claude-opus-5",
} as const;

export type LegacyTask = keyof typeof LEGACY_MODELS;

/**
 * Reasoning effort per task, for the models that accept one.
 *
 * Verified live 2026-09-04, because the two vendors spell this differently and guessing
 * would have produced a 400 in production:
 *
 *  - OpenAI (`gpt-5.6-sol`): top-level `reasoning_effort: "medium"`.
 *  - Anthropic (`claude-opus-5`): `output_config: { effort: "medium" }`. The older
 *    `thinking: {type:"enabled"}` shape is rejected by this model — the API itself
 *    replied "use thinking.type.adaptive and output_config.effort".
 *
 * Medium everywhere: these are long structured-HTML jobs where low effort degrades the
 * output and high effort mostly buys latency.
 */
export const TASK_EFFORT: Partial<Record<LegacyTask, "low" | "medium" | "high">> = {
  htmlFix: "medium",
  htmlTheme: "medium",
  htmlFixStream: "medium",
  claudeChat: "medium",
  analyzeFiles: "medium",
  chatgptChat: "medium",
  claudeHtml: "medium",
  improve: "medium",
  quizGenerator: "medium",
};

/** Effort for a task, or undefined when the task/model takes none. */
export function effortFor(task: LegacyTask): "low" | "medium" | "high" | undefined {
  return TASK_EFFORT[task];
}

/**
 * Which provider serves a given model id.
 *
 * An OpenRouter id always carries a vendor prefix (`z-ai/glm-5.3-flash`); the direct
 * vendor SDK ids never do. That single distinction is enough, and it matters because
 * the improve chain deliberately mixes vendors: its fallback is only a real fallback if
 * it is reached through a different provider than the one that just failed.
 */
export function providerForModel(modelId: string): "openai" | "anthropic" | "openrouter" {
  if (modelId.includes("/")) return "openrouter";
  return modelId.startsWith("claude") ? "anthropic" : "openai";
}

/** The env var a given model id needs. */
export function keyNameForModel(modelId: string): string {
  return AI_KEY_NAMES[providerForModel(modelId)];
}

/**
 * Which API key each legacy task needs.
 *
 * Explicit rather than inferred from the model id: `gpt-5.6-sol` obviously means OpenAI
 * today, but the mapping is what a readiness check reports to an admin, and a guess
 * there is worse than no check. Measured 2026-09-04: production had none of these set,
 * and every route built its SDK client anyway — the first admin click got a raw vendor
 * error instead of "nincs API kulcs".
 */
const TASK_KEYS: Record<LegacyTask, "openai" | "anthropic"> = {
  htmlFix: "anthropic",
  htmlTheme: "anthropic",
  htmlFixStream: "openai",
  claudeChat: "anthropic",
  analyzeFiles: "openai",
  chatgptChat: "openai",
  claudeHtml: "anthropic",
  improve: "anthropic",
  quizGenerator: "anthropic",
};

export const AI_KEY_NAMES = {
  openai: "AI_INTEGRATIONS_OPENAI_API_KEY",
  anthropic: "AI_INTEGRATIONS_ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
} as const;

export type AIVendor = keyof typeof AI_KEY_NAMES;

/** The environment variable a task's provider reads. */
export function requiredKeyFor(task: LegacyTask): string {
  return AI_KEY_NAMES[TASK_KEYS[task]];
}

/** Environment-variable name overriding a legacy task, e.g. LEGACY_MODEL_CHATGPT_CHAT. */
function legacyEnvVarName(task: LegacyTask): string {
  return `LEGACY_MODEL_${task.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}`;
}

/**
 * The model a legacy task should use, honouring a non-blank environment override.
 *
 * For `improve` this returns the primary; the runner reads `LEGACY_MODELS.improve` for
 * the whole fallback chain.
 */
export function resolveLegacyModel(task: LegacyTask, env: EnvLike = process.env): string {
  const override = env[legacyEnvVarName(task)];
  if (typeof override === "string" && override.trim().length > 0) {
    return override.trim();
  }
  const value = LEGACY_MODELS[task];
  return Array.isArray(value) ? value[0] : value;
}

export type AIKeyStatus = Record<
  AIVendor,
  {
    /** Whether the key is present and non-blank. NEVER the key itself. */
    configured: boolean;
    envVar: string;
    /** Admin features that cannot run while this key is missing. */
    blockedFeatures: string[];
  }
>;

/**
 * Report which AI providers are ready, without ever touching a key's value.
 *
 * Returns the blocked feature list too, because "OPENROUTER_API_KEY missing" means
 * nothing to the owner while "a Tudás-térkép kinyerés nem fog menni" does.
 */
export function aiKeyStatus(env: EnvLike = process.env): AIKeyStatus {
  const isSet = (name: string) => {
    const v = env[name];
    return typeof v === "string" && v.trim().length > 0;
  };

  const featuresOf = (vendor: AIVendor): string[] => {
    if (vendor === "openrouter") return ["studioExtract", "studioPipeline"];
    return (Object.keys(TASK_KEYS) as LegacyTask[]).filter((t) => TASK_KEYS[t] === vendor);
  };

  return Object.fromEntries(
    (Object.keys(AI_KEY_NAMES) as AIVendor[]).map((vendor) => {
      const envVar = AI_KEY_NAMES[vendor];
      const configured = isSet(envVar);
      return [vendor, { configured, envVar, blockedFeatures: configured ? [] : featuresOf(vendor) }];
    }),
  ) as AIKeyStatus;
}

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
 *
 * Audit 2026-09-05 (D): checked across EVERY (author primary|fallback) × (lektor
 * primary|fallback) pair — a failover must not collapse the two roles onto one vendor.
 */
export function assertDistinctFamilies(
  env: EnvLike = process.env,
  fallbacks: Partial<Record<StudioStep, string>> = FALLBACK_MODELS,
): void {
  const authors = [resolveStudioModel("author", env), fallbacks.author].filter(
    (m): m is string => typeof m === "string" && m.length > 0,
  );
  const lektors = [resolveStudioModel("lektor", env), fallbacks.lektor].filter(
    (m): m is string => typeof m === "string" && m.length > 0,
  );
  for (const author of authors) {
    for (const lektor of lektors) {
      if (modelFamily(author) === modelFamily(lektor)) {
        throw new Error(
          `Studio model routing: author (${author}) and lektor (${lektor}) resolve to the ` +
            `same model family "${modelFamily(author)}". The Lektor is the independent ` +
            `source-fidelity check (D1) and must come from a different vendor family — ` +
            `including fallbacks. Set STUDIO_MODEL_LEKTOR or STUDIO_MODEL_AUTHOR to fix.`,
        );
      }
    }
  }
}

/** All resolved step→model pairs; used by the Studio UI and by startup logging. */
export function studioModelMap(env: EnvLike = process.env): Record<StudioStep, string> {
  return Object.fromEntries(
    STUDIO_STEPS.map((step) => [step, resolveStudioModel(step, env)]),
  ) as Record<StudioStep, string>;
}
