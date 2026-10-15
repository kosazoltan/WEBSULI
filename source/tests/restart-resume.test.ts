import test from "node:test";
import assert from "node:assert/strict";
import { redactWorkflowError } from "../server/workflows/engine";
import { resumeKindOf } from "../server/studio/step-runner";
import { ORPHAN_JOB_ERROR } from "../server/studio/orphan-jobs";
import { recoveryCandidate, type RecoveryRow } from "../server/studio/recovery-sweep";

/* docs/specs/2026-10-15-ujraindulas-utani-folytatas.md (E2, E6) — mért hiba: térkép 3f39ab9b, 5 job. */

test("E6: a titok-kitakarás csak szóelején — a tétel-azonosító érintetlen, a kulcs kitakarva", () => {
  assert.equal(redactWorkflowError(new Error("t3-task-12: a javítás nem érvényes")), "t3-task-12: a javítás nem érvényes");
  assert.equal(redactWorkflowError(new Error("kulcs: sk-proj-AbC123_x és Bearer abc.def")), "kulcs: [titkos érték] és [titkos érték]");
});

test("E2: a szerver-újraindulás miatt lezárt, mentett, nem publikált job a megszakadt lépéstől folytatható", () => {
  const base = { step: "error", status: "error", error: ORPHAN_JOB_ERROR, hasLesson: true };
  assert.equal(resumeKindOf({ ...base, visit: { step: "animator", state: "error" } }), "restart");
  assert.equal(resumeKindOf({ ...base, visit: { step: "lektor", state: "running" } }), "restart");
  assert.equal(resumeKindOf({ ...base, visit: { step: "pedagogue", state: "error" } }), null, "tanítás nélkül nincs mit folytatni");
  assert.equal(resumeKindOf({ ...base, hasLesson: false, visit: { step: "animator", state: "error" } }), null);
  assert.equal(resumeKindOf({ ...base, published: true, visit: { step: "animator", state: "error" } }), null);
});

test("E2: a vezérlő jelöltje — az `interrupted` futású, újraindulás miatt lezárt job is; az újabb gyártás miatt félretett nem", () => {
  const now = Date.parse("2026-10-15T18:00:00Z");
  const row: RecoveryRow = { id: "j", status: "error", step: "error", error: ORPHAN_JOB_ERROR, finishedAt: new Date(now - 5 * 60_000), hasLesson: true, published: false,
    runId: "r", owner: "u", runState: "interrupted", leaseUntil: new Date(now - 60_000), recoveryState: null };
  assert.equal(recoveryCandidate(row, now), null);
  assert.equal(recoveryCandidate({ ...row, error: "más hiba" }, now), "a workflow nem hibás állapotú");
  assert.equal(recoveryCandidate({ ...row, recoveryState: "superseded" }, now), "ugyanabból a forrásból újabb gyártás fut");
});
