import OpenAI from 'openai';
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
  AIProviderQuotaError,
  isQuotaExhausted,

  type ChatCallOptions,
} from './AIProvider';
import { collectStream, idleAbortSignal, type StreamEvent } from './stream-collect';

/**
 * OpenRouter provider (LS-0d).
 *
 * The Lesson Studio routes each pipeline step to a different vendor (see server/ai/models.ts):
 * extraction on a vision model, authoring on one family, the Lektor on another so the
 * source-fidelity review (D1) is genuinely independent. OpenRouter exposes all of them
 * behind one OpenAI-compatible endpoint, so this provider is the existing OpenAIProvider
 * pointed at a different base URL plus attribution headers.
 *
 * Configuration is optional: with no OPENROUTER_API_KEY the provider reports itself
 * unconfigured and the factory keeps using the direct OpenAI/Claude providers. Startup
 * must never fail because a future feature's key is absent.
 */

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

type EnvLike = Record<string, string | undefined>;

/** True when a usable OpenRouter key is present. */
export function isOpenRouterConfigured(env: EnvLike = process.env): boolean {
  const key = env.OPENROUTER_API_KEY;
  return typeof key === 'string' && key.trim().length > 0;
}

/**
 * Attribution headers OpenRouter uses for dashboard/ranking purposes.
 * Deliberately free of credentials — the key travels in the Authorization header.
 */
export function openRouterHeaders(): Record<string, string> {
  return {
    'HTTP-Referer': 'https://websuli.vip',
    'X-Title': 'WebSuli Studio',
  };
}

/**
 * Removes ```json ... ``` (or bare ```) fences some models wrap JSON in.
 * Only strips when the text BEGINS with a fence, so JSON containing backticks
 * inside string values is left alone.
 */
export function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  const withoutOpening = trimmed.replace(/^```(?:json)?\s*\r?\n?/i, '');
  return withoutOpening.replace(/\r?\n?```\s*$/, '').trim();
}

export class OpenRouterProvider implements IAIProvider {
  readonly name = 'OpenRouter';
  readonly model: string;
  private client: OpenAI;
  private timeout: number;
  private configured: boolean;
  private maxTokens?: number;
  /** Spec 2026-09-19: OpenRouter `reasoning.effort` caps thinking tokens on deepseek/qwen/glm. */
  private reasoningEffort?: AIProviderConfig['reasoningEffort'];
  /** Spec §7o: provider-enforced JSON serialisation for the bulk-JSON steps. */
  private jsonMode?: boolean;

  constructor(config: AIProviderConfig) {
    this.model = config.model;
    this.maxTokens = config.maxTokens;
    this.reasoningEffort = config.reasoningEffort;
    this.jsonMode = config.jsonMode;
    this.timeout = config.timeout || 60000;
    this.configured = typeof config.apiKey === 'string' && config.apiKey.trim().length > 0;
    this.client = new OpenAI({
      // The SDK rejects an empty string; a placeholder keeps construction total while
      // `isConfigured()` stays false so nothing actually dispatches a request.
      apiKey: this.configured ? config.apiKey : 'not-configured',
      baseURL: OPENROUTER_BASE_URL,
      timeout: this.timeout,
      ...(config.maxRetries !== undefined ? { maxRetries: config.maxRetries } : {}),
      defaultHeaders: openRouterHeaders(),
    });
  }

  /** False when no API key was supplied; the factory then falls back to another provider. */
  isConfigured(): boolean {
    return this.configured;
  }

  /** Spec 2026-09-30 (U6): a beállított kimeneti keret; a szigorú séma (`responseFormat`) ezen az úton szándékosan nem megy. */
  get maxOutputTokens(): number | undefined { return this.maxTokens; }
  readonly supportsStreamingChat = true;

  async chat(messages: AIMessage[], signal?: AbortSignal, options?: ChatCallOptions): Promise<AIResponse> {
    this.assertConfigured();
    if (options?.stream) return this.chatStreamed(messages, signal, options, options.stream.idleMs);
    try {
      const outputBudget = options?.maxTokens ?? this.maxTokens;
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: messages.map(msg => ({ role: msg.role, content: msg.content })),
          ...(outputBudget ? { max_completion_tokens: outputBudget } : {}),
          ...(this.reasoningEffort ? { reasoning: { effort: this.reasoningEffort } } : {}),
          ...(this.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
          temperature: 0.7,
        },
        { signal }
      );

      const choice = response.choices[0];
      if (!choice || !choice.message) {
        throw new AIProviderError(this.name, 'No response from API');
      }

      return {
        content: choice.message.content || '',
        finishReason: choice.finish_reason || undefined,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
              ...(response.usage.prompt_tokens_details?.cached_tokens ? { cachedTokens: response.usage.prompt_tokens_details.cached_tokens } : {}),
            }
          : undefined,
      };
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  /**
   * Spec 2026-10-05-s10-adatvesztes-mentesseg: ugyanaz a kérés, mint a `chat`-é, streamelve, tétlenségi őrrel. A záró
   * használat-darab (OpenRouter: egy üres delta; OpenAI: üres `choices`) mindkét alakja kezelve; a gondolkodás-delta
   * (`reasoning` / `reasoning_details`) aktivitásnak számít. Stream közbeni `finish_reason: "error"` → hiba a részleges szöveggel.
   */
  private async chatStreamed(messages: AIMessage[], signal: AbortSignal | undefined, options: ChatCallOptions, idleMs: number): Promise<AIResponse> {
    const outputBudget = options.maxTokens ?? this.maxTokens;
    const idle = idleAbortSignal(signal);
    let partial = '';
    try {
      const stream = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: messages.map(msg => ({ role: msg.role, content: msg.content })),
          ...(outputBudget ? { max_completion_tokens: outputBudget } : {}),
          ...(this.reasoningEffort ? { reasoning: { effort: this.reasoningEffort } } : {}),
          ...(this.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
          temperature: 0.7,
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal: idle.signal }
      );
      async function* events(): AsyncGenerator<StreamEvent> {
        for await (const chunk of stream) {
          const choice = chunk.choices?.[0];
          const delta = choice?.delta as { content?: string | null; reasoning?: string | null; reasoning_details?: unknown[] } | undefined;
          if (choice?.finish_reason === ('error' as string)) throw new AIProviderError('OpenRouter', 'A szolgáltató a stream közben hibát jelzett.');
          if (delta?.content) partial += delta.content;
          yield {
            ...(delta?.content ? { text: delta.content } : {}),
            activity: true,
            ...(choice?.finish_reason ? { finishReason: choice.finish_reason } : {}),
            ...(chunk.usage ? { usage: {
              promptTokens: chunk.usage.prompt_tokens, completionTokens: chunk.usage.completion_tokens, totalTokens: chunk.usage.total_tokens,
              ...(chunk.usage.prompt_tokens_details?.cached_tokens ? { cachedTokens: chunk.usage.prompt_tokens_details.cached_tokens } : {}),
            } } : {}),
          };
        }
      }
      return await collectStream(events(), { idleMs, abort: idle.abort, provider: this.name });
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
    this.assertConfigured();
    try {
      const stream = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: messages.map(msg => ({ role: msg.role, content: msg.content })),
          ...(this.maxTokens ? { max_completion_tokens: this.maxTokens } : {}),
          temperature: 0.7,
          stream: true,
        },
        { signal }
      );

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          yield { type: 'content_delta', content: delta.content };
        }
      }

      yield { type: 'done' };
    } catch (error: unknown) {
      if (signal?.aborted) {
        yield { type: 'error', message: 'Request aborted' };
        return;
      }
      throw this.handleError(error);
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.configured) return false;
    try {
      await this.client.models.list({ timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw new AIProviderError(this.name, 'OPENROUTER_API_KEY is not set', false);
    }
  }

  private handleError(error: unknown): AIProviderError {
    if (error instanceof Error && error.name === 'AbortError') {
      return new AIProviderTimeoutError(this.name, this.timeout);
    }

    if (error instanceof OpenAI.APIError) {
      if (isQuotaExhausted(error)) return new AIProviderQuotaError(this.name, String(error.code ?? error.status));
      if (error.status === 429) return new AIProviderRateLimitError(this.name);
      if (error.status === 401 || error.status === 403) return new AIProviderAuthError(this.name);
      return new AIProviderError(
        this.name,
        error.message || 'API error',
        error.status >= 500,
        error
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return new AIProviderError(
      this.name,
      message || 'Unknown error',
      true,
      error instanceof Error ? error : undefined
    );
  }
}
