import { Router } from "express";
import { isAuthenticatedAdmin } from "../auth";
import { workflowStore } from "./store";
import { skillStore } from "./learning-store";
import { skillMarkdown, type LessonSkill } from "../../shared/lesson-skill";
import { runtimeKnowledge } from "../../shared/runtime-knowledge";

export const workflowRouter = Router();
workflowRouter.use(isAuthenticatedAdmin);
workflowRouter.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
const isSkill = (value: string): value is LessonSkill => value === "tananyag-keszito" || value === "tananyag-javito";
workflowRouter.get("/skills/:skill/runtime", async (req, res) => {
  if (!isSkill(req.params.skill)) return res.status(400).json({ message: "Ismeretlen tananyag-skill." });
  if (req.query.q !== undefined && (typeof req.query.q !== "string" || req.query.q.length > 200)) return res.status(400).json({ message: "Legfeljebb 200 karakteres keresőkifejezés használható." });
  try {
    const lessons = await skillStore.list(req.user!.id, req.params.skill);
    const snapshot = await skillStore.load(req.user!.id, req.params.skill === "tananyag-keszito" ? "upload" : "repair");
    const knowledge = runtimeKnowledge(snapshot, lessons, typeof req.query.q === "string" ? req.query.q : "");
    if (req.query.document !== undefined) {
      const name = req.query.document;
      if (typeof name !== "string" || !Object.hasOwn(knowledge.documents, name)) return res.status(400).json({ message: "Ismeretlen futási dokumentum." });
      res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
      return res.type("text/markdown").send(knowledge.documents[name as keyof typeof knowledge.documents]);
    }
    res.json(knowledge);
  } catch { res.status(503).json({ message: "A saját futási tudástár átmenetileg nem olvasható." }); }
});
workflowRouter.get("/skills/:skill", async (req, res) => {
  if (!isSkill(req.params.skill)) return res.status(400).json({ message: "Ismeretlen tananyag-skill." });
  try {
    const lessons = await skillStore.list(req.user!.id, req.params.skill);
    const snapshot = await skillStore.load(req.user!.id, req.params.skill === "tananyag-keszito" ? "upload" : "repair");
    if (req.query.format === "markdown") {
      res.setHeader("Content-Disposition", `attachment; filename="${snapshot.skill}-SKILL.md"`);
      return res.type("text/markdown").send(skillMarkdown(snapshot, lessons));
    }
    res.json({ snapshot, lessons });
  } catch { res.status(503).json({ message: "A tanult tapasztalatok átmenetileg nem olvashatók." }); }
});
workflowRouter.post("/skills/:skill/:fingerprint/disable", async (req, res) => {
  if (!isSkill(req.params.skill) || !/^[a-f0-9]{64}$/.test(req.params.fingerprint)) return res.status(400).json({ message: "Hibás tapasztalatazonosító." });
  try {
    if (!await skillStore.disable(req.user!.id, req.params.skill, req.params.fingerprint)) return res.status(404).json({ message: "A saját tapasztalat nem található." });
    res.json({ disabled: true });
  } catch { res.status(503).json({ message: "A kikapcsolás nem sikerült; próbáld újra." }); }
});
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
