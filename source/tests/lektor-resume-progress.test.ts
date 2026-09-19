import test from "node:test";
import assert from "node:assert/strict";
import { getRun, updateRun, __resetRunsForTest, type OneStepRun } from "../server/studio/one-step-progress";
import { assertWorkflowStep, workflowDefinition, type WorkflowView } from "../shared/lesson-workflow";

test("újraindítás után visszaolvasott progress frissíthető és perzisztálható", async () => {
  __resetRunsForTest();
  const saved: OneStepRun = { id: "recovered", phase: "error", detail: null, error: "timeout", mapId: "map", jobId: "job", lessonId: null, startedAt: 1, updatedAt: 1 };
  await getRun(saved.id, async () => structuredClone(saved));
  let writes = 0;
  updateRun(saved.id, { phase: "done", lessonId: "lesson", error: null }, async run => { writes++; assert.equal(run.phase, "done"); });
  assert.equal((await getRun(saved.id))?.phase, "done");
  assert.equal(writes, 1);
});

test("provider-timeout nem fogyaszt tartalmi kört, három sikeres review viszont igen", () => {
  const run: WorkflowView = { id: "run", definition: workflowDefinition("studio"), state: "running", createdAt: 1, updatedAt: 1, revision: 0, visits: [] };
  const visit = (step: string, state: "done" | "error", error?: string) => ({ step, state, error, attempt: 1, startedAt: 1, finishedAt: 2, cacheHits: 0 });
  run.visits = [visit("lektor", "error", 'A(z) "lektor" lépés modellhívása hibára futott: [xAI] Request timed out.'), visit("lektor", "done"), visit("lektor", "done"), visit("animator", "done")];
  assert.doesNotThrow(() => assertWorkflowStep(run, "lektor"));
  run.visits.splice(3, 0, visit("lektor", "done"));
  assert.throws(() => assertWorkflowStep(run, "lektor"), /Elfogyott/);
});