import Anthropic from '@anthropic-ai/sdk';
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

export class ClaudeProvider implements IAIProvider {
  readonly name = 'Claude';
  readonly model: string;
  private client: Anthropic;
  private timeout: number;
  private maxTokens: number;
  /** Spec 2026-09-19: adaptive thinking + `output_config.effort` (Opus 5 planner runs at medium). */
  private reasoningEffort?: AIProviderConfig['reasoningEffort'];

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

  async chat(messages: AIMessage[], signal?: AbortSignal): Promise<AIResponse> {
    try {
      // Separate system messages from conversation
      const systemMessages = messages.filter(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      const response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: this.maxTokens,
          system: systemMessages.map(m => m.content).join('\n\n'),
          messages: conversationMessages.map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
          // Spec 2026-09-19: Claude 4.6+/5 — adaptive thinking, depth via output_config.effort.
          ...(this.reasoningEffort
            ? { thinking: { type: 'adaptive' as const }, output_config: { effort: this.reasoningEffort } }
            : {}),
        },
        { signal }
      );

      // With thinking on, the first block may be a thinking block — take the text block.
      const content = response.content.find(block => block.type === 'text');
      if (!content || content.type !== 'text') {
        throw new AIProviderError(this.name, 'No text response from API');
      }

      return {
        content: content.text,
        finishReason: response.stop_reason || undefined,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      };
    } catch (error: unknown) {
      throw this.handleError(error);
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

      const stream = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: this.maxTokens,
          system: systemMessages.map(m => m.content).join('\n\n'),
          messages: conversationMessages.map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
          stream: true,
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
