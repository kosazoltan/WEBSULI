import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { crossFamilyFallback, effortFor, resolveLegacyModel } from "../ai/models";
import { studioModelReady } from "../ai/studio-provider";
import { logger } from "../lib/logger";
import { WorkflowConflict, workflowCheckpoint, workflowSavedCheckpoint, savedWorkflowResult, type WorkflowRecord, workflowSkillPrompt, workflowValidationFailure } from "../workflows/engine";
import { LESSON_METHOD_VERSION } from "../../shared/lesson-experience";
import { decideWebResearchGatherResult, HTML_START, webResearchGatherParts, WEB_SEARCH_TOOL, WEB_FETCH_TOOL, type WebResearchChatRequest, type WebResearchEvent, type WebSource } from "./web-research-agent";
import { fetchedTeachingSources, type TeachingReviewEvidence, type FetchedTeachingSource, type TeachingReview } from "./web-teaching-review";
import { type ExperienceCheckpoint } from "./experience-builder";
import { gatherWebSourcesGpt, gptGatherCheckpointInput, gptGatherRequest } from "./web-gather-gpt";
import { withSupportSkill } from "./support-skills";
import { cachedSystem } from "../ai/prompt-cache";

export class WebResearchFailure extends Error {}
export type ResearchArtifact = { html: string; sources: WebSource[]; reviewEvidence?: TeachingReviewEvidence };
export type ResearchObserver = {
  signal?: AbortSignal;
  onEvent: (event: WebResearchEvent) => void;
  onCandidate?: (content: string, diagnostic: { stopReason?: string | null; inputTokens?: number; outputTokens?: number; elapsedMs?: number; problems?: string; teachingReview?: TeachingReview }) => Promise<void>;
  /** Spec 2026-09-25: packets already built by an earlier execution of the same run (no model call on resume). */
  bankCheckpoint?: ExperienceCheckpoint;
  onBankCheckpoint?: (checkpoint: ExperienceCheckpoint) => Promise<void>;
  /** Spec 2026-09-25 (webes Studio-átadás): the creator, and the one-step run a resumed job keeps following. */
  userId?: string;
  studioRunId?: string;
  onStudioRun?: (runId: string) => Promise<void>;
  /** Spec 2026-10-06-s7: the web job (and its `webStudio` workflow) id — also the manufacture's progress record id. */
  jobId?: string;
};
const MAX_TOKENS = 64_000;
const MAX_CONTINUATIONS = 5;
const IDLE_TIMEOUT_MS = 120_000;
const PHASE_TIMEOUT_MS = 20 * 60_000;
export const webResearchTurnKey = (input: WebResearchChatRequest, repairAttempts = 0, continuations = 0) => ({ input, method: LESSON_METHOD_VERSION, contract: "web-knowledge-2", repairAttempts, continuations });
type ResearchTurn = { final: Anthropic.Message; content: string; sources: WebSource[] };
export function hasSavedResearchTurn(record: WorkflowRecord, input: WebResearchChatRequest): boolean {
  // Review #222: a sikeres tartalék-gyűjtés (GPT-forrás checkpoint) is folytatható alap.
  const fallback = crossFamilyFallback(resolveLegacyModel("webResearch"));
  const gpt = fallback ? savedWorkflowResult<FetchedTeachingSource[]>(record, "web-gather-gpt", gptGatherCheckpointInput(input, fallback)) : undefined;
  if (Array.isArray(gpt) && gpt.length) return true;
  const turn = savedWorkflowResult<ResearchTurn>(record, "web-provider-turn", webResearchTurnKey(input));
  return !!turn && typeof turn.content === "string" && Array.isArray(turn.sources) && Array.isArray(turn.final?.content)
    && ["end_turn", "pause_turn"].includes(turn.final.stop_reason ?? "");
}

/**
 * Spec 2026-09-25 (webes Studio-átadás): search + fetch only — shared by the standalone HTML path and the
 * Studio hand-off. Own abort controller and timers (20 min phase, 120 s idle); maps failures to WebResearchFailure.
 */
/**
 * Spec 2026-10-15-tartalek-b4-webgyujtes (C1, tulajdonosi döntés): a Claude-gyűjtés bármely hibájánál (szolgáltatói, kimeneti,
 * nincs letöltött forrás) — külső megszakítás kivételével — egyszer a GPT-6.1 Sol tartalék gyűjt (webes keresés + védett
 * szerveroldali letöltés). Ha az is bukik, mindkét ok látszik.
 */
export async function gatherWebSources(input: WebResearchChatRequest, observer: Pick<ResearchObserver, "signal" | "onEvent" | "onCandidate">): Promise<{ downloaded: FetchedTeachingSource[]; topicSeed: string }> {
  const primary = resolveLegacyModel("webResearch");
  const fallback = crossFamilyFallback(primary);
  // Review #222: folytatáskor a már mentett tartalék-forrás nyer — új (fizetős) Claude-keresés előtt.
  const savedGpt = fallback ? workflowSavedCheckpoint<FetchedTeachingSource[]>("web-gather-gpt", gptGatherCheckpointInput(input, fallback)) : undefined;
  if (savedGpt?.length) return { downloaded: savedGpt, topicSeed: gptGatherRequest(input).topicSeed };
  try {
    return await gatherWebSourcesClaude(input, observer);
  } catch (error) {
    // Review #222: elveszett workflow-lease (WorkflowConflict) nem modellhiba — nincs fizetős tartalékhívás.
    if (error instanceof WorkflowConflict) throw error;
    if (observer.signal?.aborted || !fallback || !studioModelReady(fallback)) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn(`[WEB-RESEARCH] A forrásgyűjtés (${primary}) hibázott — ${reason.slice(0, 200)} → tartalék: ${fallback}`);
    observer.onEvent({ type: "status", message: `A forrásgyűjtés elsődleges modellje hibázott — tartalék: ${fallback}…` });
    try {
      const downloaded = await gatherWebSourcesGpt(input, { model: fallback, signal: observer.signal, onEvent: observer.onEvent });
      return { downloaded, topicSeed: gptGatherRequest(input).topicSeed };
    } catch (fallbackError) {
      if (fallbackError instanceof WorkflowConflict) throw fallbackError;
      if (observer.signal?.aborted) throw error;
      throw new WebResearchFailure(`${reason} Tartalék (${fallback}): ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
    }
  }
}

async function gatherWebSourcesClaude(input: WebResearchChatRequest, { signal, onEvent, onCandidate }: Pick<ResearchObserver, "signal" | "onEvent" | "onCandidate">): Promise<{ downloaded: FetchedTeachingSource[]; topicSeed: string }> {
  const key = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!key?.trim()) throw new WebResearchFailure("Az Anthropic API kulcs nincs beállítva.");
  const controller = new AbortController();
  let timedOut = false;
  let idleTimer: NodeJS.Timeout | undefined;
  const timeout = () => { timedOut = true; controller.abort(); };
  let hardTimer = setTimeout(timeout, PHASE_TIMEOUT_MS);
  const touch = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = setTimeout(timeout, IDLE_TIMEOUT_MS); };
  const restartPhaseTimer = () => {
    clearTimeout(hardTimer);
    hardTimer = setTimeout(timeout, PHASE_TIMEOUT_MS);
    touch();
  };
  const stopIdle = () => { if (idleTimer) { clearTimeout(idleTimer); idleTimer = undefined; } };
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
    let stopReason: string | null = null;
    let continuations = 0;
    let repairAttempts = 0;
    let fewSourcesRetried = false;
    const startedAt = Date.now();

    const gatherParts = webResearchGatherParts(input.classroom, input.title, topicSeed);
    restartPhaseTimer();
    for (;;) {
      let providerCalled = false;
      const turn = await workflowCheckpoint("web-provider-turn", webResearchTurnKey(input, repairAttempts, continuations), async (): Promise<ResearchTurn> => {
      providerCalled = true;
      const stream = anthropic.messages.stream(
        {
          model: resolveLegacyModel("webResearch"),
          output_config: { effort: effortFor("webResearch") },
          max_tokens: MAX_TOKENS,
          // Spec 2026-10-03-gpt61-sol-kv-cache: statikus rész (skill + feladat + workflow-skill) töréspontos blokkban, a kérés
          // (évfolyam, cím, mag) utána; a kérés-szintű töréspont a pause_turn-folytatásokban a letöltött oldalakat is cache-eli.
          system: cachedSystem(withSupportSkill("web-research", gatherParts.fixed) + workflowSkillPrompt("web-research"), gatherParts.request),
          tools: [WEB_SEARCH_TOOL, WEB_FETCH_TOOL],
          messages,
          cache_control: { type: "ephemeral" },
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
              if (r.type === "web_search_result" && r.url && !sources.some(s => s.url === r.url)) {
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
            onEvent({ type: "content_replace", content: "A források letöltése után a tananyag a jegyzékből készül…" });
            onEvent({ type: "status", message: "Forrásgyűjtés: a HTML nem a kész tananyag." });
            continue;
          }
          onEvent({ type: "content_delta", content: text });
        }
      }

        const final = await stream.finalMessage();
        return { final, content: fullContent, sources: [...sources] };
      });
      const final = turn.final;
      fullContent = turn.content;
      sources.splice(0, sources.length, ...turn.sources);
      for (const source of fetchedTeachingSources(final.content)) fetched.set(source.url, source);
      stopReason = final.stop_reason;
      await onCandidate?.(fullContent, { stopReason, inputTokens: providerCalled ? final.usage.input_tokens : undefined, outputTokens: providerCalled ? final.usage.output_tokens : undefined, elapsedMs: Date.now() - startedAt });
      logger.info("[WEB-RESEARCH] gather-turn", { stopReason, continuations, repairAttempts, elapsedMs: Date.now() - startedAt,
        outputTokens: final.usage.output_tokens, inputTokens: final.usage.input_tokens, chars: fullContent.length, sourceCount: sources.length, fetched: fetched.size });
      if (stopReason === "pause_turn" && continuations < MAX_CONTINUATIONS) {
        continuations += 1;
        messages.push({ role: "assistant", content: final.content });
        logger.info(`[WEB-RESEARCH] pause_turn → folytatás #${continuations}`);
        continue;
      }
      const gather = decideWebResearchGatherResult({ stopReason, fullContent, repairAttempts, fetchedCount: fetched.size, fewSourcesRetried });
      if (gather.type === "retry") {
        if (fetched.size >= 1) fewSourcesRetried = true;
        await workflowValidationFailure(gather.reason);
        await onCandidate?.(fullContent, { problems: gather.reason });
        repairAttempts += 1;
        messages.push({ role: "assistant", content: [...final.content.filter(block => block.type !== "text"), { type: "text", text: fullContent }] });
        messages.push({ role: "user", content: gather.instruction });
        logger.info("[WEB-RESEARCH] gather-retry", { repairAttempts, reason: gather.reason });
        onEvent({ type: "status", message: `Források letöltése (${repairAttempts}/2)…` });
        onEvent({ type: "content_replace", content: "A tananyagírás előtt a források teljes szövegének letöltése folyamatban van…" });
        fullContent = "";
        htmlStarted = false;
        restartPhaseTimer();
        continue;
      }
      if (gather.type === "error") throw new WebResearchFailure(gather.message);
      break;
    }

    stopIdle();
    const downloaded = [...fetched.values()];
    if (!downloaded.length) throw new WebResearchFailure("Nincs letöltött forrásszöveg. A web_fetch eszközzel olvasd el a forrásokat, majd készíts teljes tananyagot.");
    return { downloaded, topicSeed };
  } catch (error) {
    if (error instanceof WebResearchFailure || error instanceof WorkflowConflict) throw error;
    logger.error("[WEB-RESEARCH] gather failure", { name: error instanceof Error ? error.name : "unknown", message: error instanceof Error ? error.message.slice(0, 400) : String(error), timedOut });
    throw new WebResearchFailure(timedOut ? "Időtúllépés: a keresés nem fejeződött be az időkeretben."
      : controller.signal.aborted ? "A kérés megszakadt." : "AI hiba történt a webes keresés közben.");
  } finally {
    clearTimeout(hardTimer);
    if (idleTimer) clearTimeout(idleTimer);
    signal?.removeEventListener("abort", abort);
  }
}
