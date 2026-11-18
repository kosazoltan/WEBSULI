import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { registerLessonTtsAudio, ttsAudioReply, TTS_AUDIO_CACHE_CONTROL_IMMUTABLE } from "../server/tts/audio-routes";
import {
  assertTotalWithinLimit, ttsAudioLimits, validateTtsAudioRow, TtsAudioInputError, TtsStorageLimitError, TTS_AUDIO_LIMITS,
  type TtsAudioRow, type TtsAudioStore,
} from "../server/tts/audio-store";

// Terv 2026-11-18-tananyag-gyartas-minoseg, S8b: méretőr, bemenet-ellenőrzés és a kiszolgáló válasza — adatbázis nélkül.
// Az adatbázisos tároló (DbTtsAudioStore) és a migráció próbája: tests/tts-audio-db.integration.ts (eldobható Postgres).
const ID = "7e7f2ba7194d719aa506cefd97009da4";
const row = (over: Partial<TtsAudioRow> = {}): TtsAudioRow => {
  const bytes = over.bytes ?? Buffer.from("ID3-hang-0123456789");
  return { id: ID, voiceVersion: "gb-1", language: "en-GB", mime: "audio/mpeg", bytes, size: bytes.length, ...over };
};

test("méretőr: a plafon 40 MB / fájlonként 300 KB; a környezeti változó csak lefelé állít", () => {
  assert.deepEqual(TTS_AUDIO_LIMITS, { maxTotalBytes: 40 * 1024 * 1024, maxFileBytes: 300 * 1024 });
  assert.equal(ttsAudioLimits(undefined).maxTotalBytes, 40 * 1024 * 1024);
  assert.equal(ttsAudioLimits("1048576").maxTotalBytes, 1048576, "lefelé állítható");
  assert.equal(ttsAudioLimits("0").maxTotalBytes, 0, "0: minden írás megtagadva");
  for (const up of [String(40 * 1024 * 1024 + 1), "99999999999", "1e3", "-5", "sok", ""]) assert.equal(ttsAudioLimits(up).maxTotalBytes, 40 * 1024 * 1024, `felfelé / hibásan nem: ${up}`);
  assert.equal(ttsAudioLimits("1").maxFileBytes, 300 * 1024, "a fájlplafon nem állítható");
});

test("mutáció: az összplafon pontosan a határon enged, egy bájttal fölötte megtagad", () => {
  const limits = { maxTotalBytes: 1000, maxFileBytes: 300 };
  assert.doesNotThrow(() => assertTotalWithinLimit(900, 100, limits));
  assert.throws(() => assertTotalWithinLimit(900, 101, limits), (e: unknown) => e instanceof TtsStorageLimitError && e.reason === "total-exceeded" && e.detail.totalBytes === 900);
  assert.throws(() => assertTotalWithinLimit(1000, 1, limits), TtsStorageLimitError);
  assert.doesNotThrow(() => assertTotalWithinLimit(0, 1000, limits));
});

test("mutáció: túl nagy fájl, hibás mime, hibás kulcs, eltérő méret, üres hang → megtagadva a várt okkal", () => {
  const limits = { maxTotalBytes: 1000, maxFileBytes: 20 };
  assert.doesNotThrow(() => validateTtsAudioRow(row({ bytes: Buffer.alloc(20, 1) }), limits));
  assert.throws(() => validateTtsAudioRow(row({ bytes: Buffer.alloc(21, 1) }), limits), (e: unknown) => e instanceof TtsStorageLimitError && e.reason === "file-too-large");
  assert.throws(() => validateTtsAudioRow(row({ bytes: Buffer.alloc(300 * 1024 + 1, 1) })), TtsStorageLimitError, "az alapértelmezett fájlplafon is él");
  for (const mime of ["audio/wav", "text/html", "", "audio/mpeg; x"]) assert.throws(() => validateTtsAudioRow(row({ mime }), limits), TtsAudioInputError, mime);
  for (const id of ["", "abc", ID.toUpperCase(), `${ID}0`, "g".repeat(32), `${ID.slice(0, 31)}'`]) assert.throws(() => validateTtsAudioRow(row({ id }), limits), TtsAudioInputError, id);
  assert.throws(() => validateTtsAudioRow(row({ size: 5 }), limits), /méret/);
  assert.throws(() => validateTtsAudioRow({ ...row(), bytes: Buffer.alloc(0), size: 0 }, limits), /Üres/);
  assert.throws(() => validateTtsAudioRow(row({ voiceVersion: "x".repeat(17) }), limits), /hangverzió/);
  assert.throws(() => validateTtsAudioRow(row({ language: "en-GB-oxendict" }), limits), /nyelvkód/);
});

test("a válasz tiszta függvénye: 200 immutable + ETag, 304, 206, 416, 404 no-store, hibás kulcs 400", () => {
  const bytes = Buffer.from("0123456789");
  const audio = { mime: "audio/mpeg", bytes };
  const full = ttsAudioReply(ID, audio);
  assert.equal(full.status, 200);
  assert.deepEqual(full.headers, {
    ETag: `"${ID}"`, "Cache-Control": "public, max-age=31536000, immutable", "CDN-Cache-Control": "public, max-age=31536000, immutable",
    "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes", "Content-Length": "10", "X-Content-Type-Options": "nosniff",
  });
  assert.equal(TTS_AUDIO_CACHE_CONTROL_IMMUTABLE, "public, max-age=31536000, immutable");
  assert.deepEqual(full.body, bytes);
  for (const ifNoneMatch of [`"${ID}"`, `W/"${ID}"`, `"mas", "${ID}"`, "*"]) {
    const unchanged = ttsAudioReply(ID, audio, { ifNoneMatch, range: "bytes=0-1" });
    assert.equal(unchanged.status, 304, ifNoneMatch);
    assert.equal(unchanged.body, undefined);
    assert.equal(unchanged.headers["Cache-Control"], "public, max-age=31536000, immutable");
  }
  assert.equal(ttsAudioReply(ID, audio, { ifNoneMatch: `"${"0".repeat(32)}"` }).status, 200, "más ETag: teljes válasz");
  const part = ttsAudioReply(ID, audio, { range: "bytes=2-5" });
  assert.equal(part.status, 206);
  assert.equal(part.headers["Content-Range"], "bytes 2-5/10");
  assert.equal(part.body?.toString(), "2345");
  assert.deepEqual(ttsAudioReply(ID, audio, { range: "bytes=50-" }), { status: 416, headers: { "Content-Range": "bytes */10", "Cache-Control": "no-store" } }, "a 416 sem tárolható");
  assert.deepEqual(ttsAudioReply(ID, null), { status: 404, headers: { "Cache-Control": "no-store" } });
  for (const bad of ["", "abc", ID.toUpperCase(), `${ID}.mp3`, "../x"]) assert.deepEqual(ttsAudioReply(bad, audio), { status: 400, headers: { "Cache-Control": "no-store" } }, bad);
});

test("végpont (valódi HTTP, ál-tároló): 200 + fejlécek, 304, 206, 404, 400 — hibás kulcsra a tárolóhoz nem fordul, írás nincs", async () => {
  const bytes = Buffer.from("ID3-0123456789-hang");
  const calls: string[] = [];
  const store: TtsAudioStore = {
    async get(id) { calls.push(`get ${id}`); return id === ID ? { mime: "audio/mpeg", bytes, size: bytes.length } : null; },
    async has() { calls.push("has"); return new Set(); },
    async put() { calls.push("put"); return "stored"; },
    async totalBytes() { calls.push("totalBytes"); return 0; },
    async usage() { calls.push("usage"); return { totalBytes: 0, rows: 0, byVersion: {} }; },
    async purgeOtherVersions() { calls.push("purge"); return { rows: 0, bytes: 0 }; },
  };
  const app = express();
  registerLessonTtsAudio(app, store);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/tts/lesson-audio`;
  try {
    const ok = await fetch(`${base}/${ID}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("content-type"), "audio/mpeg");
    assert.equal(ok.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(ok.headers.get("etag"), `"${ID}"`);
    assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
    assert.equal(ok.headers.get("accept-ranges"), "bytes");
    assert.deepEqual(Buffer.from(await ok.arrayBuffer()), bytes);

    const unchanged = await fetch(`${base}/${ID}`, { headers: { "If-None-Match": `"${ID}"` } });
    assert.equal(unchanged.status, 304);
    assert.equal((await unchanged.arrayBuffer()).byteLength, 0);
    const part = await fetch(`${base}/${ID}`, { headers: { Range: "bytes=0-2" } });
    assert.equal(part.status, 206);
    assert.equal(Buffer.from(await part.arrayBuffer()).toString(), "ID3");
    assert.deepEqual(calls, [`get ${ID}`], "az ismételt, a 304-es és a tartománykérés a memóriából megy");

    const missing = "0".repeat(32);
    const notFound = await fetch(`${base}/${missing}`);
    assert.equal(notFound.status, 404);
    assert.equal(notFound.headers.get("cache-control"), "no-store");
    assert.deepEqual(await notFound.json(), { message: "Nincs ilyen hang." });

    calls.length = 0;
    for (const bad of ["abc", ID.toUpperCase(), `${ID}.mp3`, `${ID}0`, "%27%20OR%201%3D1"]) {
      const invalid = await fetch(`${base}/${bad}`);
      assert.equal(invalid.status, 400, bad);
      assert.equal(invalid.headers.get("cache-control"), "no-store");
    }
    assert.deepEqual(calls, [], "hibás alakú kulcs nem jut el a tárolóig");
    for (const method of ["POST", "PUT", "DELETE"]) assert.equal((await fetch(`${base}/${ID}`, { method })).status, 404, `${method}: írás a végponton nincs`);
    assert.deepEqual(calls, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// Review K2: a hiány (404) nem ragadhat be a szerver memóriájába — a később legyártott hang újraindítás nélkül kiszolgálható.
test("végpont: ismeretlen kulcs 404, majd a tároló megkapja a hangot → ugyanarra a kulcsra 200 (a hiány nem tárolódik)", async () => {
  const bytes = Buffer.from("ID3-kesobb-legyartott-hang");
  const stored = new Map<string, Buffer>();
  let gets = 0;
  const store: TtsAudioStore = {
    async get(id) { gets += 1; const found = stored.get(id); return found ? { mime: "audio/mpeg", bytes: found, size: found.length } : null; },
    async has() { return new Set(); },
    async put() { return "stored"; },
    async totalBytes() { return 0; },
    async usage() { return { totalBytes: 0, rows: 0, byVersion: {} }; },
    async purgeOtherVersions() { return { rows: 0, bytes: 0 }; },
  };
  const app = express();
  registerLessonTtsAudio(app, store);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const address = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/tts/lesson-audio/${ID}`;
  try {
    assert.equal((await fetch(address)).status, 404);
    assert.equal((await fetch(address)).status, 404);
    assert.equal(gets, 2, "minden hiány újra a tárolóhoz fordul");
    stored.set(ID, bytes);
    const ok = await fetch(address);
    assert.equal(ok.status, 200);
    assert.deepEqual(Buffer.from(await ok.arrayBuffer()), bytes);
    assert.equal(gets, 3);
    assert.equal((await fetch(address)).status, 200);
    assert.equal(gets, 3, "a találat viszont a memóriából megy");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test("a Vercel a leckehangot gyorsítótárazhatja (nincs no-store, átírás-gyorsítótár bekapcsolva), a többi /api választ nem", () => {
  const cfg = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };
  const noStore = cfg.headers.filter((h) => h.headers.some((x) => x.key === "Cache-Control" && x.value.includes("no-store")));
  const hits = (path: string) => noStore.some((h) => new RegExp(`^${h.source}$`).test(path));
  assert.equal(hits(`/api/tts/lesson-audio/${ID}`), false);
  assert.equal(hits("/api/tts/lesson-audio"), true);
  assert.equal(hits("/api/tts"), true);
  assert.equal(hits("/api/tts/other"), true);
  const rule = cfg.headers.find((h) => h.source === "/api/tts/lesson-audio/(.*)");
  assert.equal(rule?.headers.find((x) => x.key === "x-vercel-enable-rewrite-caching")?.value, "1");
});
