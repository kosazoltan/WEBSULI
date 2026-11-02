import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEffort } from "../server/studio/single-run/engine";
import { anthropicClient, openAIClient, SINGLE_RUN_EFFORT } from "../server/studio/single-run/conversation";

// docs/specs/2026-11-02-ellenorzes-effort-ab.md

test("checkEffort: 'low' és ' LOW ' → low; hiányzó / üres / elgépelt → medium (biztonságos default)", () => {
  assert.equal(checkEffort({ STUDIO_CHECK_EFFORT: "low" } as NodeJS.ProcessEnv), "low");
  assert.equal(checkEffort({ STUDIO_CHECK_EFFORT: " LOW " } as NodeJS.ProcessEnv), "low");
  assert.equal(checkEffort({} as NodeJS.ProcessEnv), "medium");
  assert.equal(checkEffort({ STUDIO_CHECK_EFFORT: "" } as NodeJS.ProcessEnv), "medium");
  assert.equal(checkEffort({ STUDIO_CHECK_EFFORT: "alacsony" } as NodeJS.ProcessEnv), "medium");
});

function anthropicCapture() {
  const params: Record<string, unknown>[] = [];
  const client = {
    messages: {
      stream(p: Record<string, unknown>) {
        params.push(p);
        return { finalMessage: async () => ({ content: [{ type: "text", text: "{}" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }) };
      },
    },
  };
  return { params, client };
}

test("E1/E2 anthropicClient: effort opcióval low, nélküle a mai medium megy az output_config-ba", async () => {
  const low = anthropicCapture();
  await anthropicClient({ client: low.client as never, effort: "low" }).complete("rendszer", [{ role: "user", blocks: [{ type: "text", text: "kérés" }] }]);
  assert.equal((low.params[0].output_config as { effort: string }).effort, "low");

  const def = anthropicCapture();
  await anthropicClient({ client: def.client as never }).complete("rendszer", [{ role: "user", blocks: [{ type: "text", text: "kérés" }] }]);
  assert.equal((def.params[0].output_config as { effort: string }).effort, SINGLE_RUN_EFFORT);
});

test("E1/E2 openAIClient (tartalék): effort opcióval low, nélküle medium a reasoning.effort-ban", async () => {
  const params: Record<string, unknown>[] = [];
  const client = { responses: { create: async (p: Record<string, unknown>) => { params.push(p); return { output_text: "{}", status: "completed" }; } } };
  await openAIClient({ client: client as never, effort: "low" }).complete("rendszer", [{ role: "user", blocks: [{ type: "text", text: "kérés" }] }]);
  assert.equal((params[0].reasoning as { effort: string }).effort, "low");
  await openAIClient({ client: client as never }).complete("rendszer", [{ role: "user", blocks: [{ type: "text", text: "kérés" }] }]);
  assert.equal((params[1].reasoning as { effort: string }).effort, SINGLE_RUN_EFFORT);
});
