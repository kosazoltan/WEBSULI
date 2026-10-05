import { OpenAIProvider } from "./OpenAIProvider";
import { OpenRouterProvider } from "./OpenRouterProvider";
import { ClaudeProvider } from "./ClaudeProvider";
import { AI_KEY_NAMES, aiKeyStatus, keyNameForModel, providerForModel, MODEL_REASONING_EFFORT } from "./models";
import { AIProviderQuotaError, isQuotaExhausted, type AIMessage, type AIProviderConfig, type AIResponse, type AIStreamChunk, type ChatCallOptions, type IAIProvider } from "./AIProvider";
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

export type StudioConnection = ReturnType<typeof studioConnection>;

/**
 * Spec 2026-10-01-gyokerok-egyben (2.3): a NYERS SDK-klienst használó hívások (kivonatoló, OCR, témakör-besoroló) ugyanazt a
 * keret-átállást kapják, mint a `createStudioProvider` útja — kimerült OpenAI-keretnél ugyanaz a modell az OpenRouteren át, közös
 * 10 perces memóriával. A hívó a kapott kapcsolattal építi a klienst és a kérést (a `vendor` szerint).
 */
export async function withQuotaFailover<T>(connection: StudioConnection, run: (connection: StudioConnection) => Promise<T>, env: Record<string, string | undefined> = process.env, now = () => Date.now()): Promise<T> {
  const routerKey = env[AI_KEY_NAMES.openrouter]?.trim();
  if (connection.vendor !== "openai" || !routerKey) return run(connection);
  const fallback: StudioConnection = { vendor: "openrouter", apiKey: routerKey, model: `openai/${connection.model}`, baseURL: "https://openrouter.ai/api/v1" };
  if (now() < quotaExhaustedUntil) return run(fallback);
  try {
    return await run(connection);
  } catch (error) {
    if (!(error instanceof AIProviderQuotaError) && !(error && typeof error === "object" && isQuotaExhausted(error as { status?: number }))) throw error;
    quotaExhaustedUntil = now() + QUOTA_FAILOVER_MEMORY_MS;
    logger.warn(`[AI] OpenAI kerete elfogyott (${connection.model}) — ugyanaz a modell az OpenRouteren át, ${QUOTA_FAILOVER_MEMORY_MS / 60_000} percig (közvetlen kliens).`);
    return run(fallback);
  }
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
  get maxOutputTokens(): number | undefined { return this.primary.maxOutputTokens; }
  /** Spec 2026-10-05-s10: a tartalék (OpenRouter) is streamel, így a képesség az elsődlegesé. */
  get supportsStreamingChat(): boolean | undefined { return this.primary.supportsStreamingChat; }
  private route(): IAIProvider { return (this.fallback ??= this.makeFallback()); }
  /**
   * Review #160: a hívásonkénti beállítás (szigorú `responseFormat`, U2/C8) az ELSŐDLEGES (közvetlen OpenAI) útra megy
   * tovább; a tartalék (OpenRouter) útra nem — ott a szigorú séma nem igazolt, JSON-mód + helyi validálás marad.
   */
  private fallbackOptions(options?: ChatCallOptions): ChatCallOptions | undefined {
    if (!options) return undefined;
    const { responseFormat: _dropped, ...rest } = options;
    return Object.keys(rest).length ? rest : undefined;
  }
  async chat(messages: AIMessage[], signal?: AbortSignal, options?: ChatCallOptions): Promise<AIResponse> {
    if (this.now() < quotaExhaustedUntil) return this.route().chat(messages, signal, this.fallbackOptions(options));
    try {
      return await this.primary.chat(messages, signal, options);
    } catch (error) {
      if (!(error instanceof AIProviderQuotaError)) throw error;
      quotaExhaustedUntil = this.now() + QUOTA_FAILOVER_MEMORY_MS;
      logger.warn(`[AI] ${this.primary.name} kerete elfogyott (${this.model}) — ugyanaz a modell az OpenRouteren át, ${QUOTA_FAILOVER_MEMORY_MS / 60_000} percig.`);
      return this.route().chat(messages, signal, this.fallbackOptions(options));
    }
  }
  async *streamChat(messages: AIMessage[], signal?: AbortSignal): AsyncGenerator<AIStreamChunk, void, unknown> {
    yield* (this.now() < quotaExhaustedUntil ? this.route() : this.primary).streamChat(messages, signal);
  }
  isAvailable(): Promise<boolean> { return this.primary.isAvailable(); }
}

export const LEKTOR_TIMEOUT_MS = 480_000;
/**
 * Spec 2026-09-29-lektor-tokenkeret: a lektor kimenete ma önálló megoldásokat és sok jegyzetet is tartalmaz, a grok-nál
 * a gondolkodás is ebből fogy — a 12 000-es keret a 4 forrásos leckénél csonkult (élő job 1ebf7a88).
 */
export const LEKTOR_MAX_TOKENS = 32_000;

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
  // Spec 2026-09-30 (ábratervező): EGY fejezet ábrája; bake-off: Opus 5.5 high 7–14k kimeneti token, 75–146 s.
  visualDesigner: { timeoutMs: 300_000, maxTokens: 24_000, reasoningEffort: "high" },
  // Spec 2026-09-30-nem-elakado-kozzetetel (D4): a forrás-hivatkozó mondatok átírása (rövid, egy hívás leckénként).
  textFix: { timeoutMs: 180_000, maxTokens: 16_000, reasoningEffort: "low" },
  // Spec 2026-09-30-tanari-ellenorzolista: a tanári kérés pontjainak mérése a kész leckén.
  instructionCheck: { timeoutMs: 180_000, maxTokens: 12_000, reasoningEffort: "medium" },
  gateHelper: { timeoutMs: 180_000, maxTokens: 24_000, reasoningEffort: "low" },
  // Spec 2026-09-29 (tanári témafókusz, 2. kör): mérve 13–18 s egy döntés; élesben egyszer 180 s-ig akadt.
  // Rövid saját határidő, hogy akadásnál a tartalék modell még időben dönthessen; JSON-mód (deepseek-v4-flash-en a
  // bank óta használt). A kimenet néhány azonosító, a gondolkodással együtt 8k bőven elég.
  topicFocus: { timeoutMs: 60_000, maxTokens: 8_000, reasoningEffort: "low", jsonMode: true },
  quizPolish: { timeoutMs: 180_000, maxTokens: 24_000, reasoningEffort: "low" },
};

/**
 * Spec 2026-10-05-s10-adatvesztes-mentesseg: a hosszú kimenetű lépések streamelve futnak, tétlenségi őrrel — ha 120 s-ig nem
 * jön új darab (szöveg vagy gondolkodás), a hívás megszakad, a beérkezett szöveg naplózódik. Mért ok: „[xAI] Request timed
 * out.” a lektornál, a teljes-válasz határidő a lassan, de folyamatosan generáló modellt is megölte. A rövid döntések
 * (topicFocus) maradnak a régi, rövid határidőn.
 */
export const STREAM_IDLE_MS = 120_000;
/** Streamelt módban a teljes határidő csak felső plafon: a régi érték kétszerese. */
export const STREAM_CEILING_FACTOR = 2;
/** Review #190: szabályzati határidő nélküli streamelt lépés (szerző) felső plafonja. */
export const STREAM_DEFAULT_CEILING_MS = 30 * 60_000;
const STREAMED_STEPS: ReadonlySet<string> = new Set(["lektor", "author", "pedagogue", "animator", "bank", "visuals", "visualDesigner", "textFix", "instructionCheck", "gateHelper", "quizPolish"]);
export function stepStreamIdleMs(step: string): number | undefined {
  return STREAMED_STEPS.has(step) ? STREAM_IDLE_MS : undefined;
}

/** Review gets its own bounded request, not three hidden 180-second attempts. */
export function createStudioStepProvider(model: string, step?: string) {
  if (step === "lektor") {
    return createStudioProvider(model, LEKTOR_TIMEOUT_MS, LEKTOR_MAX_TOKENS, {
      maxRetries: 0,
      // 2026-09-20 (tulajdonosi utasítás, LLM-as-judge kutatás): az értelmező lektorálás
      // gondolkodást igényel — medium. A kimenet (önálló megoldások + jegyzetek) és a gondolkodás ugyanabból a
      // LEKTOR_MAX_TOKENS keretből fogy; a 12k élesben csonkult (spec 2026-09-29-lektor-tokenkeret). Csak a ténylegesen
      // használt token kerül pénzbe, így a nagyobb keret a kis leckéknél nem drágít.
      // Tulajdonosi döntés 2026-10-05: a lektor OpenAI-n (gpt-6.1-sol / gpt-5.6-terra) is a Responses API-n fut, medium efforttal.
      ...(providerForModel(model) === "xai" || providerForModel(model) === "openai" ? { apiMode: "responses", reasoningEffort: "medium" } : {}),
    });
  }
  const policy = step ? STUDIO_STEP_POLICY[step] : undefined;
  if (!policy) return createStudioProvider(model, undefined, undefined, MODEL_REASONING_EFFORT[model] ? { reasoningEffort: MODEL_REASONING_EFFORT[model] } : {});
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
