import type { AIMessage } from "./AIProvider";
import { crossFamilyFallback, providerForModel } from "./models";
import { createStudioProvider, crossFamilyFallbackOptions, STREAM_IDLE_MS, studioModelReady } from "./studio-provider";
import { logger } from "../lib/logger";

/**
 * Spec 2026-10-14-tartalek-b-szelet (B3b, tulajdonosi döntés): az adminisztrációs (legacy) útvonalak ellentétes családú
 * tartaléka — Claude → GPT-6.1 Sol, GPT → Opus 5.5, medium efforttal. A tartalék a teljes választ egyben kéri (tétlenségi őrös
 * streammel), így a hívó a lezárás okát is látja (a HTML-teljesség ellenőrzése a tartalékon is megmarad). Streamelt útvonalon
 * a hívó CSAK az első kiküldött darab előtt válthat (félkész válasz nem cserélhető).
 */
export function legacyFallbackFor(primary: string): string | undefined {
  const fallback = crossFamilyFallback(primary);
  return fallback && studioModelReady(fallback) ? fallback : undefined;
}

/** A lezárás oka teljes választ jelent-e (OpenAI: `stop`, Anthropic: `end_turn`). */
export function isCompleteFinish(reason: string | undefined): boolean {
  return reason === "stop" || reason === "end_turn";
}

export async function crossFamilyComplete(
  primary: string,
  cause: unknown,
  opts: {
    system: string;
    messages: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
    maxTokens: number;
    timeoutMs: number;
    json?: boolean;
    signal?: AbortSignal;
    label: string;
  },
): Promise<{ text: string; finishReason?: string; model: string }> {
  const fallback = legacyFallbackFor(primary);
  if (!fallback || opts.signal?.aborted) throw cause;
  logger.warn(`[${opts.label}] ${primary} hibázott — ${(cause instanceof Error ? cause.message : String(cause)).slice(0, 200)} → tartalék: ${fallback}`);
  const provider = createStudioProvider(fallback, opts.timeoutMs, opts.maxTokens, {
    ...crossFamilyFallbackOptions(fallback, true),
    ...(opts.json && providerForModel(fallback) !== "anthropic" ? { jsonMode: true } : {}),
  });
  const messages: AIMessage[] = [{ role: "system", content: opts.system }, ...opts.messages];
  const response = await provider.chat(messages, opts.signal, provider.supportsStreamingChat ? { stream: { idleMs: STREAM_IDLE_MS } } : undefined);
  return { text: response.content ?? "", finishReason: response.finishReason, model: fallback };
}

/** Review #220: a fájlelemzés teljes sémája (a kliens `topics.length`-et és a többi mezőt is használja). */
export type FileAnalysis = { extractedText: string; suggestedTitle: string; suggestedDescription: string; suggestedClassroom: number; topics: string[] };
export function parseFileAnalysis(text: string): FileAnalysis {
  const cleaned = text.trim().replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(cleaned || "{}"); } catch (error) { throw new Error("A fájlelemzés válasza nem érvényes JSON.", { cause: error }); }
  const ok = typeof parsed.extractedText === "string" && typeof parsed.suggestedTitle === "string" && typeof parsed.suggestedDescription === "string"
    && typeof parsed.suggestedClassroom === "number" && Number.isFinite(parsed.suggestedClassroom)
    && Array.isArray(parsed.topics) && parsed.topics.every((topic) => typeof topic === "string");
  if (!ok) throw new Error("A fájlelemzés válaszából hiányzik vagy hibás egy kötelező mező (extractedText, suggestedTitle, suggestedDescription, suggestedClassroom, topics).");
  return parsed as FileAnalysis;
}

/**
 * Review #220: az EnhancedMaterialCreator a fájlelemzést 180 s-nál megszakítja — a tartalék csak a maradék keretből futhat
 * (legalább 30 s kell), és a kliens lezárásakor megszakad (kézbesíthetetlen, fizetős hívás ne fusson végig).
 */
export const ANALYZE_CLIENT_BUDGET_MS = 170_000;
export const ANALYZE_MIN_FALLBACK_MS = 30_000;
export function analyzeFallbackBudget(startedAt: number, now = Date.now()): number | undefined {
  const remaining = ANALYZE_CLIENT_BUDGET_MS - (now - startedAt);
  return remaining >= ANALYZE_MIN_FALLBACK_MS ? remaining : undefined;
}
export function abortOnClientClose(res: { on(event: "close", listener: () => void): unknown; writableEnded: boolean }): AbortSignal {
  const controller = new AbortController();
  res.on("close", () => { if (!res.writableEnded) controller.abort(); });
  return controller.signal;
}
