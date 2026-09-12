import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { effortFor, resolveLegacyModel } from "../ai/models";
import { logger } from "../lib/logger";
import { verifyLessonMethodHtml } from "../improve/verify-lesson-method";
import { workflowSkillPrompt, workflowValidationFailure } from "../workflows/engine";
import { decideWebResearchResult, HTML_START, webResearchSystemPrompt, WEB_SEARCH_TOOL, WEB_FETCH_TOOL, type WebResearchChatRequest, type WebResearchEvent, type WebSource } from "./web-research-agent";
import { fetchedTeachingSources, reviewWebTeaching, type FetchedTeachingSource, type TeachingReview } from "./web-teaching-review";

export class WebResearchFailure extends Error {}
export type ResearchArtifact = { html: string; sources: WebSource[] };
export type ResearchObserver = {
  signal?: AbortSignal;
  onEvent: (event: WebResearchEvent) => void;
  onCandidate?: (content: string, diagnostic: { stopReason?: string | null; inputTokens?: number; outputTokens?: number; elapsedMs?: number; problems?: string; teachingReview?: TeachingReview }) => Promise<void>;
};
const MAX_TOKENS = 64_000;
const MAX_CONTINUATIONS = 5;
const IDLE_TIMEOUT_MS = 120_000;
/** Runs independently of HTTP; only the legacy stream supplies a client abort signal. */
export async function generateWebResearchLesson(input: WebResearchChatRequest, { signal, onEvent, onCandidate }: ResearchObserver): Promise<ResearchArtifact> {
  const key = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!key?.trim()) throw new WebResearchFailure("Az Anthropic API kulcs nincs beállítva.");
  const controller = new AbortController();
  let timedOut = false;
  let idleTimer: NodeJS.Timeout | undefined;
  const timeout = () => { timedOut = true; controller.abort(); };
  const hardTimer = setTimeout(timeout, 20 * 60_000);
  const touch = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = setTimeout(timeout, IDLE_TIMEOUT_MS); };
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const anthropic = new Anthropic({
      apiKey: key,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    });

    const messages: MessageParam[] = (input.conversationHistory ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    messages.push({ role: "user", content: input.message });
    const firstUser = messages.find((m) => m.role === "user" && typeof m.content === "string");
    const topicSeed = typeof firstUser?.content === "string" ? firstUser.content.slice(0, 200) : input.message.slice(0, 200);

    let fullContent = "";
    let htmlStarted = false;
    const sources: WebSource[] = [];
    const fetched = new Map<string, FetchedTeachingSource>();
    const seenUrls = new Set<string>();
    let stopReason: string | null = null;
    let continuations = 0;
    let repairAttempts = 0;
    const startedAt = Date.now();

    touch();
    for (;;) {
      const stream = anthropic.messages.stream(
        {
          model: resolveLegacyModel("webResearch"),
          output_config: { effort: effortFor("webResearch") },
          max_tokens: MAX_TOKENS,
          // A system blokk stabil (spec + téma) → prompt-cache; a téma seedje az első
          // felhasználói üzenet, így egy beszélgetésen belül nem változik.
          system: [
            {
              type: "text",
              text: webResearchSystemPrompt(input.classroom, input.title, topicSeed) + workflowSkillPrompt(),
              cache_control: { type: "ephemeral" },
            },
          ],
          tools: [WEB_SEARCH_TOOL, WEB_FETCH_TOOL],
          messages,
        },
        { signal: controller.signal },
      );

      for await (const event of stream) {
        touch();
        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "server_tool_use") {
            onEvent({ type: "status", message: "Keresés az interneten…" });
          } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
            for (const r of block.content) {
              if (r.type === "web_search_result" && r.url && !seenUrls.has(r.url)) {
                seenUrls.add(r.url);
                sources.push({ url: r.url, title: r.title || r.url });
              }
            }
            onEvent({ type: "sources", sources });
            onEvent({ type: "status", message: `Források feldolgozása (${sources.length})…` });
          }
          continue;
        }
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          const text = event.delta.text;
          if (!text) continue;
          fullContent += text;
          if (htmlStarted) continue;
          const markerAt = fullContent.indexOf(HTML_START) >= 0 ? fullContent.indexOf(HTML_START) : fullContent.search(/<!doctype\s+html\b|<html\b/i);
          if (markerAt >= 0) {
            htmlStarted = true;
            // A marker egy része már kimehetett a chatbe — a buborékot a marker előtti
            // szövegre cseréljük, a HTML az előnézetbe megy, nem a beszélgetésbe.
            onEvent({ type: "content_replace", content: fullContent.slice(0, markerAt).trimEnd() });
            onEvent({ type: "status", message: "A HTML tananyag készül…" });
            continue;
          }
          onEvent({ type: "content_delta", content: text });
        }
      }

      const final = await stream.finalMessage();
      for (const source of fetchedTeachingSources(final.content)) fetched.set(source.url, source);
      stopReason = final.stop_reason;
      await onCandidate?.(fullContent, { stopReason, inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens, elapsedMs: Date.now() - startedAt });
      logger.info("[WEB-RESEARCH] turn", { stopReason, continuations, repairAttempts, elapsedMs: Date.now() - startedAt,
        outputTokens: final.usage.output_tokens, inputTokens: final.usage.input_tokens, chars: fullContent.length, sourceCount: sources.length });
      if (stopReason === "pause_turn" && continuations < MAX_CONTINUATIONS) {
        continuations += 1;
        messages.push({ role: "assistant", content: final.content });
        logger.info(`[WEB-RESEARCH] pause_turn → folytatás #${continuations}`);
        continue;
      }
      // max_tokens/refusal/pause_turn exhaustion and htmlLooksComplete are checked
      // before the same strict HTML/bank gate. An end_turn without HTML is NOT success.
      let result = decideWebResearchResult({ stopReason, fullContent, repairAttempts, sources }, html => verifyLessonMethodHtml(html));
      if (result.type === "ready") {
        const downloaded = [...fetched.values()];
        let problems: string[];
        if (!downloaded.length) problems = ["Nincs letöltött forrásszöveg. A web_fetch eszközzel olvasd el a forrásokat, majd készíts teljes tananyagot."];
        else {
          onEvent({ type: "status", message: "A teljes tananyag összevetése a letöltött forrásokkal…" });
          // Review has its own bounded provider timeout; streaming idle time is irrelevant here.
          if (idleTimer) clearTimeout(idleTimer);
          const review = await reviewWebTeaching(result.html, downloaded);
          if (controller.signal.aborted) throw new WebResearchFailure("A tartalmi ellenőrzés ideje alatt a készítés megszakadt.");
          await onCandidate?.(result.html, { teachingReview: review });
          touch();
          problems = review.checks.filter(c => !c.passed).map(c => `Tanítási minőség (${c.criterion}): ${c.evidence}`);
        }
        if (problems.length) result = decideWebResearchResult({ stopReason, fullContent, repairAttempts, sources }, () => ({ ok: false, problems }));
      }
      if (result.type === "retry") {
        await workflowValidationFailure(result.reason);
        await onCandidate?.(fullContent, { problems: result.reason });
        repairAttempts += 1;
        messages.push({ role: "assistant", content: final.content });
        messages.push({ role: "user", content: result.instruction });
        logger.info("[WEB-RESEARCH] artifact-retry", { repairAttempts, reason: result.reason });
        onEvent({ type: "status", message: `A teljes tananyag elkészítése és ellenőrzése (${repairAttempts}/2)…` });
        onEvent({ type: "content_replace", content: "A forráskeresés után a teljes tananyag készítése és ellenőrzése folyamatban van…" });
        fullContent = "";
        htmlStarted = false;
        continue;
      }
      if (result.type === "error") throw new WebResearchFailure(result.message);
      if (sources.length === 0) throw new WebResearchFailure("Nem érkezett ellenőrizhető internetes forráshivatkozás. A tananyag nem menthető.");
      return { html: result.html, sources: [...fetched.values()].map(({ url, title }) => ({ url, title })) };
    }
  } catch (error) {
    if (error instanceof WebResearchFailure) throw error;
    logger.error("[WEB-RESEARCH] provider failure", { name: error instanceof Error ? error.name : "unknown", timedOut });
    throw new WebResearchFailure(timedOut ? "Időtúllépés: a keresés vagy a tananyagkészítés nem fejeződött be az időkeretben."
      : controller.signal.aborted ? "A kérés megszakadt." : "AI hiba történt a webes keresés közben.");
  } finally {
    clearTimeout(hardTimer);
    if (idleTimer) clearTimeout(idleTimer);
    signal?.removeEventListener("abort", abort);
  }
}
