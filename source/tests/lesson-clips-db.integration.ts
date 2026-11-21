import { after, test } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { knowledgeMaps, lessons } from "../shared/schema";

// 2. vak kör L6 (docs/specs/2026-11-10-kisfilm-memoria-vegrehajtas.md): a megszakított / sikertelen fejezet árva médiája a türelmi idő
// után törlődik, a hivatkozott és a friss (esetleg épp készülő fejezethez tartozó) média marad. Eldobható Postgres
// (scripts/run-learning-db-tests.ts). Guard BEFORE importing modules with a database connection.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
const { db, dbPool } = await import("../server/db");
const { dbClipStore } = await import("../server/lesson-clips-db");

after(async () => { await dbPool.end(); });

test("árva kisfilm-média: a türelmi időnél régebbi, sehol nem hivatkozott sor törlődik, és a tárkeretből is kikerül", async () => {
  await db.insert(knowledgeMaps).values({ id: "clipgc-map", title: "Kisfilm-takarítás", subject: "matematika", classroom: 7, sourceFiles: [], inputHash: "clipgc-integration-only" });
  await db.insert(lessons).values({ id: "clipgc-lesson", mapId: "clipgc-map", json: fusionFixture(), version: 1, publishedAt: new Date() });
  const referenced = await dbClipStore.putMedia("image", "image/webp", Buffer.from("hivatkozott kép"));
  const orphan = await dbClipStore.putMedia("audio", "audio/mpeg", Buffer.from("megszakított fejezet hangja"));
  const fresh = await dbClipStore.putMedia("video", "video/mp4", Buffer.from("épp készülő fejezet mozgóképe"));
  await dbClipStore.upsert({ lessonId: "clipgc-lesson", sectionIndex: 0, heading: "Első", sourceHash: "a".repeat(64), status: "ready", clip: { v: 2, shots: [{ image: referenced }] }, attempts: 1, model: "teszt" });
  await db.execute(sql`UPDATE lesson_clip_media SET created_at = now() - interval '2 days' WHERE id IN (${referenced}, ${orphan})`);
  const before = await dbClipStore.mediaBytes();
  const pruned = await dbClipStore.pruneOrphanMedia(24 * 3_600_000);
  assert.deepEqual(pruned, { rows: 1, bytes: Buffer.from("megszakított fejezet hangja").length });
  const left = (await db.execute(sql`SELECT id FROM lesson_clip_media WHERE id IN (${referenced}, ${orphan}, ${fresh}) ORDER BY id`)).rows.map((r) => (r as { id: string }).id.trim());
  assert.deepEqual(left, [referenced, fresh].sort(), "a hivatkozott és a friss média marad");
  assert.equal(await dbClipStore.mediaBytes(), before - pruned.bytes, "a tárkeret felszabadul");
  assert.deepEqual(await dbClipStore.pruneOrphanMedia(24 * 3_600_000), { rows: 0, bytes: 0 }, "ismételt futás: nincs több törlendő");
});
