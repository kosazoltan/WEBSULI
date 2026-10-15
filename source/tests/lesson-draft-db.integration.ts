import { test, before, after } from "node:test";
import assert from "node:assert/strict";

/* docs/specs/2026-10-15-hiba-gombok.md — a megszakadt piszkozat felismerése (E1) és a kifejezett újragyártás (E3), valódi Postgresen. */

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
const { dbPool } = await import("../server/db");
const { resumableDraftFor, supersedeDraftsOf, oneStepRunView, closeOrphanedOneStepRuns, ONE_STEP_RESUMING_DETAIL, ownerDrafts } = await import("../server/studio/lesson-pipeline-routes");

let n = 0;
async function mapWithJob(job: { status?: string; published?: boolean; output?: Record<string, unknown>; age?: string; owner?: string; map?: string }) {
  n += 1;
  const map = job.map ?? (await dbPool.query("INSERT INTO knowledge_maps(title,subject,classroom,source_files,input_hash) VALUES ('T','matematika',5,'[]'::jsonb,$1) RETURNING id", [`draft-hash-${n}`])).rows[0].id as string;
  const lesson = (await dbPool.query("INSERT INTO lessons(map_id,json,published_at) VALUES ($1,'{}'::jsonb,$2) RETURNING id", [map, job.published ? new Date() : null])).rows[0].id as string;
  const output = job.output ?? { lesson: { title: "Piszkozat" } };
  const id = (await dbPool.query(`INSERT INTO studio_jobs(lesson_id,map_id,step,status,input_hash,output,created_at) VALUES ($1,$2,'author',$3,'h',$4::jsonb, now() - $5::interval) RETURNING id`,
    [lesson, map, job.status ?? "error", JSON.stringify(output), job.age ?? "1 hour"])).rows[0].id as string;
  // A job gazdája a workflow-ja (review #248: csak a saját piszkozat ajánlható fel / tehető félre).
  await dbPool.query("INSERT INTO lesson_workflow_runs(id,owner_id,state,snapshot) VALUES ($1,$2,'error','{}'::jsonb)", [id, job.owner ?? "draft-owner"]);
  return { map, id };
}

before(async () => { await dbPool.query("INSERT INTO users(id,email,is_admin) VALUES ('draft-owner','draft@test.invalid',true),('draft-other','draft-other@test.invalid',true)"); });
// A workflow-sorok fixtúrák (nincs teljes pillanatképük): a fájl végén eltűnnek, hogy a minden sort átfésülő tesztek (lesson-skill) ne lássák.
after(async () => { await dbPool.query("DELETE FROM users WHERE id IN ('draft-owner','draft-other')"); await dbPool.end(); });

test("E1: ugyanabból a forrásból, ugyanazzal a kéréssel a befejezetlen piszkozat megtalálható", async () => {
  const { map, id } = await mapWithJob({});
  assert.equal(await resumableDraftFor(map, undefined, "draft-owner"), id);
  assert.equal(await resumableDraftFor(map, "", "draft-owner"), id, "az üres kérés = nincs kérés");
});

test("E1: más tanári kérés, publikált, kész, félretett vagy 7 napnál régebbi piszkozat nem ajánlható fel", async () => {
  const withInstruction = await mapWithJob({ output: { lesson: {}, ownerInstruction: "csak a törtek" } });
  assert.equal(await resumableDraftFor(withInstruction.map, "csak a törtek", "draft-owner"), withInstruction.id);
  assert.equal(await resumableDraftFor(withInstruction.map, "csak a tizedes törtek", "draft-owner"), null);
  assert.equal(await resumableDraftFor(withInstruction.map, undefined, "draft-owner"), null);
  assert.equal(await resumableDraftFor((await mapWithJob({ published: true })).map, undefined, "draft-owner"), null);
  assert.equal(await resumableDraftFor((await mapWithJob({ status: "ok" })).map, undefined, "draft-owner"), null);
  assert.equal(await resumableDraftFor((await mapWithJob({ output: { title: "nincs lecke" } })).map, undefined, "draft-owner"), null);
  for (const recoveryState of ["superseded", "remanufactured", "remanufacturing"])
    assert.equal(await resumableDraftFor((await mapWithJob({ output: { lesson: {}, recoveryState } })).map, undefined, "draft-owner"), null, recoveryState);
  assert.equal(await resumableDraftFor((await mapWithJob({ age: "8 days" })).map, undefined, "draft-owner"), null);
});

test("E3: a kifejezett újragyártás után a régi piszkozat már nem ajánlható fel, a kész job érintetlen", async () => {
  const { map, id } = await mapWithJob({});
  const done = (await dbPool.query(`INSERT INTO studio_jobs(map_id,step,status,input_hash,output) VALUES ($1,'done','ok','h','{"lesson":{}}'::jsonb) RETURNING id`, [map])).rows[0].id;
  await supersedeDraftsOf(map, undefined, "draft-owner");
  assert.equal(await resumableDraftFor(map, undefined, "draft-owner"), null);
  const rows = (await dbPool.query("SELECT id, output->>'recoveryState' AS state FROM studio_jobs WHERE map_id = $1", [map])).rows;
  assert.equal(rows.find((r) => r.id === id)?.state, "superseded");
  assert.equal(rows.find((r) => r.id === done)?.state, null);
});

test("E2: a választó futás a piszkozat régi futására mutat; folytatás után a job valódi állapotát mutatja (régi futás nélkül is)", async () => {
  const { map, id } = await mapWithJob({ output: { lesson: { title: "P" }, teaching: [] } });
  await dbPool.query("INSERT INTO one_step_runs(id,phase,map_id,job_id) VALUES ('old-run-1','error',$1,$2),('choice-run-1','draft',$1,$2)", [map, id]);
  const choice = await oneStepRunView("choice-run-1");
  assert.equal(choice?.phase, "draft");
  assert.equal((choice as { draftRunId?: string }).draftRunId, "old-run-1");
  assert.ok("resumable" in (choice ?? {}), "a választásnál a folytathatóság is látszik");
  // A folytatás elindult: a job ismét fut — a választó futás már nem ragad a választásnál.
  await dbPool.query("DELETE FROM one_step_runs WHERE id = 'old-run-1'");
  await dbPool.query("UPDATE studio_jobs SET status = 'running', step = 'animator', error = NULL WHERE id = $1", [id]);
  const progressing = await oneStepRunView("choice-run-1");
  assert.equal(progressing?.phase, "animator");
  assert.equal(progressing?.error, null);
});

test("review #248: más gazda piszkozata nem ajánlható fel; az újabb, más kérésű változat nem takarja el az egyezőt", async () => {
  const mine = await mapWithJob({});
  assert.equal(await resumableDraftFor(mine.map, undefined, "draft-other"), null, "másik admin nem kapja meg");
  const newer = await mapWithJob({ map: mine.map, output: { lesson: {}, ownerInstruction: "csak a törtek" }, age: "1 minute" });
  assert.equal(await resumableDraftFor(mine.map, undefined, "draft-owner"), mine.id, "a régebbi, egyező kérésű piszkozat");
  assert.equal(await resumableDraftFor(mine.map, "csak a törtek", "draft-owner"), newer.id);
});

test("review #248: az újragyártás csak a saját, egyező kérésű, megállt piszkozatot teszi félre", async () => {
  const stopped = await mapWithJob({});
  const other = await mapWithJob({ map: stopped.map, output: { lesson: {}, ownerInstruction: "más kérés" } });
  const running = await mapWithJob({ map: stopped.map, status: "running" });
  const foreign = await mapWithJob({ map: stopped.map, owner: "draft-other" });
  await supersedeDraftsOf(stopped.map, undefined, "draft-owner");
  const state = async (id: string) => (await dbPool.query("SELECT output->>'recoveryState' AS s FROM studio_jobs WHERE id=$1", [id])).rows[0].s;
  assert.equal(await state(stopped.id), "superseded");
  assert.equal(await state(other.id), null, "más kérésű változat érintetlen");
  assert.equal(await state(running.id), null, "futó job érintetlen");
  assert.equal(await state(foreign.id), null, "más gazda érintetlen");
});

test("review #247: újraindításkor csak a ténylegesen folytatódó job futása marad nyitva; a hibás jobé lezárul", async () => {
  const live = await mapWithJob({ status: "running" });
  await dbPool.query("UPDATE lesson_workflow_runs SET state='running', lease_until = now() - interval '1 minute', snapshot='{\"executions\":1}'::jsonb WHERE id=$1", [live.id]);
  const failed = await mapWithJob({ status: "error" });
  await dbPool.query("INSERT INTO one_step_runs(id,phase,map_id,job_id) VALUES ('boot-live','animator',$1,$2),('boot-failed','animator',$3,$4)", [live.map, live.id, failed.map, failed.id]);
  await closeOrphanedOneStepRuns();
  const run = async (id: string) => (await dbPool.query("SELECT phase, detail FROM one_step_runs WHERE id=$1", [id])).rows[0];
  assert.deepEqual(await run("boot-live"), { phase: "animator", detail: ONE_STEP_RESUMING_DETAIL });
  assert.equal((await run("boot-failed")).phase, "error", "nem folytatható job futása nem pollozhat örökké");
});

test("admin „Tananyag draft” (A1/A2): a saját megállt és futó piszkozat látszik, a publikált / félretett / sikeres / idegen nem", async () => {
  await dbPool.query("DELETE FROM users WHERE id = 'draft-lister'");
  await dbPool.query("INSERT INTO users(id,email,is_admin) VALUES ('draft-lister','lister@test.invalid',true)");
  try {
    const parts = { experienceCheckpoint: { parts: { a: {}, b: {} } } };
    const stopped = await mapWithJob({ owner: "draft-lister", output: { lesson: { title: "Virágos növények", sections: [{}, {}, {}] }, ...parts } });
    const running = await mapWithJob({ owner: "draft-lister", status: "running", output: { lesson: { sections: [{}] } } });
    await mapWithJob({ owner: "draft-lister", published: true });
    await mapWithJob({ owner: "draft-lister", status: "ok" });
    await mapWithJob({ owner: "draft-lister", output: { lesson: {}, recoveryState: "superseded" } });
    await mapWithJob({ owner: "draft-lister", output: { title: "nincs lecke" } });
    await mapWithJob({ owner: "draft-other" });
    const list = await ownerDrafts("draft-lister");
    assert.deepEqual(list.map((d) => d.jobId).sort(), [stopped.id, running.id].sort());
    const s = list.find((d) => d.jobId === stopped.id)!;
    assert.equal(s.title, "Virágos növények");
    assert.deepEqual(s.draft, { teachingSections: 3, savedBankPackets: 2 });
    assert.equal(s.running, false);
    assert.equal(typeof s.resumable, "boolean");
    const r = list.find((d) => d.jobId === running.id)!;
    assert.equal(r.running, true);
    assert.equal(r.resumable, false, "futó jobnál nincs folytatás gomb");
    assert.equal(r.title, "T", "lecke-cím nélkül a térkép címe");
  } finally {
    await dbPool.query("DELETE FROM users WHERE id = 'draft-lister'");
  }
});

test("review #250: a megállt futás nézete visszaadja az eredeti tanári kérést (oldalfrissítés utáni újragyártáshoz)", async () => {
  const { map, id } = await mapWithJob({ output: { lesson: { sections: [{}] }, ownerInstruction: "csak a törtek" } });
  await dbPool.query("INSERT INTO one_step_runs(id,phase,map_id,job_id,error) VALUES ('instr-run-1','error',$1,$2,'x')", [map, id]);
  assert.equal((await oneStepRunView("instr-run-1"))?.ownerInstruction, "csak a törtek");
});
