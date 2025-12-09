import {
  IAIProvider,
  AIMessage,
  AIResponse,
  AIStreamChunk,
  AIProviderError,
  AIProviderAuthError,
} from './AIProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { ClaudeProvider } from './ClaudeProvider';
import { getAICache } from './AICache';

export type ProviderType = 'openai' | 'claude';

interface ProviderOptions {
  primaryProvider: ProviderType;
  fallbackProvider?: ProviderType;
  maxRetries?: number;
}

/**
 * AI Provider Factory with automatic fallback support
 * 
 * Usage:
 * ```ts
 * const factory = new AIProviderFactory({
 *   primaryProvider: 'claude',
 *   fallbackProvider: 'openai',
 *   maxRetries: 3
 * });
 * 
 * const response = await factory.chat(messages);
 * ```
 */
export class AIProviderFactory {
  private providers: Map<ProviderType, IAIProvider> = new Map();
  private primaryProvider: ProviderType;
  private fallbackProvider?: ProviderType;
  private maxRetries: number;

  constructor(options: ProviderOptions) {
    this.primaryProvider = options.primaryProvider;
    this.fallbackProvider = options.fallbackProvider;
    this.maxRetries = options.maxRetries || 3;
    this.initializeProviders();
  }

  private initializeProviders() {
    // Initialize OpenAI provider
    const openAIKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    if (openAIKey) {
      this.providers.set(
        'openai',
        new OpenAIProvider({
          apiKey: openAIKey,
          model: 'gpt-4o-2024-11-20',
          timeout: 60000,
        })
      );
    }

    // Initialize Claude provider
    const claudeKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    if (claudeKey) {
      this.providers.set(
        'claude',
        new ClaudeProvider({
          apiKey: claudeKey,
          model: 'claude-sonnet-4-20250514',
          timeout: 60000,
        })
      );
    }
  }

  /**
   * Get a specific provider instance
   */
  getProvider(type: ProviderType): IAIProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`Provider ${type} not configured`);
    }
    return provider;
  }

  /**
   * Chat with automatic fallback, retry logic, and caching
   */
  async chat(messages: AIMessage[], signal?: AbortSignal, useCache: boolean = true): Promise<AIResponse> {
    const cache = getAICache();
    const primary = this.getProvider(this.primaryProvider);
    
    // Try cache first if enabled
    if (useCache) {
      const cacheKey = cache.generateKey(messages, primary.model);
      const cachedContent = cache.get(cacheKey);
      
      if (cachedContent) {
        return {
          content: cachedContent,
          finishReason: 'cached',
        };
      }
    }

    let lastError: Error | undefined;
    let response: AIResponse | undefined;

    // Try primary provider with retries
    try {
      response = await this.retryWithBackoff(
        () => primary.chat(messages, signal),
        this.maxRetries
      );
      
      // Cache successful response
      if (useCache && response) {
        const cacheKey = cache.generateKey(messages, primary.model);
        cache.set(cacheKey, response.content, primary.name, primary.model);
      }
      
      return response;
    } catch (error: any) {
      console.warn('[AIFactory] Primary provider (%s) failed: %s', this.primaryProvider, error.message);
      lastError = error;

      // Don't retry on auth errors
      if (error instanceof AIProviderAuthError) {
        throw error;
      }
    }

    // Try fallback provider if configured
    if (this.fallbackProvider) {
      try {
        console.log(`[AIFactory] Falling back to ${this.fallbackProvider}...`);
        const fallback = this.getProvider(this.fallbackProvider);
        response = await this.retryWithBackoff(
          () => fallback.chat(messages, signal),
          this.maxRetries
        );
        
        // Cache successful fallback response
        if (useCache && response) {
          const cacheKey = cache.generateKey(messages, fallback.model);
          cache.set(cacheKey, response.content, fallback.name, fallback.model);
        }
        
        return response;
      } catch (error: any) {
        console.error('[AIFactory] Fallback provider (%s) also failed: %s', this.fallbackProvider, error.message);
        lastError = error;
      }
    }

    // Both providers failed
    throw new AIProviderError(
      'AIFactory',
      `All providers failed. Last error: ${lastError?.message}`,
      false,
      lastError
    );
  }

  /**
   * Streaming chat with automatic fallback
   */
  async *streamChat(
    messages: AIMessage[],
    signal?: AbortSignal
  ): AsyncGenerator<AIStreamChunk, void, unknown> {
    let lastError: Error | undefined;

    // Try primary provider
    try {
      const primary = this.getProvider(this.primaryProvider);
      yield* primary.streamChat(messages, signal);
      return;
    } catch (error: any) {
      console.warn('[AIFactory] Primary provider (%s) stream failed: %s', this.primaryProvider, error.message);
      lastError = error;

      // Don't try fallback on auth errors
      if (error instanceof AIProviderAuthError) {
        throw error;
      }
    }

    // Try fallback provider if configured
    if (this.fallbackProvider) {
      try {
        console.log(`[AIFactory] Falling back to ${this.fallbackProvider} for streaming...`);
        const fallback = this.getProvider(this.fallbackProvider);
        yield* fallback.streamChat(messages, signal);
        return;
      } catch (error: any) {
        console.error('[AIFactory] Fallback provider (%s) stream also failed: %s', this.fallbackProvider, error.message);
        lastError = error;
      }
    }

    // Both providers failed
    yield {
      type: 'error',
      message: `All providers failed. Last error: ${lastError?.message}`,
    };
  }

  /**
   * Retry a function with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // Don't retry on auth errors or non-retriable errors
        if (error instanceof AIProviderAuthError || !error.isRetriable) {
          throw error;
        }

        // PERFORMANCE: Skip delay after the last retry attempt
        const isLastAttempt = attempt === maxRetries - 1;
        if (isLastAttempt) {
          break;
        }

        // Calculate exponential backoff: 1s, 2s, 4s, 8s, ...
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.log(`[AIFactory] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Check if any provider is available
   */
  async isAnyProviderAvailable(): Promise<boolean> {
    const checks = Array.from(this.providers.values()).map(p => p.isAvailable());
    const results = await Promise.all(checks);
    return results.some(available => available);
  }
}

/**
 * Singleton factory instance
 */
let factoryInstance: AIProviderFactory | null = null;

export function getAIFactory(): AIProviderFactory {
  if (!factoryInstance) {
    factoryInstance = new AIProviderFactory({
      primaryProvider: 'claude',
      fallbackProvider: 'openai',
      maxRetries: 3,
    });
  }
  return factoryInstance;
}
