import type { WorkflowView } from "@shared/lesson-workflow";

/**
 * Spec 2026-10-19-eroforras-s2a: a futásnapló-LISTA eleme lépésnapló nélkül. A lista (Futások lap) csak az azonosítót, a dátumot,
 * a címkét és az állapotot használja; a teljes futást (`visits`, `history`) az egyes futás végpontja adja. Mért: kb. 230 kB
 * futásonként × 50, 5 mp-enként.
 */
export function slimRun(view: WorkflowView): WorkflowView {
  return { ...view, visits: [], history: undefined, skill: undefined, skillFindings: undefined, resumeEdges: undefined };
}
