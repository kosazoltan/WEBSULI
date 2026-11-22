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

test("árva kisfilm-média: előbb árvának jelölődik, és csak az árvaság türelmi ideje után törlődik; a tárkeretből is kikerül (2. vak kör L6; Copilot 4655721873)", async () => {
  await db.insert(knowledgeMaps).values({ id: "clipgc-map", title: "Kisfilm-takarítás", subject: "matematika", classroom: 7, sourceFiles: [], inputHash: "clipgc-integration-only" });
  await db.insert(lessons).values({ id: "clipgc-lesson", mapId: "clipgc-map", json: fusionFixture(), version: 1, publishedAt: new Date() });
  const referenced = await dbClipStore.putMedia("image", "image/webp", Buffer.from("hivatkozott kép"));
  const replaced = await dbClipStore.putMedia("image", "image/webp", Buffer.from("lecserélt kép"));
  const orphanBytes = Buffer.from("megszakított fejezet hangja");
  const orphan = await dbClipStore.putMedia("audio", "audio/mpeg", orphanBytes);
  const fresh = await dbClipStore.putMedia("video", "video/mp4", Buffer.from("épp készülő fejezet mozgóképe"));
  const row = (clip: unknown, sectionIndex = 0) => dbClipStore.upsert({ lessonId: "clipgc-lesson", sectionIndex, heading: "Első", sourceHash: "a".repeat(64), status: "ready", clip, attempts: 1, model: "teszt" });
  await row({ v: 2, shots: [{ image: referenced }, { image: replaced }] });
  // Minden média régen készült: a régi (created_at-alapú) türelmi idő mindet törölhetőnek látná.
  await db.execute(sql`UPDATE lesson_clip_media SET created_at = now() - interval '3 days' WHERE id IN (${referenced}, ${replaced}, ${orphan}, ${fresh})`);
  // A fejezet újragyártva: a lecserélt kép ettől a pillanattól árva — a még nyitott kliens viszont a türelmi időn belül eléri.
  await row({ v: 2, shots: [{ image: referenced }] });
  const before = await dbClipStore.mediaBytes();
  assert.deepEqual(await dbClipStore.pruneOrphanMedia(24 * 3_600_000), { rows: 0, bytes: 0 }, "első söprés: csak jelöl, nem töröl");
  const marked = async () => (await db.execute(sql`SELECT id FROM lesson_clip_media WHERE orphaned_at IS NOT NULL ORDER BY id`)).rows.map((r) => (r as { id: string }).id.trim());
  assert.deepEqual(await marked(), [replaced, orphan, fresh].sort());
  // Újrahivatkozás (ugyanaz a tartalom újra beíródik) törli a jelölést.
  await dbClipStore.putMedia("video", "video/mp4", Buffer.from("épp készülő fejezet mozgóképe"));
  assert.deepEqual(await marked(), [replaced, orphan].sort(), "az újra beírt média nem árva");
  // Az árvaság türelmi ideje letelik.
  await db.execute(sql`UPDATE lesson_clip_media SET orphaned_at = now() - interval '2 days' WHERE orphaned_at IS NOT NULL`);
  const pruned = await dbClipStore.pruneOrphanMedia(24 * 3_600_000);
  assert.deepEqual(pruned, { rows: 2, bytes: orphanBytes.length + Buffer.from("lecserélt kép").length });
  const left = (await db.execute(sql`SELECT id FROM lesson_clip_media WHERE id IN (${referenced}, ${replaced}, ${orphan}, ${fresh}) ORDER BY id`)).rows.map((r) => (r as { id: string }).id.trim());
  assert.deepEqual(left, [referenced, fresh].sort(), "a hivatkozott és az újra beírt média marad");
  assert.equal(await dbClipStore.mediaBytes(), before - pruned.bytes, "a tárkeret felszabadul");
  assert.deepEqual(await dbClipStore.pruneOrphanMedia(24 * 3_600_000), { rows: 0, bytes: 0 }, "ismételt futás: nincs több törlendő");
});

test("árva kisfilm-média: sok árva sor korlátos adagokban, egyetlen söprésben törlődik; a hivatkozott marad (Copilot 4655721897)", async () => {
  const keep = await dbClipStore.putMedia("image", "image/webp", Buffer.from("adagos próba: hivatkozott"));
  await dbClipStore.upsert({ lessonId: "clipgc-lesson", sectionIndex: 1, heading: "Második", sourceHash: "b".repeat(64), status: "ready", clip: { v: 2, shots: [{ image: keep }] }, attempts: 1, model: "teszt" });
  const ids: string[] = [];
  for (let i = 0; i < 450; i++) ids.push(await dbClipStore.putMedia("audio", "audio/mpeg", Buffer.from(`adagos árva ${i}`)));
  await db.execute(sql`UPDATE lesson_clip_media SET orphaned_at = now() - interval '2 days' WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
  const pruned = await dbClipStore.pruneOrphanMedia(24 * 3_600_000);
  assert.equal(pruned.rows, 450);
  const remaining = Number((await db.execute(sql`SELECT count(*)::int AS n FROM lesson_clip_media WHERE id IN (${sql.join([keep, ...ids].map((id) => sql`${id}`), sql`, `)})`)).rows[0]?.n);
  assert.equal(remaining, 1, "csak a hivatkozott marad");
});

test("a 0044-es migráció és a Drizzle-séma egyezik: lesson_clip_media.orphaned_at", async () => {
  const { rows } = await db.execute(sql`SELECT data_type, is_nullable FROM information_schema.columns WHERE table_name = 'lesson_clip_media' AND column_name = 'orphaned_at'`);
  assert.deepEqual(rows, [{ data_type: "timestamp with time zone", is_nullable: "YES" }]);
});

test("I/O-leltár: a kisfilm-adatréteg minden lekérdezése időkorlátos (statement_timeout) — az elakadt lekérdezés megszakad", async () => {
  const { withClipStatementTimeout } = await import("../server/lesson-clips-db");
  const started = Date.now();
  // A Drizzle a Postgres-hibát `cause`-ként csomagolja: az ok a statement_timeout.
  await assert.rejects(withClipStatementTimeout((tx) => tx.execute(sql`SELECT pg_sleep(5)`), 200), (error: unknown) => /statement timeout/i.test(String((error as { cause?: unknown }).cause ?? error)));
  assert.ok(Date.now() - started < 3000, `az elakadt lekérdezés nem tartja fel (${Date.now() - started} ms)`);
  assert.deepEqual((await withClipStatementTimeout((tx) => tx.execute(sql`SELECT 1 AS ok`), 200)).rows, [{ ok: 1 }]);
});

test("I/O-leltár: a példányok közötti zár nem blokkol — foglalt zárnál a második kör azonnal kimarad, a zár a kör végén felszabadul", async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const first = dbClipStore.exclusive(async () => { await held; return "első"; });
  await new Promise((r) => setTimeout(r, 50));
  const started = Date.now();
  assert.equal(await dbClipStore.exclusive(async () => "második"), null, "foglalt zárnál nincs várakozás, a kör kimarad");
  assert.ok(Date.now() - started < 2000);
  release();
  assert.equal(await first, "első");
  assert.equal(await dbClipStore.exclusive(async () => "harmadik"), "harmadik", "a zár felszabadult");
});
