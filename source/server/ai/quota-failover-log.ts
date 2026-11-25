/**
 * Kvóta-átállás költségnaplója (tulajdonosi döntés 2026-11-23, kanban #10; terv: docs/specs/2026-11-23-kvota-atallas-koltsegnaplo.md).
 * Kimerült OpenAI-keretnél a Studio OpenRouterre vált — ez marad, de MINDEN tartalékra terelt hívás rögzül:
 *   1. egysoros, strukturált napló (`[AI][quota-failover] {json}`),
 *   2. folyamaton belüli telemetria-számlálók (`quotaFailoverCounters()`),
 *   3. a meglévő munkafolyamat-tokenkönyvelés (`workflowQuotaFailover`): a futás nézete + az aktuális látogatás `failover` mezője.
 * Kulcs, URL vagy hibaüzenet-szöveg nem kerül bele (a hibából csak az osztály neve).
 */
import { logger } from "../lib/logger";
import { workflowQuotaFailover } from "../workflows/engine";
import type { QuotaFailoverRecord } from "../../shared/lesson-workflow";

export type QuotaFailoverEvent = QuotaFailoverRecord & {
  /** Mindig igaz: a hívás átállásként, a tartalék szolgáltatóhoz rendelve könyvelődik. */
  failover: true;
};

export type QuotaFailoverCounters = { switches: number; fallbackCalls: number; failedFallbackCalls: number; tokensIn: number; tokensOut: number };

const emptyCounters = (): QuotaFailoverCounters => ({ switches: 0, fallbackCalls: 0, failedFallbackCalls: 0, tokensIn: 0, tokensOut: 0 });
let counters = emptyCounters();
let sinkForTest: ((event: QuotaFailoverEvent, line: string) => void) | undefined;

/** A folyamat indulása óta rögzített átállások összesítője (telemetria-számláló). */
export function quotaFailoverCounters(): QuotaFailoverCounters { return { ...counters }; }
export function resetQuotaFailoverCountersForTest() { counters = emptyCounters(); }
/** Teszthez: a naplósor és az esemény elkapása (a `logger` helyett). */
export function setQuotaFailoverSinkForTest(sink: ((event: QuotaFailoverEvent, line: string) => void) | undefined) { sinkForTest = sink; }

type UsageLike = {
  promptTokens?: number; completionTokens?: number; cachedTokens?: number;
  prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number }; input_tokens_details?: { cached_tokens?: number };
};
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Tokenek egy válaszból: `AIResponse.usage` vagy az OpenAI SDK chat / Responses alakja. Ismeretlen alaknál üres. */
export function usageTokens(result: unknown): Pick<QuotaFailoverRecord, "tokensIn" | "tokensOut" | "cachedTokens"> {
  const usage = result && typeof result === "object" ? (result as { usage?: unknown }).usage : undefined;
  if (!usage || typeof usage !== "object") return {};
  const u = usage as UsageLike;
  const tokensIn = num(u.promptTokens) ?? num(u.prompt_tokens) ?? num(u.input_tokens);
  const tokensOut = num(u.completionTokens) ?? num(u.completion_tokens) ?? num(u.output_tokens);
  const cachedTokens = num(u.cachedTokens) ?? num(u.prompt_tokens_details?.cached_tokens) ?? num(u.input_tokens_details?.cached_tokens);
  return { ...(tokensIn !== undefined ? { tokensIn } : {}), ...(tokensOut !== undefined ? { tokensOut } : {}), ...(cachedTokens !== undefined ? { cachedTokens } : {}) };
}

export type QuotaFailoverInput = {
  fromModel: string; toModel: string; trigger: QuotaFailoverRecord["trigger"]; path: QuotaFailoverRecord["path"];
  now?: number; result?: unknown; error?: unknown;
};

/** Egy tartalékra terelt hívás rögzítése. Soha nem dob: a könyvelés hibája nem töri el a modellhívást. */
export async function recordQuotaFailover(input: QuotaFailoverInput): Promise<QuotaFailoverEvent> {
  const ok = input.error === undefined;
  const event: QuotaFailoverEvent = {
    at: new Date(input.now ?? Date.now()).toISOString(),
    from: { provider: "openai", model: input.fromModel },
    to: { provider: "openrouter", model: input.toModel },
    reason: "quota", trigger: input.trigger, path: input.path, failover: true, ok,
    ...(ok ? usageTokens(input.result) : { error: input.error instanceof Error ? input.error.constructor.name : typeof input.error }),
  };
  counters.fallbackCalls++;
  if (input.trigger === "quota-error") counters.switches++;
  if (!ok) counters.failedFallbackCalls++;
  counters.tokensIn += event.tokensIn ?? 0;
  counters.tokensOut += event.tokensOut ?? 0;
  const line = `[AI][quota-failover] ${JSON.stringify(event)}`;
  if (sinkForTest) sinkForTest(event, line); else logger.warn(line);
  try {
    const { failover: _flag, ...record } = event;
    await workflowQuotaFailover(record);
  } catch (error) {
    logger.warn(`[AI][quota-failover] a futás könyvelése nem sikerült: ${error instanceof Error ? error.constructor.name : typeof error}`);
  }
  return event;
}
