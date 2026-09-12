import { createHash } from "node:crypto";
import { SKILL_METHOD_VERSION, SKILL_RULES, skillForMode, type SkillFinding, type SkillCode, type SkillSnapshot, type SkillAudit } from "../../shared/lesson-skill";
import { workflowDefinition, type WorkflowMode, type WorkflowView } from "../../shared/lesson-workflow";

const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const detectors: Array<[SkillCode, RegExp]> = [
  ["concept_reference", /ismeretlen fogalom|fogalom.{0,30}azonosító|unknown.{0,20}(concept|id)|nem szerepel a térképen/i],
  ["bank_cardinality", /Array must contain|bank.{0,30}(méret|hiány|csomag)|methods=|tasks=|quiz=|legalább 15|minimum 15/i],
  ["sample_score", /mintaválasz|minWords|required|szinonimacsoport/i],
  ["duplicate_question", /ismétlődő kérdés|duplicate/i],
  ["oral_written", /oral|written|szóbeli/i],
  ["coverage", /fedettség|hiányzó fogalom|tanítása hiányos|nem tanított/i],
  ["html_complete", /keresési összefoglaló|HTML dokumentum nincs lezárva|csonka tananyag|négy.{0,5}lap/i],
  ["citations", /forrás.{0,80}hivatkozás|kattintható hivatkozás/i],
  ["typography", /ékezet|betűtípus|font|Unicode/i],
  ["repair_scope", /nem érintett tétel|nem módosítható|nem törölhet|javítás csak egyedi/i],
  ["schema", /érvényes JSON|alakilag hibás|séma|Invalid (type|enum)|Required/i],
];
export function knownFinding(code: SkillCode, step: string): SkillFinding {
  return { code, step, fingerprint: digest(`${SKILL_METHOD_VERSION}:${code}`) };
}
/** Classification may inspect an error; only a digest and maintained codes leave this function. */
export function findingsFromError(error: unknown, step: string): SkillFinding[] {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "unknown";
  const infra = /időtúllépés|szolgáltató|API.kulcs|429|rate.limit|timeout|kapcsolat|megszakadt|adatbázis|engedélye elveszett|végrehajtó/i.test(text);
  if (infra) return [{ code: "infrastructure", step, fingerprint: digest(`${SKILL_METHOD_VERSION}:${step}:infrastructure`) }];
  const matches = detectors.filter(([, regex]) => regex.test(text)).map(([code]) => knownFinding(code, step));
  if (matches.length) return matches;
  // No raw message, source, title, identifier or instruction is persisted in a skill.
  const shape = text.replace(/https?:\/\/\S+|\b[\w.-]+@[\w.-]+\b|(?:sk-|Bearer\s+)\S+/gi, "[value]")
    .replace(/["'`][^"'`]*["'`]/g, "[value]").replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "[id]").replace(/\d+/g, "#").slice(0, 2000);
  return [{ code: "unknown", step, fingerprint: digest(`${SKILL_METHOD_VERSION}:${step}:${shape}`) }];
}
export function mergeFindings(...groups: SkillFinding[][]): SkillFinding[] {
  return [...new Map(groups.flat().map(f => [f.fingerprint, f])).values()];
}
export function skillSnapshot(mode: WorkflowMode, codes: string[]): SkillSnapshot {
  const rules = [...new Set(codes)].filter((c): c is SkillCode => Object.hasOwn(SKILL_RULES, c)).sort();
  const skill = skillForMode(mode);
  return { skill, version: digest(JSON.stringify([SKILL_METHOD_VERSION, skill, rules])).slice(0, 20), rules };
}
export function auditWorkflow(view: WorkflowView): SkillAudit {
  const definition = workflowDefinition(view.definition.mode);
  const complete = view.state === "done" || view.state === "ready";
  const checks = {
    sequence: definition.steps.every(step => view.visits.some(v => v.step === step.id && v.state === "done"))
      && view.visits.every((visit, index) => {
        const step = definition.steps.find(s => s.id === visit.step);
        const previous = view.visits[index - 1];
        return Boolean(step && (step.after.includes(previous?.step ?? "start") || (previous?.step === visit.step && previous.state !== "done")));
      }),
    gate: view.visits.some(v => v.step === "gate" && v.state === "done"),
    readback: Boolean(view.result?.id && view.visits.at(-1)?.step === "readback" && view.visits.at(-1)?.state === "done"),
  };
  const errors = view.state === "error" || view.state === "interrupted"
    ? findingsFromError(view.error, view.visits.at(-1)?.step ?? "start") : [];
  return { version: SKILL_METHOD_VERSION, execution: view.executions ?? 0, at: Date.now(), checks,
    outcome: complete && Object.values(checks).every(Boolean) ? "passed" : complete ? "incomplete" : "stopped",
    findings: mergeFindings(view.skillFindings ?? [], errors) };
}
