import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createWorkflowStore } from "../server/workflows/store";
import { executeWorkflow, workflowPhase, workflowCheckpoint, WorkflowConflict } from "../server/workflows/engine";
import { workflowDefinition } from "../shared/lesson-workflow";
import express from "express";
import type { AddressInfo } from "node:net";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
const { dbPool } = await import("../server/db");
const store = createWorkflowStore(async () => dbPool);
before(async () => { await dbPool.query("INSERT INTO users(id,email,is_admin) VALUES ('workflow-owner','workflow@test.invalid',true),('workflow-other','workflow-other@test.invalid',true)"); });
after(() => dbPool.end());

test("valódi HTML-alkalmazás: mentés, teljes visszaolvasás, ismételt kérés és hibás jelölt", async () => {
  const { applyTrackedImprovement } = await import("../server/workflows/apply");
  const original = "<!DOCTYPE html><html><body><p>Korábbi ellenőrzött tartalom.</p></body></html>";
  const candidate = `<!DOCTYPE html><html><body><h1>Javított lecke</h1><p>${"Forráshű mintamondat. ".repeat(20)}</p></body></html>`;
  await dbPool.query("INSERT INTO html_files(id,title,content,user_id) VALUES ('workflow-material','Teszt',$1,'workflow-owner')", [original]);
  await dbPool.query("INSERT INTO improved_html_files(id,original_file_id,title,content,created_by) VALUES ('workflow-candidate','workflow-material','Javított teszt',$1,'workflow-owner')", [candidate]);
  const result = await applyTrackedImprovement("workflow-candidate", "workflow-owner");
  assert.equal(result.success, true); assert.equal(result.originalFile.content, candidate); assert.ok(result.backupId);
  const { rows } = await dbPool.query("SELECT backup_data FROM material_improvement_backups WHERE id=$1", [result.backupId]);
  assert.equal(rows[0].backup_data.content, original);
  const view = (await store.read(result.workflowId, "workflow-owner"))!.view;
  assert.equal(view.state, "done"); assert.equal(view.result?.id, "workflow-material");
  assert.deepEqual(view.visits.map(v => v.step), ["source", "gate", "apply", "readback"]);
  await applyTrackedImprovement("workflow-candidate", "workflow-owner");
  const count = await dbPool.query("SELECT count(*)::int AS n FROM material_improvement_backups WHERE improved_file_id='workflow-candidate'");
  assert.equal(count.rows[0].n, 1);
  await dbPool.query("INSERT INTO improved_html_files(id,original_file_id,title,content,created_by) VALUES ('workflow-invalid','workflow-material','Hibás','Feldolgozás alatt','workflow-owner')");
  await assert.rejects(applyTrackedImprovement("workflow-invalid", "workflow-owner"), /üres vagy hiányos/);
  const failed = (await store.read("apply:workflow-invalid", "workflow-owner"))!.view;
  assert.equal(failed.state, "error"); assert.equal(failed.visits.at(-1)?.step, "gate");
  const unchanged = await dbPool.query("SELECT content FROM html_files WHERE id='workflow-material'");
  assert.equal(unchanged.rows[0].content, candidate);
});

test("PostgreSQL: egyetlen lease, tulajdonosi elkülönítés, megőrzött részeredmény és idempotens befejezés", async () => {
  let release!: () => void; let entered!: () => void; let calls = 0; let fail = true;
  const barrier = new Promise<void>(r => { release = r; }); const ready = new Promise<void>(r => { entered = r; });
  const input = { id: "workflow-db", owner: "workflow-owner", mode: "web" as const, request: { prompt: "fixture" } };
  const work = async () => {
    await workflowPhase("generate");
    await workflowCheckpoint("answer", { model: "fixture", input: "stable" }, async () => { calls++; entered(); await barrier; return { text: "Synthetic completed response" }; });
    await workflowPhase("gate"); await workflowPhase("publish");
    if (fail) throw new Error("Synthetic publication failure");
    await workflowPhase("readback"); return { kind: "material" as const, id: "fixture-result" };
  };
  const first = executeWorkflow(store, input, work);
  await ready;
  await assert.rejects(executeWorkflow(createWorkflowStore(async () => dbPool), input, work), WorkflowConflict);
  release(); await assert.rejects(first, /Synthetic publication failure/);
  assert.equal(await store.read(input.id, "workflow-other"), null);
  assert.equal((await store.list("workflow-other")).length, 0);
  fail = false;
  const restored = createWorkflowStore(async () => dbPool);
  const done = await executeWorkflow(restored, { ...input, retry: true }, work);
  assert.equal(done.state, "done"); assert.equal(calls, 1);
  assert.equal(done.history![0].visits.at(-1)!.state, "error");
  await executeWorkflow(restored, input, work); assert.equal(calls, 1);
  const { rows } = await dbPool.query("SELECT state,lease_token,revision FROM lesson_workflow_runs WHERE id=$1", [input.id]);
  assert.equal(rows[0].state, "done"); assert.equal(rows[0].lease_token, null); assert.ok(rows[0].revision > 5);
});

test("PostgreSQL: elavult végrehajtó nem írhat, lejárt lease megszakadt állapotként látszik", async () => {
  const record = { owner: "workflow-owner", checkpoints: {}, view: { id: "workflow-expired", state: "running" as const, definition: workflowDefinition("web"), createdAt: Date.now(), updatedAt: Date.now(), visits: [], revision: 0 } };
  await store.create(record); assert.equal(await store.claim(record.view.id, record.owner, "old-token"), true);
  await dbPool.query("UPDATE lesson_workflow_runs SET lease_until=now()-interval '1 second' WHERE id=$1", [record.view.id]);
  assert.equal((await store.read(record.view.id, record.owner))!.view.state, "interrupted");
  assert.equal((await store.list(record.owner)).find(r => r.view.id === record.view.id)!.view.state, "interrupted");
  assert.equal(await store.save(record, "old-token"), false);
  assert.equal(await store.claim(record.view.id, record.owner, "new-token"), true);
  assert.equal(await store.save(record, "old-token"), false);
  assert.equal(await store.save(record, "new-token"), true);
  assert.equal(await store.save(record, "new-token"), false);
  await store.release(record.view.id, "old-token");
  assert.equal(await store.heartbeat(record.view.id, "new-token"), true);
  await store.release(record.view.id, "new-token");
});

test("valódi admin API: csak saját napló, nincs prompt és ellenőrzőpont a válaszban", async () => {
  const { workflowRouter } = await import("../server/workflows/routes");
  const app = express();
  app.use((req, _res, next) => {
    const owner = req.header("x-test-owner");
    req.isAuthenticated = (() => !!owner) as typeof req.isAuthenticated;
    if (owner) req.user = { id: owner, isAdmin: true } as Express.User;
    next();
  });
  app.use("/api/studio", workflowRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(`${origin}/api/studio/workflows`)).status, 401);
    const mine = await fetch(`${origin}/api/studio/workflows/workflow-db`, { headers: { "x-test-owner": "workflow-owner" } });
    assert.equal(mine.headers.get("cache-control"), "no-store");
    const body = await mine.json(); assert.equal(body.run.state, "done");
    const text = JSON.stringify(body); assert.equal(text.includes("Synthetic completed response"), false); assert.equal(text.includes("requestHash"), false); assert.equal(text.includes("checkpoints"), false);
    const other = await fetch(`${origin}/api/studio/workflows/workflow-db`, { headers: { "x-test-owner": "workflow-other" } });
    assert.deepEqual(await other.json(), { run: null });
  } finally { server.closeAllConnections(); await new Promise<void>((r, reject) => server.close(e => e ? reject(e) : r())); }
});
