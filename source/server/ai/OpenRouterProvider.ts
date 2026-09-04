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
} from './AIProvider';

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

  constructor(config: AIProviderConfig) {
    this.model = config.model;
    this.timeout = config.timeout || 60000;
    this.configured = typeof config.apiKey === 'string' && config.apiKey.trim().length > 0;
    this.client = new OpenAI({
      // The SDK rejects an empty string; a placeholder keeps construction total while
      // `isConfigured()` stays false so nothing actually dispatches a request.
      apiKey: this.configured ? config.apiKey : 'not-configured',
      baseURL: OPENROUTER_BASE_URL,
      timeout: this.timeout,
      defaultHeaders: openRouterHeaders(),
    });
  }

  /** False when no API key was supplied; the factory then falls back to another provider. */
  isConfigured(): boolean {
    return this.configured;
  }

  async chat(messages: AIMessage[], signal?: AbortSignal): Promise<AIResponse> {
    this.assertConfigured();
    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: messages.map(msg => ({ role: msg.role, content: msg.content })),
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
            }
          : undefined,
      };
    } catch (error: unknown) {
      throw this.handleError(error);
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
