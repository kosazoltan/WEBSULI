import express, { type Request, type Response } from "express";
import { z } from "zod";
import { isAuthenticatedAdmin } from "../auth";
import { webResearchChatSchema, type WebResearchEvent } from "./web-research-agent";
import { generateWebResearchLesson, WebResearchFailure } from "./web-research-runner";
import { createResearchJobs, publicResearchJob, ResearchJobConflict } from "./web-research-jobs";
import { researchJobStore } from "./web-research-job-store";

export const webResearchRouter = express.Router();
webResearchRouter.use(isAuthenticatedAdmin);
const jobs = createResearchJobs(researchJobStore, generateWebResearchLesson);
const startSchema = webResearchChatSchema.extend({ id: z.string().uuid() });
const idSchema = z.string().uuid();
const routeError = (res: Response, error: unknown) => res.status(error instanceof ResearchJobConflict ? 409 : 500).json({ message:
  error instanceof WebResearchFailure || error instanceof ResearchJobConflict ? error.message : "A futás állapota most nem érhető el. Próbáld újra a követést." });

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

/** Legacy SSE consumers use the same runner; new UI follows a durable job instead. */
webResearchRouter.post("/web-research/chat", async (req: Request, res: Response) => {
  const parsed = webResearchChatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Hibás kérés. Adj meg szöveget és osztályt (0–12)." });
  const controller = new AbortController();
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const send = (event: WebResearchEvent) => { if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`); };
  const heartbeat = setInterval(() => { if (!res.writableEnded && !res.destroyed) res.write(": heartbeat\n\n"); }, 15_000);
  res.on("close", () => { if (!res.writableEnded) controller.abort(); clearInterval(heartbeat); });
  try {
    const artifact = await generateWebResearchLesson(parsed.data, { signal: controller.signal, onEvent: send });
    send({ type: "html_generated", ...artifact });
    send({ type: "complete" });
  } catch (error) { send({ type: "error", message: error instanceof Error ? error.message : "A tananyagkészítés hibával megállt." }); }
  finally { clearInterval(heartbeat); if (!res.destroyed) res.end("data: [DONE]\n\n"); }
});
