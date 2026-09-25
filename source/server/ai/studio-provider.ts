import { OpenAIProvider } from "./OpenAIProvider";
import { OpenRouterProvider } from "./OpenRouterProvider";
import { ClaudeProvider } from "./ClaudeProvider";
import { AI_KEY_NAMES, aiKeyStatus, keyNameForModel, providerForModel } from "./models";
import { AIProviderQuotaError, type AIMessage, type AIProviderConfig, type AIResponse, type AIStreamChunk, type IAIProvider } from "./AIProvider";
import { logger } from "../lib/logger";

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

export function createStudioProvider(model: string, timeout = 180000, maxTokens = 24000, options: Pick<AIProviderConfig, "apiMode" | "reasoningEffort" | "maxRetries" | "jsonMode"> = {}, env: Record<string, string | undefined> = process.env): IAIProvider {
  const connection = studioConnection(model, env);
  const config = { apiKey: connection.apiKey, model: connection.model, timeout, maxTokens, ...options };
  // Spec 2026-09-19: the planner (pedagogue) runs on the direct Anthropic API (Opus 5,
  // adaptive thinking, effort from the step policy) — own key, no OpenRouter hop.
  if (connection.vendor === "anthropic") return new ClaudeProvider(config);
  if (connection.vendor === "openrouter") return new OpenRouterProvider(config);
  const direct = new OpenAIProvider(config, connection.vendor);
  // Spec 2026-09-25 (docs/specs/2026-09-25-openai-keret-atallas.md): kimerült OpenAI-keretnél ugyanaz a modell az
  // OpenRouteren át. Mérve: a webes job 22a38c0a bankfázisa „insufficient_quota” miatt állt le, miközben az
  // `openai/gpt-5.6-terra` és `openai/gpt-5.6-luna` az OpenRouteren működött.
  const routerKey = env[AI_KEY_NAMES.openrouter]?.trim();
  if (connection.vendor !== "openai" || !routerKey) return direct;
  return new QuotaFailoverProvider(direct, () => new OpenRouterProvider({ ...config, apiKey: routerKey, model: `openai/${connection.model}` }));
}

/** Kimerült keret után ennyi ideig a közvetlen hívás kimarad (nem ér minden hívás egy biztosan bukó kérést). */
export const QUOTA_FAILOVER_MEMORY_MS = 10 * 60_000;
let quotaExhaustedUntil = 0;
export function resetQuotaFailoverForTest() { quotaExhaustedUntil = 0; }

/** Ugyanaz a kérés ugyanazzal a modellel a tartalék útvonalon, ha az elsődleges fiók kerete elfogyott. */
export class QuotaFailoverProvider implements IAIProvider {
  readonly name: string;
  readonly model: string;
  private fallback?: IAIProvider;
  constructor(private readonly primary: IAIProvider, private readonly makeFallback: () => IAIProvider, private readonly now = () => Date.now()) {
    this.name = primary.name;
    this.model = primary.model;
  }
  private route(): IAIProvider { return (this.fallback ??= this.makeFallback()); }
  async chat(messages: AIMessage[], signal?: AbortSignal): Promise<AIResponse> {
    if (this.now() < quotaExhaustedUntil) return this.route().chat(messages, signal);
    try {
      return await this.primary.chat(messages, signal);
    } catch (error) {
      if (!(error instanceof AIProviderQuotaError)) throw error;
      quotaExhaustedUntil = this.now() + QUOTA_FAILOVER_MEMORY_MS;
      logger.warn(`[AI] ${this.primary.name} kerete elfogyott (${this.model}) — ugyanaz a modell az OpenRouteren át, ${QUOTA_FAILOVER_MEMORY_MS / 60_000} percig.`);
      return this.route().chat(messages, signal);
    }
  }
  async *streamChat(messages: AIMessage[], signal?: AbortSignal): AsyncGenerator<AIStreamChunk, void, unknown> {
    yield* (this.now() < quotaExhaustedUntil ? this.route() : this.primary).streamChat(messages, signal);
  }
  isAvailable(): Promise<boolean> { return this.primary.isAvailable(); }
}

export const LEKTOR_TIMEOUT_MS = 480_000;

type StepPolicy = { timeoutMs: number; maxTokens: number; reasoningEffort: NonNullable<AIProviderConfig["reasoningEffort"]>; jsonMode?: boolean };

/**
 * Spec 2026-09-19 (modellmátrix): effort/timeout/maxTokens per pipeline step.
 * - pedagogue: the plan decides how many rounds follow → medium effort, generous timeout.
 * - animator / bank: bulk, template-like JSON on cheap models → low effort caps thinking tokens.
 * - gateHelper / quizPolish: classification → low.
 * The lektor keeps its own bounded request below; author is unchanged (no entry).
 */
export const STUDIO_STEP_POLICY: Readonly<Record<string, StepPolicy>> = {
  pedagogue: { timeoutMs: 300_000, maxTokens: 16_000, reasoningEffort: "medium" },
  // Mérve (run 45233b4b): a teljes lecke JSON-ja 10 fejezetnél ~10k kimeneti token, egy
  // bankcsomag 3–6k; a 16k keret egy elfajult csomagválaszon betelt → 24k, mint az alapérték.
  // Spec §7o (mérve 2026-09-20): a 6. mérés két bukott bankkísérlete „a válasz nem érvényes JSON" volt,
  // és szondázva a glm-válaszok ~1/8-a szintaktikailag törik (nem csonka: a hiba a szöveg közepén van).
  // A `json_object` mód a szolgáltatónál garantálja a sorosítást — a tartalmat nem érinti, a ```json
  // kerítés is elmarad. Mindkét itt futó modellen ellenőrizve (glm-5.3-flash, deepseek-v4-flash).
  animator: { timeoutMs: 240_000, maxTokens: 24_000, reasoningEffort: "low", jsonMode: true },
  bank: { timeoutMs: 240_000, maxTokens: 24_000, reasoningEffort: "low", jsonMode: true },
  // Spec 2026-09-24 (magyarázó ábrák): az ábra-folt tervezése (Claude Opus 5.5) térlátás + újraszámolás →
  // medium effort. Külön kulcs: az "animator" szabály a bankhívásokra is érvényes (step: "animator"), azt nem
  // változtatjuk. A kimenet csak a folt (néhány ezer token), a 16k keret a gondolkodással együtt is elég.
  visuals: { timeoutMs: 300_000, maxTokens: 16_000, reasoningEffort: "medium" },
  gateHelper: { timeoutMs: 180_000, maxTokens: 24_000, reasoningEffort: "low" },
  quizPolish: { timeoutMs: 180_000, maxTokens: 24_000, reasoningEffort: "low" },
};

/** Review gets its own bounded request, not three hidden 180-second attempts. */
export function createStudioStepProvider(model: string, step?: string) {
  if (step === "lektor") {
    return createStudioProvider(model, LEKTOR_TIMEOUT_MS, 12_000, {
      maxRetries: 0,
      // 2026-09-20 (tulajdonosi utasítás, LLM-as-judge kutatás): az értelmező lektorálás
      // gondolkodást igényel — medium; a lektor kimenete kicsi (≈ 0,4–2k token), az ár nem nő érdemben.
      ...(providerForModel(model) === "xai" ? { apiMode: "responses", reasoningEffort: "medium" } : {}),
    });
  }
  const policy = step ? STUDIO_STEP_POLICY[step] : undefined;
  if (!policy) return createStudioProvider(model);
  return createStudioProvider(model, policy.timeoutMs, policy.maxTokens, {
    reasoningEffort: policy.reasoningEffort,
    ...(policy.jsonMode ? { jsonMode: true } : {}),
    // Mérve (4. mérés, run a9a4f683 és a regressziós futások): a tartalék bankmodell hívása 364 / 558 / 602 s-ig
    // tartott — az SDK a 240 s-os időtúllépést alapból kétszer csendben újrapróbálta (3 × 240 s). A lépés
    // időkorlátja EGY kérésre vonatkozik; az újrapróbálás a csomag-ciklus dolga (következő modell).
    maxRetries: 0,
    // xAI only honours reasoning effort on the Responses API (verified for the lektor).
    ...(providerForModel(model) === "xai" ? { apiMode: "responses" } : {}),
  });
}
