import { LESSON_METHOD_VERSION } from "../../shared/lesson-experience";
import type { WebResearchJob } from "../../shared/web-research-job";
import type { WebResearchChatRequest } from "./web-research-agent";
import { decideWebResearchResult } from "./web-research-agent";
import { type ResearchArtifact, type ResearchObserver, WebResearchFailure, hasSavedResearchTurn } from "./web-research-runner";
import { readHtmlLessonData } from "../../shared/lesson-html-data";
import { verifyLessonMethodHtml } from "../improve/verify-lesson-method";
import { logger } from "../lib/logger";
import { assertTeachingReviewEvidence, type TeachingReviewEvidence } from "./web-teaching-review";
import { executeWorkflow, workflowPhase, workflowCheckpoint, workflowUsage, savedWorkflowResult, type WorkflowStore } from "../workflows/engine";
import type { ExperienceCheckpoint } from "./experience-builder";
import { isStudioArtifact, type StudioResearchArtifact } from "./web-studio-handoff";

export type StoredResearchJob = WebResearchJob & {
  userId: string;
  input: WebResearchChatRequest;
  candidate?: string;
  diagnostics: Array<Record<string, unknown>>;
  updatedAt?: number;
  reviewEvidence?: TeachingReviewEvidence;
  /** Spec 2026-09-25: bank packets already built; a resumed run reuses them without a model call. Never public. */
  bankCheckpoint?: ExperienceCheckpoint;
  /** Spec 2026-09-25 (webes Studio-átadás): the one-step run the downloaded sources were handed to. */
  studioRunId?: string;
  lessonId?: string;
};
export interface ResearchJobStore {
  create(job: StoredResearchJob): Promise<boolean>;
  read(id: string, userId: string): Promise<StoredResearchJob | null>;
  update(job: StoredResearchJob, expectedState: StoredResearchJob["state"]): Promise<void>;
  publish(id: string, userId: string): Promise<StoredResearchJob>;
  verifyMaterial?(id: string, userId: string, html: string): Promise<boolean>;
  /** Spec 2026-09-25: the Studio lesson is published and points at this material; its title and grade. */
  readStudioLesson?(htmlFileId: string, lessonId: string): Promise<{ title: string; classroom: number } | null>;
}
export class ResearchJobConflict extends Error {}

/**
 * Spec 2026-09-19: the published web lesson is named after its own <title> / first <h1>
 * when the teacher gave no title — not the generic "tantárgy — N. osztály" fallback.
 */
export function webLessonTitleFromHtml(html: string): string | null {
  const pick = (m: RegExpMatchArray | null) => {
    const text = m?.[1]?.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim() ?? "";
    return text.length >= 4 && text.length <= 160 ? text : null;
  };
  return pick(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)) ?? pick(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i));
}
export function publicResearchJob(job: StoredResearchJob): WebResearchJob {
  const { id, state, stage, title, message, content, sources, createdAt, classroom, materialId, error, canResume, output } = job;
  const warnings = job.reviewEvidence?.warnings;
  return { id, state, stage, title, message, content, sources, createdAt, classroom, materialId, error, canResume, ...(output ? { output } : {}),
    ...(state === "done" || state === "ready" ? { html: job.html } : {}),
    // Spec 2026-09-19: the reviewer's open pedagogical notes travel to the Studio panel.
    ...(warnings?.length ? { warnings } : {}) };
}
export function checkedResearchArtifact(artifact: ResearchArtifact) {
  const check = decideWebResearchResult({ stopReason: "end_turn", fullContent: artifact.html, repairAttempts: 2, sources: artifact.sources }, verifyLessonMethodHtml);
  if (check.type !== "ready") throw new WebResearchFailure(check.type === "error" ? check.message : check.reason);
  if (!artifact.sources.length) throw new WebResearchFailure("Nincs ellenőrizhető internetes forrás.");
  try { assertTeachingReviewEvidence(artifact.html, artifact.sources, artifact.reviewEvidence); }
  catch { throw new WebResearchFailure("A teljes tananyaghoz és forrásaihoz kötött sikeres tartalmi lektorálás hiányzik vagy elavult."); }
  return readHtmlLessonData(artifact.html);
}

/** DB owns idempotency, so multiple requests/processes cannot start the same AI call. */
export function createResearchJobs(store: ResearchJobStore, generate: (input: WebResearchChatRequest, observer: ResearchObserver) => Promise<ResearchArtifact | StudioResearchArtifact>, workflows?: WorkflowStore) {
  async function runWork(job: StoredResearchJob, onStarted?: () => void) {
    let checkpoint = Promise.resolve();
    onStarted?.();
    const persist = () => {
      job.updatedAt = Date.now();
      const snapshot = structuredClone(job);
      // Serialize snapshots to keep an old status write from racing completion. Spec 2026-09-25: one
      // failed write must not poison the chain — the next snapshot still runs; only the last result counts.
      checkpoint = checkpoint.catch(() => undefined).then(() => store.update(snapshot, "running"));
      // The final await still reports failure; avoid an unhandled rejection mid-stream.
      void checkpoint.catch(() => undefined);
    };
    try {
      await workflowPhase("generate");
      const artifact = await workflowCheckpoint("web-result", { input: job.input, method: LESSON_METHOD_VERSION }, () => ["ready", "done"].includes(job.state) && job.html
        ? Promise.resolve({ html: job.html, sources: job.sources, reviewEvidence: job.reviewEvidence }) : generate(job.input, {
        userId: job.userId,
        studioRunId: job.studioRunId,
        async onStudioRun(runId) { job.studioRunId = runId; job.output = "studio"; persist(); await checkpoint; },
        bankCheckpoint: job.bankCheckpoint,
        async onBankCheckpoint(next) { job.bankCheckpoint = structuredClone(next); persist(); },
        onEvent(event) {
          if (event.type === "status") { job.stage = event.message; persist(); }
          if (event.type === "sources") { job.sources = [...event.sources]; persist(); }
          if (event.type === "content_replace") job.content = event.content;
          if (event.type === "content_delta") job.content += event.content;
        },
        async onCandidate(content, diagnostic) {
          job.candidate = content;
          job.diagnostics.push(diagnostic);
          await workflowUsage({ input_tokens: diagnostic.inputTokens, output_tokens: diagnostic.outputTokens });
          persist();
          await checkpoint;
        },
      }));
      await workflowPhase("knowledge");
      await workflowPhase("author");
      await workflowPhase("gate");
      if (isStudioArtifact(artifact)) return await finishStudioLesson(job, artifact, () => checkpoint);
      const data = checkedResearchArtifact(artifact);
      await checkpoint;
      job.html = artifact.html;
      job.sources = artifact.sources;
      job.reviewEvidence = artifact.reviewEvidence;
      job.classroom = data.classroom;
      job.title = job.input.title?.trim() || webLessonTitleFromHtml(artifact.html) || `${data.subject} — ${data.classroom}. osztály`;
      job.state = "ready";
      job.stage = "A kész tananyag mentése…";
      await store.update(job, "running");
      await workflowPhase("publish");
      await store.publish(job.id, job.userId);
      await workflowPhase("readback");
      const saved = await store.read(job.id, job.userId);
      if (!saved?.materialId || saved.state !== "done" || saved.html !== artifact.html) throw new WebResearchFailure("A mentett tananyag visszaolvasása nem igazolta a kész eredményt.");
      if (store.verifyMaterial && !await store.verifyMaterial(saved.materialId, job.userId, artifact.html)) throw new WebResearchFailure("A közzétett HTML eltér a kész tananyagtól.");
      return { kind: "material" as const, id: saved.materialId };
    } catch (error) {
      await checkpoint.catch(() => undefined);
      job.error = error instanceof WebResearchFailure ? error.message : "A tananyagkészítés vagy mentés hibával megállt. A mentett futás állapota visszaolvasható.";
      job.stage = job.error;
      const committed = await store.read(job.id, job.userId).catch(() => null);
      if (committed?.state !== "done") {
        const previous = job.state;
        if (job.state !== "ready") job.state = "error";
        await store.update(job, previous).catch(() => logger.error("[WEB-RESEARCH] job failure could not be persisted"));
      }
      if (workflows) throw error;
    }
  }
  /**
   * Spec 2026-09-25 (webes Studio-átadás): the one-step run already passed its own gate and published the
   * lesson — no html_files write here; the readback proves the published lesson behind the material.
   */
  async function finishStudioLesson(job: StoredResearchJob, artifact: StudioResearchArtifact, pending: () => Promise<void>) {
    await pending();
    job.sources = artifact.sources;
    job.studioRunId = artifact.runId;
    job.lessonId = artifact.lessonId;
    job.output = "studio";
    await workflowPhase("publish");
    await workflowPhase("readback");
    const lesson = store.readStudioLesson ? await store.readStudioLesson(artifact.htmlFileId, artifact.lessonId) : null;
    if (!lesson) throw new WebResearchFailure("A Studio-lecke közzététele nem igazolható vissza.");
    job.title = job.input.title?.trim() || lesson.title;
    job.classroom = lesson.classroom;
    job.materialId = artifact.htmlFileId;
    job.state = "done";
    job.error = undefined;
    job.stage = "A tananyag elkészült és közzétéve (Studio-lecke).";
    await store.update(job, "running");
    return { kind: "material" as const, id: artifact.htmlFileId };
  }
  async function run(job: StoredResearchJob, retry = false, onStarted?: () => void) {
    return workflows ? executeWorkflow(workflows, { id: job.id, owner: job.userId, mode: "web", retry, request: job.input }, async () => {
      // Change the domain state only after acquiring the workflow's exclusive lease.
      if (job.state === "error") { job.state = "running"; job.error = undefined; job.canResume = false; job.stage = "Folytatás a mentett részeredményekből…"; await store.update(job, "error"); }
      return runWork(job, onStarted);
    }) : runWork(job, onStarted);
  }
  async function read(id: string, userId: string) {
    const job = await store.read(id, userId);
    if (job?.state === "running") {
      // Spec 2026-09-25: the workflow lease, not the age of the last status write, tells whether a worker
      // is alive. A live worker (long bank/review phase without status) is never declared dead — its later
      // writes would be silently lost; a dead one (restart, crash) is reported at once, not after 25 min.
      const tracked = workflows ? await workflows.read(id, userId) : null;
      const workerGone = tracked ? ["error", "interrupted"].includes(tracked.view.state) : Date.now() - (job.updatedAt ?? job.createdAt) > 25 * 60_000;
      if (workerGone) {
        job.state = "error";
        job.error = "A szerverfutás megszakadt vagy túllépte az időkeretet. A mentett részeredményekből folytatható, vagy új készítést indíthatsz; a források és a diagnózis megmaradtak.";
        job.stage = job.error;
        await store.update(job, "running");
      }
    }
    if (job?.state === "error" && workflows) {
      const tracked = await workflows.read(id, userId);
      const artifact = tracked && savedWorkflowResult<ResearchArtifact | StudioResearchArtifact>(tracked, "web-result", { input: job.input, method: LESSON_METHOD_VERSION });
      job.canResume = false;
      if (tracked && ["error", "interrupted"].includes(tracked.view.state) && (tracked.view.executions ?? 0) < 4) {
        if (isStudioArtifact(artifact)) job.canResume = true;
        else if (artifact) {
          try { checkedResearchArtifact(artifact); job.canResume = true; }
          catch { /* An invalid saved artifact cannot be recovered by republishing it. */ }
        } else job.canResume = hasSavedResearchTurn(tracked, job.input) || !!job.studioRunId;
      }
    }
    return job;
  }
  /**
   * Spec 2026-09-25: `background` resumes a stopped run without holding the HTTP request for the whole
   * remaining pipeline (tens of minutes; the client gave up after 20 s and stopped following). It returns
   * once the lease is held and the job row says `running`; failures before that still reach the caller.
   */
  async function publish(id: string, userId: string, options: { background?: boolean } = {}) {
    const tracked = workflows ? await workflows.read(id, userId) : null;
    if (tracked) {
      const job = await read(id, userId);
      if (!job) throw new WebResearchFailure("A futás nem található.");
      if (job.state === "done" && tracked.view.state === "done") return job;
      if (!["ready", "done"].includes(job.state) && !job.canResume) throw new WebResearchFailure("Még nincs ellenőrzött, menthető tananyag.");
      if (options.background && !["ready", "done"].includes(job.state)) {
        let started!: () => void;
        const began = new Promise<void>(resolve => { started = resolve; });
        const work = run(job, true, started);
        work.catch((error: unknown) => logger.error("[WEB-RESEARCH] resumed background job failed", { id, message: error instanceof Error ? error.message.slice(0, 400) : String(error) }));
        await Promise.race([began, work]);
        return (await store.read(id, userId))!;
      }
      await run(job, true);
      return (await store.read(id, userId))!;
    }
    return store.publish(id, userId);
  }
  return {
    read, publish,
    async start(id: string, userId: string, input: WebResearchChatRequest) {
      const job: StoredResearchJob = { id, userId, input, state: "running", stage: "Forráskeresés indul…", title: input.title || "", message: input.message, content: "", sources: [], diagnostics: [], createdAt: Date.now() };
      if (await store.create(job)) {
        void run(job).catch((error: unknown) => logger.error("[WEB-RESEARCH] background job failed", { id: job.id, message: error instanceof Error ? error.message.slice(0, 400) : String(error) }));
        return job;
      }
      const existing = await read(id, userId);
      if (!existing || JSON.stringify(existing.input) !== JSON.stringify(input)) throw new ResearchJobConflict("Ez a futásazonosító már másik kéréshez tartozik.");
      return existing;
    },
  };
}
