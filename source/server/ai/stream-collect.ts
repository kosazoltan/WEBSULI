import { AIProviderError, AIProviderIdleTimeoutError, type AIResponse } from "./AIProvider";

/**
 * Spec 2026-10-05-s10-adatvesztes-mentesseg: egy streamelt modellválasz összegyűjtése TÉTLENSÉGI őrrel.
 *
 * Mért ok: a gyártás teljes-válasz határidővel, streamelés nélkül hívott (`run-step.ts`), és egy lassan generáló lektornál
 * („[xAI] Request timed out.”) a már legenerált, kifizetett szöveg is elveszett. Az SDK `timeout` csak a fejlécig véd
 * (openai `client.js:357-377`), ezért az őr itt van. Review #190:
 *  - az őrt CSAK valódi haladás (szöveg- vagy gondolkodás-delta) indítja újra — metaadat, üres vagy keep-alive esemény nem;
 *  - befejezési jelzés (finishReason) nélkül záruló stream csonka válasz → hiba a részleges szöveggel (nem siker);
 *  - a stream MEGNYITÁSA (fejlécig) is az őr alatt áll (`withIdleStart`).
 */
export type StreamEvent = {
  /** Kimeneti szöveg-darab (haladás). */
  text?: string;
  /** Gondolkodás-delta (haladás) — az őrt újraindítja, szöveget nem ad. */
  activity?: boolean;
  finishReason?: string;
  usage?: AIResponse["usage"];
};

export async function collectStream(events: AsyncIterable<StreamEvent>, opts: { idleMs: number; abort: () => void; provider: string }): Promise<AIResponse> {
  const iterator = events[Symbol.asyncIterator]();
  let content = "";
  let finishReason: string | undefined;
  let usage: AIResponse["usage"];
  let deadline = Date.now() + opts.idleMs;
  for (;;) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const idle = new Promise<"idle">((resolve) => { timer = setTimeout(() => resolve("idle"), Math.max(0, deadline - Date.now())); });
    let step: IteratorResult<StreamEvent> | "idle";
    try {
      step = await Promise.race([iterator.next(), idle]);
    } catch (error) {
      if (error && typeof error === "object") (error as { partialContent?: string }).partialContent = content;
      throw error;
    } finally {
      clearTimeout(timer);
    }
    if (step === "idle") {
      opts.abort();
      void iterator.return?.().catch(() => undefined);
      throw new AIProviderIdleTimeoutError(opts.provider, opts.idleMs, content);
    }
    if (step.done) break;
    const ev = step.value;
    if (ev.text || ev.activity) deadline = Date.now() + opts.idleMs;
    if (ev.text) content += ev.text;
    if (ev.finishReason) finishReason = ev.finishReason;
    if (ev.usage) usage = ev.usage;
  }
  if (!finishReason) {
    const error = new AIProviderError(opts.provider, "A stream befejezési jelzés nélkül zárult — csonka válasz.", true);
    error.partialContent = content;
    throw error;
  }
  return { content, finishReason, ...(usage ? { usage } : {}) };
}

/** A hívó jele és a tétlenségi megszakítás együtt (bármelyik megszakítja a kérést). */
export function idleAbortSignal(outer?: AbortSignal): { signal: AbortSignal; abort: () => void } {
  const controller = new AbortController();
  return { signal: outer ? AbortSignal.any([outer, controller.signal]) : controller.signal, abort: () => controller.abort() };
}

/** Review #190 (P2): a stream megnyitása (a válaszfejlécig) is a tétlenségi őr alatt áll — a néma szolgáltató nem blokkol percekig. */
export async function withIdleStart<T>(opening: Promise<T>, idleMs: number, abort: () => void, provider: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const idle = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { abort(); reject(new AIProviderIdleTimeoutError(provider, idleMs, "")); }, idleMs);
  });
  try {
    return await Promise.race([opening, idle]);
  } finally {
    clearTimeout(timer);
  }
}
