import Anthropic from '@anthropic-ai/sdk';
import { cacheConversation, claudeSystemFromMessages } from './prompt-cache';
import {
  IAIProvider,
  AIMessage,
  AIResponse,
  AIStreamChunk,
  AIProviderConfig,
  AIProviderError,
  AIProviderTimeoutError,
  AIProviderRateLimitError,
  AIProviderAuthError,
  type ChatCallOptions,
} from './AIProvider';
import { collectStream, idleAbortSignal, type StreamEvent } from './stream-collect';

export class ClaudeProvider implements IAIProvider {
  readonly name = 'Claude';
  readonly model: string;
  private client: Anthropic;
  private timeout: number;
  private maxTokens: number;
  /** Spec 2026-09-19: adaptive thinking + `output_config.effort` (Opus 5 planner runs at medium). */
  private reasoningEffort?: AIProviderConfig['reasoningEffort'];
  get maxOutputTokens(): number { return this.maxTokens; }
  /** Spec 2026-10-05-s10 (3. szelet): a szerző (Claude Opus 5.5) hosszú kimenete streamelve, tétlenségi őrrel. */
  readonly supportsStreamingChat = true;

  constructor(config: AIProviderConfig) {
    this.model = config.model;
    this.timeout = config.timeout || 60000; // Default 60s
    this.maxTokens = config.maxTokens || 4096;
    this.reasoningEffort = config.reasoningEffort;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      timeout: this.timeout,
    });
  }

  async chat(messages: AIMessage[], signal?: AbortSignal, options?: ChatCallOptions): Promise<AIResponse> {
    try {
      // Separate system messages from conversation
      const systemMessages = messages.filter(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');
      const systemText = systemMessages.map(m => m.content).join('\n\n');
      // Spec 2026-09-30 (U6, C10): a stabil előtag (runbook + skill) külön blokk `cache_control`-lal — az ismételt hívások
      // (fejezetenkénti tervező, bank-ellenőr, lektor körök) ezt a gyorsítótárból olvassák. A rövid előtagot a szolgáltató
      // egyszerűen nem gyorsítótárazza (nem hiba).
      const prefix = options?.cachePrefixChars && options.cachePrefixChars > 0 && options.cachePrefixChars < systemText.length
        ? systemText.slice(0, options.cachePrefixChars) : '';
      const system = prefix
        ? [
            { type: 'text' as const, text: prefix, cache_control: { type: 'ephemeral' as const } },
            { type: 'text' as const, text: systemText.slice(prefix.length) },
          ]
        : systemText;

      const params = {
        model: this.model,
        max_tokens: options?.maxTokens ?? this.maxTokens,
        system,
        messages: conversationMessages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        // Spec 2026-09-19: Claude 4.6+/5 — adaptive thinking, depth via output_config.effort.
        ...(this.reasoningEffort
          ? { thinking: { type: 'adaptive' as const }, output_config: { effort: this.reasoningEffort } }
          : {}),
      };
      if (options?.stream) return await this.chatStreamed(params, signal, options.stream.idleMs);
      const response = await this.client.messages.create(params, { signal });

      // With thinking on, the first block may be a thinking block — take the text block.
      const content = response.content.find(block => block.type === 'text');
      if (!content || content.type !== 'text') {
        throw new AIProviderError(this.name, 'No text response from API');
      }

      return {
        content: content.text,
        finishReason: response.stop_reason || undefined,
        usage: {
          promptTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0) + response.usage.output_tokens,
          ...(response.usage.cache_read_input_tokens ? { cachedTokens: response.usage.cache_read_input_tokens } : {}),
          ...(response.usage.cache_creation_input_tokens ? { cacheWriteTokens: response.usage.cache_creation_input_tokens } : {}),
        },
      };
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  /**
   * Spec 2026-10-05-s10-adatvesztes-mentesseg (3. szelet): ugyanaz a kérés `messages.stream`-mel; a szöveg-delta szöveg, a
   * gondolkodás-delta aktivitás (a tétlenségi őrt újraindítja); a pontos használat és a `stop_reason` a stream végén a
   * `finalMessage()`-ből. Megszakadáskor a hiba a beérkezett szöveget hordozza.
   */
  private async chatStreamed(params: Anthropic.MessageCreateParamsNonStreaming, signal: AbortSignal | undefined, idleMs: number): Promise<AIResponse> {
    const idle = idleAbortSignal(signal);
    let partial = '';
    const provider = this.name;
    try {
      const stream = this.client.messages.stream(params, { signal: idle.signal });
      const events = (async function* (): AsyncGenerator<StreamEvent> {
        for await (const ev of stream) {
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') { partial += ev.delta.text; yield { text: ev.delta.text }; continue; }
          yield { activity: true };
        }
        const msg = await stream.finalMessage();
        const u = msg.usage;
        const input = u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
        yield {
          ...(msg.stop_reason ? { finishReason: msg.stop_reason } : {}),
          usage: { promptTokens: input, completionTokens: u.output_tokens, totalTokens: input + u.output_tokens,
            ...(u.cache_read_input_tokens ? { cachedTokens: u.cache_read_input_tokens } : {}),
            ...(u.cache_creation_input_tokens ? { cacheWriteTokens: u.cache_creation_input_tokens } : {}) },
        };
      })();
      return await collectStream(events, { idleMs, abort: idle.abort, provider });
    } catch (error: unknown) {
      if (error instanceof AIProviderError && error.name === 'AIProviderIdleTimeoutError') throw error;
      const mapped = error instanceof AIProviderError ? error : this.handleError(error);
      mapped.partialContent = (error as { partialContent?: string })?.partialContent ?? partial;
      throw mapped;
    }
  }

  async *streamChat(
    messages: AIMessage[],
    signal?: AbortSignal
  ): AsyncGenerator<AIStreamChunk, void, unknown> {
    try {
      // Separate system messages from conversation
      const systemMessages = messages.filter(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      // Spec 2026-10-03-gpt61-sol-kv-cache: a hívó a statikus és a változó system-részt külön üzenetben adja → töréspont
      // a statikus rész végén; folytatásos körben az első user-üzenet (pl. a teljes eredeti tananyag) is a gyorsítótárból jön.
      const stream = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: this.maxTokens,
          system: claudeSystemFromMessages(systemMessages.map(m => m.content)),
          messages: cacheConversation(conversationMessages),
          stream: true,
          // Review #180 (Codex): kérés-szintű automatikus töréspont az utolsó blokkon — az ELSŐ hívás is eltárolja a nagy
          // user-promptot, így már az első folytatás cache-találat (az explicit jelölő ugyanazzal a TTL-lel összefér).
          cache_control: { type: 'ephemeral' },
        },
        { signal }
      );

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield {
              type: 'content_delta',
              content: event.delta.text,
            };
          }
        }
      }

      yield { type: 'done' };
    } catch (error: unknown) {
      if (signal?.aborted) {
        yield {
          type: 'error',
          message: 'Request aborted',
        };
        return;
      }
      throw this.handleError(error);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Try a minimal request to check availability
      await this.client.messages.create({
        model: this.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }

  private handleError(error: unknown): AIProviderError {
    // Handle abort errors
    if (error instanceof Error && error.name === 'AbortError') {
      return new AIProviderTimeoutError(this.name, this.timeout);
    }

    // Handle Anthropic specific errors
    if (error instanceof Anthropic.APIError) {
      if (error.status === 429) {
        return new AIProviderRateLimitError(this.name);
      }
      if (error.status === 401 || error.status === 403) {
        return new AIProviderAuthError(this.name);
      }
      return new AIProviderError(
        this.name,
        error.message || 'API error',
        error.status >= 500, // Retriable if server error
        error
      );
    }

    // Generic error
    const message = error instanceof Error ? error.message : String(error);
    return new AIProviderError(
      this.name,
      message || 'Unknown error',
      true,
      error instanceof Error ? error : undefined
    );
  }
}
