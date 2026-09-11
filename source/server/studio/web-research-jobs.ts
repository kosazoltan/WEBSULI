import type { WebResearchJob } from "../../shared/web-research-job";
import type { WebResearchChatRequest } from "./web-research-agent";
import { decideWebResearchResult } from "./web-research-agent";
import { type ResearchArtifact, type ResearchObserver, WebResearchFailure } from "./web-research-runner";
import { readHtmlLessonData } from "../../shared/lesson-html-data";
import { verifyLessonMethodHtml } from "../improve/verify-lesson-method";
import { logger } from "../lib/logger";

export type StoredResearchJob = WebResearchJob & {
  userId: string;
  input: WebResearchChatRequest;
  candidate?: string;
  diagnostics: Array<Record<string, unknown>>;
};
export interface ResearchJobStore {
  create(job: StoredResearchJob): Promise<boolean>;
  read(id: string, userId: string): Promise<StoredResearchJob | null>;
  update(job: StoredResearchJob, expectedState: StoredResearchJob["state"]): Promise<void>;
  publish(id: string, userId: string): Promise<StoredResearchJob>;
}
export class ResearchJobConflict extends Error {}
export function publicResearchJob(job: StoredResearchJob): WebResearchJob {
  const { id, state, stage, title, message, content, sources, createdAt, classroom, materialId, error } = job;
  return { id, state, stage, title, message, content, sources, createdAt, classroom, materialId, error,
    ...(state === "done" || state === "ready" ? { html: job.html } : {}) };
}
export function checkedResearchArtifact(artifact: ResearchArtifact) {
  const check = decideWebResearchResult({ stopReason: "end_turn", fullContent: artifact.html, repairAttempts: 2, sources: artifact.sources }, verifyLessonMethodHtml);
  if (check.type !== "ready") throw new WebResearchFailure(check.type === "error" ? check.message : check.reason);
  if (!artifact.sources.length) throw new WebResearchFailure("Nincs ellenőrizhető internetes forrás.");
  return readHtmlLessonData(artifact.html);
}

/** DB owns idempotency, so multiple requests/processes cannot start the same AI call. */
export function createResearchJobs(store: ResearchJobStore, generate: (input: WebResearchChatRequest, observer: ResearchObserver) => Promise<ResearchArtifact>) {
  async function run(job: StoredResearchJob) {
    let checkpoint = Promise.resolve();
    const persist = () => {
      const snapshot = structuredClone(job);
      // Serialize snapshots to keep an old status write from racing completion.
      checkpoint = checkpoint.then(() => store.update(snapshot, "running"));
      // The final await still reports failure; avoid an unhandled rejection mid-stream.
      void checkpoint.catch(() => undefined);
    };
    try {
      const artifact = await generate(job.input, {
        onEvent(event) {
          if (event.type === "status") { job.stage = event.message; persist(); }
          if (event.type === "sources") { job.sources = [...event.sources]; persist(); }
          if (event.type === "content_replace") job.content = event.content;
          if (event.type === "content_delta") job.content += event.content;
        },
        async onCandidate(content, diagnostic) {
          job.candidate = content;
          job.diagnostics.push(diagnostic);
          persist();
          await checkpoint;
        },
      });
      const data = checkedResearchArtifact(artifact);
      await checkpoint;
      job.html = artifact.html;
      job.sources = artifact.sources;
      job.classroom = data.classroom;
      job.title = job.input.title?.trim() || `${data.subject} — ${data.classroom}. osztály`;
      job.state = "ready";
      job.stage = "A kész tananyag mentése…";
      await store.update(job, "running");
      await publish(job.id, job.userId);
    } catch (error) {
      await checkpoint.catch(() => undefined);
      job.error = error instanceof WebResearchFailure ? error.message : "A tananyagkészítés vagy mentés hibával megállt. A mentett futás állapota visszaolvasható.";
      job.stage = job.error;
      const previous = job.state;
      if (job.state !== "ready") job.state = "error";
      await store.update(job, previous).catch(() => logger.error("[WEB-RESEARCH] job failure could not be persisted"));
    }
  }
  async function read(id: string, userId: string) {
    const job = await store.read(id, userId);
    if (job?.state === "running" && Date.now() - job.createdAt > 25 * 60_000) {
      job.state = "error";
      job.error = "A szerverfutás megszakadt vagy túllépte az időkeretet. Új készítést indíthatsz; a régi források és diagnózis megmaradtak.";
      job.stage = job.error;
      await store.update(job, "running");
      return store.read(id, userId);
    }
    return job;
  }
  async function publish(id: string, userId: string) {
    return store.publish(id, userId);
  }
  return {
    read, publish,
    async start(id: string, userId: string, input: WebResearchChatRequest) {
      const job: StoredResearchJob = { id, userId, input, state: "running", stage: "Forráskeresés indul…", title: input.title || "", message: input.message, content: "", sources: [], diagnostics: [], createdAt: Date.now() };
      if (await store.create(job)) {
        void run(job).catch(() => logger.error("[WEB-RESEARCH] background job failed"));
        return job;
      }
      const existing = await read(id, userId);
      if (!existing || JSON.stringify(existing.input) !== JSON.stringify(input)) throw new ResearchJobConflict("Ez a futásazonosító már másik kéréshez tartozik.");
      return existing;
    },
  };
}
