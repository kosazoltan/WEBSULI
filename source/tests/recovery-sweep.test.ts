import test from "node:test";
import assert from "node:assert/strict";
import { recoveryCandidate, RECOVERY_GRACE_MS, type RecoveryRow } from "../server/studio/recovery-sweep";
import { recoveryHistoryOf } from "../server/studio/step-runner";
import { planRecovery } from "../server/studio/recovery-planner";
import { executeWorkflow, workflowOrchestratorAllow, workflowPhase } from "../server/workflows/engine";
import { memoryWorkflows } from "./helpers/workflow-store";

/* Elakadás-vezérlő V3 (docs/specs/2026-10-15-elakadas-vezerlo-v3-vegrehajtas.md). */

const now = Date.parse("2026-10-15T12:00:00Z");
const base: RecoveryRow = { id: "j", status: "error", step: "error", error: "Hibás banktétel maradt a limiten: experience.tasks[1]: x", finishedAt: new Date(now - RECOVERY_GRACE_MS - 1),
  hasLesson: true, published: false, runId: "r", owner: "o", runState: "error", leaseUntil: null, recoveryState: null };

test("jelölt: a hibás, mentett, nem publikált, workflow-naplós job a türelmi idő után", () => {
  assert.equal(recoveryCandidate(base, now), null);
  assert.equal(recoveryCandidate({ ...base, finishedAt: new Date(now - 1000) }, now), "türelmi idő", "a tulajdonos kézi döntése elsőbbséget kap");
  assert.equal(recoveryCandidate({ ...base, published: true }, now), "publikált");
  assert.equal(recoveryCandidate({ ...base, hasLesson: false }, now), "nincs mentett lecke");
  assert.equal(recoveryCandidate({ ...base, runId: null }, now), "nincs workflow-napló");
  assert.equal(recoveryCandidate({ ...base, runState: "running" }, now), "a workflow nem hibás állapotú");
  assert.equal(recoveryCandidate({ ...base, leaseUntil: new Date(now + 60_000) }, now), "élő lízing");
  assert.equal(recoveryCandidate({ ...base, recoveryState: "ask-owner" }, now), "tulajdonosi döntésre vár");
  assert.equal(recoveryCandidate({ ...base, status: "ok", step: "done" }, now), "nem hibás");
});

test("történet a régi mezőkből (mért: job 416ad01d) → a következő fok a CÉLZOTT újraépítés", () => {
  const error = "Hibás banktétel maradt a limiten, és a kivétel után a bank nem felelne meg — nem publikálható: experience.tasks[7]: x (kivétel után: c12: hiányzó apply kvíz.)";
  const history = recoveryHistoryOf({ gateRecoveryAttempt: 3, bankRebuild: true, previousGateError: error } as never);
  assert.deepEqual(history.map((h) => h.strategy), ["gate", "rebuild-full"]);
  assert.equal(planRecovery({ error, history }).strategy, "rebuild-targeted");
  assert.deepEqual(recoveryHistoryOf({ recovery: [{ strategy: "review", fingerprint: "evidence||", failing: 0, at: 1 }], gateRecoveryAttempt: 2 } as never).map((h) => h.strategy), ["review"],
    "ha van valódi napló, az számít");
});

test("az automatikus javító kerete végrehajtásonként megújul (mért: a 416 új tételei a régi, elfogyott keretet örökölték)", async () => {
  const { store } = memoryWorkflows();
  const input = { id: "orch", owner: "o", mode: "studio" as const };
  await assert.rejects(executeWorkflow(store, input, async () => {
    await workflowPhase("pedagogue");
    for (let i = 0; i < 8; i++) assert.equal(await workflowOrchestratorAllow(`p${i}`), true);
    assert.equal(await workflowOrchestratorAllow("p9"), false, "a futásonkénti 8-as keret elfogyott");
    throw new Error("megállt");
  }), /megállt/);
  await assert.rejects(executeWorkflow(store, { ...input, retry: true, continuation: true }, async () => {
    assert.equal(await workflowOrchestratorAllow("p9"), true, "az új végrehajtás friss keretet kap");
    throw new Error("megint");
  }), /megint/);
});
