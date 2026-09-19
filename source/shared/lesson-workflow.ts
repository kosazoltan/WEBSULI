import type { SkillSnapshot, SkillFinding, SkillAudit } from "./lesson-skill";
/** One versioned definition drives execution guards and the administrator's diagram. */
export const WORKFLOW_VERSION = "lesson-flow-2";
export type WorkflowMode = "upload" | "studio" | "web" | "repair" | "concept" | "html" | "apply";
export type WorkflowStep = { id: string; label: string; after: string[]; maxVisits: number };
export type WorkflowDefinition = { version: string; mode: WorkflowMode; label: string; steps: WorkflowStep[] };
const labels: Record<string, string> = {
  source: "Forrás és eredeti tartalom", scope: "Tantárgy és évfolyam", knowledge: "Forrásjegyzék készítése",
  sourceCheck: "Forrásellenőrzés", pedagogue: "Tanulási terv", author: "Tananyag írása",
  animator: "Ábrák és gyakorlóbankok", banks: "Gyakorlóbankok", lektor: "Tartalmi lektorálás",
  gate: "Kötelező ellenőrzések", generate: "Forráskeresés és letöltés", save: "Ellenőrzött jelölt mentése",
  publish: "Mentés és közzététel", apply: "Mentés és javítás alkalmazása", readback: "Eredmény visszaolvasása",
};
const chains: Record<WorkflowMode, { label: string; ids: string[] }> = {
  upload: { label: "Feltöltött forrás", ids: ["source", "scope", "knowledge", "sourceCheck", "pedagogue", "author", "animator", "lektor", "gate", "readback"] },
  studio: { label: "Studio készítés", ids: ["pedagogue", "author", "animator", "lektor", "gate", "readback"] },
  web: { label: "Internetes készítés", ids: ["generate", "knowledge", "author", "gate", "publish", "readback"] },
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
    : mode === "web" && ["knowledge", "author"].includes(step.id)
      ? { ...step, maxVisits: 3 }
    // Spec 2026-09-19: one bank-only repair round after the author limit — the animator may
    // follow the lektor directly, so animator/lektor/gate get a fourth visit.
    : ["upload", "studio"].includes(mode) && ["animator", "lektor", "gate"].includes(step.id)
      ? { ...step, after: step.id === "animator" ? [...step.after, "lektor"] : step.after, maxVisits: 4 }
    : ["upload", "studio"].includes(mode) && step.id === "pedagogue"
      ? { ...step, after: [...step.after, "pedagogue"], maxVisits: 3 }
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
  // Provider timeouts are not completed content reviews. Explicit continuation is
  // still limited separately by executeWorkflow's four-execution budget.
  const contentVisits = run.visits.filter(v => v.step === id && !(id === "lektor" && v.state === "error"
    && v.error?.startsWith('A(z) "lektor" lépés modellhívása hibára futott:') && /timed out|timeout/i.test(v.error)));
  if (contentVisits.length >= step.maxVisits) throw new Error(`Elfogyott a lépés javítási kerete: ${step.label}.`);
  return step;
}

export type WorkflowStepDisplay = { state: "done" | "running" | "error" | "waiting" | "redo" | "pending"; label: string; round: number };
/**
 * Spec 2026-09-19: what a step card shows. A step whose last visit belongs to an EARLIER
 * round than the visit currently running (the run looped back to the author) is not
 * "Befejezett" any more — it will run again (measured on the owner's screen: step 7 in
 * round 3 while steps 8–9 still read done from round 2).
 */
export function workflowStepDisplay(run: WorkflowView, stepId: string): WorkflowStepDisplay {
  const last = run.visits.filter(v => v.step === stepId).at(-1);
  if (!last) return { state: "pending", label: "Még nem indult", round: 0 };
  const round = run.visits.filter(v => v.step === stepId).length;
  const state = last.state === "running" && run.state === "interrupted" ? "error" : last.state;
  const current = run.visits.at(-1);
  const order = run.definition.steps.map(s => s.id);
  if (run.state === "running" && current && current.state === "running" && current.step !== stepId && last.state === "done"
    && order.indexOf(stepId) > order.indexOf(current.step) && (last.finishedAt ?? last.startedAt) <= current.startedAt) {
    return { state: "redo", label: "Új kör következik", round };
  }
  const labels = { done: "Befejezett", running: "Folyamatban", error: "Megállt", waiting: "Döntésre vár" } as const;
  return { state, label: labels[state], round };
}
