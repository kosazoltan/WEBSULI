import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { IAIProvider } from "../server/ai/AIProvider";
import { callStepModel, StepModelError } from "../server/studio/run-step";
import { webAuthorModelForAttempt } from "../server/studio/web-research-runner";
import { executeWorkflow, workflowPhase } from "../server/workflows/engine";
import { memoryWorkflows } from "./helpers/workflow-store";

/* Spec 2026-09-29 (docs/specs/2026-09-29-szerzomodell-gpt6-luna.md, „Review-kör”): R1 — a régi webes HTML-út is
 * használja a szerző tartalékát; R2 — a bukott (érvénytelen JSON-os) hívás tokenje is a workflow-ba kerül. */

test("R1: a webes szerzői kísérlet modellje — első az elsődleges, a javítókör a tartalék", () => {
  assert.equal(webAuthorModelForAttempt(0, "gpt-6-luna", "gpt-5.6-terra"), "gpt-6-luna");
  assert.equal(webAuthorModelForAttempt(1, "gpt-6-luna", "gpt-5.6-terra"), "gpt-5.6-terra");
  assert.equal(webAuthorModelForAttempt(2, "gpt-6-luna", "gpt-5.6-terra"), "gpt-5.6-terra");
  assert.equal(webAuthorModelForAttempt(1, "gpt-6-luna", undefined), "gpt-6-luna", "tartalék nélkül az elsődleges marad");
  assert.equal(webAuthorModelForAttempt(1, "gpt-6-luna", "gpt-6-luna"), "gpt-6-luna");
});

test("R1: a webes HTML-út a szerzői providert a kísérlet szerinti modellel hozza létre", () => {
  const src = readFileSync(new URL("../server/studio/web-research-runner.ts", import.meta.url), "utf8");
  assert.match(src, /const model = webAuthorModelForAttempt\(attempts, authorModel, authorFallback\);[\s\S]{0,200}createStudioProvider\(model, PHASE_TIMEOUT_MS, MAX_TOKENS\)/, "a szerzői hívás a kísérlet-függő modellt használja");
  assert.doesNotMatch(src, /createStudioProvider\(authorModel, PHASE_TIMEOUT_MS, MAX_TOKENS\)/, "nincs rögzített szerzőmodell");
});

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
    await assert.rejects(callStepModel(reply('{"title": "x", "sections": [', 20, 10), { step: "author", model: "gpt-6-luna", system: "s", user: "u1" }),
      (error: unknown) => error instanceof StepModelError && /nem érvényes JSON/.test(error.message));
    await callStepModel(reply('{"ok": true}', 5, 5), { step: "author", model: "gpt-5.6-terra", system: "s", user: "u2" });
    await workflowPhase("knowledge"); await workflowPhase("author"); await workflowPhase("gate"); await workflowPhase("publish"); await workflowPhase("readback");
    return { kind: "material" as const, id: "ok" };
  });
  const generate = view.visits.find(v => v.step === "generate")!;
  assert.equal(generate.tokensIn, 25, "a bukott hívás 20 bemeneti tokenje is számít");
  assert.equal(generate.tokensOut, 15);
});
