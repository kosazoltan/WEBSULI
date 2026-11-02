import test from "node:test";
import assert from "node:assert/strict";
import { bankPacketContract } from "../shared/lesson-experience";
import { SINGLE_RUN_MAX_TOKENS, SINGLE_RUN_PRIMARY_MODEL, SINGLE_RUN_FALLBACK_MODEL } from "../server/studio/single-run/conversation";
import { maxOutputForModel } from "../server/ai/models";
import { TelemetryRecorder, timed } from "../server/studio/single-run/telemetry";
import { telemetryView } from "../shared/run-telemetry";

/* Spec 2026-10-20-bank-kimeneti-keret: a levágott modellválasz megszüntetése — előre megadott kimeneti keret. */

test("a forduló kimeneti korlátja a modellek plafonja (128 000), és nem nagyobb annál", () => {
  assert.equal(SINGLE_RUN_MAX_TOKENS, 128_000);
  for (const model of [SINGLE_RUN_PRIMARY_MODEL, SINGLE_RUN_FALLBACK_MODEL]) {
    const max = maxOutputForModel(model);
    assert.ok(max !== undefined && SINGLE_RUN_MAX_TOKENS <= max, `${model}: ${max}`);
  }
});

test("a bank szerződése előre megadja a csomag méretét és a tételenkénti hosszkeretet", () => {
  const c = bankPacketContract({ sectionIndex: 1, conceptIds: ["a", "b"], methodKinds: ["gate", "myth", "popup"], taskCount: 20, taskTarget: 29, quizCount: 38, quizTarget: 49 });
  assert.match(c, /9\. KIMENETI KERET/);
  assert.match(c, /ez a csomag 29 nyílt feladat \+ 49 kvízkérdés \+ legalább 3 módszer/);
  assert.match(c, /kvízopciónként legfeljebb 1 mondatos magyarázat/);
  assert.match(c, /a JSON-t egyszer írd le/);
});

test("a levágott forduló a telemetriában számít, és a futás nézete mutatja; a nem levágott nem", async () => {
  const rec = new TelemetryRecorder(null, () => 0);
  await timed(rec, "gyakorlóbank", async () => ({ text: "{", model: "claude-opus-5-5", truncated: true, usage: { input: 10, output: 128_000 } }), { fresh: true });
  await timed(rec, "gyakorlóbank", async () => ({ text: "{}", model: "claude-opus-5-5", truncated: false, usage: { input: 10, output: 100 } }), { fresh: true });
  assert.equal(rec.gates.outputTruncated, 1);
  assert.ok(telemetryView(rec.snapshot("claude-opus-5-5")).gates.includes("Levágott modellválasz (kimeneti keret): 1"));
  const old = rec.snapshot("claude-opus-5-5");
  delete (old.gates as { outputTruncated?: number }).outputTruncated;
  assert.ok(!telemetryView(old).gates.some((g) => g.startsWith("Levágott")), "a régi telemetria (mező nélkül) nem mutat sort");
});

test("review #345: a szerződés karakterkeretet is ad; a tartalékmodell tartalomszűrése nem számít levágásnak", async () => {
  const c = bankPacketContract({ sectionIndex: 0, conceptIds: ["a"], methodKinds: ["gate"], taskCount: 1, taskTarget: 2, quizCount: 2, quizTarget: 3 });
  assert.match(c, /≤ 300 karakter/);
  assert.match(c, /≤ 200 karakter/);
  const { openAIClient } = await import("../server/studio/single-run/conversation");
  const make = (reason: string | undefined) => openAIClient({ apiKey: "x", client: { responses: { create: async () => ({ output_text: "{}", status: "incomplete", incomplete_details: reason ? { reason } : null }) } } });
  const filtered = await make("content_filter").complete("s", [{ role: "user", blocks: [{ type: "text", text: "x" }] }] as never);
  assert.equal(filtered.truncated, false, "tartalomszűrés: nem kimeneti korlát");
  const limited = await make("max_output_tokens").complete("s", [{ role: "user", blocks: [{ type: "text", text: "x" }] }] as never);
  assert.equal(limited.truncated, true);
});
