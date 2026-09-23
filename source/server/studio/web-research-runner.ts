import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { effortFor, resolveLegacyModel, resolveStudioModel, resolveWebResearchAuthorModel } from "../ai/models";
import { createStudioProvider, studioModelReady } from "../ai/studio-provider";
import { logger } from "../lib/logger";
import { verifyLessonMethodHtml } from "../improve/verify-lesson-method";
import { verifyTeachingVisuals } from "../improve/verify-html-teaching";
import { workflowCheckpoint, savedWorkflowResult, type WorkflowRecord, workflowSkillPrompt, workflowValidationFailure, workflowUsage } from "../workflows/engine";
import { LESSON_METHOD_VERSION } from "../../shared/lesson-experience";
import { hasHtmlLessonData, readRawHtmlLessonData } from "../../shared/lesson-html-data";
import { decideWebResearchGatherResult, decideWebResearchResult, extractGeneratedHtml, htmlLooksComplete, HTML_START, webResearchGatherPrompt, webLessonAuthorPrompt, WEB_SEARCH_TOOL, WEB_FETCH_TOOL, type WebResearchChatRequest, type WebResearchEvent, type WebSource } from "./web-research-agent";
import { fetchedTeachingSources, teachingReviewEvidence, subjectiveOnlyFailures, TeachingReviewFailure, type TeachingReviewEvidence, type FetchedTeachingSource, type TeachingReview } from "./web-teaching-review";
import { repairWebLessonBank } from "./web-bank-repair";
import { reviewAndRepairWebTeaching } from "./web-teaching-repair";
import { stripJsonFences } from "../ai/OpenRouterProvider";
import { callStepModel, StepModelError } from "./run-step";
import { buildLessonExperience } from "./experience-builder";
import { withSupportSkill } from "./support-skills";
import {
  assembledWebLessonData,
  extractWebConcepts,
  fetchedSourcesToExtractorFiles,
  injectWebExperience,
  knowledgeAuthorData,
  lessonFromTeachingHtml,
  mapConceptsFromBrief,
  teachableConcepts,
  webKnowledgeBrief,
  type WebKnowledgeBrief,
} from "./web-knowledge";

export class WebResearchFailure extends Error {}
export type ResearchArtifact = { html: string; sources: WebSource[]; reviewEvidence?: TeachingReviewEvidence };
export type ResearchObserver = {
  signal?: AbortSignal;
  onEvent: (event: WebResearchEvent) => void;
  onCandidate?: (content: string, diagnostic: { stopReason?: string | null; inputTokens?: number; outputTokens?: number; elapsedMs?: number; problems?: string; teachingReview?: TeachingReview }) => Promise<void>;
};
const MAX_TOKENS = 64_000;
const MAX_CONTINUATIONS = 5;
const IDLE_TIMEOUT_MS = 120_000;
const PHASE_TIMEOUT_MS = 20 * 60_000;
export const webResearchTurnKey = (input: WebResearchChatRequest, repairAttempts = 0, continuations = 0) => ({ input, method: LESSON_METHOD_VERSION, contract: "web-knowledge-2", repairAttempts, continuations });
type ResearchTurn = { final: Anthropic.Message; content: string; sources: WebSource[] };
export function hasSavedResearchTurn(record: WorkflowRecord, input: WebResearchChatRequest): boolean {
  const turn = savedWorkflowResult<ResearchTurn>(record, "web-provider-turn", webResearchTurnKey(input));
  return !!turn && typeof turn.content === "string" && Array.isArray(turn.sources) && Array.isArray(turn.final?.content)
    && ["end_turn", "pause_turn"].includes(turn.final.stop_reason ?? "");
}

function evidenceFromBrief(brief: WebKnowledgeBrief): string {
  const terms = brief.concepts.map(concept => concept.term).join(", ");
  const text = terms ? `${terms} tanítása a letöltött források alapján.` : "A forrásjegyzékben szereplő fogalmak tanítása.";
  return text.length >= 20 ? text : `${text} A forrás idézetei a tanítás alapjai.`;
}

function lessonMetaFromHtml(html: string, fallback: { title: string; subject: string; classroom: number; classroomEvidence: string }) {
  try {
    const raw = readRawHtmlLessonData(html);
    if (!raw || typeof raw !== "object") return fallback;
    const row = raw as { classroom?: unknown; classroomEvidence?: unknown; subject?: unknown };
    const classroom = typeof row.classroom === "number" && row.classroom >= 0 && row.classroom <= 12 ? row.classroom : fallback.classroom;
    const classroomEvidence = typeof row.classroomEvidence === "string" && row.classroomEvidence.trim().length >= 20 ? row.classroomEvidence.trim() : fallback.classroomEvidence;
    const subject = typeof row.subject === "string" && row.subject.trim() ? row.subject.trim() : fallback.subject;
    return { ...fallback, classroom, classroomEvidence, subject };
  } catch {
    return fallback;
  }
}

/** Runs independently of HTTP; only the legacy stream supplies a client abort signal. */
export async function generateWebResearchLesson(input: WebResearchChatRequest, { signal, onEvent, onCandidate }: ResearchObserver): Promise<ResearchArtifact> {
  const key = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!key?.trim()) throw new WebResearchFailure("Az Anthropic API kulcs nincs beállítva.");
  const extractModel = resolveStudioModel("extract");
  const authorModel = resolveWebResearchAuthorModel();
  if (!studioModelReady(extractModel) || !studioModelReady(authorModel)) {
    throw new WebResearchFailure("A Studio kivonatoló vagy szerző modell API-kulcsa nincs beállítva.");
  }
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
    const startedAt = Date.now();

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
          system: [
            {
              type: "text",
              text: withSupportSkill("web-research", webResearchGatherPrompt(input.classroom, input.title, topicSeed)) + workflowSkillPrompt(),
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
      const gather = decideWebResearchGatherResult({ stopReason, fullContent, repairAttempts, fetchedCount: fetched.size });
      if (gather.type === "retry") {
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

    restartPhaseTimer();
    stopIdle();
    onEvent({ type: "status", message: "Forrásjegyzék készítése a letöltött szövegekből…" });
    const files = fetchedSourcesToExtractorFiles(downloaded);
    const extraction = await workflowCheckpoint("web-extract", { input, method: LESSON_METHOD_VERSION, contract: "web-extract-1", urls: downloaded.map(s => s.url) }, () => extractWebConcepts(files, { subject: input.title?.trim() || "tananyag", classroom: input.classroom }, async (system, user) => {
      const provider = createStudioProvider(extractModel, 180_000, 12_000);
      const response = await provider.chat([
        { role: "system", content: withSupportSkill("web-research", system) + workflowSkillPrompt() },
        { role: "user", content: user },
      ], controller.signal);
      await workflowUsage({ promptTokens: response.usage?.promptTokens, completionTokens: response.usage?.completionTokens });
      if (response.finishReason === "length" || response.finishReason === "max_tokens") {
        throw new WebResearchFailure("A forrásjegyzék válasza elérte a hosszkorlátot. Csonka jegyzék nem menthető.");
      }
      const text = stripJsonFences(response.content ?? "").trim();
      try { return JSON.parse(text) as unknown; }
      catch { throw new WebResearchFailure("A forrásjegyzék nem érvényes JSON. A tananyag nem írható."); }
    }));
    const taught = teachableConcepts(extraction.concepts);
    if (!taught.length) throw new WebResearchFailure("A letöltött szövegekből nem készült idézetellenőrzött fogalomjegyzék. A tananyag nem írható.");
    const brief = webKnowledgeBrief({ topic: input.message, classroomHint: input.classroom, sources: downloaded, files, concepts: extraction.concepts });
    const conceptIds = brief.concepts.map(concept => concept.id);

    restartPhaseTimer();
    stopIdle();
    onEvent({ type: "status", message: "Tananyag írása a forrásjegyzékből…" });
    const authorSystem = withSupportSkill("web-author", webLessonAuthorPrompt(input.classroom, input.title, topicSeed)) + workflowSkillPrompt();
    const authorUser = `${knowledgeAuthorData(brief)}\nKért téma: ${input.message}`;
    let html = "";
    const authorMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: authorSystem },
      { role: "user", content: authorUser },
    ];
    html = await workflowCheckpoint("web-author-html", { input, method: LESSON_METHOD_VERSION, contract: "web-author-html-1", conceptIds }, async () => {
      let attempts = 0;
      for (;;) {
        const provider = createStudioProvider(authorModel, PHASE_TIMEOUT_MS, MAX_TOKENS);
        const response = await provider.chat(authorMessages, controller.signal);
        await workflowUsage({ promptTokens: response.usage?.promptTokens, completionTokens: response.usage?.completionTokens });
        if (response.finishReason === "length" || response.finishReason === "max_tokens") {
          throw new WebResearchFailure("A szerzői válasz elérte a hosszkorlátot. A csonka tananyag nem menthető.");
        }
        const content = response.content ?? "";
        const produced = extractGeneratedHtml(content) ?? "";
        const problems: string[] = [];
        if (!produced || !htmlLooksComplete(produced)) problems.push("Csak keresési összefoglaló érkezett, tananyag nem.");
        else if (!hasHtmlLessonData(produced)) problems.push("Pontosan egy websuli-lesson-data JSON-bank szükséges.");
        else {
          try {
            lessonFromTeachingHtml(produced, { title: input.title?.trim() || extraction.title, subject: "tananyag", classroom: input.classroom }, conceptIds);
          } catch (error) {
            problems.push(error instanceof Error ? error.message : "A tanítás nem alakítható Lessonné.");
          }
          // Spec 2026-09-19: the publication gate's visual rule, checked here so a missing
          // chapter visual is repaired now and not discovered after the bank is built.
          problems.push(...verifyTeachingVisuals(produced));
        }
        if (!problems.length) return produced;
        const reason = problems.join("; ");
        if (attempts >= 2) throw new WebResearchFailure(`A tananyag az automatikus javítás után sem készült el: ${reason}`);
        attempts += 1;
        repairAttempts = attempts;
        await workflowValidationFailure(reason);
        await onCandidate?.(content, { problems: reason });
        authorMessages.push({ role: "assistant", content });
        authorMessages.push({
          role: "user",
          content: `A korábbi HTML nem teljesítette a készítési szerződést: ${reason}\nMost készítsd el a TELJES négyoldalas tananyagot a forrásjegyzék fogalmaiból. Ne kérj engedélyt. ${HTML_START}\n<!DOCTYPE html> kezdetű, </html>-lel lezárt dokumentum; a JSON-bank helyőrző, saját pontozó JS nélkül.`,
        });
        onEvent({ type: "status", message: `A tanítás javítása (${attempts}/2)…` });
      }
    });
    await onCandidate?.(html, { stopReason: "end_turn", elapsedMs: Date.now() - startedAt });

    restartPhaseTimer();
    stopIdle();
    onEvent({ type: "status", message: "Gyakorlóbank készítése a tanított fejezetekből…" });
    const fallbackMeta = {
      title: input.title?.trim() || extraction.title,
      subject: "tananyag",
      classroom: input.classroom,
      classroomEvidence: evidenceFromBrief(brief),
    };
    const meta = lessonMetaFromHtml(html, fallbackMeta);
    const lesson = lessonFromTeachingHtml(html, meta, conceptIds);
    const experience = await buildLessonExperience(lesson, mapConceptsFromBrief(brief), {
      async call(system, user) {
        return (await callStepModel(createStudioProvider(authorModel, 240_000, 16_000), { step: "author", model: authorModel, system, user }, controller.signal)).json;
      },
    });
    html = injectWebExperience(html, assembledWebLessonData(brief, meta, experience));
    fullContent = html;
    sources.splice(0, sources.length, ...[...fetched.values()].map(({ url, title }) => ({ url, title })));

    clearTimeout(hardTimer);
    stopIdle();
    if (htmlLooksComplete(html)) {
      fullContent = await repairWebLessonBank(html, {
        signal: controller.signal,
        async onProblem(problems) {
          await workflowValidationFailure(problems);
          onEvent({ type: "status", message: "Az elkészült tananyag hiányzó vagy hibás feladatainak célzott javítása…" });
          await onCandidate?.(fullContent, { problems });
        },
        onCandidate: next => onCandidate?.(next, {}) ?? Promise.resolve(),
      });
    }
    let result = decideWebResearchResult({ stopReason, fullContent, repairAttempts, sources }, html => verifyLessonMethodHtml(html));
    let reviewEvidence: TeachingReviewEvidence | undefined;
    if (result.type === "ready") {
      onEvent({ type: "status", message: "A teljes tananyag összevetése a letöltött forrásokkal…" });
      const corrected = await reviewAndRepairWebTeaching(result.html, downloaded, {
        signal: controller.signal, requestedTopic: input.message,
        onReview: (next, review) => onCandidate?.(next, { teachingReview: review }) ?? Promise.resolve(),
        async onProblem(problem, next) {
          await workflowValidationFailure(problem);
          await onCandidate?.(next, { problems: problem });
          onEvent({ type: "status", message: "A lektor által talált tartalmi hibák célzott javítása és újraellenőrzése…" });
        },
        onCandidate: next => onCandidate?.(next, {}) ?? Promise.resolve(),
      });
      if (controller.signal.aborted) throw new WebResearchFailure("A tartalmi ellenőrzés ideje alatt a készítés megszakadt.");
      const { review } = corrected;
      fullContent = corrected.html;
      result = { type: "ready", html: corrected.html };
      const problems = review.checks.filter(c => !c.passed).map(c => `Tanítási minőség (${c.criterion}): ${c.evidence}`);
      const subjective = subjectiveOnlyFailures(review);
      if (!problems.length) reviewEvidence = teachingReviewEvidence(result.html, downloaded, review);
      else if (subjective) {
        // Spec 2026-09-19: after the bounded repair rounds only the judgement criteria
        // (explanation_depth, age_and_added_value) remain — published with the reviewer's
        // notes as warnings; factual/coverage/grounding failures still stop the run.
        reviewEvidence = teachingReviewEvidence(result.html, downloaded, review);
        logger.warn("[WEB-RESEARCH] published with pedagogical warnings", { criteria: subjective });
        await workflowValidationFailure(`Pedagógiai figyelmeztetéssel közzétéve: ${problems.join("; ")}`);
        onEvent({ type: "status", message: `A tananyag elkészült; a lektor pedagógiai megjegyzései (${subjective.join(", ")}) figyelmeztetésként mellékelve.` });
      } else throw new WebResearchFailure(`A célzott tartalmi javítás után további ellenőrzés szükséges: ${problems.join("; ")}`);
    }
    if (result.type === "retry") throw new WebResearchFailure(`A tananyag az automatikus javítás után sem készült el: ${result.reason}`);
    if (result.type === "error") throw new WebResearchFailure(result.message);
    if (downloaded.length === 0) throw new WebResearchFailure("Nem érkezett ellenőrizhető internetes forráshivatkozás. A tananyag nem menthető.");
    return { html: result.html, sources: [...fetched.values()].map(({ url, title }) => ({ url, title })), reviewEvidence };
  } catch (error) {
    if (error instanceof WebResearchFailure) throw error;
    if (error instanceof TeachingReviewFailure) throw new WebResearchFailure(error.message);
    if (error instanceof StepModelError && !controller.signal.aborted) throw new WebResearchFailure(error.step === "lektor"
      ? "A tartalmi lektorálás nem fejeződött be. A jelölt még nem publikálható."
      : error.step === "author" ? "A tananyagírás vagy a gyakorlóbank készítése nem fejeződött be. A jelölt még nem publikálható."
      : "A célzott javító modellhívása nem fejeződött be. A jelölt még nem publikálható.");
    logger.error("[WEB-RESEARCH] provider failure", { name: error instanceof Error ? error.name : "unknown", timedOut });
    throw new WebResearchFailure(timedOut ? "Időtúllépés: a keresés vagy a tananyagkészítés nem fejeződött be az időkeretben."
      : controller.signal.aborted ? "A kérés megszakadt." : "AI hiba történt a webes keresés közben.");
  } finally {
    clearTimeout(hardTimer);
    if (idleTimer) clearTimeout(idleTimer);
    signal?.removeEventListener("abort", abort);
  }
}
