import express, { type Request, type Response } from "express";
import { z } from "zod";
import { isAuthenticatedAdmin } from "../auth";
import { webResearchChatSchema, type WebResearchEvent } from "./web-research-agent";
import { generateWebResearchLesson, WebResearchFailure } from "./web-research-runner";
import { createResearchJobs, publicResearchJob, ResearchJobConflict } from "./web-research-jobs";
import { researchJobStore } from "./web-research-job-store";
import { workflowStore } from "../workflows/store";
import { WorkflowConflict } from "../workflows/engine";

export const webResearchRouter = express.Router();
webResearchRouter.use(isAuthenticatedAdmin);
const jobs = createResearchJobs(researchJobStore, generateWebResearchLesson, workflowStore);
const startSchema = webResearchChatSchema.extend({ id: z.string().uuid() });
const idSchema = z.string().uuid();
const routeError = (res: Response, error: unknown) => res.status(error instanceof ResearchJobConflict || error instanceof WorkflowConflict ? 409 : 500).json({ message:
  error instanceof WebResearchFailure || error instanceof ResearchJobConflict || error instanceof WorkflowConflict ? error.message : "A futás állapota most nem érhető el. Próbáld újra a követést." });

webResearchRouter.post("/web-research/jobs", async (req, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Hibás készítési kérés." });
  if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY?.trim()) return res.status(503).json({ message: "Az Anthropic API kulcs nincs beállítva." });
  const { id, ...input } = parsed.data;
  try { return res.status(202).json(publicResearchJob(await jobs.start(id, req.user!.id, input))); }
  catch (error) { return routeError(res, error); }
});
webResearchRouter.get("/web-research/jobs/:id", async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(400).json({ message: "Hibás futásazonosító." });
  res.setHeader("Cache-Control", "no-store");
  try {
    const job = await jobs.read(req.params.id, req.user!.id);
    return job ? res.json(publicResearchJob(job)) : res.status(404).json({ message: "A futás nem található ehhez a felhasználóhoz." });
  } catch (error) { return routeError(res, error); }
});
webResearchRouter.get("/web-research/jobs/:id/diagnostics", async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(400).json({ message: "Hibás futásazonosító." });
  res.setHeader("Cache-Control", "no-store");
  try {
    const job = await jobs.read(req.params.id, req.user!.id);
    return job ? res.json({ diagnostics: job.diagnostics, candidate: job.candidate }) : res.status(404).json({ message: "A futás nem található." });
  } catch (error) { return routeError(res, error); }
});
webResearchRouter.post("/web-research/jobs/:id/publish", async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(400).json({ message: "Hibás futásazonosító." });
  try { return res.json(publicResearchJob(await jobs.publish(req.params.id, req.user!.id))); }
  catch (error) { return routeError(res, error); }
});

/** Legacy streaming clients also start the same durable, automatically saved job. */
webResearchRouter.post("/web-research/chat", async (req: Request, res: Response) => {
  const parsed = webResearchChatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Hibás készítési kérés." });
  if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY?.trim()) return res.status(503).json({ message: "Az Anthropic API kulcs nincs beállítva." });
  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();
  await jobs.start(id, req.user!.id, parsed.data);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Workflow-Id", id);
  res.flushHeaders();
  const send = (event: WebResearchEvent) => { if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`); };
  try {
    while (!res.destroyed) {
      const job = await jobs.read(id, req.user!.id);
      if (!job) throw new Error("A futás nem olvasható vissza.");
      send({ type: "status", message: job.stage });
      if (job.state === "error" || job.error) throw new Error(job.error || "A készítés megállt.");
      if (job.state === "done" && job.html && job.materialId) {
        send({ type: "html_generated", html: job.html, sources: job.sources });
        send({ type: "complete" });
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) { send({ type: "error", message: error instanceof Error ? error.message : "A követés megszakadt." }); }
  finally { if (!res.destroyed) res.end("data: [DONE]\n\n"); }
});