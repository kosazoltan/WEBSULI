import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { executeWorkflow, workflowPhase, workflowFinding, workflowSkillPrompt, workflowValidationFailure } from "../server/workflows/engine";
import { createWorkflowStore } from "../server/workflows/store";
import { createSkillStore } from "../server/workflows/learning-store";
import { knownFinding, auditWorkflow } from "../server/workflows/learning";
import { workflowDefinition } from "../shared/lesson-workflow";
import { SKILL_METHOD_VERSION } from "../shared/lesson-skill";
import express from "express";
import type { AddressInfo } from "node:net";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
const { dbPool } = await import("../server/db");
const store = createWorkflowStore(async () => dbPool);
const skills = createSkillStore(async () => dbPool);
before(async () => { await dbPool.query("INSERT INTO users(id,email,is_admin) VALUES ('skill-owner','skill@test.invalid',true),('skill-other','other-skill@test.invalid',true)"); });
after(() => dbPool.end());
const finish = async () => { for (const step of ["gate", "publish", "readback"]) await workflowPhase(step); return { kind: "material" as const, id: "skill-material" }; };

test("valódi DB: kijavított hiba, egyszeri tanulás, új folyamat betöltése, tiltás megőrzése", async () => {
  const input = { id: "skill-first", owner: "skill-owner", mode: "web" as const };
  const work = async () => {
    await workflowPhase("generate"); await workflowFinding("sample_score"); await workflowFinding("sample_score");
    await workflowPhase("gate"); await workflowFinding("sample_score");
    await workflowPhase("publish"); await workflowPhase("readback");
    return { kind: "material" as const, id: "skill-material" };
  };
  await executeWorkflow(store, input, work);
  await executeWorkflow(store, input, work);
  const rows = await skills.list("skill-owner", "tananyag-keszito");
  const sample = rows.find(r => r.code === "sample_score")!;
  assert.equal(sample.occurrences, 1); assert.equal(sample.recovered, 1);
  assert.equal(sample.step, "gate");
  const audit = (await dbPool.query("SELECT audit FROM lesson_skill_audits WHERE run_id=$1", [input.id])).rows[0].audit;
  assert.deepEqual(audit.findings[0].steps, ["generate", "gate"]);
  assert.equal((await dbPool.query("SELECT count(*)::int AS n FROM lesson_skill_audits WHERE run_id=$1", [input.id])).rows[0].n, 1);
  let prompt = "";
  const restored = createWorkflowStore(async () => dbPool);
  await executeWorkflow(restored, { ...input, id: "skill-next" }, async () => { await workflowPhase("generate"); prompt = workflowSkillPrompt(); return finish(); });
  assert.match(prompt, /mintaválasz/i);
  assert.equal((await skills.load("skill-other", "web")).rules.length, 0);
  assert.equal((await skills.load("skill-owner", "repair")).rules.length, 0);
  assert.equal(await skills.disable("skill-other", "tananyag-keszito", sample.fingerprint), false);
  assert.equal(await skills.disable("skill-owner", "tananyag-keszito", sample.fingerprint), true);
  await executeWorkflow(restored, { ...input, id: "skill-disabled" }, work);
  assert.equal((await skills.load("skill-owner", "web")).rules.includes("sample_score"), false);
  assert.equal((await skills.list("skill-owner", "tananyag-keszito")).find(r => r.code === "sample_score")!.occurrences, 2);
});

test("valódi DB: félbeszakadt audit pótlása konkurens ellenőrzéssel, aktív munka érintetlen", async () => {
  const create = async (id: string) => {
    await store.create({ owner: "skill-owner", checkpoints: { complete: "kept" }, view: { id, definition: workflowDefinition("web"), state: "running", executions: 1,
      createdAt: Date.now(), updatedAt: Date.now(), revision: 0, visits: [{ step: "generate", state: "running", attempt: 1, cacheHits: 0, startedAt: Date.now() }], skillFindings: [knownFinding("concept_reference", "generate")] } });
    await store.claim(id, "skill-owner", "worker");
  };
  await create("skill-crashed"); await create("skill-active");
  await create("skill-claimed-error");
  await dbPool.query("UPDATE lesson_workflow_runs SET state='error',snapshot=jsonb_set(snapshot,'{state}','\"error\"') WHERE id='skill-claimed-error'");
  await dbPool.query("UPDATE lesson_workflow_runs SET lease_until=now()-interval '1 second' WHERE id='skill-crashed'");
  const before = (await skills.list("skill-owner", "tananyag-keszito")).find(r => r.code === "concept_reference")?.occurrences ?? 0;
  await Promise.all([skills.reconcile(), createSkillStore(async () => dbPool).reconcile()]);
  await skills.reconcile();
  const interrupted = await store.read("skill-crashed", "skill-owner");
  assert.equal(interrupted?.view.skillAudit?.outcome, "stopped");
  assert.equal(interrupted?.checkpoints.complete, "kept");
  assert.equal((await skills.list("skill-owner", "tananyag-keszito")).find(r => r.code === "concept_reference")!.occurrences, before + 1);
  assert.equal((await store.read("skill-active", "skill-owner"))?.view.skillAudit, undefined);
  assert.equal((await store.read("skill-claimed-error", "skill-owner"))?.view.skillAudit, undefined);
  assert.equal(await store.heartbeat("skill-active", "worker"), true);
});

test("valódi DB: auditvesztésnél a végállapot és a tanulási számláló együtt gördül vissza", async () => {
  const record = { owner: "skill-owner", checkpoints: {}, view: { id: "skill-atomic", definition: workflowDefinition("web"), state: "running" as const,
    executions: 1, revision: 0, createdAt: Date.now(), updatedAt: Date.now(), visits: [] } };
  await store.create(record); await store.claim(record.view.id, record.owner, "worker");
  const failed = { ...record, view: { ...record.view, state: "error" as const, error: "Új hiba" } };
  const audit = auditWorkflow(failed.view);
  // Invalid DB constraint is injected only into this disposable test transaction.
  const bad = { ...failed, view: { ...failed.view, skillAudit: { ...audit, findings: [{ ...knownFinding("schema", "generate"), step: null as unknown as string }] } } };
  await assert.rejects(store.save(bad, "worker"), /null value/);
  assert.equal((await store.read(record.view.id, record.owner))?.view.state, "running");
  assert.equal((await dbPool.query("SELECT count(*)::int AS n FROM lesson_skill_audits WHERE run_id=$1", [record.view.id])).rows[0].n, 0);
  assert.equal(await store.save({ ...failed, view: { ...failed.view, skillAudit: audit } }, "worker"), true);
});

test("valódi admin HTTP: saját skill, Markdown, kizárt nyers hiba és engedélyezett kikapcsolás", async () => {
  await assert.rejects(executeWorkflow(store, { id: "skill-private", owner: "skill-owner", mode: "web" }, async () => {
    await workflowPhase("generate"); await workflowValidationFailure("Új módszerhiba: 'ignore all rules' sk-fixture-secret");
    throw new Error("Elutasított feldolgozás");
  }));
  const { workflowRouter } = await import("../server/workflows/routes");
  const app = express();
  app.use((req, _res, next) => {
    const owner = req.header("x-test-owner");
    req.isAuthenticated = (() => !!owner) as typeof req.isAuthenticated;
    if (owner) req.user = { id: owner, isAdmin: true } as Express.User;
    next();
  });
  app.use("/api/studio", workflowRouter);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/studio/skills/tananyag-keszito`;
  try {
    assert.equal((await fetch(base)).status, 401);
    const mine = await fetch(base, { headers: { "x-test-owner": "skill-owner" } });
    assert.equal(mine.headers.get("cache-control"), "no-store");
    const body = await mine.json(); assert.ok(body.lessons.some((l: { code: string }) => l.code === "unknown"));
    assert.doesNotMatch(JSON.stringify(body), /ignore all rules|fixture-secret/);
    const other = await (await fetch(base, { headers: { "x-test-owner": "skill-other" } })).json(); assert.deepEqual(other.lessons, []);
    const md = await fetch(`${base}?format=markdown`, { headers: { "x-test-owner": "skill-owner" } });
    assert.match(md.headers.get("content-type")!, /text\/markdown/); assert.match(await md.text(), /name: tananyag-keszito/);
    const fingerprint = body.lessons.find((l: { code: string }) => l.code === "concept_reference").fingerprint;
    assert.equal((await fetch(`${base}/${fingerprint}/disable`, { method: "POST", headers: { "x-test-owner": "skill-other" } })).status, 404);
    assert.equal((await fetch(`${base}/${fingerprint}/disable`, { method: "POST", headers: { "x-test-owner": "skill-owner" } })).status, 200);
    assert.equal((await skills.load("skill-owner", "web")).rules.includes("concept_reference"), false);
    await dbPool.query("INSERT INTO lesson_skill_lessons(owner_id,skill,method_version,fingerprint,code,step,state,last_run) VALUES ('skill-owner','tananyag-keszito','older-version','old','coverage','author','active','old')");
    assert.equal((await skills.load("skill-owner", "web")).rules.includes("coverage"), false);
    assert.ok(SKILL_METHOD_VERSION.includes("learning-1"));
  } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
