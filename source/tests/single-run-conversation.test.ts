import test from "node:test";
import assert from "node:assert/strict";
import { LessonConversation, anthropicClient, openAIClient, isUnavailable, SINGLE_RUN_PRIMARY_MODEL, SINGLE_RUN_FALLBACK_MODEL, type ModelClient, type Turn } from "../server/studio/single-run/conversation";

/* docs/specs/2026-10-16-egy-futas.md (A, S2): egy beszélgetés, egy modell — Opus 5.5 medium, tartalék GPT-6.1 Sol medium a teljes átirattal. */

const PNG = "data:image/png;base64,iVBORw0KGgo=";

function fakeClient(model: string, script: Array<string | Error>): ModelClient & { seen: Turn[][] } {
  const seen: Turn[][] = [];
  return {
    model, seen,
    async complete(_system, turns) {
      seen.push(structuredClone(turns));
      const next = script.shift();
      if (next instanceof Error) throw next;
      return { text: next ?? "", model, truncated: false };
    },
  };
}
const unavailable = () => Object.assign(new Error("Overloaded"), { status: 529 });

test("a modellek: Opus 5.5 elsődleges, GPT-6.1 Sol tartalék", () => {
  assert.equal(SINGLE_RUN_PRIMARY_MODEL, "claude-opus-5-5");
  assert.equal(SINGLE_RUN_FALLBACK_MODEL, "gpt-6.1-sol");
});

test("egy beszélgetés: minden forduló a korábbiakhoz fűződik (nincs új, átadott kontextus)", async () => {
  const primary = fakeClient("claude-opus-5-5", ["térkép", "terv"]);
  const conv = new LessonConversation("RENDSZER", primary, null);
  await conv.send([{ type: "text", text: "1. állomás" }]);
  await conv.send([{ type: "text", text: "2. állomás" }]);
  assert.deepEqual(primary.seen[1].map((t) => [t.role, t.blocks[0].type === "text" ? t.blocks[0].text : "?"]),
    [["user", "1. állomás"], ["assistant", "térkép"], ["user", "2. állomás"]]);
  assert.equal(conv.state().turns.length, 4);
});

test("elérhetetlen Opus → GPT-6.1 Sol a TELJES átirattal, és utána végig a tartalék", async () => {
  const primary = fakeClient("claude-opus-5-5", ["térkép", unavailable(), unavailable()]);
  const fallback = fakeClient("gpt-6.1-sol", ["terv", "lecke"]);
  const events: string[] = [];
  const conv = new LessonConversation("R", primary, fallback, { onFallback: (r) => events.push(r) });
  await conv.send([{ type: "text", text: "1" }]);
  const reply = await conv.send([{ type: "text", text: "2" }]);
  assert.equal(reply.model, "gpt-6.1-sol");
  assert.equal(fallback.seen[0].length, 3, "a tartalék a teljes eddigi beszélgetést kapja (1, térkép, 2)");
  await conv.send([{ type: "text", text: "3" }]);
  assert.equal(primary.seen.length, 3, "váltás után az elsődleges nem hívódik");
  assert.equal(conv.state().switchedToFallback, true);
  assert.match(events[0], /claude-opus-5-5 nem elérhető .* gpt-6.1-sol viszi tovább/);
});

test("nem elérhetőségi hiba (pl. hibás kérés) → nincs váltás, a forduló kivehető és újraküldhető", async () => {
  const primary = fakeClient("claude-opus-5-5", [Object.assign(new Error("bad request"), { status: 400 }), "ok"]);
  const fallback = fakeClient("gpt-6.1-sol", []);
  const conv = new LessonConversation("R", primary, fallback);
  await assert.rejects(conv.send([{ type: "text", text: "x" }]), /bad request/);
  assert.equal(conv.state().turns.length, 0, "a sikertelen forduló nem marad bent");
  assert.equal((await conv.send([{ type: "text", text: "x" }])).text, "ok");
  assert.equal(fallback.seen.length, 0);
});

test("kulcs nélküli elsődleges → a tartalékkal indul; mentett állapotból visszatölthető", async () => {
  const fallback = fakeClient("gpt-6.1-sol", ["a", "b"]);
  const conv = new LessonConversation("R", null, fallback);
  assert.equal(conv.model, "gpt-6.1-sol");
  await conv.send([{ type: "text", text: "1" }]);
  const restored = new LessonConversation("R", fakeClient("claude-opus-5-5", []), fallback, { state: conv.state() });
  assert.equal(restored.model, "gpt-6.1-sol", "a váltás a folytatásban is megmarad");
  await restored.send([{ type: "text", text: "2" }]);
  assert.equal(fallback.seen[1].length, 3);
  assert.throws(() => new LessonConversation("R", null, null), /kulcs hiányzik/);
});

test("isUnavailable: 401/404/429/5xx/529 és hálózat igen; 400 nem", () => {
  for (const status of [401, 403, 404, 408, 429, 500, 529]) assert.equal(isUnavailable({ status }), true, String(status));
  assert.equal(isUnavailable({ status: 400 }), false);
  assert.equal(isUnavailable(new Error("fetch failed")), true);
  assert.equal(isUnavailable(new Error("JSON parse")), false);
});

test("Anthropic-kliens: medium effort, adaptív gondolkodás, gyorsítótár, forrás natív blokkként, szöveges forrás szövegként", async () => {
  let params: Record<string, unknown> | undefined;
  const client = anthropicClient({ client: { messages: { stream: (p) => { params = p as unknown as Record<string, unknown>; return { finalMessage: async () => ({
    content: [{ type: "thinking", thinking: "…", signature: "s" }, { type: "text", text: "{\"ok\":true}" }], stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 90, cache_creation_input_tokens: 0 } }) as never }; } } } });
  const reply = await client.complete("R", [{ role: "user", blocks: [{ type: "source", file: { name: "a.png", kind: "image", content: PNG } },
    { type: "source", file: { name: "b.txt", kind: "text", content: "Forrásszöveg." } }, { type: "text", text: "Olvasd be." }] }]);
  assert.equal(reply.text, "{\"ok\":true}");
  assert.equal(reply.usage?.cachedInput, 90);
  assert.equal(params?.model, "claude-opus-5-5");
  assert.deepEqual(params?.output_config, { effort: "medium" });
  assert.deepEqual(params?.thinking, { type: "adaptive" });
  // Dokumentált specváltozás (docs/specs/2026-10-19-eroforras-s1.md): 1 órás TTL — a körök gyakran 5 percnél hosszabbak.
  assert.deepEqual(params?.cache_control, { type: "ephemeral", ttl: "1h" });
  const content = (params?.messages as Array<{ content: Array<{ type: string; text?: string }> }>)[0].content;
  assert.deepEqual(content.map((c) => c.type), ["image", "text", "text"]);
  assert.match(content[1].text ?? "", /FORRÁS \(b\.txt\):\nForrásszöveg\./);
});

test("OpenAI-kliens (tartalék): Responses API, medium effort, a forráskép input_image-ként, az előző válasz assistant-ként", async () => {
  let body: Record<string, unknown> | undefined;
  const client = openAIClient({ client: { responses: { create: async (p) => { body = p; return { output_text: "kész", status: "completed", usage: { input_tokens: 3, output_tokens: 1 } }; } } } });
  const reply = await client.complete("R", [
    { role: "user", blocks: [{ type: "source", file: { name: "a.png", kind: "image", content: PNG } }, { type: "text", text: "1" }] },
    { role: "assistant", blocks: [{ type: "text", text: "térkép" }] },
    { role: "user", blocks: [{ type: "text", text: "2" }] },
  ]);
  assert.equal(reply.text, "kész");
  assert.equal(body?.model, "gpt-6.1-sol");
  assert.deepEqual(body?.reasoning, { effort: "medium" });
  assert.equal(body?.instructions, "R");
  const input = body?.input as Array<{ role: string; content: unknown }>;
  assert.deepEqual(input.map((m) => m.role), ["user", "assistant", "user"]);
  assert.equal((input[0].content as Array<{ type: string }>)[0].type, "input_image");
  assert.equal(input[1].content, "térkép");
});

// Review #259
test("a tartalék failed állapotú válasza hiba (nem üres forduló); az onUsage hibája nem rontja az átiratot; üres kulcs = hiányzó", async () => {
  const failing = openAIClient({ client: { responses: { create: async () => ({ output_text: "", status: "failed" }) } } });
  await assert.rejects(failing.complete("R", [{ role: "user", blocks: [{ type: "text", text: "x" }] }]), /failed/);
  const primary = fakeClient("claude-opus-5-5", ["egy", "kettő"]);
  const conv = new LessonConversation("R", primary, null, { onUsage: () => { throw new Error("metrika"); } });
  await conv.send([{ type: "text", text: "1" }]);
  await conv.send([{ type: "text", text: "2" }]);
  assert.deepEqual(conv.state().turns.map((t) => t.role), ["user", "assistant", "user", "assistant"]);
  const { createLessonConversation } = await import("../server/studio/single-run/conversation");
  assert.equal(createLessonConversation("R", {}, { AI_INTEGRATIONS_ANTHROPIC_API_KEY: "  ", AI_INTEGRATIONS_OPENAI_API_KEY: "", OPENAI_API_KEY: "x" }).model, "gpt-6.1-sol");
});

test("docx: a kinyert szöveg megy a modellnek, nem a base64 tartalom", async () => {
  let params: Record<string, unknown> | undefined;
  const client = anthropicClient({ client: { messages: { stream: (p) => { params = p as unknown as Record<string, unknown>; return { finalMessage: async () => ({
    content: [{ type: "text", text: "{}" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }) as never }; } } } });
  await client.complete("R", [{ role: "user", blocks: [{ type: "source", file: { name: "a.docx", kind: "docx", content: "data:application/zip;base64,UEsDBA==", extractedText: "A docx szövege." } }] }]);
  const text = (params?.messages as Array<{ content: Array<{ text?: string }> }>)[0].content[0].text ?? "";
  assert.match(text, /A docx szövege\./);
  assert.doesNotMatch(text, /UEsDBA/);
});
