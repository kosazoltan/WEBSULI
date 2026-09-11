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
};
