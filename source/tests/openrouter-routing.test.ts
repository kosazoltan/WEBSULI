import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { OpenRouterProvider } from "../server/ai/OpenRouterProvider";

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

// S4b (docs/specs/2026-10-16-egy-futas.md): a MiniMax M3 tesztíró és a modellenkénti OpenRouter-útválasztás (ANSWER_KEY_MODEL, OPENROUTER_MODEL_ROUTING) kivezetve — két esete törölve.

test("bejegyzés nélküli modell kérése változatlan (csak a régi effort, szolgáltató-mező nélkül)", async (t) => {
  const body = await bodyFor(t, "z-ai/glm-5.3-flash", "low");
  assert.deepEqual(body.reasoning, { effort: "low" });
  assert.equal(body.provider, undefined);
  const plain = await bodyFor(t, "deepseek/deepseek-v4-flash");
  assert.equal(plain.reasoning, undefined);
  // S4b (docs/specs/2026-10-16-egy-futas.md): a modellenkénti útválasztó tábla (OPENROUTER_MODEL_ROUTING) kivezetve — a méretének ellenőrzése törölve.
});

