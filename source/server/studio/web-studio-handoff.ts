import type { OneStepRequest } from "./one-step";
import type { FetchedTeachingSource } from "./web-teaching-review";
import type { WebResearchChatRequest, WebSource } from "./web-research-agent";
import { fetchedSourcesToExtractorFiles } from "./web-knowledge";
import { WebResearchFailure, type ResearchObserver } from "./web-research-runner";
import { outsideWorkflow } from "../workflows/engine";

/**
 * Spec 2026-09-25 (docs/specs/2026-09-25-webes-studio-atadas.md, tulajdonosi döntés): the internet path
 * only searches and downloads; the downloaded pages go to the SAME one-step Studio manufacture as an
 * upload (grade from the source, curated map, planner, figures, blind solver, bank verifier, lektor, gate).
 */

/** The scope classifier receives every source at once — the web pages are capped to fit its window. */
export const MAX_SOURCE_CHARS = 60_000;
export const MAX_TOTAL_CHARS = 200_000;
const MIN_TAIL_CHARS = 2_000;
export const STUDIO_POLL_MS = 3_000;
export const STUDIO_MAX_WAIT_MS = 120 * 60_000;

export type StudioResearchArtifact = { kind: "studio"; runId: string; lessonId: string; htmlFileId: string; sources: WebSource[] };
export type StudioRunView = { phase: string; detail: string | null; error: string | null; lessonId: string | null; htmlFileId: string | null };
export type WebStudioDeps = {
  gather(input: WebResearchChatRequest, observer: Pick<ResearchObserver, "signal" | "onEvent" | "onCandidate">): Promise<{ downloaded: FetchedTeachingSource[] }>;
  start(data: OneStepRequest, userId: string): string;
  read(runId: string): Promise<StudioRunView | null>;
  sleep?(ms: number): Promise<void>;
  pollMs?: number;
  maxWaitMs?: number;
};

export function isStudioArtifact(value: unknown): value is StudioResearchArtifact {
  return !!value && typeof value === "object" && (value as { kind?: unknown }).kind === "studio";
}

/** Each downloaded page → one text source; the URL and title head the text so they stay in the map's source. */
export function webSourcesToOneStepFiles(downloaded: FetchedTeachingSource[]): OneStepRequest["files"] {
  const names = fetchedSourcesToExtractorFiles(downloaded).map(file => file.name);
  const files: OneStepRequest["files"] = [];
  let budget = MAX_TOTAL_CHARS;
  downloaded.forEach((source, index) => {
    const text = source.text.trim();
    if (!text || budget < MIN_TAIL_CHARS) return;
    const content = `Forrás: ${source.url}\nCím: ${source.title}\n\n${text}`.slice(0, Math.min(MAX_SOURCE_CHARS, budget));
    budget -= content.length;
    files.push({ name: names[index], kind: "text", content });
  });
  return files;
}

const PHASE_LABELS: Record<string, string> = {
  indul: "indul", ocr: "tantárgy és évfolyam felismerése", extract: "tudástár a letöltött forrásokból",
  pedagogue: "tanulási terv", author: "tananyag írása", animator: "ábrák és gyakorlóbank",
  lektor: "tartalmi lektorálás", gate: "ellenőrzések és közzététel",
};

/** Search + download, then hand the pages to a one-step Studio run and follow it to the published lesson. */
export async function generateWebStudioLesson(input: WebResearchChatRequest, observer: ResearchObserver, deps: WebStudioDeps): Promise<StudioResearchArtifact> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const { downloaded } = await deps.gather(input, observer);
  const sources = downloaded.map(({ url, title }) => ({ url, title }));
  observer.onEvent({ type: "sources", sources });

  // A resumed job follows its saved run while that is alive or finished; a failed one is replaced.
  let runId = observer.studioRunId;
  if (runId) {
    const saved = await deps.read(runId);
    if (!saved || saved.phase === "error" || saved.phase === "parked") runId = undefined;
  }
  if (!runId) {
    if (!observer.userId) throw new WebResearchFailure("A Studio-gyártáshoz hitelesített készítő szükséges.");
    const files = webSourcesToOneStepFiles(downloaded);
    if (!files.length) throw new WebResearchFailure("A letöltött oldalakból nem maradt feldolgozható szöveg. Új keresés szükséges.");
    const title = input.title?.trim();
    const data: OneStepRequest = { ...(title ? { title: title.slice(0, 255) } : {}), instructions: input.message.slice(0, 4000), files };
    const userId = observer.userId;
    // Its own upload workflow: the run must not inherit this web workflow's context.
    runId = outsideWorkflow(() => deps.start(data, userId));
    await observer.onStudioRun?.(runId);
  }
  observer.onEvent({ type: "status", message: "A letöltött források átadva a Studio-gyártásnak…" });

  const deadline = Date.now() + (deps.maxWaitMs ?? STUDIO_MAX_WAIT_MS);
  let last = "";
  for (;;) {
    if (observer.signal?.aborted) throw new WebResearchFailure("A kérés megszakadt.");
    const view = await deps.read(runId);
    if (!view) throw new WebResearchFailure("A Studio-gyártás futása nem olvasható vissza (lejárt vagy ismeretlen). Új készítés szükséges.");
    if (view.phase === "done") {
      if (!view.lessonId || !view.htmlFileId) throw new WebResearchFailure("A Studio-gyártás kész, de a közzétett lecke nem olvasható vissza.");
      return { kind: "studio", runId, lessonId: view.lessonId, htmlFileId: view.htmlFileId, sources };
    }
    if (view.phase === "error") throw new WebResearchFailure(`A Studio-gyártás hibával megállt: ${view.error ?? "ismeretlen hiba"}`);
    if (view.phase === "parked") throw new WebResearchFailure(`A Studio-gyártás forrásellenőrzésre vár: ${view.detail ?? "a tudástár nem hagyható jóvá gépileg"}`);
    const status = `Studio-gyártás: ${PHASE_LABELS[view.phase] ?? view.phase}${view.detail ? ` — ${view.detail}` : ""}`;
    if (status !== last) { observer.onEvent({ type: "status", message: status }); last = status; }
    if (Date.now() > deadline) throw new WebResearchFailure("A Studio-gyártás nem fejeződött be 120 percen belül. A futás a Studio-panelen követhető.");
    await sleep(deps.pollMs ?? STUDIO_POLL_MS);
  }
}
