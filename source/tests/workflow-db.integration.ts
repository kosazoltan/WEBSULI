import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createWorkflowStore } from "../server/workflows/store";
import { executeWorkflow, workflowPhase, workflowCheckpoint, workflowFence, WorkflowConflict } from "../server/workflows/engine";
import { workflowDefinition } from "../shared/lesson-workflow";
import express from "express";
import type { AddressInfo } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { teachingHtml } from "./helpers/teaching-html";

function completeHtml() {
  const data = { classroom: 7, classroomEvidence: "Az alaphoz tartozó magasság és a területképlet.", subject: "matematika", experience: standardFusionFixture().experience };
  const candidate = `<!DOCTYPE html><html><body>${["teaching", "methods", "tasks", "quiz"].map(name => `<button data-lesson-tab="${name}">${name}</button><section data-lesson-panel="${name}">${name === "teaching" ? teachingHtml : ""}</section>`).join("")}<script id="websuli-lesson-data" type="application/json">${JSON.stringify(data)}</script><script>const data=JSON.parse(document.getElementById('websuli-lesson-data').textContent);</script></body></html>`;
  return candidate;
}

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
const { dbPool } = await import("../server/db");
const store = createWorkflowStore(async () => dbPool);
before(async () => { await dbPool.query("INSERT INTO users(id,email,is_admin) VALUES ('workflow-owner','workflow@test.invalid',true),('workflow-other','workflow-other@test.invalid',true)"); });
after(() => dbPool.end());

test("folyamatleállítás után a kész válasz megmarad, a befejezetlen újrafut és nincs dupla befejezés", async () => {
  const id = "workflow-process-loss";
  // Only the disposable database configured and asserted above reaches the child.
  const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import { Pool } from 'pg';
    import { createWorkflowStore } from './server/workflows/store.ts';
    import { executeWorkflow, workflowPhase, workflowCheckpoint } from './server/workflows/engine.ts';
    const pool = new Pool({connectionString:process.env.DATABASE_URL});
    await executeWorkflow(createWorkflowStore(async()=>pool), {id:'${id}',owner:'workflow-owner',mode:'web',request:{source:'process-loss'}}, async()=>{
      await workflowPhase('generate');
      await workflowCheckpoint('complete',{source:'stable'},async()=>({text:'Persisted first answer'}));
      await workflowCheckpoint('incomplete',{source:'stable'},async()=>{
        process.stdout.write('CHECKPOINT_SAVED\\n');
        await new Promise(()=>{});
      });
    });
  `], { cwd: process.cwd(), env: process.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const exited = once(child, "exit");
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Checkpoint child did not become ready")), 15_000);
      child.once("error", () => { clearTimeout(timeout); reject(new Error("Checkpoint child could not start")); });
      child.once("exit", () => { clearTimeout(timeout); reject(new Error("Checkpoint child exited before interruption")); });
      child.stdout.on("data", chunk => {
        if (String(chunk).includes("CHECKPOINT_SAVED")) { clearTimeout(timeout); resolve(); }
      });
    });
    child.kill(); await exited;
    const persisted = await store.read(id, "workflow-owner");
    assert.equal(persisted!.view.state, "running");
    assert.equal(Object.keys(persisted!.checkpoints).length, 2); // request hash + completed answer
    // Model lease expiration deterministically; the worker itself was really terminated.
    await dbPool.query("UPDATE lesson_workflow_runs SET lease_until=now()-interval '1 second' WHERE id=$1", [id]);
    assert.equal((await store.read(id, "workflow-owner"))!.view.state, "interrupted");
    let incompleteCalls = 0; let completions = 0;
    const input = { id, owner: "workflow-owner", mode: "web" as const, request: { source: "process-loss" }, retry: true };
    const work = async () => {
      await workflowPhase("generate");
      const cached = await workflowCheckpoint("complete", { source: "stable" }, async () => { throw new Error("Completed answer must not be regenerated"); });
      assert.deepEqual(cached, { text: "Persisted first answer" });
      await workflowCheckpoint("incomplete", { source: "stable" }, async () => { incompleteCalls++; return { text: "Restarted answer" }; });
      await workflowPhase("knowledge"); await workflowPhase("author");
      await workflowPhase("gate"); await workflowPhase("publish");
      completions++;
      await workflowPhase("readback"); return { kind: "material" as const, id: "process-loss-result" };
    };
    const done = await executeWorkflow(createWorkflowStore(async () => dbPool), input, work);
    assert.equal(done.state, "done");
    assert.equal(done.visits[0].cacheHits, 1);
    await executeWorkflow(createWorkflowStore(async () => dbPool), input, work);
    assert.equal(incompleteCalls, 1); assert.equal(completions, 1);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
  }
});

test("lejárt vagy átvett workflow-engedély a domain tranzakció írását is visszagörgeti", async () => {
  const { db } = await import("../server/db");
  const { sql } = await import("drizzle-orm");
  await dbPool.query("INSERT INTO html_files(id,title,content,user_id) VALUES ('fenced-material','Fenced','Original','workflow-owner')");
  for (const scenario of ["taken-over", "expired-in-transaction"]) {
    const id = `fence-${scenario}`;
    await assert.rejects(executeWorkflow(store, { id, owner: "workflow-owner", mode: "web" }, async () => {
      for (const step of ["generate", "knowledge", "author", "gate", "publish"]) await workflowPhase(step);
      if (scenario === "taken-over") await dbPool.query("UPDATE lesson_workflow_runs SET lease_token='replacement' WHERE id=$1", [id]);
      await db.transaction(async tx => {
        await workflowFence(tx);
        await tx.execute(sql`UPDATE html_files SET content='Must roll back' WHERE id='fenced-material'`);
        if (scenario === "expired-in-transaction") await tx.execute(sql`UPDATE lesson_workflow_runs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=${id}`);
        await workflowFence(tx);
      });
      await workflowPhase("readback"); return { kind: "material", id: "fenced-material" };
    }), WorkflowConflict);
    assert.equal((await dbPool.query("SELECT content FROM html_files WHERE id='fenced-material'")).rows[0].content, "Original");
  }
});

// Review #263 (J5): a folytatás ugyanazt a jobot írja — az átvett lízingű (elavult) végrehajtó jobmentése visszautasítva, a job érintetlen.
test("elavult végrehajtó nem írhatja a gyártási job mentését (saveStep a workflow-kerítés mögött)", async () => {
  const { createDrizzlePipelineStore } = await import("../server/studio/pipeline-store");
  const store2 = await createDrizzlePipelineStore();
  const map = (await dbPool.query("INSERT INTO knowledge_maps(title,subject,classroom,source_files,input_hash) VALUES ('F','matematika',5,'[]'::jsonb,'fence-job-map') RETURNING id")).rows[0].id as string;
  const job = (await dbPool.query("INSERT INTO studio_jobs(map_id,step,status,input_hash,output) VALUES ($1,'lektor','running','h','{\"mark\":\"original\"}'::jsonb) RETURNING id", [map])).rows[0].id as string;
  try {
    const id = "fence-job-save";
    await executeWorkflow(store, { id, owner: "workflow-owner", mode: "web" }, async () => {
      await workflowPhase("generate");
      await store2.saveStep(job, { output: { mark: "live" } });
      await dbPool.query("UPDATE lesson_workflow_runs SET lease_token='replacement' WHERE id=$1", [id]);
      await assert.rejects(store2.saveStep(job, { status: "error", output: { mark: "stale" } }), WorkflowConflict);
      throw new WorkflowConflict("vége");
    }).catch((e) => { if (!(e instanceof WorkflowConflict)) throw e; });
    const row = (await dbPool.query("SELECT status, output FROM studio_jobs WHERE id=$1", [job])).rows[0];
    assert.equal(row.output.mark, "live", "az érvényes végrehajtó mentése megtörtént, az elavulté nem");
    assert.equal(row.status, "running");
  } finally {
    await dbPool.query("DELETE FROM studio_jobs WHERE id=$1", [job]);
    await dbPool.query("DELETE FROM knowledge_maps WHERE id=$1", [map]);
  }
});

test("új HTML-jelölt nem írhatja felül a készítése után módosított eredetit", async () => {
  const { storage } = await import("../server/storage");
  const { htmlBaselineHash } = await import("../server/improve/html-baseline");
  const candidate = completeHtml();
  await dbPool.query("INSERT INTO html_files(id,title,content,user_id) VALUES ('baseline-material','Eredeti','Original','workflow-owner')");
  const original = await storage.getHtmlFile("baseline-material");
  await dbPool.query("INSERT INTO improved_html_files(id,original_file_id,title,content,baseline_hash,created_by) VALUES ('baseline-candidate','baseline-material','Javított',$1,$2,'workflow-owner')", [candidate, htmlBaselineHash(original!)]);
  await dbPool.query("UPDATE html_files SET content='Edited after generation' WHERE id='baseline-material'");
  await assert.rejects(storage.applyImprovedFileToOriginal("baseline-candidate", "workflow-owner", true), /megváltozott/);
  assert.equal((await storage.getHtmlFile("baseline-material"))!.content, "Edited after generation");
  assert.equal((await storage.getAllMaterialImprovementBackups("baseline-material")).length, 0);
  await dbPool.query("UPDATE html_files SET content='Original' WHERE id='baseline-material'");
  await dbPool.query("UPDATE improved_html_files SET content=$1 WHERE id='baseline-candidate'", [candidate.replace(/<script[\s\S]*?<\/script>/g, "")]);
  await assert.rejects(storage.applyImprovedFileToOriginal("baseline-candidate", "workflow-owner", true), /JSON-bank/);
  assert.equal((await storage.getAllMaterialImprovementBackups("baseline-material")).length, 0);
  assert.equal((await storage.getHtmlFile("baseline-material"))!.content, "Original");
  await dbPool.query("UPDATE improved_html_files SET content=$1 WHERE id='baseline-candidate'", [candidate]);
  await storage.applyImprovedFileToOriginal("baseline-candidate", "workflow-owner", true);
  await storage.applyImprovedFileToOriginal("baseline-candidate", "workflow-owner", true);
  assert.equal((await storage.getAllMaterialImprovementBackups("baseline-material")).length, 1);
});

test("felhasználó törlése a saját futásait eltávolítja, más tulajdonos naplóját megtartja", async () => {
  const { storage } = await import("../server/storage");
  await dbPool.query("INSERT INTO users(id,email,is_admin) VALUES ('workflow-delete','delete@test.invalid',true)");
  const create = async (id: string, owner: string) => store.create({ owner, checkpoints: {}, view: { id, definition: workflowDefinition("web"), state: "error", visits: [], createdAt: Date.now(), updatedAt: Date.now(), revision: 0 } });
  await create("deleted-run", "workflow-delete"); await create("retained-run", "workflow-other");
  assert.equal(await storage.deleteUser("workflow-delete"), true);
  assert.equal(await store.read("deleted-run", "workflow-delete"), null);
  assert.ok(await store.read("retained-run", "workflow-other"));
  const constraint = await dbPool.query("SELECT confdeltype FROM pg_constraint WHERE conrelid='lesson_workflow_runs'::regclass AND contype='f'");
  assert.equal(constraint.rows[0].confdeltype, "c");
  await dbPool.query("DELETE FROM lesson_workflow_runs WHERE id='retained-run'");
});

test("valódi HTML-alkalmazás: mentés, teljes visszaolvasás, ismételt kérés és hibás jelölt", async () => {
  const { applyTrackedImprovement } = await import("../server/workflows/apply");
  const original = "<!DOCTYPE html><html><body><p>Korábbi ellenőrzött tartalom.</p></body></html>";
  const candidate = completeHtml();
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
    await workflowPhase("knowledge"); await workflowPhase("author");
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

// Review #265: párhuzamos bankcsomagoknál a workflow-mentés (revízió-növelés) és a kerített job-mentés egyidejűleg fut — közös sorban
// az érvényes végrehajtó nem kaphat hamis „elavult végrehajtó” hibát.
test("párhuzamos workflow-mentés és kerített jobmentés: nincs hamis konfliktus", async () => {
  const { createDrizzlePipelineStore } = await import("../server/studio/pipeline-store");
  const { workflowValidationFailure } = await import("../server/workflows/engine");
  const store2 = await createDrizzlePipelineStore();
  const map = (await dbPool.query("INSERT INTO knowledge_maps(title,subject,classroom,source_files,input_hash) VALUES ('P','matematika',5,'[]'::jsonb,'parallel-save-map') RETURNING id")).rows[0].id as string;
  const job = (await dbPool.query("INSERT INTO studio_jobs(map_id,step,status,input_hash,output) VALUES ($1,'animator','running','h','{}'::jsonb) RETURNING id", [map])).rows[0].id as string;
  try {
    await executeWorkflow(store, { id: "parallel-save", owner: "workflow-owner", mode: "web" }, async () => {
      await workflowPhase("generate");
      const work: Array<Promise<unknown>> = [];
      for (let i = 0; i < 12; i++) {
        work.push(workflowValidationFailure(new Error(`bankcsomag ${i}: a csomag alakja hibás`)));
        work.push(store2.saveStep(job, { output: { mark: i } }));
      }
      await Promise.all(work);
      for (const step of ["knowledge", "author", "gate", "publish"]) await workflowPhase(step);
      await workflowPhase("readback");
      return { kind: "material", id: "fenced-material" };
    });
    assert.equal((await dbPool.query("SELECT output->>'mark' AS m FROM studio_jobs WHERE id=$1", [job])).rows[0].m, "11", "a mentések a hívás sorrendjében");
  } finally {
    await dbPool.query("DELETE FROM studio_jobs WHERE id=$1", [job]);
    await dbPool.query("DELETE FROM knowledge_maps WHERE id=$1", [map]);
  }
});

// Spec 2026-10-22-elmaradt-feladatok (S3): a futó futás leállítása — bérlet törölve, állapot „hiba” az üzenettel, revízió lép, a hozzá
// tartozó okosítás-sor lezárul; befejezett futás és idegen tulajdonos nem állítható le; a régi bérletű végrehajtó nem írhat vissza.
test("futó okosítás leállítása: állapot, bérlet, revízió, okosítás-sor; ismételt és idegen leállítás nem módosít", async () => {
  const id = "workflow-stop-1";
  const view = { id, definition: workflowDefinition("html"), state: "running", createdAt: Date.now(), updatedAt: Date.now(), visits: [], revision: 2 };
  await dbPool.query("INSERT INTO html_files(id,title,content) VALUES ('stop-file','Stop anyag','<p>x</p>')");
  await dbPool.query("INSERT INTO improved_html_files(id,original_file_id,title,content,status) VALUES ($1,'stop-file','Stop anyag','<p>…</p>','processing')", [id]);
  await dbPool.query("INSERT INTO lesson_workflow_runs(id,owner_id,state,revision,snapshot,lease_token,lease_until) VALUES ($1,'workflow-owner','running',2,$2::jsonb,'tok-1',now()+interval '90 seconds')", [id, JSON.stringify(view)]);
  assert.equal(await store.stop(id, "workflow-other", "A futást a tulajdonos leállította."), false, "idegen tulajdonos nem állíthatja le");
  assert.equal(await store.stop(id, "workflow-owner", "A futást a tulajdonos leállította."), true);
  const { rows: [run] } = await dbPool.query("SELECT state, revision, lease_token, lease_until, snapshot FROM lesson_workflow_runs WHERE id=$1", [id]);
  assert.equal(run.state, "error");
  assert.equal(run.revision, 3);
  assert.equal(run.lease_token, null);
  assert.equal(run.lease_until, null);
  assert.equal(run.snapshot.state, "error");
  assert.equal(run.snapshot.error, "A futást a tulajdonos leállította.");
  const { rows: [imp] } = await dbPool.query("SELECT status, improvement_notes FROM improved_html_files WHERE id=$1", [id]);
  assert.deepEqual({ status: imp.status, notes: imp.improvement_notes }, { status: "error", notes: "A futást a tulajdonos leállította." });
  // A régi végrehajtó szívverése és mentése elbukik (a motor ebből tudja, hogy nem írhat vissza).
  assert.equal(await store.heartbeat(id, "tok-1"), false);
  assert.equal(await store.stop(id, "workflow-owner", "x"), false, "a már leállított futás nem állítható le újra");
});

// Review #366: a már „pending” (nem alkalmazott) jelölt is lezárul; a hibaág a leállítás megjegyzését atomikusan megőrzi; a későn
// befejeződő háttérmunka „pending” mentése a leállított sort nem éleszti újra.
test("leállítás: pending jelölt lezárul, a megjegyzés megmarad, a késői pending mentés elutasítva", async () => {
  const { storage } = await import("../server/storage");
  const STOP = "A futást a tulajdonos leállította.";
  const mk = async (id: string, status: string) => {
    const view = { id, definition: workflowDefinition("html"), state: "running", createdAt: Date.now(), updatedAt: Date.now(), visits: [], revision: 1 };
    await dbPool.query("INSERT INTO improved_html_files(id,original_file_id,title,content,status) VALUES ($1,'stop-file','Stop anyag','<p>…</p>',$2)", [id, status]);
    await dbPool.query("INSERT INTO lesson_workflow_runs(id,owner_id,state,revision,snapshot,lease_token,lease_until) VALUES ($1,'workflow-owner','running',1,$2::jsonb,'tok',now()+interval '90 seconds')", [id, JSON.stringify(view)]);
  };
  await mk("workflow-stop-pending", "pending");
  assert.equal(await store.stop("workflow-stop-pending", "workflow-owner", STOP), true);
  const { rows: [p] } = await dbPool.query("SELECT status, improvement_notes FROM improved_html_files WHERE id='workflow-stop-pending'");
  assert.deepEqual({ s: p.status, n: p.improvement_notes }, { s: "error", n: STOP }, "a pending jelölt sem alkalmazható");

  await mk("workflow-stop-race", "processing");
  assert.equal(await store.stop("workflow-stop-race", "workflow-owner", STOP), true);
  assert.equal(await storage.failImprovedHtmlFileUnlessStopped("workflow-stop-race", "A futást már másik végrehajtó kezeli.", STOP), false, "a hibaág nem írja felül");
  await assert.rejects(storage.updateImprovedHtmlFileContentAndStatus("workflow-stop-race", "<p>késő jelölt</p>", "pending"), /nem menthető/);
  const { rows: [r] } = await dbPool.query("SELECT status, improvement_notes, content FROM improved_html_files WHERE id='workflow-stop-race'");
  assert.deepEqual({ s: r.status, n: r.improvement_notes, c: r.content }, { s: "error", n: STOP, c: "<p>…</p>" });

  // A nem leállított sor hibára zárása változatlanul működik.
  await dbPool.query("INSERT INTO improved_html_files(id,original_file_id,title,content,status) VALUES ('imp-normal-fail','stop-file','x','<p>x</p>','processing')");
  assert.equal(await storage.failImprovedHtmlFileUnlessStopped("imp-normal-fail", "Időtúllépés", STOP), true);
});

// Review #366: az olvasás és a foglalás közé eső leállítás elutasítja az elavult indulást; a leállítás lezárja a nyitott lépést
// (futó / várakozó / üres lépéslista) és frissíti a pillanatkép idejét.
test("leállítás: elavult foglalás elutasítva; nyitott lépés lezárva, időpont frissítve", async () => {
  const STOP = "A futást a tulajdonos leállította.";
  const mk = async (id: string, state: string, visits: unknown[]) => {
    const view = { id, definition: workflowDefinition("html"), state, createdAt: 1, updatedAt: 1, visits, revision: 4 };
    await dbPool.query("INSERT INTO lesson_workflow_runs(id,owner_id,state,revision,snapshot) VALUES ($1,'workflow-owner',$2,4,$3::jsonb)", [id, state, JSON.stringify(view)]);
  };
  // Verseny: a motor 4-es revíziót olvasott, közben leállították → a régi revíziós foglalás elbukik.
  await mk("workflow-stop-claim", "running", []);
  const read = await store.read("workflow-stop-claim", "workflow-owner");
  assert.equal(read!.view.revision, 4);
  assert.equal(await store.stop("workflow-stop-claim", "workflow-owner", STOP), true);
  assert.equal(await store.claim("workflow-stop-claim", "workflow-owner", "late", read!.view.revision), false, "elavult indulás elutasítva");
  // A kifejezett újrapróba a friss revízióval foglalhat (a hibaállapot nincs általánosan tiltva).
  assert.equal(await store.claim("workflow-stop-claim", "workflow-owner", "retry", 5), true);

  await mk("workflow-stop-visit-run", "running", [{ step: "author", attempt: 1, startedAt: 1, state: "done", finishedAt: 2, cacheHits: 0 }, { step: "gate", attempt: 1, startedAt: 3, state: "running", cacheHits: 0 }]);
  await mk("workflow-stop-visit-wait", "waiting", [{ step: "gate", attempt: 1, startedAt: 3, state: "waiting", cacheHits: 0 }]);
  for (const id of ["workflow-stop-visit-run", "workflow-stop-visit-wait", "workflow-stop-visit-empty"]) {
    if (id.endsWith("empty")) await mk(id, "running", []);
    assert.equal(await store.stop(id, "workflow-owner", STOP), true, id);
    const { rows: [r] } = await dbPool.query("SELECT snapshot FROM lesson_workflow_runs WHERE id=$1", [id]);
    assert.equal(r.snapshot.state, "error");
    assert.ok(r.snapshot.updatedAt > 1, "a pillanatkép ideje frissült");
    const last = r.snapshot.visits.at(-1);
    if (last) { assert.equal(last.state, "error", id); assert.equal(last.error, STOP); assert.ok(last.finishedAt > 1); }
    else assert.deepEqual(r.snapshot.visits, []);
  }
  const { rows: [done] } = await dbPool.query("SELECT snapshot FROM lesson_workflow_runs WHERE id='workflow-stop-visit-run'");
  assert.equal(done.snapshot.visits[0].state, "done", "a már kész lépés változatlan");
});
