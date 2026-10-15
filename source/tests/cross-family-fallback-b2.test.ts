import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { openAiPartsToClaude } from "../server/studio/claude-vision";
import { callScopeModel } from "../server/studio/one-step";

/*
 * Spec 2026-10-14-tartalek-b-szelet (B2, tulajdonosi döntés): a tantárgy-felismerés és a kivonatoló ellentétes családú
 * tartaléka — OpenAI → Opus 5.5 (medium), ugyanazokkal a forrásrészekkel (kép, PDF, szöveg) Claude-blokkként.
 */

function withEnv(t: TestContext, values: Record<string, string>) {
  const before = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}
const PNG = "data:image/png;base64,iVBORw0KGgo=";
const PDF = "data:application/pdf;base64,JVBERi0xLjQ=";

test("openAiPartsToClaude: szöveg → text, kép → image, PDF → document; nem data URL → hiba (nincs csendes kihagyás)", () => {
  const blocks = openAiPartsToClaude([
    { type: "text", text: "Forrás" },
    { type: "image_url", image_url: { url: PNG, detail: "high" } },
    { type: "file", file: { filename: "lap.pdf", file_data: PDF } },
  ]);
  assert.deepEqual(blocks[0], { type: "text", text: "Forrás" });
  assert.deepEqual(blocks[1], { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } });
  assert.deepEqual(blocks[2], { type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0xLjQ=" } });
  assert.throws(() => openAiPartsToClaude([{ type: "image_url", image_url: { url: "https://example.org/kep.png" } }]), /nem base64 data URL/);
});

test("callScopeModel: a gpt-6-luna hibájánál az Opus 5.5 kapja ugyanazt a képet, medium efforttal", async t => {
  withEnv(t, { AI_INTEGRATIONS_OPENAI_API_KEY: "test-placeholder", AI_INTEGRATIONS_ANTHROPIC_API_KEY: "test-placeholder" });
  const calls: Array<{ host: string; body: Record<string, unknown> }> = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    const host = new URL(String(url)).host;
    calls.push({ host, body: JSON.parse(String(init?.body)) });
    if (host === "api.openai.com") return new Response(JSON.stringify({ error: { message: "server error" } }), { status: 500, headers: { "Content-Type": "application/json" } });
    const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
    return new Response([
      ev("message_start", { message: { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }),
      ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
      ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: '{"subject":"Matematika","classroom":6}' } }),
      ev("content_block_stop", { index: 0 }),
      ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 5 } }),
      ev("message_stop", {}),
    ].join(""), { headers: { "Content-Type": "text/event-stream" } });
  });
  const text = await callScopeModel([{ name: "lap.png", kind: "image", content: PNG }], "gpt-6-luna");
  assert.equal(text, '{"subject":"Matematika","classroom":6}');
  const claude = calls.find((c) => c.host === "api.anthropic.com");
  assert.ok(claude, "a tartalék az Anthropicra ment");
  assert.ok(calls.some((c) => c.host === "api.openai.com"), "előbb az elsődleges");
  assert.equal(claude.body.model, "claude-opus-5-5");
  assert.deepEqual(claude.body.output_config, { effort: "medium" });
  const content = (claude.body.messages as Array<{ content: Array<{ type: string }> }>)[0].content;
  assert.ok(content.some((b) => b.type === "image"), "a kép a tartalékhoz is eljut");
});

// Review #218: a kimeneti hiba is a tartalék-határon belül — 200-as, de használhatatlan vagy csonka válasz is tartalékot indít.
for (const [label, openAiReply] of [
  ["JSON nélküli szöveg", { choices: [{ index: 0, message: { role: "assistant", content: "Ez egy matematika lap." }, finish_reason: "stop" }] }],
  ["csonka (hosszkorlát)", { choices: [{ index: 0, message: { role: "assistant", content: '{"subject":"Mat' }, finish_reason: "length" }] }],
] as const) {
  test(`review #218: callScopeModel — ${label} elsődleges válasz után az Opus 5.5 tartalék dönt`, async t => {
    withEnv(t, { AI_INTEGRATIONS_OPENAI_API_KEY: "test-placeholder", AI_INTEGRATIONS_ANTHROPIC_API_KEY: "test-placeholder" });
    const hosts: string[] = [];
    t.mock.method(globalThis, "fetch", async (url: unknown) => {
      const host = new URL(String(url)).host;
      hosts.push(host);
      if (host === "api.openai.com") return new Response(JSON.stringify({ id: "x", object: "chat.completion", created: 1, model: "gpt-6-luna", ...openAiReply }), { headers: { "Content-Type": "application/json" } });
      const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
      return new Response([
        ev("message_start", { message: { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }),
        ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
        ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: '{"subject":"Matematika","classroom":6}' } }),
        ev("content_block_stop", { index: 0 }),
        ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 5 } }),
        ev("message_stop", {}),
      ].join(""), { headers: { "Content-Type": "text/event-stream" } });
    });
    const text = await callScopeModel([{ name: "lap.png", kind: "image", content: PNG }], "gpt-6-luna");
    assert.equal(text, '{"subject":"Matematika","classroom":6}');
    assert.deepEqual([...new Set(hosts)], ["api.openai.com", "api.anthropic.com"]);
  });
}

test("review #218: scopeAnswerUsable — csak tantárgy + szám osztály JSON használható", async () => {
  const { scopeAnswerUsable } = await import("../server/studio/one-step");
  assert.equal(scopeAnswerUsable('Itt: {"subject":"Biológia","classroom":7}'), true);
  assert.equal(scopeAnswerUsable('{"subject":"","classroom":7}'), false);
  assert.equal(scopeAnswerUsable('{"subject":"Biológia"}'), false);
  assert.equal(scopeAnswerUsable("nincs json"), false);
  assert.equal(scopeAnswerUsable('{"subject":"Bio'), false);
});

test("kivonatoló-tartalék: kimerült OpenAI-keretnél (OpenRouter) a `reasoning.effort`, közvetlen OpenAI-n a `reasoning_effort` megy", async () => {
  // A kivonatoló belső függvénye (callExtractorModel) nincs exportálva — a meglévő R1-minta szerint forrás-szinten rögzítve.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../server/studio/run-extraction.ts", import.meta.url), "utf8");
  assert.match(src, /\.\.\.\(effort \? \(connection\.vendor === "openrouter" \? \{ reasoning: \{ effort \} \} : \{ reasoning_effort: effort \}\) : \{\}\)/);
});
