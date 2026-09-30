import test from "node:test";
import assert from "node:assert/strict";
import { bankResponseFormat, normalizeStrictPacket, strictPacketSchema, strictPatchSchema } from "../server/studio/bank-schema";
import { experiencePacketSchema, openTaskSchema } from "../shared/lesson-experience";
import { callStepModel } from "../server/studio/run-step";
import { callBankPacketModel } from "../server/studio/bank-call";
import type { IAIProvider, AIMessage } from "../server/ai/AIProvider";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* Spec 2026-09-30-utasitasrendszer-rendbetetel (U2b, C8): szigorú JSON-séma a bankcsomagra a közvetlen OpenAI-úton. */

const counts = { methodMin: 2, taskCount: 5, taskMax: 45, quizCount: 10, quizMax: 75, language: false };

test("a szigorú séma strict, a darabszámot a séma kényszeríti, opcionális mező csak nullable alakban", () => {
  const rf = bankResponseFormat(counts, false);
  assert.equal(rf.type, "json_schema");
  assert.equal(rf.json_schema.strict, true);
  const schema = JSON.stringify(rf.json_schema.schema);
  assert.match(schema, /"minItems":5/); assert.match(schema, /"minItems":10/); assert.match(schema, /"maxItems":45/);
  assert.doesNotMatch(schema, /"optional"/);
  assert.match(schema, /"additionalProperties":false/);
  const patch = bankResponseFormat(counts, true);
  assert.equal(patch.json_schema.name, "bank_packet_patch");
  assert.doesNotMatch(JSON.stringify(patch.json_schema.schema).slice(0, 400), /"minItems":5/);
});

test("a szigorú séma tükrözi a helyi sémát: a fixture bankja átmegy rajta (null-ok nélkül), és a null-ok visszaalakulnak", () => {
  const e = standardFusionFixture().experience!;
  const toStrict = (item: Record<string, unknown>, nullables: string[]) => { const o: Record<string, unknown> = { ...item }; delete o.sourceHash; for (const k of nullables) if (!(k in o) || o[k] === undefined) o[k] = null; return o; };
  const packet = {
    methods: e.methods.map((m) => toStrict(m as unknown as Record<string, unknown>, ["options", "correctIndex", "steps"])),
    tasks: e.tasks.map((t) => toStrict(t as unknown as Record<string, unknown>, ["typedAnswers", "requiredDistinct"])),
    quiz: e.quiz.map((q) => ({ ...toStrict(q as unknown as Record<string, unknown>, []), intent: q.intent ?? "recall" })),
    glossary: [],
  };
  const full = strictPacketSchema({ methodMin: 2, taskCount: 1, taskMax: 480, quizCount: 1, quizMax: 960, language: false }).safeParse(packet);
  assert.equal(full.success, true, JSON.stringify(full.success ? [] : full.error.issues.slice(0, 3)));
  assert.equal(strictPatchSchema.safeParse({ methods: [], tasks: [], quiz: [], glossary: [] }).success, true);
  const normalized = normalizeStrictPacket(packet) as { tasks: Array<Record<string, unknown>>; methods: Array<Record<string, unknown>> };
  assert.equal("typedAnswers" in normalized.tasks[0], false);
  assert.equal("options" in normalized.methods.find((m) => m.kind === "sorting")!, false);
  assert.equal(openTaskSchema.safeParse(normalized.tasks[0]).success, true);
  assert.equal(experiencePacketSchema.safeParse({ ...e, ...normalizeStrictPacket({ methods: packet.methods, tasks: packet.tasks, quiz: packet.quiz, glossary: [] }) as object }).success, true);
  const typed = normalizeStrictPacket({ tasks: [{ id: "t", typedAnswers: [{ part: "a", kind: "number", value: "5", unit: null, form: null }] }] }) as { tasks: Array<{ typedAnswers: Array<Record<string, unknown>> }> };
  assert.deepEqual(typed.tasks[0].typedAnswers[0], { part: "a", kind: "number", value: "5" });
});

test("a response_format eljut a szolgáltatóhoz: callStepModel a chat 3. paraméterében adja, a bankhívás csak közvetlen OpenAI-úton", async () => {
  const seen: unknown[] = [];
  const provider: IAIProvider = {
    name: "fixture", model: "gpt-6-luna", isAvailable: async () => true,
    async chat(_m: AIMessage[], _s?: AbortSignal, options?: { responseFormat?: unknown }) { seen.push(options?.responseFormat ?? null); return { content: '{"ok":true}' }; },
    async *streamChat() { yield { type: "done" }; },
  };
  const rf = bankResponseFormat(counts, false);
  await callStepModel(provider, { step: "animator", role: "bank", model: "gpt-6-luna", system: "S", user: "U", responseFormat: rf });
  await callStepModel(provider, { step: "animator", role: "bank", model: "gpt-6-luna", system: "S", user: "U" });
  assert.equal((seen[0] as { type: string }).type, "json_schema");
  assert.equal(seen[1], null);
  await callBankPacketModel(provider, "gpt-6-luna", "S", "U", undefined, { responseFormat: rf });
  await callBankPacketModel(provider, "z-ai/glm-5.3-flash", "S", "U", undefined, { responseFormat: rf });
  assert.equal((seen[2] as { type: string }).type, "json_schema", "közvetlen OpenAI: megy a szigorú séma");
  assert.equal(seen[3], null, "OpenRouter-út: nincs szigorú séma (nem igazolt), marad a JSON-mód + helyi validálás");
});
