import { Router } from "express";
import { isAuthenticatedAdmin } from "../auth";
import { workflowStore } from "./store";

export const workflowRouter = Router();
workflowRouter.use(isAuthenticatedAdmin);
workflowRouter.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
workflowRouter.get("/workflows", async (req, res) => {
  try {
    const records = await workflowStore.list(req.user!.id);
    res.json({ runs: records.map(r => r.view) });
  } catch { res.status(503).json({ message: "A futásnapló átmenetileg nem olvasható." }); }
});
workflowRouter.get("/workflows/:id", async (req, res) => {
  if (!/^[a-zA-Z0-9:-]{1,100}$/.test(req.params.id)) return res.status(400).json({ message: "Hibás futásazonosító." });
  try {
  const owner = req.user!.id;
  const record = await workflowStore.read(req.params.id, owner);
  const related = !record && await workflowStore.related(req.params.id, owner);
  const result = record ?? (related ? await workflowStore.read(related, owner) : null);
  // Null means no owned history; it never invents a successful legacy run.
  res.json({ run: result?.view ?? null });
  } catch { res.status(503).json({ message: "A futásnapló átmenetileg nem olvasható." }); }
});
