import assert from "node:assert/strict";
import test from "node:test";

import { callStepModel, StepModelError } from "../server/studio/run-step";
import type { AIResponse, IAIProvider } from "../server/ai/AIProvider";

/**
 * LS-2c — the call layer between the state machine and the provider.
 *
 * One narrow contract, tested with a stub provider (no network): the runner sends the
 * prompt, strips code fences from the answer, parses JSON, and fails closed on anything
 * that is not parseable. What the caller must NEVER see is a half-built step object —
 * the pipeline treats a parse failure as `error`, and the admin sees the raw text's
 * length, never the raw text (prompt-injection hygiene).
 */

function stubProvider(response: string | (() => never), usage?: AIResponse["usage"]): IAIProvider {
  return {
    name: "stub",
    model: "stub/model",
    chat: async () => {
      if (typeof response === "function") response();
      return { content: response as string, usage: usage ?? { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    },
    isAvailable: async () => true,
  } as unknown as IAIProvider;
}

test("a JSON válasz parse-olódik", async () => {
  const out = await callStepModel(
    stubProvider('{"sections":[]}'),
    { step: "pedagogue", model: "m/1", system: "S", user: "U" },
  );

  assert.deepEqual(out.json, { sections: [] });
  assert.equal(out.usage?.totalTokens, 15);
});

test("a kód-keretes válasz is parse-olódik (fence-strip)", async () => {
  const out = await callStepModel(
    stubProvider('```json\n{"ok": true}\n```'),
    { step: "lektor", model: "m/2", system: "S", user: "U" },
  );

  assert.deepEqual(out.json, { ok: true });
});

test("érvénytelen JSON fail-closed: StepModelError", async () => {
  await assert.rejects(
    callStepModel(stubProvider("ez nem JSON"), { step: "author", model: "m/3", system: "S", user: "U" }),
    StepModelError,
  );
});

test("a provider hibája is StepModelError lesz", async () => {
  const broken = stubProvider(() => {
    throw new Error("rate limited");
  });

  await assert.rejects(
    callStepModel(broken, { step: "author", model: "m/4", system: "S", user: "U" }),
    (e: unknown) => e instanceof StepModelError && /rate limited/.test(String((e as Error).cause)),
  );
});

test("üres válasz fail-closed", async () => {
  await assert.rejects(
    callStepModel(stubProvider("   "), { step: "pedagogue", model: "m/5", system: "S", user: "U" }),
    StepModelError,
  );
});
