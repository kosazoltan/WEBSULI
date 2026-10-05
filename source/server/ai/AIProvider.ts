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
    /** Spec 2026-09-30 (U6, C10): a gyorsítótárból olvasott bemeneti tokenek (OpenAI `cached_tokens`, Anthropic `cache_read_input_tokens`). */
    cachedTokens?: number;
    /** Anthropic `cache_creation_input_tokens` — a gyorsítótárba írt bemeneti tokenek. */
    cacheWriteTokens?: number;
  };
}

/** Szigorú JSON-séma válaszformátum (OpenAI Structured Outputs alak). */
export type ResponseFormatJsonSchema = { type: "json_schema"; json_schema: { name: string; strict?: boolean; schema: Record<string, unknown>; description?: string } };
/** Hívásonkénti beállítás a szolgáltatónak (a provider-konfig a lépésé, ez az egyes kérésé). */
export type ChatCallOptions = {
  responseFormat?: ResponseFormatJsonSchema;
  /** Spec 2026-09-30 (U6, C11): a kimeneti keret felülírása EGY kérésre (hosszkorlát utáni egyszeri, nagyobb keret). */
  maxTokens?: number;
  /**
   * Spec 2026-09-30 (U6, C10): a rendszerutasítás első `cachePrefixChars` karaktere a stabil előtag (runbook + skill) —
   * az ezt támogató szolgáltató (Anthropic) `cache_control`-lal jelöli; a többi figyelmen kívül hagyja.
   */
  cachePrefixChars?: number;
  /**
   * Spec 2026-10-05-s10-adatvesztes-mentesseg: streamelt hívás tétlenségi őrrel — ha `idleMs` ideig nem jön új darab (szöveg
   * vagy gondolkodás), a hívás megszakad, és a hiba a már beérkezett szöveget is hordozza. Csak a `supportsStreamingChat`
   * szolgáltató használja; a többi figyelmen kívül hagyja.
   */
  stream?: { idleMs: number };
};

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
  /** Spec 2026-09-30 (U6, C11): a szolgáltató beállított kimeneti kerete (ha ismert) — a hosszkorlát-újrapróba ebből nő. */
  readonly maxOutputTokens?: number;
  /** Spec 2026-10-05-s10: a `chat` hívás `options.stream` esetén streamel (tétlenségi őrrel). */
  readonly supportsStreamingChat?: boolean;
  
  /**
   * Chat completion. Alapból pufferelt; `options.stream` esetén (és ha `supportsStreamingChat`) a szolgáltató BELÜL streamel,
   * tétlenségi őrrel — megszakadáskor a hiba `partialContent`-ben hordozza a beérkezett szöveget (spec 2026-10-05-s10).
   */
  /**
   * `options.responseFormat` (spec 2026-09-30, U2/C8): hívásonkénti szigorú JSON-séma a szolgáltatónak (`json_schema`,
   * strict). Csak az azt támogató szolgáltató (közvetlen OpenAI) használja; a többi figyelmen kívül hagyja.
   */
  chat(messages: AIMessage[], signal?: AbortSignal, options?: ChatCallOptions): Promise<AIResponse>;
  
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
  /** Spec 2026-10-05-s10: streamelt hívás megszakadásakor a már beérkezett (kifizetett) szöveg — naplózásra, elemzésre. */
  partialContent?: string;
}

/** Spec 2026-10-05-s10: a stream `idleMs` ideig nem hozott új darabot — megszakítva, a részleges szöveggel. */
export class AIProviderIdleTimeoutError extends AIProviderError {
  constructor(provider: string, public idleMs: number, partialContent: string) {
    super(provider, `No stream data for ${idleMs}ms (idle timeout)`, true);
    this.name = 'AIProviderIdleTimeoutError';
    this.partialContent = partialContent;
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
export function isQuotaExhausted(error: { status?: number; code?: unknown; type?: unknown; error?: unknown; message?: unknown }): boolean {
  const body = (error.error ?? {}) as { code?: unknown; type?: unknown; message?: unknown };
  const codes = [error.code, error.type, body.code, body.type].map(v => String(v ?? ""));
  if (error.status === 402) return true;
  if (error.status !== 429) return false;
  if (codes.some(c => c === "insufficient_quota" || c === "credit_balance_exhausted")) return true;
  // Spec 2026-10-01-gyokerok-egyben (2.3): az OpenAI előre fizetett számlázás üzenete (mért: „You have no credits remaining”).
  return /no credits remaining|exceeded your current quota|insufficient[_ ]quota/i.test(`${String(error.message ?? "")} ${String(body.message ?? "")}`);
}

export class AIProviderAuthError extends AIProviderError {
  constructor(provider: string) {
    super(provider, 'Authentication failed', false);
    this.name = 'AIProviderAuthError';
  }
}
