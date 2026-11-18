import { after, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { sql } from "drizzle-orm";
import { ttsAudioHash, TTS_VOICE_VERSION } from "../shared/tts-audio-key";

// Terv 2026-11-18-tananyag-gyartas-minoseg, S8b (D4): a hangtár adatbázisos megvalósítása eldobható Postgresben (a tábla a 0043-as
// migrációs fájlból jön — scripts/run-learning-db-tests.ts). Guard BEFORE importing modules with a database connection.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
const { db, dbPool } = await import("../server/db");
const { DbTtsAudioStore, TtsAudioInputError, TtsStorageLimitError, ttsAudioStore } = await import("../server/tts/audio-store");
const { registerLessonTtsAudio } = await import("../server/tts/audio-routes");
const { lessonTtsAudio } = await import("../shared/schema");

after(async () => { await dbPool.end(); });
const count = async () => Number((await db.execute(sql`SELECT count(*)::int AS n FROM lesson_tts_audio`)).rows[0]?.n);
const audioRow = async (text: string, bytes: Buffer) => ({ id: await ttsAudioHash(text, "en-GB"), voiceVersion: TTS_VOICE_VERSION, language: "en-GB", mime: "audio/mpeg", bytes, size: bytes.length });
const storeWith = (maxTotalBytes: number) => new DbTtsAudioStore(async () => db, () => ({ maxTotalBytes, maxFileBytes: 300 * 1024 }));

test("a migráció táblája és a Drizzle-séma egyezik: oszlopok, típusok, index", async () => {
  const { rows } = await db.execute(sql`SELECT column_name, data_type, character_maximum_length AS len, is_nullable FROM information_schema.columns
    WHERE table_name = 'lesson_tts_audio' ORDER BY ordinal_position`);
  assert.deepEqual(rows, [
    { column_name: "id", data_type: "character", len: 32, is_nullable: "NO" },
    { column_name: "voice_version", data_type: "character varying", len: 16, is_nullable: "NO" },
    { column_name: "language", data_type: "character varying", len: 8, is_nullable: "NO" },
    { column_name: "mime", data_type: "character varying", len: 40, is_nullable: "NO" },
    { column_name: "bytes", data_type: "bytea", len: null, is_nullable: "NO" },
    { column_name: "size", data_type: "integer", len: null, is_nullable: "NO" },
    { column_name: "created_at", data_type: "timestamp with time zone", len: null, is_nullable: "NO" },
  ]);
  const indexes = await db.execute(sql`SELECT indexname FROM pg_indexes WHERE tablename = 'lesson_tts_audio' ORDER BY indexname`);
  assert.deepEqual(indexes.rows.map((r) => r.indexname), ["lesson_tts_audio_pkey", "lesson_tts_audio_voice_language_idx"]);
  assert.deepEqual(await db.select().from(lessonTtsAudio), [], "a Drizzle-séma a migráció tábláját olvassa");
});

test("put → get → azonos bájtok; ismételt put → exists (felülírás nélkül); has és totalBytes", async () => {
  const store = storeWith(10_000);
  const bytes = Buffer.from([0x49, 0x44, 0x33, 0, 255, 1, 2, 3, 0, 0, 7]);
  const first = await audioRow("triangle", bytes);
  assert.equal(await store.put(first), "stored");
  const read = await store.get(first.id);
  assert.deepEqual(read, { mime: "audio/mpeg", bytes, size: bytes.length });
  assert.equal(await store.put({ ...first, bytes: Buffer.from("masik-tartalom"), size: 14 }), "exists");
  assert.deepEqual((await store.get(first.id))?.bytes, bytes, "a meglévő sor nem íródik felül");
  const second = await audioRow("This is a triangle.", Buffer.alloc(100, 7));
  assert.equal(await store.put(second), "stored");
  assert.equal(await store.totalBytes(), bytes.length + 100);
  assert.deepEqual(await store.has([first.id, second.id, "0".repeat(32), "nem-kulcs", first.id]), new Set([first.id, second.id]));
  assert.deepEqual(await store.has([]), new Set());
  assert.equal(await store.get("0".repeat(32)), null);
  assert.equal(await store.get("'; DROP TABLE lesson_tts_audio; --"), null);
  const [saved] = await db.select().from(lessonTtsAudio).where(sql`id = ${first.id}`);
  assert.equal(saved.voiceVersion, "gb-1");
  assert.equal(saved.language, "en-GB");
  assert.ok(saved.createdAt instanceof Date);
});

test("mutáció: plafon feletti írás → TtsStorageLimitError, a sorok száma nem nő; az olvasás megy tovább", async () => {
  const before = await count();
  const total = await storeWith(10_000).totalBytes();
  const tight = storeWith(total + 50);
  const tooMuch = await audioRow("over the limit", Buffer.alloc(51, 1));
  await assert.rejects(tight.put(tooMuch), (e: unknown) => e instanceof TtsStorageLimitError && e.reason === "total-exceeded");
  assert.equal(await count(), before);
  assert.equal(await tight.get(tooMuch.id), null);
  assert.ok(await tight.get(await ttsAudioHash("triangle", "en-GB")), "a kiszolgálás a plafon elérése után is megy");
  assert.equal(await tight.put(await audioRow("triangle", Buffer.alloc(5000, 1))), "exists", "meglévő kulcs a plafonnál sem hiba");
  const exact = await audioRow("exactly at the limit", Buffer.alloc(50, 1));
  assert.equal(await tight.put(exact), "stored", "pontosan a plafonig még ír");
  await assert.rejects(tight.put(await audioRow("one more byte", Buffer.alloc(1, 1))), TtsStorageLimitError);
  assert.equal(await count(), before + 1);
});

test("mutáció: túl nagy fájl, hibás mime, hibás kulcs → megtagadva, sor nem keletkezik; egyidejű írás sem lépi át a plafont", async () => {
  const before = await count();
  const store = storeWith(10_000_000);
  await assert.rejects(store.put(await audioRow("too large", Buffer.alloc(300 * 1024 + 1, 1))), (e: unknown) => e instanceof TtsStorageLimitError && e.reason === "file-too-large");
  await assert.rejects(store.put({ ...(await audioRow("wav", Buffer.alloc(10, 1))), mime: "audio/wav" }), TtsAudioInputError);
  await assert.rejects(store.put({ ...(await audioRow("bad id", Buffer.alloc(10, 1))), id: "XYZ" }), TtsAudioInputError);
  assert.equal(await count(), before);
  const total = await store.totalBytes();
  const racing = storeWith(total + 100);
  const results = await Promise.allSettled(await Promise.all(Array.from({ length: 6 }, (_, i) => audioRow(`race ${i}`, Buffer.alloc(40, i + 1)))).then((rows) => rows.map((r) => racing.put(r))));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 2, "40 + 40 fér a 100 bájtos maradékba, a többi megtagadva");
  assert.ok(await racing.totalBytes() <= total + 100);
});

// Review K3: hangcserénél az új verzió gyártása nem akadhat meg a régi verzió sorain; a takarítás kifejezett, külön művelet.
test("hangverzió-váltás: a plafon verziónként számol, a teljes méret csak jelző; a takarítás csak a régi verziók sorait törli", async () => {
  const all = storeWith(10_000_000);
  const oldBytes = await all.totalBytes("gb-1");
  const oldRows = await count();
  assert.ok(oldBytes > 0 && oldRows > 0);
  assert.equal(await all.totalBytes(), oldBytes, "eddig csak gb-1 sorok vannak");
  // A plafon kisebb, mint a régi verzió mérete: ha a régi sorok beleszámítanának, az új verzió egyetlen bájtot sem írhatna.
  const next = storeWith(100);
  const v2 = async (text: string, bytes: Buffer) => ({ id: await ttsAudioHash(text, "en-GB", "gb-2"), voiceVersion: "gb-2", language: "en-GB", mime: "audio/mpeg", bytes, size: bytes.length });
  assert.ok(oldBytes > 100);
  assert.equal(await next.put(await v2("triangle", Buffer.alloc(60, 2))), "stored");
  assert.equal(await next.put(await v2("This is a triangle.", Buffer.alloc(40, 2))), "stored");
  await assert.rejects(next.put(await v2("one more", Buffer.alloc(1, 2))), (e: unknown) => e instanceof TtsStorageLimitError && e.reason === "total-exceeded" && e.detail.totalBytes === 100, "az új verzió saját plafonja él");
  assert.equal(await next.totalBytes("gb-2"), 100);
  assert.deepEqual(await next.usage(), { totalBytes: oldBytes + 100, rows: oldRows + 2, byVersion: { "gb-1": { rows: oldRows, bytes: oldBytes }, "gb-2": { rows: 2, bytes: 100 } } });
  assert.notEqual(await ttsAudioHash("triangle", "en-GB", "gb-2"), await ttsAudioHash("triangle", "en-GB"), "a két verzió kulcsa különbözik, a régi hang közben is kiszolgálható");
  for (const bad of ["", "GB-2", "gb 2", "' OR 1=1 --", "x".repeat(17)]) await assert.rejects(next.purgeOtherVersions(bad), TtsAudioInputError, JSON.stringify(bad));
  assert.equal(await count(), oldRows + 2, "hibás bemenetre semmi nem törlődik");
  assert.deepEqual(await next.purgeOtherVersions("gb-2"), { rows: oldRows, bytes: oldBytes });
  assert.deepEqual(await next.usage(), { totalBytes: 100, rows: 2, byVersion: { "gb-2": { rows: 2, bytes: 100 } } });
  assert.equal(await next.get(await ttsAudioHash("triangle", "en-GB")), null, "a régi verzió hangja törölve");
  assert.ok(await next.get(await ttsAudioHash("triangle", "en-GB", "gb-2")), "az új verzióé megmaradt");
  assert.deepEqual(await next.purgeOtherVersions("gb-2"), { rows: 0, bytes: 0 }, "ismételve nincs mit törölni");
  // A következő (végpont-) teszt a gb-1 „triangle” hangját kéri: visszaírjuk.
  assert.equal(await all.put(await audioRow("triangle", Buffer.from([0x49, 0x44, 0x33, 0, 255, 1, 2, 3, 0, 0, 7]))), "stored");
});

test("végpont az adatbázisos tárolóval: 200 + fejlécek, 304, 206, 404, 400; a gyár ugyanazt a felületet adja", async () => {
  const app = express();
  registerLessonTtsAudio(app, ttsAudioStore());
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/tts/lesson-audio`;
  try {
    const id = await ttsAudioHash("triangle", "en-GB");
    const before = await count();
    const ok = await fetch(`${base}/${id}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("content-type"), "audio/mpeg");
    assert.equal(ok.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(ok.headers.get("etag"), `"${id}"`);
    assert.deepEqual(Buffer.from(await ok.arrayBuffer()), Buffer.from([0x49, 0x44, 0x33, 0, 255, 1, 2, 3, 0, 0, 7]));
    assert.equal((await fetch(`${base}/${id}`, { headers: { "If-None-Match": ok.headers.get("etag")! } })).status, 304);
    const part = await fetch(`${base}/${id}`, { headers: { Range: "bytes=0-2" } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get("content-range"), "bytes 0-2/11");
    const missing = await fetch(`${base}/${await ttsAudioHash("no such word", "en-GB")}`);
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("cache-control"), "no-store");
    assert.equal((await fetch(`${base}/not-a-key`)).status, 400);
    assert.equal(await count(), before, "a végpont csak olvas");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
