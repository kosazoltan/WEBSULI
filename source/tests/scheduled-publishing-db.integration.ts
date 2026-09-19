import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

test("scheduled publishing uses the selected real DEV PostgreSQL, including DEV-only configuration", async () => {
  assert.equal(process.env.NODE_ENV, "development");
  const url = new URL(process.env.DEV_DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.pathname, "/websuli_test");
  assert.equal(process.env.DATABASE_URL, "postgresql://127.0.0.1:1/must_not_be_used");
  const { dbPool } = await import("../server/db");
  const { runScheduledPublishingCheck } = await import("../server/scheduledPublishing");
  const id = `qa-scheduled-${randomUUID()}`;
  const jobIds = [`${id}-due`, `${id}-future`, `${id}-dev-only`];
  const originalDatabaseUrl = process.env.DATABASE_URL;
  try {
    await dbPool.query("INSERT INTO users(id,is_admin) VALUES($1,false)", [id]);
    await dbPool.query("INSERT INTO html_files(id,title,content) VALUES($1,'QA scheduled','QA')", [id]);
    await dbPool.query(`INSERT INTO scheduled_jobs(id,type,scheduled_for,payload) VALUES
      ($1,'publish_material',now()-interval '1 minute',$3),
      ($2,'publish_material',now()+interval '1 day',$3)`, [jobIds[0], jobIds[1], { materialId: id, userId: id }]);
    await runScheduledPublishingCheck();
    const read = async (jobId: string) => (await dbPool.query("SELECT status,completed_at,error FROM scheduled_jobs WHERE id=$1", [jobId])).rows[0];
    const first = await read(jobIds[0]);
    assert.equal(first.status, "completed");
    assert.ok(first.completed_at instanceof Date);
    assert.equal(first.error, null);
    assert.equal((await dbPool.query("SELECT user_id FROM html_files WHERE id=$1", [id])).rows[0].user_id, id);
    assert.equal((await read(jobIds[1])).status, "pending");
    await runScheduledPublishingCheck();
    assert.deepEqual(await read(jobIds[0]), first);
    delete process.env.DATABASE_URL;
    await dbPool.query("INSERT INTO scheduled_jobs(id,type,scheduled_for,payload) VALUES($1,'publish_material',now(),$2)", [jobIds[2], { materialId: id, userId: id }]);
    await runScheduledPublishingCheck();
    assert.equal((await read(jobIds[2])).status, "completed");
    assert.equal((await read(jobIds[1])).status, "pending");
  } finally {
    process.env.DATABASE_URL = originalDatabaseUrl;
    await dbPool.query("DELETE FROM scheduled_jobs WHERE id=ANY($1)", [jobIds]);
    await dbPool.query("DELETE FROM html_files WHERE id=$1", [id]);
    await dbPool.query("DELETE FROM users WHERE id=$1", [id]);
    await dbPool.end();
  }
});