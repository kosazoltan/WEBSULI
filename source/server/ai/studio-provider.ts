import { OpenAIProvider } from "./OpenAIProvider";
import { OpenRouterProvider } from "./OpenRouterProvider";
import { ClaudeProvider } from "./ClaudeProvider";
import { AI_KEY_NAMES, aiKeyStatus, CROSS_FAMILY_FALLBACK_EFFORT, isCrossFamilyFallbackModel, keyNameForModel, providerForModel, MODEL_REASONING_EFFORT } from "./models";
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

export function createStudioProvider(model: string, timeout = 180000, maxTokens = 24000, options: Pick<AIProviderConfig, "apiMode" | "reasoningEffort" | "maxRetries" | "jsonMode" | "chatReasoningEffort"> = {}, env: Record<string, string | undefined> = process.env): IAIProvider {
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

type StepPolicy = { timeoutMs: number; maxTokens: number; reasoningEffort: NonNullable<AIProviderConfig["reasoningEffort"]>; jsonMode?: boolean;
  /** OpenAI chat-úton az effort csak kifejezett kérésre megy ki (`chatReasoningEffort`) — review #241: a döntőbírónak ténylegesen kell. */
  chatEffort?: boolean };

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
  // T2.3 (2026-10-15): a tesztíró MiniMax M3 max efforttal — élő próbán 24k-nál egy hívás csonkult (a gondolkodás is a keretből fogy).
  answerKey: { timeoutMs: 240_000, maxTokens: 48_000, reasoningEffort: "low", jsonMode: true },
  // T6.1: a kvíz vak előszűrője (MiniMax M3 xhigh) — a T2.3 tapasztalata szerint a gondolkodás miatt bő keret.
  quizBlind: { timeoutMs: 240_000, maxTokens: 48_000, reasoningEffort: "low", jsonMode: true },
  // Spec 2026-09-29 (tanári témafókusz, 2. kör): mérve 13–18 s egy döntés; élesben egyszer 180 s-ig akadt.
  // Rövid saját határidő, hogy akadásnál a tartalék modell még időben dönthessen; JSON-mód (deepseek-v4-flash-en a
  // bank óta használt). A kimenet néhány azonosító, a gondolkodással együtt 8k bőven elég.
  topicFocus: { timeoutMs: 60_000, maxTokens: 8_000, reasoningEffort: "low", jsonMode: true },
  quizPolish: { timeoutMs: 180_000, maxTokens: 24_000, reasoningEffort: "low" },
  // Spec 2026-10-14-forras-besorolo-openai-luna (review #209): a katalógus-besoroló a MÉRT beállításon fut — gpt-6-luna high
  // effort, 20 hívás: medián 5,1 s, p95 12,2 s, max 751 kimeneti token. Korábban a topicFocus (low) szabályzatot kapta.
  catalogClassify: { timeoutMs: 120_000, maxTokens: 8_000, reasoningEffort: "high", jsonMode: true },
  // Spec 2026-10-05-s9 (terv-ellenőrzés): az orkesztrátor saját szabálya — rövid elemzés + javító prompt, JSON-mód, stream.
  orchestrator: { timeoutMs: 120_000, maxTokens: 4_000, reasoningEffort: "low", jsonMode: true },
  // Tételgyár T7.1: a döntőbíró egy rövid ítélet a gyerek válaszáról — a gyerek vár rá, ezért rövid határidő; a gondolkodással együtt 4k elég.
  // Tulajdonosi döntés 2026-10-16: medium effort (Opus 5.5 / GPT-6.1 Sol); a gondolkodás miatt bővebb időkeret.
  // Review #258: modellenként 30 s — az elsődleges + tartalék lánc (60 s) a kliens 70 s-os keretén belül marad.
  arbiter: { timeoutMs: 30_000, maxTokens: 8_000, reasoningEffort: "medium", jsonMode: true, chatEffort: true },
};

/**
 * Spec 2026-10-05-s10-adatvesztes-mentesseg: a hosszú kimenetű lépések streamelve futnak, tétlenségi őrrel — ha 120 s-ig nem
 * jön új darab (szöveg vagy gondolkodás), a hívás megszakad, a beérkezett szöveg naplózódik. Mért ok: „[xAI] Request timed
 * out.” a lektornál, a teljes-válasz határidő a lassan, de folyamatosan generáló modellt is megölte. A rövid döntések
 * (topicFocus) maradnak a régi, rövid határidőn.
 */
/** Tulajdonosi döntés 2026-10-05: a szerző kimeneti alapkerete (mért: Opus 5.5 és Qwen 3.8 is 24k fölött írt). */
export const AUTHOR_MAX_TOKENS = 48_000;
export const STREAM_IDLE_MS = 120_000;
/** Streamelt módban a teljes határidő csak felső plafon: a régi érték kétszerese. */
export const STREAM_CEILING_FACTOR = 2;
/** Review #190: szabályzati határidő nélküli streamelt lépés (szerző) felső plafonja. */
export const STREAM_DEFAULT_CEILING_MS = 30 * 60_000;
const STREAMED_STEPS: ReadonlySet<string> = new Set(["lektor", "author", "pedagogue", "animator", "bank", "visuals", "visualDesigner", "textFix", "instructionCheck", "gateHelper", "answerKey", "quizBlind", "quizPolish", "orchestrator"]);
export function stepStreamIdleMs(step: string): number | undefined {
  return STREAMED_STEPS.has(step) ? STREAM_IDLE_MS : undefined;
}

/**
 * Tulajdonosi döntés 2026-10-14 (ellentétes családú tartalék): a tartalékhívás effortja medium, a lépés szabályzatától
 * függetlenül; az OpenAI chat-úton is ténylegesen elküldve (`chatReasoningEffort`). Csak az ellentétes családú tartalékmodellre.
 */
export function crossFamilyFallbackOptions(model: string, fallback: boolean | undefined): Pick<AIProviderConfig, "reasoningEffort" | "chatReasoningEffort"> {
  if (!fallback) return {};
  // Spec 2026-10-14-tartalek-b-szelet: a harmadik családú tartalék (Qwen 0902) a saját effortján (high) fut, nem a lépés szabályzatán.
  if (!isCrossFamilyFallbackModel(model)) return MODEL_REASONING_EFFORT[model] ? { reasoningEffort: MODEL_REASONING_EFFORT[model] } : {};
  return { reasoningEffort: CROSS_FAMILY_FALLBACK_EFFORT, ...(providerForModel(model) === "openai" ? { chatReasoningEffort: true } : {}) };
}

/** Review gets its own bounded request, not three hidden 180-second attempts. */
export function createStudioStepProvider(model: string, step?: string, opts: { fallback?: boolean } = {}) {
  if (step === "lektor") {
    const vendor = providerForModel(model);
    return createStudioProvider(model, LEKTOR_TIMEOUT_MS, LEKTOR_MAX_TOKENS, {
      maxRetries: 0,
      // 2026-09-20 (tulajdonosi utasítás, LLM-as-judge kutatás): az értelmező lektorálás
      // gondolkodást igényel — medium. A kimenet (önálló megoldások + jegyzetek) és a gondolkodás ugyanabból a
      // LEKTOR_MAX_TOKENS keretből fogy; a 12k élesben csonkult (spec 2026-09-29-lektor-tokenkeret). Csak a ténylegesen
      // használt token kerül pénzbe, így a nagyobb keret a kis leckéknél nem drágít.
      // Tulajdonosi döntés 2026-10-05: a lektor OpenAI-n (gpt-6.1-sol / gpt-5.6-terra) is a Responses API-n fut, medium efforttal.
      ...(vendor === "xai" || vendor === "openai" ? { apiMode: "responses", reasoningEffort: "medium" } : {}),
      // Tulajdonosi döntés 2026-10-14: a lektor-lánc Anthropic tagja (Opus 5.5) medium, a harmadik családú Qwen high efforton.
      ...(vendor === "anthropic" ? { reasoningEffort: CROSS_FAMILY_FALLBACK_EFFORT } : {}),
      ...(vendor === "openrouter" && MODEL_REASONING_EFFORT[model] ? { reasoningEffort: MODEL_REASONING_EFFORT[model] } : {}),
    });
  }
  const policy = step ? STUDIO_STEP_POLICY[step] : undefined;
  const fallbackOptions = crossFamilyFallbackOptions(model, opts.fallback);
  // Tulajdonosi döntés 2026-10-05 (élő próba, job c1f9d12a): mindkét szerzőmodell (Opus 5.5, Qwen 3.8) 24k fölött írt — az első hívás
  // kárba ment, utána 48k-s újrapróba jött. A szerző ezért rögtön 48k kerettel indul (csak a ténylegesen használt token fizetendő).
  if (step === "author") return createStudioProvider(model, undefined, AUTHOR_MAX_TOKENS, { ...(MODEL_REASONING_EFFORT[model] ? { reasoningEffort: MODEL_REASONING_EFFORT[model] } : {}), ...fallbackOptions });
  if (!policy) return createStudioProvider(model, undefined, undefined, { ...(MODEL_REASONING_EFFORT[model] ? { reasoningEffort: MODEL_REASONING_EFFORT[model] } : {}), ...fallbackOptions });
  return createStudioProvider(model, policy.timeoutMs, policy.maxTokens, {
    reasoningEffort: policy.reasoningEffort,
    ...fallbackOptions,
    ...(policy.jsonMode ? { jsonMode: true } : {}),
    ...(policy.chatEffort && providerForModel(model) === "openai" ? { chatReasoningEffort: true } : {}),
    // Mérve (4. mérés, run a9a4f683 és a regressziós futások): a tartalék bankmodell hívása 364 / 558 / 602 s-ig
    // tartott — az SDK a 240 s-os időtúllépést alapból kétszer csendben újrapróbálta (3 × 240 s). A lépés
    // időkorlátja EGY kérésre vonatkozik; az újrapróbálás a csomag-ciklus dolga (következő modell).
    maxRetries: 0,
    // xAI only honours reasoning effort on the Responses API (verified for the lektor).
    ...(providerForModel(model) === "xai" ? { apiMode: "responses" } : {}),
  });
}
