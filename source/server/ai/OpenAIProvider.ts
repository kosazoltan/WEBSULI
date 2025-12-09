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

export class OpenAIProvider implements IAIProvider {
  readonly name = 'OpenAI';
  readonly model: string;
  private client: OpenAI;
  private timeout: number;

  constructor(config: AIProviderConfig) {
    this.model = config.model;
    this.timeout = config.timeout || 60000; // Default 60s
    this.client = new OpenAI({
      apiKey: config.apiKey,
      timeout: this.timeout,
    });
  }

  async chat(messages: AIMessage[], signal?: AbortSignal): Promise<AIResponse> {
    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
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
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  async *streamChat(
    messages: AIMessage[],
    signal?: AbortSignal
  ): AsyncGenerator<AIStreamChunk, void, unknown> {
    try {
      const stream = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
          temperature: 0.7,
          stream: true,
        },
        { signal }
      );

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          yield {
            type: 'content_delta',
            content: delta.content,
          };
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
      // Simple ping to check if API is reachable
      await this.client.models.list({ timeout: 5000 });
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

    // Handle OpenAI specific errors
    if (error instanceof OpenAI.APIError) {
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
