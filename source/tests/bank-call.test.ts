import assert from "node:assert/strict";
import test from "node:test";
import { AIProviderTimeoutError, type AIResponse, type IAIProvider } from "../server/ai/AIProvider";
import { BANK_RESCUE_MODEL, FALLBACK_MODELS, resolveStudioModel } from "../server/ai/models";
import { bankModelForAttempt, bankProviderStep, callBankPacketModel } from "../server/studio/bank-call";
import { PACKET_ATTEMPTS, RetryableBankCallError } from "../server/studio/experience-builder";
import { StepModelError } from "../server/studio/run-step";

function provider(chat: () => Promise<AIResponse>): IAIProvider {
  return { name: "fake", model: "fake", chat, async *stream() { /* not used */ } } as unknown as IAIProvider;
}
const reply = (content: string, finishReason = "stop"): AIResponse => ({ content, finishReason } as AIResponse);

test("spec 2026-09-25: a bankcsomag kísérletenként a bank-, tartalék-, majd mentőmodellen fut", () => {
  for (let attempt = 0; attempt < PACKET_ATTEMPTS - 1; attempt++) assert.equal(bankModelForAttempt(attempt), resolveStudioModel("bank"));
  assert.equal(bankModelForAttempt(PACKET_ATTEMPTS - 1), FALLBACK_MODELS.bank ?? resolveStudioModel("bank"));
  assert.equal(bankModelForAttempt(PACKET_ATTEMPTS), BANK_RESCUE_MODEL);
  assert.equal(bankProviderStep(0), "bank");
  assert.equal(bankProviderStep(PACKET_ATTEMPTS - 1), "bank");
  assert.equal(bankProviderStep(PACKET_ATTEMPTS), "author");
});

test("spec 2026-09-25: modell-kimeneti hiba újrapróbálható, szolgáltatói hiba nem", async () => {
  const ok = await callBankPacketModel(provider(async () => reply('{"tasks":[]}')), "m", "sys-ok", "user-ok");
  assert.deepEqual(ok.json, { tasks: [] });
  for (const [label, chat] of [
    ["hosszkorlát", async () => reply('{"tasks":[', "length")],
    ["üres", async () => reply("")],
    ["nem JSON", async () => reply("ez nem json")],
  ] as const) {
    await assert.rejects(callBankPacketModel(provider(chat), "m", `sys-${label}`, `user-${label}`), (error: unknown) =>
      error instanceof RetryableBankCallError && error.message.startsWith("m: ") && error.cause instanceof StepModelError, label);
  }
  // A deadline abort surfaces as a StepModelError whose cause is a timeout → retryable, marked.
  const slow = provider(async () => { throw new AIProviderTimeoutError("fake", 240_000); });
  await assert.rejects(callBankPacketModel(slow, "m", "sys-slow", "user-slow"), (error: unknown) =>
    error instanceof RetryableBankCallError && /időtúllépés/.test(error.message));
  const outage = provider(async () => { throw new Error("503 Service Unavailable"); });
  await assert.rejects(callBankPacketModel(outage, "m", "sys-outage", "user-outage"), (error: unknown) =>
    error instanceof StepModelError && !(error instanceof RetryableBankCallError));
});
