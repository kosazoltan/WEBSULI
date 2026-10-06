import type { OneStepRequest } from "./one-step";
import type { FetchedTeachingSource } from "./web-teaching-review";
import type { WebResearchChatRequest, WebSource } from "./web-research-agent";
import { fetchedSourcesToExtractorFiles } from "./web-knowledge";
import { WebResearchFailure, type ResearchObserver } from "./web-research-runner";
import { workflowCheckpoint } from "../workflows/engine";
import { LESSON_METHOD_VERSION } from "../../shared/lesson-experience";

/**
 * Spec 2026-09-25 (docs/specs/2026-09-25-webes-studio-atadas.md, tulajdonosi döntés): the internet path
 * only searches and downloads; the downloaded pages go to the SAME one-step Studio manufacture as an
 * upload (grade from the source, curated map, planner, figures, blind solver, bank verifier, lektor, gate).
 * Spec 2026-10-06-s7 (C egy futásban): the manufacture runs INSIDE the web job's own `webStudio` workflow —
 * no separate upload run, no back-filled steps; the progress record shares the web job's id.
 */

/** The scope classifier receives every source at once — the web pages are capped to fit its window. */
export const MAX_SOURCE_CHARS = 60_000;
export const MAX_TOTAL_CHARS = 200_000;
/** A page cut to fit the remaining budget must keep at least this much; a page that fits whole always goes. */
const MIN_TAIL_CHARS = 2_000;
export const STUDIO_POLL_MS = 3_000;

export type StudioResearchArtifact = { kind: "studio"; runId: string; lessonId: string; htmlFileId: string; sources: WebSource[] };
export type StudioRunView = { phase: string; detail: string | null; error: string | null; lessonId: string | null; htmlFileId: string | null };
export type WebStudioDeps = {
  gather(input: WebResearchChatRequest, observer: Pick<ResearchObserver, "signal" | "onEvent" | "onCandidate">): Promise<{ downloaded: FetchedTeachingSource[] }>;
  /** Runs the one-step manufacture in the CALLER's workflow (`webStudio`), reporting into the progress record `runId`. */
  manufacture(runId: string, data: OneStepRequest, userId: string): Promise<void>;
  read(runId: string): Promise<StudioRunView | null>;
  sleep?(ms: number): Promise<void>;
  pollMs?: number;
};

export function isStudioArtifact(value: unknown): value is StudioResearchArtifact {
  return !!value && typeof value === "object" && (value as { kind?: unknown }).kind === "studio";
}

/**
 * Each downloaded page → one text source; the URL and title head the text so they stay in the map's source.
 * `sources` lists exactly the pages handed over (Codex, PR #128): a page dropped by the caps is not "used".
 */
export function webSourcesToOneStepFiles(downloaded: FetchedTeachingSource[]): { files: OneStepRequest["files"]; sources: WebSource[] } {
  const names = fetchedSourcesToExtractorFiles(downloaded).map(file => file.name);
  const files: OneStepRequest["files"] = [];
  const sources: WebSource[] = [];
  let budget = MAX_TOTAL_CHARS;
  downloaded.forEach((source, index) => {
    const text = source.text.trim();
    if (!text) return;
    const whole = `Forrás: ${source.url}\nCím: ${source.title}\n\n${text}`.slice(0, MAX_SOURCE_CHARS);
    // Copilot (PR #128): a short page that fits the remaining budget whole is never dropped; only a
    // page that would have to be cut to a sliver is skipped — later, shorter pages still get their turn.
    if (whole.length > budget && budget < MIN_TAIL_CHARS) return;
    const content = whole.slice(0, budget);
    budget -= content.length;
    files.push({ name: names[index], kind: "text", content });
    sources.push({ url: source.url, title: source.title });
  });
  return { files, sources };
}

const PHASE_LABELS: Record<string, string> = {
  indul: "indul", ocr: "tantárgy és évfolyam felismerése", extract: "tudástár a letöltött forrásokból",
  pedagogue: "tanulási terv", author: "tananyag írása", animator: "ábrák és gyakorlóbank",
  lektor: "tartalmi lektorálás", gate: "ellenőrzések és közzététel",
};

/**
 * Search + download (the `generate` step; a resumed execution reuses the saved download without a new search), then the
 * one-step Studio manufacture IN this workflow, followed through the shared progress record to the published lesson.
 */
export async function generateWebStudioLesson(input: WebResearchChatRequest, observer: ResearchObserver, deps: WebStudioDeps): Promise<StudioResearchArtifact> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const userId = observer.userId;
  if (!userId) throw new WebResearchFailure("A Studio-gyártáshoz hitelesített készítő szükséges.");
  const runId = observer.jobId;
  if (!runId) throw new WebResearchFailure("A Studio-gyártáshoz a webes futás azonosítója szükséges.");
  const { downloaded } = await workflowCheckpoint("web-sources", { input, method: LESSON_METHOD_VERSION }, () => deps.gather(input, observer));
  const handed = webSourcesToOneStepFiles(downloaded);
  const files = handed.files;
  const sources: WebSource[] = handed.sources;
  observer.onEvent({ type: "sources", sources });
  if (!files.length) throw new WebResearchFailure("A letöltött oldalakból nem maradt feldolgozható szöveg. Új keresés szükséges.");
  const title = input.title?.trim();
  const data: OneStepRequest = { ...(title ? { title: title.slice(0, 255) } : {}), instructions: input.message.slice(0, 4000), files };
  await observer.onStudioRun?.(runId);
  observer.onEvent({ type: "status", message: "A letöltött források átadva a Studio-gyártásnak…" });

  // The manufacture runs in this workflow; meanwhile its progress record is relayed as status events.
  let settled = false;
  let failure: unknown;
  const work = deps.manufacture(runId, data, userId).then(() => { settled = true; }, (error: unknown) => { settled = true; failure = error; });
  let last = "";
  while (!settled) {
    const view = await deps.read(runId).catch(() => null);
    if (view && !settled) {
      const status = `Studio-gyártás: ${PHASE_LABELS[view.phase] ?? view.phase}${view.detail ? ` — ${view.detail}` : ""}`;
      if (status !== last) { observer.onEvent({ type: "status", message: status }); last = status; }
    }
    if (!settled) await Promise.race([sleep(deps.pollMs ?? STUDIO_POLL_MS), work]);
  }
  await work;
  if (failure) throw failure;
  const view = await deps.read(runId);
  if (!view) throw new WebResearchFailure("A Studio-gyártás futása nem olvasható vissza (lejárt vagy ismeretlen). Új készítés szükséges.");
  if (view.phase === "done") {
    if (!view.lessonId || !view.htmlFileId) throw new WebResearchFailure("A Studio-gyártás kész, de a közzétett lecke nem olvasható vissza.");
    return { kind: "studio", runId, lessonId: view.lessonId, htmlFileId: view.htmlFileId, sources };
  }
  if (view.phase === "error") throw new WebResearchFailure(`A Studio-gyártás hibával megállt: ${view.error ?? "ismeretlen hiba"}`);
  if (view.phase === "parked") throw new WebResearchFailure(`A Studio-gyártás forrásellenőrzésre vár: ${view.detail ?? "a tudástár nem hagyható jóvá gépileg"}`);
  throw new WebResearchFailure("A Studio-gyártás véget ért, de nem adott közzétett leckét.");
}
