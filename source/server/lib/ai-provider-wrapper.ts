/**
 * C2: Unified AI provider wrapper with timeout, retry, and safe error mapping.
 * Prevents raw upstream errors leaking to the client and ensures bounded execution.
 */

export interface AICallOptions {
  /** Timeout in milliseconds. Default: AI_TIMEOUT_MS env or 30000. */
  timeoutMs?: number;
  /** Number of retries on transient failure (5xx, network). Default: 1. */
  retries?: number;
  /** Base delay between retries in ms. Default: 1000. */
  retryDelayMs?: number;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly code: 'TIMEOUT' | 'UPSTREAM_ERROR' | 'RATE_LIMITED' | 'UNKNOWN',
    public readonly statusHint: number = 502,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

function defaultTimeoutMs(): number {
  const env = parseInt(process.env.AI_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(env) && env > 0 ? env : 30_000;
}

function isTransient(err: unknown): boolean {
  if (err instanceof AIProviderError) return false; // already mapped
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('rate limit') || msg.includes('429')) return false; // don't retry rate limits
    if (msg.includes('timeout') || msg.includes('abort')) return false; // timeout = not transient
  }
  return true;
}

/**
 * Wraps any async AI call with:
 * - AbortController-based timeout
 * - Bounded exponential-backoff retry (transient errors only)
 * - Safe client-facing error mapping (no raw upstream message leak)
 */
export async function withAIProvider<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  opts: AICallOptions = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? defaultTimeoutMs();
  const retries = opts.retries ?? 1;
  const retryDelayMs = opts.retryDelayMs ?? 1000;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await fn(controller.signal);
      return result;
    } catch (err: unknown) {
      lastErr = err;
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        throw new AIProviderError(
          `AI provider call timed out after ${timeoutMs}ms`,
          'TIMEOUT',
          504,
        );
      }
      if (err instanceof Error && (err.message.includes('429') || err.message.toLowerCase().includes('rate limit'))) {
        throw new AIProviderError('AI provider rate limited', 'RATE_LIMITED', 429);
      }
      if (attempt < retries && isTransient(err)) {
        await new Promise((r) => setTimeout(r, retryDelayMs * Math.pow(2, attempt)));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  // Map unknown upstream error to safe client response
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  // Only log; do NOT propagate raw message to client
  // eslint-disable-next-line no-console
  console.error('[AI] Upstream error after retries:', msg);
  throw new AIProviderError('AI provider error', 'UPSTREAM_ERROR', 502);
}
