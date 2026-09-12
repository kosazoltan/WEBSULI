import type { SkillSnapshot, SkillFinding, SkillAudit } from "./lesson-skill";
/** One versioned definition drives execution guards and the administrator's diagram. */
export const WORKFLOW_VERSION = "lesson-flow-1";
export type WorkflowMode = "upload" | "studio" | "web" | "repair" | "concept" | "html" | "apply";
export type WorkflowStep = { id: string; label: string; after: string[]; maxVisits: number };
export type WorkflowDefinition = { version: string; mode: WorkflowMode; label: string; steps: WorkflowStep[] };
const labels: Record<string, string> = {
  source: "Forrás és eredeti tartalom", scope: "Tantárgy és évfolyam", knowledge: "Forrásjegyzék készítése",
  sourceCheck: "Forrásellenőrzés", pedagogue: "Tanulási terv", author: "Tananyag írása",
  animator: "Ábrák és gyakorlóbankok", banks: "Gyakorlóbankok", lektor: "Tartalmi lektorálás",
  gate: "Kötelező ellenőrzések", generate: "Forráskeresés és tananyagírás", save: "Ellenőrzött jelölt mentése",
  publish: "Mentés és közzététel", apply: "Mentés és javítás alkalmazása", readback: "Eredmény visszaolvasása",
};
const chains: Record<WorkflowMode, { label: string; ids: string[] }> = {
  upload: { label: "Feltöltött forrás", ids: ["source", "scope", "knowledge", "sourceCheck", "pedagogue", "author", "animator", "lektor", "gate", "readback"] },
  studio: { label: "Studio készítés", ids: ["pedagogue", "author", "animator", "lektor", "gate", "readback"] },
  web: { label: "Internetes készítés", ids: ["generate", "gate", "publish", "readback"] },
  repair: { label: "Teljes lecke javítása", ids: ["source", "author", "banks", "lektor", "gate", "save", "readback"] },
  concept: { label: "Célzott fogalomjavítás", ids: ["source", "author", "banks", "lektor", "gate", "save", "apply", "readback"] },
  html: { label: "HTML-okosítás", ids: ["source", "author", "gate", "save", "readback"] },
  apply: { label: "Javítás alkalmazása", ids: ["source", "gate", "apply", "readback"] },
};
export const WORKFLOW_MODES = Object.keys(chains) as WorkflowMode[];
export function workflowDefinition(mode: WorkflowMode): WorkflowDefinition {
  const chain = chains[mode];
  return { version: WORKFLOW_VERSION, mode, label: chain.label, steps: chain.ids.map((id, i) => ({
    id, label: id === "gate" && (mode === "upload" || mode === "studio") ? "Ellenőrzések és közzététel" : labels[id],
    after: i ? [chain.ids[i - 1]] : ["start"],
    maxVisits: 1,
  })).map(step => step.id === "author" && ["upload", "studio"].includes(mode)
    ? { ...step, after: [...step.after, "lektor", "gate", "pedagogue"], maxVisits: 3 }
    : ["upload", "studio"].includes(mode) && ["pedagogue", "animator", "lektor", "gate"].includes(step.id)
      ? { ...step, after: step.id === "pedagogue" ? [...step.after, "pedagogue"] : step.after, maxVisits: 3 }
      : step) };
}
export type WorkflowVisit = {
  step: string; attempt: number; startedAt: number; finishedAt?: number;
  state: "running" | "done" | "error" | "waiting"; error?: string; tokensIn?: number; tokensOut?: number; cacheHits: number;
};
export type WorkflowView = {
  id: string; definition: WorkflowDefinition; state: "running" | "waiting" | "ready" | "done" | "error" | "interrupted";
  createdAt: number; updatedAt: number; visits: WorkflowVisit[]; error?: string;
  result?: { kind: "candidate" | "material"; id: string }; revision: number;
  executions?: number;
  resourceId?: string;
  skill?: SkillSnapshot;
  skillFindings?: SkillFinding[];
  skillAudit?: SkillAudit;
  history?: Array<{ state: WorkflowView["state"]; visits: WorkflowVisit[]; error?: string }>;
};
export const WORKFLOW_STATE_LABELS: Record<WorkflowView["state"], string> = {
  running: "Folyamatban", waiting: "Döntésre vár", ready: "Jelölt elkészült, alkalmazásra vár",
  done: "Elkészült és visszaolvasva", error: "Hibával megállt", interrupted: "Megszakadt, részeredmények megőrizve",
};
export function assertWorkflowStep(run: WorkflowView, id: string): WorkflowStep {
  if (run.definition.version !== WORKFLOW_VERSION) throw new Error("Más folyamatverzióval indult futás nem folytatható ezzel a kóddal.");
  if (run.state !== "running") throw new Error("Csak aktív futás léptethető tovább.");
  const step = run.definition.steps.find(s => s.id === id);
  const last = run.visits.at(-1);
  if (last && (last.state === "error" || last.state === "waiting")) throw new Error("Befejezetlen lépés után csak annak kifejezett folytatása megengedett.");
  const previous = run.visits.at(-1)?.step ?? "start";
  if (!step || !step.after.includes(previous)) throw new Error(`Nem megengedett folyamatlépés: ${previous} → ${id}.`);
  if (run.visits.filter(v => v.step === id).length >= step.maxVisits) throw new Error(`Elfogyott a lépés javítási kerete: ${step.label}.`);
  return step;
}
