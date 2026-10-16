import test from "node:test";
import assert from "node:assert/strict";
import { redactWorkflowError } from "../server/workflows/engine";

/* docs/specs/2026-10-15-ujraindulas-utani-folytatas.md (E2, E6) — mért hiba: térkép 3f39ab9b, 5 job. */

test("E6: a titok-kitakarás csak szóelején — a tétel-azonosító érintetlen, a kulcs kitakarva", () => {
  assert.equal(redactWorkflowError(new Error("t3-task-12: a javítás nem érvényes")), "t3-task-12: a javítás nem érvényes");
  assert.equal(redactWorkflowError(new Error("kulcs: sk-proj-AbC123_x és Bearer abc.def")), "kulcs: [titkos érték] és [titkos érték]");
});
