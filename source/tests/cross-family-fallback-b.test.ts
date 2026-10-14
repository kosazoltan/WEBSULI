import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { IAIProvider } from "../server/ai/AIProvider";
import { independentFallbackFor } from "../server/ai/models";
import { createStudioStepProvider } from "../server/ai/studio-provider";
import { callStepModelWithFallback, StepModelError } from "../server/studio/run-step";

/*
 * Spec 2026-10-14-tartalek-b-szelet (tulajdonosi döntés): a ma tartalék nélküli támogató hívások ellentétes családú tartalékot
 * kapnak; ELLENŐRZŐ szerepnél, ha a tartalék az ellenőrzött tartalom családjába esne, a harmadik család (Qwen 0902, high).
 */

function withEnv(t: TestContext, values: Record<string, string>) {
  const before = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}

test("independentFallbackFor: író szerep → ellentétes család; ellenőrző szerep a saját családjába nem esik → Qwen", () => {
  assert.equal(independentFallbackFor("claude-opus-5-5"), "gpt-6.1-sol");
  assert.equal(independentFallbackFor("gpt-6-luna"), "claude-opus-5-5");
  // A bank-ellenőr (Opus) a GPT-bankot ellenőrzi: a GPT-tartalék kiesik → harmadik család.
  assert.equal(independentFallbackFor("claude-opus-5-5", ["gpt-5.6-luna"]), "qwen/qwen3.8-max-0902");
  // Claude-szerzős leckét ellenőriz: a GPT-tartalék független.
  assert.equal(independentFallbackFor("claude-opus-5-5", ["claude-opus-5-5"]), "gpt-6.1-sol");
  // Ha a Qwen is ütközne, nincs tartalék; más családú elsődlegesnek nincs ellentétes tartaléka.
  assert.equal(independentFallbackFor("claude-opus-5-5", ["gpt-5.6-luna", "qwen/qwen3.8-max-prime"]), undefined);
  assert.equal(independentFallbackFor("z-ai/glm-5.3-flash"), undefined);
});

const stub = (log: Array<[string, boolean | undefined]>, failing: ReadonlySet<string>) =>
  (model: string, _step?: string, opts?: { fallback?: boolean }): IAIProvider => ({
    name: "stub", model, isAvailable: async () => true,
    chat: async () => {
      log.push([model, opts?.fallback]);
      if (failing.has(model)) throw new Error("[stub] 500 server error");
      return { content: '{"ok":true}', finishReason: "stop" };
    },
  } as unknown as IAIProvider);

test("callStepModelWithFallback: az elsődleges hibája után egyszer a tartalék, { fallback: true }-val, a tényleges modellel", async () => {
  const log: Array<[string, boolean | undefined]> = [];
  const result = await callStepModelWithFallback(
    { step: "lektor", policy: "visuals", role: "bank-verifier", model: "claude-opus-5-5", system: "S", user: "U" },
    { providerFactory: stub(log, new Set(["claude-opus-5-5"])), providerStep: "visuals", keyConfigured: () => true, checkedModels: ["gpt-5.6-luna"] },
  );
  assert.deepEqual(result.json, { ok: true });
  assert.equal(result.model, "qwen/qwen3.8-max-0902");
  assert.deepEqual(log, [["claude-opus-5-5", undefined], ["qwen/qwen3.8-max-0902", true]]);
});

test("callStepModelWithFallback: sikeres elsődlegesnél nincs tartalék; kulcs nélkül és megszakításnál az eredeti hiba marad", async () => {
  const log: Array<[string, boolean | undefined]> = [];
  const ok = await callStepModelWithFallback({ step: "author", role: "author", model: "claude-opus-5-5", system: "S", user: "U" }, { providerFactory: stub(log, new Set()), keyConfigured: () => true });
  assert.equal(ok.model, "claude-opus-5-5");
  assert.equal(log.length, 1);
  log.length = 0;
  await assert.rejects(callStepModelWithFallback({ step: "author", role: "author", model: "claude-opus-5-5", system: "S", user: "U" }, { providerFactory: stub(log, new Set(["claude-opus-5-5"])), keyConfigured: (m) => m !== "gpt-6.1-sol" }), StepModelError);
  assert.equal(log.length, 1, "kulcs nélküli tartalék nem indul");
  log.length = 0;
  const controller = new AbortController();
  const aborting = (model: string): IAIProvider => ({ name: "stub", model, isAvailable: async () => true, chat: async () => { controller.abort(); throw new Error("[stub] 500"); } } as unknown as IAIProvider);
  await assert.rejects(callStepModelWithFallback({ step: "author", role: "author", model: "claude-opus-5-5", system: "S", user: "U" }, { providerFactory: aborting, keyConfigured: () => true, signal: controller.signal }));
});

test("a Qwen tartalék a saját effortján (high) fut, nem a lépés szabályzatán (visuals: medium)", async t => {
  withEnv(t, { OPENROUTER_API_KEY: "test-placeholder" });
  let body: Record<string, unknown> | undefined;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "{}" }, finish_reason: "stop" }] }), { headers: { "Content-Type": "application/json" } });
  });
  await createStudioStepProvider("qwen/qwen3.8-max-0902", "visuals", { fallback: true }).chat([{ role: "user", content: "x" }]);
  assert.deepEqual(body?.reasoning, { effort: "high" });
});

// Review #217: a szerzőség csak az ELFOGADOTT tanítás modellje; a fogalomjavítás bankja a javítás tényleges szerzőjén épül.
// (Mindkét függvény adatbázist ér el — a meglévő R1-minta szerint forrás-szinten rögzítve.)
test("review #217: szerkezett javításnál a legutóbbi tanítás-író hívás a szerző; fogalomjavításnál a bank a tényleges szerzőn", async () => {
  const { readFileSync } = await import("node:fs");
  const si = readFileSync(new URL("../server/studio/structured-improvement.ts", import.meta.url), "utf8");
  assert.match(si, /if \(step === "author" && role === "repair"\) teachingAuthor = result\.model;/, "csak a tanítás-író hívás, felülírva (nem gyűjtve)");
  assert.match(si, /lektorChainFor\(teachingAuthor \? \[teachingAuthor\] : undefined\)/);
  assert.doesNotMatch(si, /authors\.add\(/, "elutasított kör nem marad szerző");
  const sr = readFileSync(new URL("../server/studio/step-runner.ts", import.meta.url), "utf8");
  assert.match(sr, /const bankAuthor = fixAuthor \?\? model;\s*const bankProvider = bankAuthor === model \? provider : providerFactory\(bankAuthor, undefined, \{ fallback: true \}\);/);
  assert.match(sr, /callBankPacketModel\(bankProvider, bankAuthor,/);
});
