import test from "node:test";
import assert from "node:assert/strict";
import { executeWorkflow, workflowOrchestratorAllow, workflowPhase } from "../server/workflows/engine";
import { memoryWorkflows } from "./helpers/workflow-store";

/* Elakadás-vezérlő V3 (docs/specs/2026-10-15-elakadas-vezerlo-v3-vegrehajtas.md). */

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
