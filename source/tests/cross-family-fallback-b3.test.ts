import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createStudioProvider, crossFamilyFallbackOptions } from "../server/ai/studio-provider";
import { LEGACY_MODELS } from "../server/ai/models";

/*
 * Spec 2026-10-14-tartalek-b-szelet (B3a, tulajdonosi döntés): HTML-modernizálás és kvízgenerátor ellentétes családú tartaléka
 * (Claude → GPT-6.1 Sol, medium) — a régi stream-úton is ténylegesen kimegy az effort.
 */

function withEnv(t: TestContext, values: Record<string, string>) {
  const before = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}

test("a HTML-modernizálás láncának tartaléka GPT-6.1 Sol, és a régi streamChat-út medium effortot küld", async t => {
  // Spec-változás 2026-10-16 (docs/specs/2026-10-16-egy-futas.md, S4a, tulajdonosi döntés): csak Opus 5.5 és GPT-6.1 Sol marad. A tartalék továbbra is az ellentétes családú GPT-6.1 Sol.
  assert.deepEqual([...LEGACY_MODELS.improve], ["claude-opus-5-5", "gpt-6.1-sol"]);
  withEnv(t, { AI_INTEGRATIONS_OPENAI_API_KEY: "test-placeholder" });
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const chunk = (o: object) => `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 1, model: "gpt-6.1-sol", ...o })}\n\n`;
    return new Response(chunk({ choices: [{ index: 0, delta: { content: "<html>" }, finish_reason: "stop" }] }) + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
  });
  for (const fallback of [true, false]) {
    const provider = createStudioProvider("gpt-6.1-sol", 900000, 64000, crossFamilyFallbackOptions("gpt-6.1-sol", fallback));
    for await (const _chunk of provider.streamChat([{ role: "user", content: "x" }])) { /* drain */ }
  }
  assert.equal(bodies[0].reasoning_effort, "medium", "tartalékként medium");
  assert.equal(bodies[1].reasoning_effort, undefined, "tartalék-jelzés nélkül a kérés bájtra a régi");
  const improve = readFileSync(new URL("../server/improveAsync.ts", import.meta.url), "utf8");
  assert.match(improve, /createStudioProvider\(model, 900000, 64000, crossFamilyFallbackOptions\(model, modelIndex > 0\)\)/);
});

// Review #219: futtatott teszt (nem forrás-minta) — a tartalék-határon belül a szolgáltatói ÉS a kimeneti hiba is.
test("quizItemsWithFallback: szolgáltatói hiba, hibás JSON, nem tömb és üres tömb is a tartalékot indítja; tartalék nélkül az eredeti hiba", async () => {
  const { quizItemsWithFallback } = await import("../server/gameQuizGeneratorService");
  const good = async () => '```json\n[{"q":"Mennyi 2+2?"}]\n```';
  for (const primary of [
    async () => { throw new Error("[Claude] 529 overloaded"); },
    async () => '[{"q":"csonka',
    async () => '{"q":"nem tömb"}',
    async () => "[]",
  ]) {
    let fallbacks = 0;
    const items = await quizItemsWithFallback(primary, async () => { fallbacks++; return good(); }, () => undefined);
    assert.deepEqual(items, [{ q: "Mennyi 2+2?" }]);
    assert.equal(fallbacks, 1);
  }
  let fallbacks = 0;
  assert.deepEqual(await quizItemsWithFallback(good, async () => { fallbacks++; return "[]"; }), [{ q: "Mennyi 2+2?" }]);
  assert.equal(fallbacks, 0, "sikeres elsődlegesnél nincs tartalék");
  await assert.rejects(quizItemsWithFallback(async () => "nem json", undefined), /JSON-parse/);
  await assert.rejects(quizItemsWithFallback(async () => "nem json", async () => "[]"), /üres tömb/, "a tartalék hibája is látszik");
});

test("a HTML-modernizálás minden nem-túlterheléses szolgáltatói hibánál is a tartalékra vált (megszakítás után nem)", () => {
  // Az improve-folyamat adatbázist ér el — a meglévő R1-minta szerint forrás-szinten rögzítve.
  const improve = readFileSync(new URL("../server/improveAsync.ts", import.meta.url), "utf8");
  assert.match(improve, /if \(!controller\.signal\.aborted && currentModelIndex < MODEL_CHAIN\.length - 1 && attempt < MAX_ATTEMPTS\) \{\s*currentModelIndex\+\+;\s*improveProvider = createProvider\(currentModelIndex\);/);
});

// Tulajdonosi döntés 2026-10-15: a HTML-okosítás érvénytelen kimenete egyszer a tartalékon újragenerálódik.
test("html workflow: a szerző a kapu után vagy önmaga után még egyszer jöhet (legfeljebb 2), harmadszor nem; más mód változatlan", async () => {
  const { workflowDefinition } = await import("../shared/lesson-workflow");
  const html = workflowDefinition("html");
  const author = html.steps.find((s) => s.id === "author")!;
  assert.deepEqual(author.after, ["source", "author", "gate"]);
  assert.equal(author.maxVisits, 2);
  assert.equal(html.steps.find((s) => s.id === "gate")!.maxVisits, 2);
  assert.equal(workflowDefinition("apply").steps.find((s) => s.id === "author")?.maxVisits ?? 1, 1);

  const { executeWorkflow, workflowPhase } = await import("../server/workflows/engine");
  const { memoryWorkflows } = await import("./helpers/workflow-store");
  const { store } = memoryWorkflows();
  const view = await executeWorkflow(store, { id: "html-retry", owner: "a", mode: "html" }, async () => {
    await workflowPhase("source"); await workflowPhase("author"); await workflowPhase("gate");
    await workflowPhase("author"); await workflowPhase("gate"); await workflowPhase("save"); await workflowPhase("readback");
    return { kind: "candidate" as const, id: "ok" };
  });
  assert.equal(view.state, "ready");
  const { store: store2 } = memoryWorkflows();
  const failed = await executeWorkflow(store2, { id: "html-third", owner: "a", mode: "html" }, async () => {
    await workflowPhase("source"); await workflowPhase("author"); await workflowPhase("author"); await workflowPhase("author");
    return { kind: "candidate" as const, id: "x" };
  }).catch((e: Error) => e);
  assert.match(String((failed as { error?: string }).error ?? (failed as Error).message), /keret|Nem megengedett/);
});

test("improve: az érvénytelen kimenet (üres, rövid, nem HTML, záró kapu) ImproveOutputError, és a futtató egyszer a tartalékon újragenerál", () => {
  // Az improve-folyamat adatbázist és élő modellt ér el — a bekötés forrás-szinten rögzítve (meglévő R1-minta).
  const src = readFileSync(new URL("../server/improveAsync.ts", import.meta.url), "utf8");
  for (const msg of ["Az AI nem adott vissza választ", "A generált HTML túl rövid vagy üres", "A generált válasz nem tartalmaz érvényes HTML struktúrát"]) {
    assert.ok(src.includes(`throw outputError('${msg}')`), msg);
  }
  assert.match(src, /throw outputError\(`A javított tananyag nem ment át a záró ellenőrzésen/);
  assert.match(src, /if \(!\(error instanceof ImproveOutputError\) \|\| !error\.canFallback\) throw error;[\s\S]{0,300}startModelIndex: error\.modelIndex \+ 1, isOutputRetry: true/);
  assert.match(src, /if \(error instanceof ImproveOutputError && error\.canFallback && opts\.retryOnOutputFailure\) throw error;/, "újrapróba előtt a rekord nem kerül hibaállapotba");
});
