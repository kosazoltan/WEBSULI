import { OpenAIProvider } from "./OpenAIProvider";
import { OpenRouterProvider } from "./OpenRouterProvider";
import { ClaudeProvider } from "./ClaudeProvider";
import { aiKeyStatus, keyNameForModel, providerForModel } from "./models";
import type { AIProviderConfig } from "./AIProvider";

/** Resolve credentials by model, never by whichever key happens to be available. */
export function studioConnection(model: string, env: Record<string, string | undefined> = process.env) {
  const vendor = providerForModel(model);
  const keyName = keyNameForModel(model);
  const apiKey = env[keyName]?.trim() || (vendor === "openai" ? env.OPENAI_API_KEY?.trim() : undefined);
  if (!apiKey) throw new Error(`A modell saját API-kulcsa hiányzik: ${keyName}.`);
  return {
    vendor, apiKey,
    model: vendor === "openrouter" ? model : model.replace(/^(openai|x-ai)\//, ""),
    baseURL: vendor === "openai" ? "https://api.openai.com/v1"
      : vendor === "xai" ? "https://api.x.ai/v1"
      : vendor === "anthropic" ? "https://api.anthropic.com"
      : "https://openrouter.ai/api/v1",
  };
}

export function studioModelReady(model: string) {
  return aiKeyStatus()[providerForModel(model)].configured;
}

export function createStudioProvider(model: string, timeout = 180000, maxTokens = 24000, options: Pick<AIProviderConfig, "apiMode" | "reasoningEffort" | "maxRetries"> = {}) {
  const connection = studioConnection(model);
  const config = { apiKey: connection.apiKey, model: connection.model, timeout, maxTokens, ...options };
  // Spec 2026-09-19: the planner (pedagogue) runs on the direct Anthropic API (Opus 5,
  // adaptive thinking, effort from the step policy) — own key, no OpenRouter hop.
  if (connection.vendor === "anthropic") return new ClaudeProvider(config);
  return connection.vendor === "openrouter"
    ? new OpenRouterProvider(config)
    : new OpenAIProvider(config, connection.vendor);
}

export const LEKTOR_TIMEOUT_MS = 480_000;

type StepPolicy = { timeoutMs: number; maxTokens: number; reasoningEffort: NonNullable<AIProviderConfig["reasoningEffort"]> };

/**
 * Spec 2026-09-19 (modellmátrix): effort/timeout/maxTokens per pipeline step.
 * - pedagogue: the plan decides how many rounds follow → medium effort, generous timeout.
 * - animator / bank: bulk, template-like JSON on cheap models → low effort caps thinking tokens.
 * - gateHelper / quizPolish: classification → low.
 * The lektor keeps its own bounded request below; author is unchanged (no entry).
 */
export const STUDIO_STEP_POLICY: Readonly<Record<string, StepPolicy>> = {
  pedagogue: { timeoutMs: 300_000, maxTokens: 16_000, reasoningEffort: "medium" },
  animator: { timeoutMs: 240_000, maxTokens: 16_000, reasoningEffort: "low" },
  bank: { timeoutMs: 240_000, maxTokens: 16_000, reasoningEffort: "low" },
  gateHelper: { timeoutMs: 180_000, maxTokens: 24_000, reasoningEffort: "low" },
  quizPolish: { timeoutMs: 180_000, maxTokens: 24_000, reasoningEffort: "low" },
};

/** Review gets its own bounded request, not three hidden 180-second attempts. */
export function createStudioStepProvider(model: string, step?: string) {
  if (step === "lektor") {
    return createStudioProvider(model, LEKTOR_TIMEOUT_MS, 12_000, {
      maxRetries: 0,
      ...(providerForModel(model) === "xai" ? { apiMode: "responses", reasoningEffort: "low" } : {}),
    });
  }
  const policy = step ? STUDIO_STEP_POLICY[step] : undefined;
  if (!policy) return createStudioProvider(model);
  return createStudioProvider(model, policy.timeoutMs, policy.maxTokens, {
    reasoningEffort: policy.reasoningEffort,
    // xAI only honours reasoning effort on the Responses API (verified for the lektor).
    ...(providerForModel(model) === "xai" ? { apiMode: "responses" } : {}),
  });
}
