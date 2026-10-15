import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { OpenRouterProvider } from "../server/ai/OpenRouterProvider";
import { ANSWER_KEY_MODEL, OPENROUTER_MODEL_ROUTING } from "../server/ai/models";
import { answerKeyModels } from "../server/studio/answer-key-writer";

/* T2.3 (docs/specs/2026-10-15-tetelgyar-t2-valaszkulcs-tesztek-vegrehajtas.md): a MiniMax M3 max efforttal, a saját szolgáltatóján. */

async function bodyFor(t: TestContext, model: string, reasoningEffort?: "low" | "high", stream = false) {
  let body: Record<string, unknown> | undefined;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    if (stream) {
      const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: "{}" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`;
      return new Response(sse, { headers: { "Content-Type": "text/event-stream" } });
    }
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "{}" }, finish_reason: "stop" }] }), { headers: { "Content-Type": "application/json" } });
  });
  const provider = new OpenRouterProvider({ model, apiKey: "test-placeholder", reasoningEffort, jsonMode: true });
  await provider.chat([{ role: "user", content: "x" }], undefined, stream ? { stream: { idleMs: 5000 } } : undefined);
  return body!;
}

test("a MiniMax M3 kérése: xhigh effort, bekapcsolt gondolkodás, a MiniMax szolgáltató elöl (tartalékkal) — a lépés effortja felülírva", async (t) => {
  assert.equal(ANSWER_KEY_MODEL, "minimax/minimax-m3");
  const body = await bodyFor(t, ANSWER_KEY_MODEL, "low");
  assert.deepEqual(body.reasoning, { effort: "xhigh", enabled: true });
  assert.deepEqual(body.provider, { order: ["Minimax"], allow_fallbacks: true });
});

test("streamelt úton is ugyanez", async (t) => {
  const body = await bodyFor(t, ANSWER_KEY_MODEL, "low", true);
  assert.deepEqual(body.reasoning, { effort: "xhigh", enabled: true });
  assert.deepEqual(body.provider, { order: ["Minimax"], allow_fallbacks: true });
});

test("bejegyzés nélküli modell kérése változatlan (csak a régi effort, szolgáltató-mező nélkül)", async (t) => {
  const body = await bodyFor(t, "z-ai/glm-5.3-flash", "low");
  assert.deepEqual(body.reasoning, { effort: "low" });
  assert.equal(body.provider, undefined);
  const plain = await bodyFor(t, "deepseek/deepseek-v4-flash");
  assert.equal(plain.reasoning, undefined);
  assert.equal(Object.keys(OPENROUTER_MODEL_ROUTING).length, 1);
});

test("a tesztíró lánca: MiniMax M3 elöl, utána a tartalék; azonos modell egyszer", () => {
  assert.deepEqual(answerKeyModels(ANSWER_KEY_MODEL, "deepseek/deepseek-v4-flash"), ["minimax/minimax-m3", "deepseek/deepseek-v4-flash"]);
  assert.deepEqual(answerKeyModels(ANSWER_KEY_MODEL, ANSWER_KEY_MODEL), ["minimax/minimax-m3"]);
  assert.deepEqual(answerKeyModels(ANSWER_KEY_MODEL, undefined), ["minimax/minimax-m3"]);
});
