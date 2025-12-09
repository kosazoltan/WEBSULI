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

  constructor(config: AIProviderConfig) {
    this.model = config.model;
    this.timeout = config.timeout || 60000; // Default 60s
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
          max_tokens: 4096,
          system: systemMessages.map(m => m.content).join('\n\n'),
          messages: conversationMessages.map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
        },
        { signal }
      );

      const content = response.content[0];
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
    } catch (error: any) {
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
          max_tokens: 4096,
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
    } catch (error: any) {
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

  private handleError(error: any): AIProviderError {
    // Handle abort errors
    if (error.name === 'AbortError') {
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
    return new AIProviderError(
      this.name,
      error.message || 'Unknown error',
      true,
      error
    );
  }
}
