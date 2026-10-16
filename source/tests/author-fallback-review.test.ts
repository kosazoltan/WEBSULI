import assert from "node:assert/strict";
import test from "node:test";

import type { IAIProvider } from "../server/ai/AIProvider";
import { callStepModel, StepModelError } from "../server/studio/run-step";
import { executeWorkflow, workflowPhase } from "../server/workflows/engine";
import { memoryWorkflows } from "./helpers/workflow-store";

/* Spec 2026-09-29 (docs/specs/2026-09-29-szerzomodell-gpt6-luna.md, „Review-kör”): R1 — a régi webes HTML-út is
 * használja a szerző tartalékát; R2 — a bukott (érvénytelen JSON-os) hívás tokenje is a workflow-ba kerül. */

test("R2: a workflow a bukott (érvénytelen JSON-os) modellhívás tokenjét is elszámolja", async () => {
  const { store } = memoryWorkflows();
  const reply = (content: string, promptTokens: number, completionTokens: number): IAIProvider => ({
    name: "stub",
    model: "stub",
    chat: async () => ({ content, finishReason: "stop", usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens } }),
    isAvailable: async () => true,
  } as unknown as IAIProvider);
  const view = await executeWorkflow(store, { id: "usage", owner: "a", mode: "web" }, async () => {
    await workflowPhase("generate");
    await assert.rejects(callStepModel(reply('{"title": "x", "sections": [', 20, 10), { step: "author", role: "author", model: "gpt-6-luna", system: "s", user: "u1" }),
      (error: unknown) => error instanceof StepModelError && /nem érvényes JSON/.test(error.message));
    await callStepModel(reply('{"ok": true}', 5, 5), { step: "author", role: "author", model: "gpt-5.6-terra", system: "s", user: "u2" });
    await workflowPhase("knowledge"); await workflowPhase("author"); await workflowPhase("gate"); await workflowPhase("publish"); await workflowPhase("readback");
    return { kind: "material" as const, id: "ok" };
  });
  const generate = view.visits.find(v => v.step === "generate")!;
  assert.equal(generate.tokensIn, 25, "a bukott hívás 20 bemeneti tokenje is számít");
  assert.equal(generate.tokensOut, 15);
});
