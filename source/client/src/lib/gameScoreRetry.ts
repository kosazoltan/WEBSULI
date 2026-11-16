/**
 * JM0: a pontbeküldés runId-ja és egyszeri, késleltetett újrapróbája (tiszta, könnyen tesztelhető logika; a hálózati
 * hívást a `gameScoreRunId.ts` köti be).
 *
 * Szabályok:
 *  - automatikus újraküldés KIZÁRÓLAG érvényes (UUID v4) `runId`-val történik — a szerver így idempotens, nem számol kétszer;
 *    runId nélkül (nincs kriptográfiai véletlen) inkább elvész egy beküldés, mint hogy dupla XP legyen;
 *  - legfeljebb EGY újrapróba; 4xx-re (kivéve 429) nincs;
 *  - 429-nél a szerver Retry-After értékéig várunk (+ kis véletlen ráhagyás); ha az 30 mp-nél több, nincs vak újrapróba;
 *  - hálózati hibára / 5xx-re 3 mp múlva egy újrapróba;
 *  - a függő várakozás megszakítható (oldal elhagyása), ilyenkor az eredeti hiba kerül a hívóhoz.
 */
export const MAX_RETRY_WAIT_MS = 30_000;
export const SERVER_ERROR_RETRY_MS = 3_000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidRunId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4.test(value);
}

type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
};

/** Szabályos UUID v4: `crypto.randomUUID`, tartalékként `crypto.getRandomValues`; kriptográfiai véletlen nélkül `undefined`. */
export function newScoreRunId(cryptoImpl: CryptoLike | undefined = (globalThis as { crypto?: CryptoLike }).crypto): string | undefined {
  try {
    if (cryptoImpl && typeof cryptoImpl.randomUUID === "function") {
      const id = cryptoImpl.randomUUID();
      if (isValidRunId(id)) return id;
    }
    if (cryptoImpl && typeof cryptoImpl.getRandomValues === "function") {
      const bytes = cryptoImpl.getRandomValues(new Uint8Array(16));
      if (!bytes || bytes.length !== 16) return undefined;
      bytes[6] = (bytes[6]! & 0x0f) | 0x40;
      bytes[8] = (bytes[8]! & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      return isValidRunId(id) ? id : undefined;
    }
  } catch {
    // nincs használható véletlenforrás → runId nélkül megy (és akkor nincs automatikus újraküldés)
  }
  return undefined;
}

export type ScoreSendError = { status?: number; retryAfterSec?: number };

/** Mennyit várjunk az újrapróbáig (ms); `null` = nincs újrapróba. */
export function retryDelayMs(error: unknown, jitterMs: number): number | null {
  const e = (error ?? {}) as ScoreSendError;
  if (e.status === undefined || e.status >= 500) return SERVER_ERROR_RETRY_MS;
  if (e.status !== 429) return null;
  const sec = e.retryAfterSec;
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec <= 0) return null;
  const wait = sec * 1000;
  return wait <= MAX_RETRY_WAIT_MS ? wait + Math.max(0, Math.min(1000, jitterMs)) : null;
}

export interface ScoreRetryDeps {
  /** Vár `ms`-t; `false`, ha közben megszakították. */
  wait: (ms: number, signal: AbortSignal) => Promise<boolean>;
  jitterMs: () => number;
  signal: AbortSignal;
}

export async function sendScoreWithRetry<T>(
  send: (payload: Record<string, unknown>) => Promise<T>,
  payload: Record<string, unknown>,
  deps: ScoreRetryDeps,
): Promise<T> {
  try {
    return await send(payload);
  } catch (error) {
    if (!isValidRunId(payload.runId)) throw error; // runId nélkül nincs automatikus újraküldés
    const delay = retryDelayMs(error, deps.jitterMs());
    if (delay === null || deps.signal.aborted) throw error;
    const completed = await deps.wait(delay, deps.signal);
    if (!completed || deps.signal.aborted) throw error;
    return send(payload);
  }
}
