import type { WebSource } from "./web-research-stream";

export type WebResearchJob = {
  id: string;
  state: "running" | "ready" | "done" | "error";
  stage: string;
  title: string;
  message: string;
  content: string;
  sources: WebSource[];
  createdAt: number;
  html?: string;
  classroom?: number;
  materialId?: string;
  error?: string;
  canResume?: boolean;
  /** Spec 2026-09-19: review criteria left open after the repair rounds (published as warnings). */
  warnings?: string[];  /** Spec 2026-09-25: "studio" — made by the one-step Studio manufacture from the downloaded pages (no inline HTML). */
  output?: "studio" | "html";
};

/** Human labels for the reviewer's criteria shown next to a published web lesson. */
export const WEB_REVIEW_WARNING_LABELS: Record<string, string> = {
  explanation_depth: "A lektor szerint egyes fejezetek hogyan/miért magyarázata még kifejthetőbb.",
  age_and_added_value: "A lektor szerint az évfolyamhoz illő pedagógiai többlet (példa, aktivitás) még bővíthető.",
};

export function webReviewWarningLabel(criterion: string): string {
  return WEB_REVIEW_WARNING_LABELS[criterion] ?? `A lektor megjegyzése: ${criterion}.`;
}
