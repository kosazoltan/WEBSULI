import test from "node:test";
import assert from "node:assert/strict";
import { canStopWorkflow, WORKFLOW_STOPPED_MESSAGE } from "../shared/lesson-workflow";

// Spec 2026-10-22-elmaradt-feladatok (S3): csak a futó / döntésre váró futás állítható le.
test("leállítható állapotok", () => {
  assert.equal(canStopWorkflow("running"), true);
  assert.equal(canStopWorkflow("waiting"), true);
  for (const s of ["done", "ready", "error", "interrupted"] as const) assert.equal(canStopWorkflow(s), false, s);
  assert.equal(WORKFLOW_STOPPED_MESSAGE, "A futást a tulajdonos leállította.");
});
