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
  maxRetries?: number;
  apiMode?: 'chat' | 'responses';
  reasoningEffort?: 'low' | 'medium' | 'high';
  /**
   * Spec §7o (mérve 2026-09-20): a szolgáltató szintaktikailag érvényes JSON-t ad vissza
   * (`response_format: json_object`). A kért tartalmat nem befolyásolja, csak a sorosítást.
   */
  jsonMode?: boolean;
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

/**
 * Spec 2026-09-25 (docs/specs/2026-09-25-openai-keret-atallas.md): a fiók kerete (kreditje) elfogyott. Mért: az
 * OpenAI ezt HTTP 429-cel, `insufficient_quota` típussal küldi, és eddig „Rate limit exceeded”-ként (újrapróbálható
 * sebességkorlátként) jelent meg — a webes gyártás „nem fejeződött be” hibával állt le, az ok sehol nem látszott.
 * Nem újrapróbálható: ugyanazon a fiókon a következő kérés is bukik.
 */
export class AIProviderQuotaError extends AIProviderError {
  constructor(provider: string, detail?: string) {
    super(provider, `A szolgáltatói fiók kerete (kreditje) elfogyott${detail ? ` (${detail})` : ""}.`, false);
    this.name = 'AIProviderQuotaError';
  }
}

/** OpenAI: 429 + insufficient_quota / credit_balance_exhausted; OpenRouter: 402 (nincs elég kredit). */
export function isQuotaExhausted(error: { status?: number; code?: unknown; type?: unknown; error?: unknown }): boolean {
  const body = (error.error ?? {}) as { code?: unknown; type?: unknown };
  const codes = [error.code, error.type, body.code, body.type].map(v => String(v ?? ""));
  if (error.status === 402) return true;
  return error.status === 429 && codes.some(c => c === "insufficient_quota" || c === "credit_balance_exhausted");
}

export class AIProviderAuthError extends AIProviderError {
  constructor(provider: string) {
    super(provider, 'Authentication failed', false);
    this.name = 'AIProviderAuthError';
  }
}
