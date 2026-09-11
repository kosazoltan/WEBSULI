import test from "node:test";
import assert from "node:assert/strict";
import { executeWorkflow, workflowPhase, workflowCheckpoint, workflowUsage, WorkflowWaiting, WorkflowConflict, redactWorkflowError } from "../server/workflows/engine";
import { memoryWorkflows } from "./helpers/workflow-store";

test("a visszaolvasás nélküli siker és az átugrott kapu nem hajthat végre írást", async () => {
  const { store, records } = memoryWorkflows(); let writes = 0;
  await assert.rejects(executeWorkflow(store, { id: "skip", owner: "a", mode: "web" }, async () => {
    await workflowPhase("generate"); await workflowPhase("publish"); writes++; return { kind: "material", id: "x" };
  }), /Nem megengedett/);
  assert.equal(writes, 0); assert.equal(records.get("skip")!.view.state, "error");
  await assert.rejects(executeWorkflow(store, { id: "fake", owner: "a", mode: "web" }, async () => {
    await workflowPhase("generate"); return { kind: "material", id: "x" };
  }), /Nincs visszaolvasott/);
});

test("a jelölt külön végállapot; ugyanaz a kész kérés nem írhat másodszor", async () => {
  const { store } = memoryWorkflows(); let calls = 0;
  const input = { id: "html", owner: "a", mode: "html" as const, request: { content: "source" } };
  const work = async () => { calls++; for (const step of ["source", "author", "gate", "save", "readback"]) await workflowPhase(step); return { kind: "candidate" as const, id: "candidate" }; };
  assert.equal((await executeWorkflow(store, input, work)).state, "ready");
  await executeWorkflow(store, input, work); assert.equal(calls, 1);
  await assert.rejects(executeWorkflow(store, { ...input, owner: "b" }, work), /Másik készítő/);
  await assert.rejects(executeWorkflow(store, { ...input, request: { content: "changed" } }, work), /Megváltozott/);
});

test("párhuzamos kérés nem indít második munkát; elveszett lease nem írhat vissza", async () => {
  const m = memoryWorkflows(); let release!: () => void; let entered!: () => void;
  const ready = new Promise<void>(r => { entered = r; }); const pause = new Promise<void>(r => { release = r; });
  const input = { id: "parallel", owner: "a", mode: "web" as const };
  const first = executeWorkflow(m.store, input, async () => { await workflowPhase("generate"); entered(); await pause; await workflowPhase("gate"); return undefined; });
  await ready;
  await assert.rejects(executeWorkflow(m.store, input, async () => { assert.fail("second worker ran"); }), WorkflowConflict);
  m.leases.set(input.id, "new-owner"); release();
  await assert.rejects(first, WorkflowConflict);
  assert.equal(m.records.get(input.id)!.view.visits.length, 1);
  assert.equal(m.leases.get(input.id), "new-owner");
});

test("mentési hiba után a változatlan AI-részeredmény megmarad, a korábbi hiba látható", async () => {
  const { store } = memoryWorkflows(); let models = 0; let fail = true;
  const input = { id: "retry", owner: "a", mode: "web" as const, request: { prompt: "same" } };
  const work = async () => {
    await workflowPhase("generate");
    const output = await workflowCheckpoint("model", { model: "fixture", prompt: "same" }, async () => { models++; await workflowUsage({ input_tokens: 20, output_tokens: 50 }); return { text: "verified" }; });
    assert.equal(output.text, "verified");
    await workflowPhase("gate"); await workflowPhase("publish"); if (fail) throw new Error("Mentési hiba");
    await workflowPhase("readback"); return { kind: "material" as const, id: "saved" };
  };
  await assert.rejects(executeWorkflow(store, input, work), /Mentési hiba/);
  fail = false;
  const view = await executeWorkflow(store, { ...input, retry: true }, work);
  assert.equal(view.state, "done"); assert.equal(models, 1);
  assert.equal(view.history![0].visits[0].tokensOut, 50);
  assert.equal(view.history![0].visits.at(-1)!.state, "error");
  assert.equal(view.visits[0].cacheHits, 1);
  assert.equal(view.visits[0].tokensOut, undefined);
});

test("Studio jóváhagyás folytatja a történetet és a lektori javító kör véges", async () => {
  const { store } = memoryWorkflows(); const input = { id: "studio", owner: "a", mode: "studio" as const };
  await assert.rejects(executeWorkflow(store, input, async () => { await workflowPhase("pedagogue"); throw new WorkflowWaiting("Vázlat jóváhagyása", true); }), WorkflowWaiting);
  assert.equal((await store.read("studio", "a"))!.view.visits[0].state, "done");
  await assert.rejects(executeWorkflow(store, { ...input, retry: true, continuation: true }, async () => {
    for (let round = 0; round < 4; round++) {
      await workflowPhase("author"); await workflowPhase("animator"); await workflowPhase("lektor");
    }
    return undefined;
  }), /Elfogyott/);
  const view = (await store.read("studio", "a"))!.view;
  assert.equal(view.visits.filter(v => v.step === "author").length, 3);
  assert.equal(view.visits[0].step, "pedagogue");
});

test("idegen folyamatverzió és túl sok újrapróbálás leáll, hibaszövegben nincs kulcs", async () => {
  const m = memoryWorkflows(); const input = { id: "broken", owner: "a", mode: "web" as const, retry: true };
  const work = async () => { await workflowPhase("generate"); throw new Error("hiba"); };
  for (let n = 0; n < 4; n++) await assert.rejects(executeWorkflow(m.store, input, work), /hiba/);
  await assert.rejects(executeWorkflow(m.store, input, work), /kerete elfogyott/);
  m.records.get(input.id)!.view.definition.version = "other";
  await assert.rejects(executeWorkflow(m.store, input, work), /eltérő programverzió/);
  assert.equal(redactWorkflowError(new Error("https://fixture.test/private?key=secret Bearer fixture-secret sk-fixture")), "[hivatkozás] [titkos érték] [titkos érték]");
});
