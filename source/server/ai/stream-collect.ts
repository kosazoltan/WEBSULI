import { AIProviderIdleTimeoutError, type AIResponse } from "./AIProvider";

/**
 * Spec 2026-10-05-s10-adatvesztes-mentesseg: egy streamelt modellválasz összegyűjtése TÉTLENSÉGI őrrel.
 *
 * Mért ok: a gyártás teljes-válasz határidővel, streamelés nélkül hívott (`run-step.ts`), és egy lassan generáló lektornál
 * („[xAI] Request timed out.”) a már legenerált, kifizetett szöveg is elveszett. Az SDK `timeout` csak a fejlécig véd
 * (openai `client.js:357-377`), ezért az őr itt van: minden valódi darab (szöveg VAGY gondolkodás-delta) újraindítja; ha
 * `idleMs` ideig nem jön semmi, `abort()` és `AIProviderIdleTimeoutError` a részleges szöveggel. Más hibánál a hiba
 * `partialContent`-et kap, hogy a hívó naplózhassa.
 */
export type StreamEvent = {
  /** Kimeneti szöveg-darab. */
  text?: string;
  /** Csak aktivitás (pl. gondolkodás-delta) — az őrt újraindítja, szöveget nem ad. */
  activity?: boolean;
  finishReason?: string;
  usage?: AIResponse["usage"];
};

export async function collectStream(events: AsyncIterable<StreamEvent>, opts: { idleMs: number; abort: () => void; provider: string }): Promise<AIResponse> {
  const iterator = events[Symbol.asyncIterator]();
  let content = "";
  let finishReason: string | undefined;
  let usage: AIResponse["usage"];
  for (;;) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const idle = new Promise<"idle">((resolve) => { timer = setTimeout(() => resolve("idle"), opts.idleMs); });
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
    if (ev.text) content += ev.text;
    if (ev.finishReason) finishReason = ev.finishReason;
    if (ev.usage) usage = ev.usage;
  }
  return { content, ...(finishReason ? { finishReason } : {}), ...(usage ? { usage } : {}) };
}

/** A hívó jele és a tétlenségi megszakítás együtt (bármelyik megszakítja a kérést). */
export function idleAbortSignal(outer?: AbortSignal): { signal: AbortSignal; abort: () => void } {
  const controller = new AbortController();
  return { signal: outer ? AbortSignal.any([outer, controller.signal]) : controller.signal, abort: () => controller.abort() };
}
