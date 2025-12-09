/**
 * AI Provider Abstraction
 * 
 * This module provides a unified interface for interacting with different AI providers
 * (OpenAI, Claude, etc.) with automatic fallback support and error handling.
 */

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIStreamChunk {
  type: 'content_delta' | 'html_generated' | 'error' | 'done';
  content?: string;
  html?: string;
  message?: string;
}

export interface AIResponse {
  content: string;
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIProviderConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number; // milliseconds
}

/**
 * Base interface for all AI providers
 */
export interface IAIProvider {
  readonly name: string;
  readonly model: string;
  
  /**
   * Non-streaming chat completion
   */
  chat(messages: AIMessage[], signal?: AbortSignal): Promise<AIResponse>;
  
  /**
   * Streaming chat completion
   * Returns an async generator that yields chunks as they arrive
   */
  streamChat(messages: AIMessage[], signal?: AbortSignal): AsyncGenerator<AIStreamChunk, void, unknown>;
  
  /**
   * Check if the provider is currently available
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Error types for AI provider operations
 */
export class AIProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public isRetriable: boolean = true,
    public originalError?: Error
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'AIProviderError';
  }
}

export class AIProviderTimeoutError extends AIProviderError {
  constructor(provider: string, timeout: number) {
    super(provider, `Request timed out after ${timeout}ms`, true);
    this.name = 'AIProviderTimeoutError';
  }
}

export class AIProviderRateLimitError extends AIProviderError {
  constructor(provider: string) {
    super(provider, 'Rate limit exceeded', true);
    this.name = 'AIProviderRateLimitError';
  }
}

export class AIProviderAuthError extends AIProviderError {
  constructor(provider: string) {
    super(provider, 'Authentication failed', false);
    this.name = 'AIProviderAuthError';
  }
}
