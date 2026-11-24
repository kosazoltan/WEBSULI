import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { knowledgeMaps, lessons } from "../shared/schema";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

// U4a (docs/specs/2026-11-24-osszevont-eredmenylevel.md, Adatmodell): a félretett végleges eredmények táblája (0047) — részenként
// egy NYITOTT sor tanulónként és leckénként; az elküldött sor megmarad (a kör felhasználásának tartós nyoma), mellette új nyitott sor lehet.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
const { db, dbPool } = await import("../server/db");

before(async () => {
  await db.insert(knowledgeMaps).values({ id: "pending-map", title: "Félretétel", subject: "matematika", classroom: 6, sourceFiles: [], inputHash: "pending-integration-only" });
  await db.insert(lessons).values({ id: "pending-lesson", mapId: "pending-map", json: fusionFixture(), version: 1, publishedAt: new Date() });
});
after(async () => { await dbPool.end(); });

const insert = (kind: string, round: string, owner = "owner-a") => dbPool.query(
  `INSERT INTO lesson_result_pending (lesson_id, owner_key, kind, round_id, graded, learner) VALUES ('pending-lesson', $1, $2, $3, '{"kind":"x"}', '{"name":"Teszt"}') RETURNING id`,
  [owner, kind, round]);

test("részenként egy nyitott sor; másik rész és másik tanuló külön", async () => {
  await insert("tasks", "r1");
  await assert.rejects(insert("tasks", "r2"), (err: { code?: string }) => err.code === "23505");
  await insert("quiz", "q1");
  await insert("tasks", "r1", "owner-b");
  const open = await dbPool.query(`SELECT count(*)::int AS n FROM lesson_result_pending WHERE sent_at IS NULL`);
  assert.equal(open.rows[0].n, 3);
});

test("elküldés után a sor megmarad, és mellette új nyitott sor lehet; ismeretlen rész és indok elutasítva", async () => {
  await dbPool.query(`UPDATE lesson_result_pending SET sent_at = now(), sent_reason = 'pair', graded = NULL, learner = NULL WHERE owner_key = 'owner-a' AND kind = 'tasks'`);
  await insert("tasks", "r3");
  const rows = await dbPool.query(`SELECT round_id, sent_reason FROM lesson_result_pending WHERE owner_key = 'owner-a' AND kind = 'tasks' ORDER BY created_at`);
  assert.deepEqual(rows.rows.map((r) => [r.round_id, r.sent_reason]), [["r1", "pair"], ["r3", null]]);
  await assert.rejects(insert("essay", "e1"), (err: { code?: string }) => err.code === "23514");
  await assert.rejects(dbPool.query(`UPDATE lesson_result_pending SET sent_reason = 'mas' WHERE round_id = 'r3'`), (err: { code?: string }) => err.code === "23514");
  await assert.rejects(dbPool.query(`UPDATE lesson_result_pending SET graded = NULL WHERE round_id = 'r3'`), (err: { code?: string }) => err.code === "23514", "nyitott sorban kötelező a graded");
});

test("a három CHECK a migrációval azonos néven él (a sémaexport is ugyanígy hozza létre)", async () => {
  const { rows } = await dbPool.query(`SELECT conname FROM pg_constraint WHERE conrelid = 'lesson_result_pending'::regclass AND contype = 'c' ORDER BY conname`);
  assert.deepEqual(rows.map((r) => r.conname), ["lesson_result_pending_kind_check", "lesson_result_pending_open_has_content", "lesson_result_pending_sent_reason_check"]);
});

test("a lecke törlése a félretett sorokat is törli", async () => {
  await dbPool.query(`DELETE FROM lessons WHERE id = 'pending-lesson'`);
  const left = await dbPool.query(`SELECT count(*)::int AS n FROM lesson_result_pending`);
  assert.equal(left.rows[0].n, 0);
});
