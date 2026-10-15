import { test, before, after } from "node:test";
import assert from "node:assert/strict";

/* docs/specs/2026-10-15-hiba-gombok.md — a megszakadt piszkozat felismerése (E1) és a kifejezett újragyártás (E3), valódi Postgresen. */

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
const { dbPool } = await import("../server/db");
const { resumableDraftFor, supersedeDraftsOf, oneStepRunView } = await import("../server/studio/lesson-pipeline-routes");

let n = 0;
async function mapWithJob(job: { status?: string; published?: boolean; output?: Record<string, unknown>; age?: string }) {
  n += 1;
  const map = (await dbPool.query("INSERT INTO knowledge_maps(title,subject,classroom,source_files,input_hash) VALUES ('T','matematika',5,'[]'::jsonb,$1) RETURNING id", [`draft-hash-${n}`])).rows[0].id as string;
  const lesson = (await dbPool.query("INSERT INTO lessons(map_id,json,published_at) VALUES ($1,'{}'::jsonb,$2) RETURNING id", [map, job.published ? new Date() : null])).rows[0].id as string;
  const output = job.output ?? { lesson: { title: "Piszkozat" } };
  const id = (await dbPool.query(`INSERT INTO studio_jobs(lesson_id,map_id,step,status,input_hash,output,created_at) VALUES ($1,$2,'author',$3,'h',$4::jsonb, now() - $5::interval) RETURNING id`,
    [lesson, map, job.status ?? "error", JSON.stringify(output), job.age ?? "1 hour"])).rows[0].id as string;
  return { map, id };
}

before(async () => { await dbPool.query("SELECT 1"); });
after(() => dbPool.end());

test("E1: ugyanabból a forrásból, ugyanazzal a kéréssel a befejezetlen piszkozat megtalálható", async () => {
  const { map, id } = await mapWithJob({});
  assert.equal(await resumableDraftFor(map, undefined), id);
  assert.equal(await resumableDraftFor(map, ""), id, "az üres kérés = nincs kérés");
});

test("E1: más tanári kérés, publikált, kész, félretett vagy 7 napnál régebbi piszkozat nem ajánlható fel", async () => {
  const withInstruction = await mapWithJob({ output: { lesson: {}, ownerInstruction: "csak a törtek" } });
  assert.equal(await resumableDraftFor(withInstruction.map, "csak a törtek"), withInstruction.id);
  assert.equal(await resumableDraftFor(withInstruction.map, "csak a tizedes törtek"), null);
  assert.equal(await resumableDraftFor(withInstruction.map, undefined), null);
  assert.equal(await resumableDraftFor((await mapWithJob({ published: true })).map, undefined), null);
  assert.equal(await resumableDraftFor((await mapWithJob({ status: "ok" })).map, undefined), null);
  assert.equal(await resumableDraftFor((await mapWithJob({ output: { title: "nincs lecke" } })).map, undefined), null);
  for (const recoveryState of ["superseded", "remanufactured", "remanufacturing"])
    assert.equal(await resumableDraftFor((await mapWithJob({ output: { lesson: {}, recoveryState } })).map, undefined), null, recoveryState);
  assert.equal(await resumableDraftFor((await mapWithJob({ age: "8 days" })).map, undefined), null);
});

test("E3: a kifejezett újragyártás után a régi piszkozat már nem ajánlható fel, a kész job érintetlen", async () => {
  const { map, id } = await mapWithJob({});
  const done = (await dbPool.query(`INSERT INTO studio_jobs(map_id,step,status,input_hash,output) VALUES ($1,'done','ok','h','{"lesson":{}}'::jsonb) RETURNING id`, [map])).rows[0].id;
  await supersedeDraftsOf(map);
  assert.equal(await resumableDraftFor(map, undefined), null);
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
