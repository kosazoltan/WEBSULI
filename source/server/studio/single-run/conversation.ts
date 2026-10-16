/**
 * Egyfutásos tananyaggyártás — a beszélgetés-réteg (docs/specs/2026-10-16-egy-futas.md, A; végrehajtás: S2).
 *
 * Tulajdonosi döntés 2026-10-16: a tananyagot EGY modell készíti el, EGY üzenetfolyamban — Claude Opus 5.5 (medium effort); ha az Opus nem
 * elérhető, GPT-6.1 Sol (medium), amely a teljes eddigi beszélgetéssel egyedül viszi tovább. Nincs ügynökök közötti átadás: minden forduló
 * ugyanahhoz a beszélgetéshez fűződik, a korábbi fordulók a szolgáltató prompt-gyorsítótárából jönnek.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { claudeSourceBlock } from "../ocr";
import type { ExtractorFile } from "../extractor";

export const SINGLE_RUN_PRIMARY_MODEL = "claude-opus-5-5";
export const SINGLE_RUN_FALLBACK_MODEL = "gpt-6.1-sol";
export const SINGLE_RUN_EFFORT = "medium" as const;
/** Egy forduló kimeneti kerete (a teljes tanítás vagy egy fejezet bankja is ebbe fér; csak a használt token fizetendő). */
export const SINGLE_RUN_MAX_TOKENS = 64_000;
/** Egy forduló időkerete: a hosszú, gondolkodó fordulók streamelve futnak. */
export const SINGLE_RUN_TIMEOUT_MS = 30 * 60_000;

export type TurnBlock = { type: "text"; text: string } | { type: "source"; file: ExtractorFile };
export type Turn = { role: "user" | "assistant"; blocks: TurnBlock[] };
/** Kép / PDF natív tartalomblokk (data URL); minden más forrás már kinyert szöveg — szövegként megy. */
const isBinarySource = (file: ExtractorFile) => /^data:[^;,]+;base64,/.test(file.content) && (file.kind === "image" || file.kind === "pdf");
// A determinisztikusan kinyert szöveg (docx / szöveges PDF) elsőbbséget élvez a nyers tartalommal szemben.
const sourceAsText = (file: ExtractorFile) => `FORRÁS (${file.name}):
${file.extractedText ?? file.content}`;

export type ModelReply = { text: string; model: string; truncated: boolean; usage?: { input: number; output: number; cachedInput?: number } };

/** Egy szolgáltató egy modellje: a teljes beszélgetésből a következő asszisztens-válasz. */
export interface ModelClient {
  readonly model: string;
  complete(system: string, turns: Turn[], signal?: AbortSignal): Promise<ModelReply>;
}

/** Elérhetetlenség (a tartalékra váltás oka): hitelesítés, nem létező modell, túlterhelés, kvóta, szerverhiba, időtúllépés, hálózat. */
export function isUnavailable(error: unknown): boolean {
  const status = (error as { status?: unknown })?.status;
  if (typeof status === "number") return status === 401 || status === 403 || status === 404 || status === 408 || status === 429 || status >= 500;
  const text = `${(error as { name?: unknown })?.name ?? ""} ${(error as { code?: unknown })?.code ?? ""} ${error instanceof Error ? error.message : String(error)}`;
  return /overloaded|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed|timed? ?out|APIConnection/i.test(text);
}

type AnthropicLike = { messages: { stream(params: Anthropic.MessageStreamParams, options?: { signal?: AbortSignal }): { finalMessage(): Promise<Anthropic.Message> } } };

/** Claude Opus 5.5: natív, többfordulós üzenetek (szöveg + forrás tartalomblokk), streamelve, adaptív gondolkodással, medium efforttal. */
export function anthropicClient(opts: { apiKey?: string; model?: string; client?: AnthropicLike } = {}): ModelClient {
  const model = opts.model ?? SINGLE_RUN_PRIMARY_MODEL;
  const client: AnthropicLike = opts.client ?? new Anthropic({ apiKey: opts.apiKey, timeout: SINGLE_RUN_TIMEOUT_MS, maxRetries: 0 });
  return {
    model,
    async complete(system, turns, signal) {
      const messages: Anthropic.MessageParam[] = turns.map((t) => ({
        role: t.role,
        content: t.blocks.map((b): Anthropic.ContentBlockParam => (b.type === "text" ? { type: "text", text: b.text }
          : isBinarySource(b.file) ? claudeSourceBlock(b.file) : { type: "text", text: sourceAsText(b.file) })),
      }));
      const stream = client.messages.stream({
        model, max_tokens: SINGLE_RUN_MAX_TOKENS,
        // A stabil előtag (a gyártás teljes módszertana) gyorsítótárból; a beszélgetés eddigi része a kérés-szintű töréspontból.
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages,
        thinking: { type: "adaptive" },
        output_config: { effort: SINGLE_RUN_EFFORT },
        cache_control: { type: "ephemeral" },
      } as Anthropic.MessageStreamParams, { signal });
      const msg = await stream.finalMessage();
      const text = msg.content.filter((c): c is Anthropic.TextBlock => c.type === "text").map((c) => c.text).join("");
      const u = msg.usage;
      return { text, model, truncated: msg.stop_reason === "max_tokens",
        usage: { input: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), output: u.output_tokens, cachedInput: u.cache_read_input_tokens ?? 0 } };
    },
  };
}

type OpenAILike = { responses: { create(params: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<{ output_text?: string; status?: string; usage?: { input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens?: number } } }> } };

/** GPT-6.1 Sol (tartalék): Responses API, medium effort, a teljes beszélgetés (szöveg + forrás) minden fordulóban. */
export function openAIClient(opts: { apiKey?: string; model?: string; client?: OpenAILike } = {}): ModelClient {
  const model = opts.model ?? SINGLE_RUN_FALLBACK_MODEL;
  const client: OpenAILike = opts.client ?? (new OpenAI({ apiKey: opts.apiKey, timeout: SINGLE_RUN_TIMEOUT_MS, maxRetries: 0 }) as unknown as OpenAILike);
  return {
    model,
    async complete(system, turns, signal) {
      const input = turns.map((t) => t.role === "assistant"
        ? { role: "assistant", content: t.blocks.map((b) => (b.type === "text" ? b.text : "")).join("") }
        : { role: "user", content: t.blocks.map((b) => {
          if (b.type === "text") return { type: "input_text", text: b.text };
          if (!isBinarySource(b.file)) return { type: "input_text", text: sourceAsText(b.file) };
          return b.file.kind === "image" ? { type: "input_image", image_url: b.file.content } : { type: "input_file", filename: b.file.name, file_data: b.file.content };
        }) });
      const response = await client.responses.create({ model, instructions: system, input, store: false, max_output_tokens: SINGLE_RUN_MAX_TOKENS, reasoning: { effort: SINGLE_RUN_EFFORT } }, { signal });
      return { text: response.output_text ?? "", model, truncated: response.status === "incomplete",
        ...(response.usage ? { usage: { input: response.usage.input_tokens, output: response.usage.output_tokens, cachedInput: response.usage.input_tokens_details?.cached_tokens ?? 0 } } : {}) };
    },
  };
}

export type ConversationState = { model: string; switchedToFallback: boolean; turns: Turn[] };

/**
 * Egy gyártás beszélgetése. A `send` a felhasználói fordulót a beszélgetéshez fűzi, a válasz is oda kerül. Elérhetetlenségnél (2 próba után)
 * a beszélgetés VÉGLEG a tartalékra vált, és a teljes átiratot küldi — a tartalék egyedül viszi tovább.
 */
export class LessonConversation {
  private turns: Turn[];
  private current: ModelClient;
  private switched: boolean;

  constructor(
    private readonly system: string,
    private readonly primary: ModelClient | null,
    private readonly fallback: ModelClient | null,
    private readonly opts: { attempts?: number; onFallback?: (reason: string) => void; onUsage?: (reply: ModelReply) => void; state?: ConversationState } = {},
  ) {
    const start = opts.state?.switchedToFallback ? fallback : primary ?? fallback;
    if (!start) throw new Error("Nincs beállított modell az egyfutásos gyártáshoz (Opus 5.5 / GPT-6.1 Sol kulcs hiányzik).");
    this.current = start;
    this.switched = start === fallback && fallback !== primary;
    this.turns = opts.state ? structuredClone(opts.state.turns) : [];
  }

  get model(): string { return this.current.model; }

  state(): ConversationState { return { model: this.current.model, switchedToFallback: this.switched, turns: structuredClone(this.turns) }; }

  async send(blocks: TurnBlock[], signal?: AbortSignal): Promise<ModelReply> {
    this.turns.push({ role: "user", blocks });
    try {
      const reply = await this.completeWithFallback(signal);
      this.turns.push({ role: "assistant", blocks: [{ type: "text", text: reply.text }] });
      this.opts.onUsage?.(reply);
      return reply;
    } catch (error) {
      this.turns.pop(); // a sikertelen forduló nem marad a beszélgetésben — újraküldhető
      throw error;
    }
  }

  private async completeWithFallback(signal?: AbortSignal): Promise<ModelReply> {
    const attempts = this.opts.attempts ?? 2;
    let last: unknown;
    for (let i = 0; i < attempts; i++) {
      try { return await this.current.complete(this.system, this.turns, signal); }
      catch (error) {
        last = error;
        if (!isUnavailable(error) || signal?.aborted) throw error;
      }
    }
    if (!this.switched && this.fallback && this.current !== this.fallback) {
      const reason = last instanceof Error ? last.message.slice(0, 200) : String(last);
      this.opts.onFallback?.(`${this.current.model} nem elérhető (${reason}) — ${this.fallback.model} viszi tovább a teljes beszélgetéssel.`);
      this.current = this.fallback;
      this.switched = true;
      return this.current.complete(this.system, this.turns, signal);
    }
    throw last;
  }
}

/** Az éles beszélgetés a környezet kulcsaival: Opus 5.5 elsődleges, GPT-6.1 Sol tartalék (kulcs nélküli modell kimarad). */
export function createLessonConversation(system: string, opts: ConstructorParameters<typeof LessonConversation>[3] = {}, env: NodeJS.ProcessEnv = process.env): LessonConversation {
  const anthropicKey = env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const openaiKey = env.AI_INTEGRATIONS_OPENAI_API_KEY ?? env.OPENAI_API_KEY;
  return new LessonConversation(system, anthropicKey ? anthropicClient({ apiKey: anthropicKey }) : null, openaiKey ? openAIClient({ apiKey: openaiKey }) : null, opts);
}
