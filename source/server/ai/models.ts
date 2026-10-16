/**
 * A modell-útválasztás egyetlen helye (LS-0d).
 *
 * docs/specs/2026-10-16-egy-futas.md (S4b, tulajdonosi döntés 2026-10-16): a rendszerben KÉT modell van — Claude Opus 5.5 (elsődleges)
 * és GPT-6.1 Sol (tartalék), mindkettő medium efforttal. A tananyaggyártás és -javítás egy beszélgetésben fut (`single-run/`), a
 * döntőbíró ugyanezt a párt használja (`arbiter/arbiter.ts`), a régi AI-funkciók pedig a `LEGACY_MODELS` táblát. Az alügynök-modellek
 * (OCR-olvasók, besoroló, kinyerő, bank-, lektor-, tesztíró-, kvíz- és orkesztrátor-modellek) kivezetve.
 */

/** A tananyaggyártás modellpárja (az egyfutásos beszélgetés és a döntőbíró ezt használja). */
export const LESSON_MODELS = { primary: "claude-opus-5-5", fallback: "gpt-6.1-sol" } as const;

/**
 * Spec 2026-09-30 (U6, C11): modellenkénti kimeneti plafon a hosszkorlát utáni EGYSZERI nagyobb kerethez. Ismeretlen modellnél nincs
 * újrapróba (a csonka válasz hiba). Kulcs: a gyártó-előtag és a pont/kötőjel különbség nélkül.
 */
const MAX_OUTPUT_BY_MODEL: Record<string, number> = {
  "gpt-6-1-sol": 128_000,
  "claude-opus-5-5": 128_000,
};
export function maxOutputForModel(modelId: string): number | undefined {
  const key = modelId.replace(/^[^/]+\//, "").replace(/\./g, "-").toLowerCase();
  return MAX_OUTPUT_BY_MODEL[key];
}

/**
 * Tulajdonosi döntés 2026-10-14 (docs/specs/2026-10-14-ellentetes-csalad-tartalek.md): minden OpenAI GPT elsődleges tartaléka
 * az Anthropic Opus 5.5, minden Anthropic elsődlegesé az OpenAI GPT-6.1 Sol — mindkettő medium efforttal.
 */
export const CROSS_FAMILY_FALLBACK: Readonly<Record<"openai" | "anthropic", string>> = {
  openai: LESSON_MODELS.primary,
  anthropic: LESSON_MODELS.fallback,
};
export const CROSS_FAMILY_FALLBACK_EFFORT = "medium" as const;
/** Az elsődleges modell ellentétes családú tartaléka; OpenAI/Anthropic családon kívül `undefined`. */
export function crossFamilyFallback(model: string): string | undefined {
  const family = modelFamily(model);
  return family === "openai" || family === "anthropic" ? CROSS_FAMILY_FALLBACK[family] : undefined;
}
/** A tartalékhívás effortja: az ellentétes családú tartalék medium; minden más modellnél nincs felülírás. */
export function isCrossFamilyFallbackModel(model: string): boolean {
  return Object.values(CROSS_FAMILY_FALLBACK).includes(model);
}

/**
 * Model ids the pre-Studio routes already used.
 *
 * These are vendor SDK ids (Anthropic / OpenAI direct), not a
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
  htmlFix: "claude-opus-5-5",
  /** adminRouter POST /html-fix/theme — Claude JSON theme rewrite (routes.ts ~1316) */
  htmlTheme: "claude-opus-5-5",
  /** Enhanced Creator SSE two-phase OpenAI HTML fix (routes.ts ~1479, ~1508) */
  htmlFixStream: "gpt-6.1-sol",
  /** Enhanced Creator Claude chat stream, full HTML generation (routes.ts ~1790) */
  claudeChat: "claude-opus-5-5",
  /** Vision analysis of uploaded files (routes.ts ~1942 multi, ~2055 single) */
  analyzeFiles: "gpt-6.1-sol",
  /** Enhanced Creator ChatGPT chat stream (routes.ts ~2212) */
  chatgptChat: "gpt-6.1-sol",
  /** Enhanced Creator Claude HTML generation stream (routes.ts ~2417) */
  claudeHtml: "claude-opus-5-5",
  /**
   * HTML modernisation: Anthropic primary, direct OpenAI fallback. Tulajdonosi döntés 2026-10-14
   * (docs/specs/2026-10-14-tartalek-b-szelet.md, B3): a tartalék az ellentétes családú GPT-6.1 Sol, medium efforttal (korábban Terra).
   */
  improve: ["claude-opus-5-5", "gpt-6.1-sol"],
  /** Quiz item generation from a material (gameQuizGeneratorService.ts) */
  quizGenerator: "claude-opus-5-5",
  /** Internetes tananyag — csak a forrásgyűjtés (web_search + web_fetch); a gyártás az egyfutásos motoron megy. */
  webResearch: "claude-opus-5-5",
} as const;

export type LegacyTask = keyof typeof LEGACY_MODELS;

/**
 * Reasoning effort per task, for the models that accept one.
 *
 * Verified live 2026-09-04, because the two vendors spell this differently and guessing
 * would have produced a 400 in production:
 *
 *  - OpenAI (`gpt-6.1-sol`, tulajdonosi döntés 2026-10-03 a gpt-5.6-sol helyett): top-level `reasoning_effort: "medium"`.
 *  - Anthropic (`claude-opus-5-5`): `output_config: { effort: "medium" }`. The older
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
  webResearch: "low",
};

/** Effort for a task, or undefined when the task/model takes none. */
export function effortFor(task: LegacyTask): "low" | "medium" | "high" | undefined {
  return TASK_EFFORT[task];
}

/** Prefixes retained in old environment overrides also route directly. */
export function providerForModel(modelId: string): AIVendor {
  if (modelId.startsWith("openai/")) return "openai";
  if (modelId.startsWith("x-ai/") || modelId.startsWith("grok-")) return "xai";
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
 * Explicit rather than inferred from the model id: `gpt-6.1-sol` obviously means OpenAI
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
  webResearch: "anthropic",
};

export const AI_KEY_NAMES = {
  openai: "AI_INTEGRATIONS_OPENAI_API_KEY",
  anthropic: "AI_INTEGRATIONS_ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  xai: "XAI_API_KEY",
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
    return [...(Object.keys(TASK_KEYS) as LegacyTask[]).filter((t) => TASK_KEYS[t] === vendor),
      ...(Object.entries(LESSON_MODELS) as Array<[keyof typeof LESSON_MODELS, string]>)
        .filter(([, model]) => providerForModel(model) === vendor).map(([role]) => `tananyaggyártás (${role === "primary" ? "elsődleges" : "tartalék"})`)];
  };

  return Object.fromEntries(
    (Object.keys(AI_KEY_NAMES) as AIVendor[]).map((vendor) => {
      const envVar = AI_KEY_NAMES[vendor];
      const configured = isSet(envVar) || (vendor === "openai" && isSet("OPENAI_API_KEY"));
      return [vendor, { configured, envVar, blockedFeatures: configured ? [] : featuresOf(vendor) }];
    }),
  ) as AIKeyStatus;
}

type EnvLike = Record<string, string | undefined>;

/** Vendor prefix of an OpenRouter id (`openai/gpt-5` → `openai`). */
export function modelFamily(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash === -1 ? (modelId.startsWith("gpt-") ? "openai" : modelId.startsWith("grok-") ? "x-ai" : modelId.startsWith("claude") ? "anthropic" : modelId) : modelId.slice(0, slash);
}
