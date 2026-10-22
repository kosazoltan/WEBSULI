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

// Review #366: az okosítás újrapróba-ciklusa minden új próbálkozás előtt (a try-blokkon KÍVÜL) ellenőrzi a leállítást — utána nincs
// új szolgáltatói hívás és tartalékmodell.
test("az újrapróba-ciklus a leállítás után nem indít új próbát", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync("server/improveAsync.ts", "utf8");
  const loop = src.indexOf("for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {");
  const guard = src.indexOf("if (current?.status === 'error' && current.improvementNotes === WORKFLOW_STOPPED_MESSAGE) throw new Error(WORKFLOW_STOPPED_MESSAGE);", loop);
  const tryAt = src.indexOf("fullContent = '';", loop);
  assert.ok(loop > 0 && guard > loop && guard < tryAt, "az őr a ciklus elején, a try előtt");
});
