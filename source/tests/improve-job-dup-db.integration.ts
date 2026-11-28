import { after, test } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { htmlFiles, improvedHtmlFiles } from "../shared/schema";

// TEST-PG-HARNESS / IMPROVE-JOB-DUP (review #644): a javítás-job foglalását VALÓDI Postgres-párhuzamosság alatt ellenőrizzük
// (eldobható adatbázis, tanácsadó zár + `FOR UPDATE`). A tiszta döntést a tests/improve-job-single.test.ts fedi.
// Guard BEFORE importing modules with a database connection. No production fallback.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
const { db, dbPool } = await import("../server/db");
const { storage } = await import("../server/storage");

after(async () => { await dbPool.end(); });

const job = (originalFileId: string, n: number) => ({
  originalFileId, title: `Javítás ${n}`, content: "<p>jelölt</p>", status: "processing",
});

async function lesson(id: string) {
  await db.insert(htmlFiles).values({ id, title: `Lecke ${id}`, content: "lesson", classroom: 5 });
}

async function processing(originalFileId: string) {
  return db.select({ id: improvedHtmlFiles.id }).from(improvedHtmlFiles)
    .where(and(eq(improvedHtmlFiles.originalFileId, originalFileId), eq(improvedHtmlFiles.status, "processing")));
}

test("8 párhuzamos indítás ugyanarra a leckére: pontosan egy job jön létre, a többi null", async () => {
  await lesson("ijd-same");
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => storage.createImprovedHtmlFile(job("ijd-same", i))));
  assert.equal(results.filter((r) => r !== null).length, 1);
  assert.equal((await processing("ijd-same")).length, 1);
});

test("különböző leckék párhuzamosan: mindegyik saját jobot kap (a zár leckénként szól)", async () => {
  const ids = ["ijd-a", "ijd-b", "ijd-c", "ijd-d"];
  for (const id of ids) await lesson(id);
  const results = await Promise.all(ids.map((id, i) => storage.createImprovedHtmlFile(job(id, i))));
  assert.ok(results.every((r) => r !== null));
  for (const id of ids) assert.equal((await processing(id)).length, 1);
});

test("lejárt (beragadt) processing sor mellett párhuzamosan is pontosan egy új job; a régi hibára zárul", async () => {
  await lesson("ijd-stale");
  const [old] = await db.insert(improvedHtmlFiles)
    .values({ ...job("ijd-stale", 0), createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) }).returning();
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) =>
    storage.createImprovedHtmlFile(job("ijd-stale", i + 1), { staleAfterMs: 60 * 60 * 1000 })));
  const created = results.filter((r) => r !== null);
  assert.equal(created.length, 1);
  const live = await processing("ijd-stale");
  assert.deepEqual(live.map((r) => r.id), [created[0]!.id]);
  const [oldNow] = await db.select({ status: improvedHtmlFiles.status }).from(improvedHtmlFiles).where(eq(improvedHtmlFiles.id, old!.id));
  assert.equal(oldNow!.status, "error");
});

test("friss processing sor mellett staleAfterMs-sel sem indul új job", async () => {
  await lesson("ijd-fresh");
  await db.insert(improvedHtmlFiles).values(job("ijd-fresh", 0));
  const r = await storage.createImprovedHtmlFile(job("ijd-fresh", 1), { staleAfterMs: 60 * 60 * 1000 });
  assert.equal(r, null);
  assert.equal((await processing("ijd-fresh")).length, 1);
});
