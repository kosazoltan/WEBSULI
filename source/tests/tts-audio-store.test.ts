import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { registerLessonTtsAudio, ttsAudioReply, ttsAvailabilityReply, TTS_AUDIO_CACHE_CONTROL_IMMUTABLE } from "../server/tts/audio-routes";
import { LESSON_AUDIO_RATE_LIMIT, TTS_AUDIO_AVAILABILITY_MAX_KEYS, parseTtsAvailabilityQuery, ttsAudioAvailabilityUrl } from "../shared/tts-audio-key";
import {
  assertTotalWithinLimit, ttsAudioLimits, validateTtsAudioRow, DbTtsAudioStore, TtsAudioInputError, TtsStorageLimitError, TTS_AUDIO_LIMITS,
  type TtsAudioRow, type TtsAudioStore,
} from "../server/tts/audio-store";

// Terv 2026-11-18-tananyag-gyartas-minoseg, S8b: méretőr, bemenet-ellenőrzés és a kiszolgáló válasza — adatbázis nélkül.
// Az adatbázisos tároló (DbTtsAudioStore) és a migráció próbája: tests/tts-audio-db.integration.ts (eldobható Postgres).
const ID = "7e7f2ba7194d719aa506cefd97009da4";
const row = (over: Partial<TtsAudioRow> = {}): TtsAudioRow => {
  const bytes = over.bytes ?? Buffer.from("ID3-hang-0123456789");
  return { id: ID, voiceVersion: "gb-1", language: "en-GB", mime: "audio/mpeg", bytes, size: bytes.length, ...over };
};

test("méretőr: hangverziónként 40 MB, abszolút 80 MB, fájlonként 300 KB; a környezeti változó csak a verziókeretet és csak lefelé állítja", () => {
  // Dokumentált spec-pontosítás (review U1, orkesztrátori döntés 2026-11-18): a verziónkénti plafon mellé kemény abszolút összplafon került.
  assert.deepEqual(TTS_AUDIO_LIMITS, { maxTotalBytes: 40 * 1024 * 1024, maxAbsoluteBytes: 80 * 1024 * 1024, maxFileBytes: 300 * 1024 });
  for (const value of [undefined, "1", "0", "99999999999"]) assert.equal(ttsAudioLimits(value).maxAbsoluteBytes, 80 * 1024 * 1024, `az abszolút plafon nem állítható: ${value}`);
  assert.equal(ttsAudioLimits(undefined).maxTotalBytes, 40 * 1024 * 1024);
  assert.equal(ttsAudioLimits("1048576").maxTotalBytes, 1048576, "lefelé állítható");
  assert.equal(ttsAudioLimits("0").maxTotalBytes, 0, "0: minden írás megtagadva");
  for (const up of [String(40 * 1024 * 1024 + 1), "99999999999", "1e3", "-5", "sok", ""]) assert.equal(ttsAudioLimits(up).maxTotalBytes, 40 * 1024 * 1024, `felfelé / hibásan nem: ${up}`);
  assert.equal(ttsAudioLimits("1").maxFileBytes, 300 * 1024, "a fájlplafon nem állítható");
});

test("mutáció: az összplafon pontosan a határon enged, egy bájttal fölötte megtagad", () => {
  const limits = { maxTotalBytes: 1000, maxAbsoluteBytes: 2000, maxFileBytes: 300 };
  const only = (versionBytes: number) => ({ versionBytes, totalBytes: versionBytes });
  assert.doesNotThrow(() => assertTotalWithinLimit(only(900), 100, limits));
  assert.throws(() => assertTotalWithinLimit(only(900), 101, limits), (e: unknown) => e instanceof TtsStorageLimitError && e.reason === "total-exceeded" && e.detail.totalBytes === 900);
  assert.throws(() => assertTotalWithinLimit(only(1000), 1, limits), TtsStorageLimitError);
  assert.doesNotThrow(() => assertTotalWithinLimit(only(0), 1000, limits));
});

// Review U1: a verziókeret mellett a TELJES tábla abszolút plafonja is megtagad — megkülönböztethető okkal.
test("mutáció: az abszolút összplafon a régi verziók soraival együtt számol; a határon enged, egy bájttal fölötte megtagad", () => {
  const limits = { maxTotalBytes: 1000, maxAbsoluteBytes: 2000, maxFileBytes: 300 };
  // Az új verzió kerete még szinte üres (100 / 1000), de a tábla a régi verzióval együtt a plafonnál jár.
  assert.doesNotThrow(() => assertTotalWithinLimit({ versionBytes: 100, totalBytes: 1900 }, 100, limits));
  assert.throws(() => assertTotalWithinLimit({ versionBytes: 100, totalBytes: 1900 }, 101, limits),
    (e: unknown) => e instanceof TtsStorageLimitError && e.reason === "absolute-exceeded" && e.detail.totalBytes === 1900 && e.detail.limit === 2000);
  assert.throws(() => assertTotalWithinLimit({ versionBytes: 0, totalBytes: 2000 }, 1, limits), (e: unknown) => e instanceof TtsStorageLimitError && e.reason === "absolute-exceeded");
  assert.match(new TtsStorageLimitError("absolute-exceeded", { size: 1, totalBytes: 2000, limit: 2000 }).message, /abszolút plafon 2000/);
  assert.notEqual(new TtsStorageLimitError("absolute-exceeded", { size: 1, totalBytes: 1, limit: 1 }).message, new TtsStorageLimitError("total-exceeded", { size: 1, totalBytes: 1, limit: 1 }).message);
  // Ha mindkettő sérül, a verziókeret oka jön (az a szűkebb, a gyártó azt tudja kezelni).
  assert.throws(() => assertTotalWithinLimit({ versionBytes: 1000, totalBytes: 2000 }, 1, limits), (e: unknown) => e instanceof TtsStorageLimitError && e.reason === "total-exceeded");
});

// Review U1: a hangverzió neve nem nyithat új keretet — írni csak a kódban rögzített aktuális verzióra lehet.
test("mutáció: nem az aktuális hangverzióra szóló sor → megtagadva (elgépelt, régi és jövőbeli verziónév is)", () => {
  assert.doesNotThrow(() => validateTtsAudioRow(row()));
  for (const voiceVersion of ["gb-2", "gb-11", "gb-0", "GB-1", "us-1"]) assert.throws(() => validateTtsAudioRow(row({ voiceVersion })), (e: unknown) => e instanceof TtsAudioInputError && /aktuális hangverzió/.test(e.message), voiceVersion);
  assert.doesNotThrow(() => validateTtsAudioRow(row({ voiceVersion: "gb-2" }), undefined, "gb-2"), "hangcsere után az új verzió az aktuális");
  assert.throws(() => validateTtsAudioRow(row(), undefined, "gb-2"), /aktuális hangverzió/, "…és a régire már nem lehet írni");
});

test("mutáció: túl nagy fájl, hibás mime, hibás kulcs, eltérő méret, üres hang → megtagadva a várt okkal", () => {
  const limits = { maxTotalBytes: 1000, maxAbsoluteBytes: 2000, maxFileBytes: 20 };
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
    async existing(keys) { calls.push(`existing ${keys.length}`); return keys.filter((key) => key === ID).map((id) => ({ id, size: 1234 })); },
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
    async existing() { return []; },
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
// Review J1–J2: elérhetőségi jegyzék — a kliens egy kéréssel tudja meg, mely kulcsokhoz van hang (nem kattintásonkénti 404-ből).
const key = (n: number) => n.toString(16).padStart(32, "0");
test("jegyzék: a bemenet csak a kulcsformátum, darabszám-plafonnal; a cím rendezett és ismétlés nélküli", () => {
  assert.equal(TTS_AUDIO_AVAILABILITY_MAX_KEYS, 200);
  assert.deepEqual(parseTtsAvailabilityQuery({ keys: `${key(2)},${key(1)},${key(2)}` }), { keys: [key(2), key(1)] });
  const full = Array.from({ length: 200 }, (_, i) => key(i));
  assert.equal((parseTtsAvailabilityQuery({ keys: full.join(",") }) as { keys: string[] }).keys.length, 200, "pontosan a plafonig enged");
  for (const bad of [{}, { keys: "" }, { keys: [key(1)] }, { keys: 5 }, { keys: "abc" }, { keys: `${key(1)},` }, { keys: `${key(1)},${ID.toUpperCase()}` },
    { keys: `${key(1)} ` }, { keys: "' OR 1=1 --" }, { keys: [...full, key(999)].join(",") }, { keys: "a".repeat(7000) }]) {
    assert.ok("error" in parseTtsAvailabilityQuery(bad as Record<string, unknown>), JSON.stringify(bad).slice(0, 60));
  }
  assert.equal(ttsAudioAvailabilityUrl([key(2), key(1), key(2)]), `/api/tts/lesson-audio/available?keys=${key(1)},${key(2)}`);
  assert.equal(ttsAudioAvailabilityUrl([]), null);
  assert.equal(ttsAudioAvailabilityUrl([key(1), "nem-kulcs"]), null);
  assert.equal(ttsAudioAvailabilityUrl([...full, key(999)]), null, "a plafon fölött nincs kérés");
  assert.ok(ttsAudioAvailabilityUrl(full)!.length < 8000, "a leghosszabb cím is belefér a szokásos URL-korlátba");
});

test("jegyzék válasza: a meglévő kulcsok részhalmaza, rövid gyorsítótárral; hibás bemenet 400 no-store, a tároló megkérdezése nélkül", async () => {
  const asked: string[][] = [];
  const existing = async (keys: string[]) => { asked.push(keys); return [{ id: key(3), size: 300 }, { id: key(1), size: 100 }, { id: key(77), size: 7 }]; };
  const ok = await ttsAvailabilityReply({ keys: `${key(3)},${key(1)},${key(2)}` }, existing);
  assert.deepEqual(ok, { status: 200, headers: { "Cache-Control": "public, max-age=60", "CDN-Cache-Control": "public, max-age=60" }, body: { available: [key(1), key(3)], sizes: { [key(1)]: 100, [key(3)]: 300 } } });
  assert.deepEqual(asked, [[key(3), key(1), key(2)]], "egyetlen tárolóhívás; a nem kért kulcs (77) nem kerül a válaszba");
  const bad = await ttsAvailabilityReply({ keys: "abc" }, existing);
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.headers, { "Cache-Control": "no-store" });
  assert.equal(asked.length, 1, "hibás bemenet nem jut el a tárolóig");
  assert.deepEqual((await ttsAvailabilityReply({ keys: key(9) }, async () => [])).body, { available: [], sizes: {} }, "üres tár: üres jegyzék, nem hiba");
  // S8d: a méret az előtöltés adatforgalmi plafonjához kell — érvénytelen méretű sor nem kerül a jegyzékbe.
  const odd = await ttsAvailabilityReply({ keys: `${key(1)},${key(2)},${key(3)}` }, async () => [{ id: key(1), size: 0 }, { id: key(2), size: Number.NaN }, { id: key(3), size: 9 }]);
  assert.deepEqual(odd.body, { available: [key(3)], sizes: { [key(3)]: 9 } });
});

test("jegyzék végpont (valódi HTTP): az „available” nem kulcs — a jegyzék útvonala megelőzi a hangfájlét", async () => {
  const calls: string[] = [];
  const store: TtsAudioStore = {
    async get(id) { calls.push(`get ${id}`); return null; },
    async existing(keys) { calls.push(`existing ${keys.length}`); return keys.filter((k) => k === ID).map((id) => ({ id, size: 1234 })); },
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
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const ok = await fetch(`${base}${ttsAudioAvailabilityUrl([ID, key(5)])}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "public, max-age=60");
    assert.deepEqual(await ok.json(), { available: [ID], sizes: { [ID]: 1234 } });
    assert.deepEqual(calls, ["existing 2"], "egy tárolóhívás, hangfájl-lekérés nélkül");
    for (const bad of ["", "?keys=", "?keys=abc", `?keys=${ID},x`, `?key=${ID}`]) {
      const invalid = await fetch(`${base}/api/tts/lesson-audio/available${bad}`);
      assert.equal(invalid.status, 400, bad);
      assert.equal(invalid.headers.get("cache-control"), "no-store");
    }
    assert.deepEqual(calls, ["existing 2"]);
    assert.equal((await fetch(`${base}/api/tts/lesson-audio/available`, { method: "POST" })).status, 404, "írás nincs");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// Review J2 + S8d: a hangtár korlátja osztályra méretezett; a bekötést valódi HTTP-n a tests/tts-rate-limits.test.ts méri.
test("sebességkorlát: a hangtár kerete egy egyszerre megnyitó osztály előtöltésére méretezett", () => {
  const { classSize, textsPerLesson, requestsPerAudio, max, windowMs } = LESSON_AUDIO_RATE_LIMIT;
  const classLoad = classSize * textsPerLesson * requestsPerAudio + classSize;
  assert.equal(classLoad, 3630, "30 tanuló × 60 előtöltött hang × 2 kérés (tartománykérés) + 30 jegyzék-kérés");
  assert.ok(max >= classLoad * 1.2, "tartalékkal");
  assert.equal(max, 4500);
  assert.equal(windowMs, 15 * 60 * 1000);
});

// Vak review (szerver) K2: a hangtár útjain a Vercel nem tesz `no-store`-t — a belső hiba és az ismeretlen alút válasza a szerveren múlik.
test("K2: a hangtár 500-as válasza és az ismeretlen alút / metódus 404-e kifejezetten `no-store`", async () => {
  const store: TtsAudioStore = {
    async get() { throw new Error("adatbázishiba"); },
    async existing() { throw new Error("adatbázishiba"); },
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
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/tts/lesson-audio`;
  try {
    for (const path of [`/${ID}`, `/available?keys=${ID}`]) {
      const failed = await fetch(`${base}${path}`);
      assert.deepEqual([failed.status, failed.headers.get("cache-control")], [500, "no-store"], path);
      assert.deepEqual(await failed.json(), { message: "A hang most nem érhető el." }, "a hiba részletei nem kerülnek a válaszba");
    }
    for (const [path, method] of [[`/${ID}/extra`, "GET"], ["/a/b/c", "GET"], [`/${ID}`, "POST"], [`/${ID}`, "DELETE"], ["/available", "PUT"], ["", "GET"]] as const) {
      const unknown = await fetch(`${base}${path}`, { method });
      assert.deepEqual([unknown.status, unknown.headers.get("cache-control")], [404, "no-store"], `${method} ${path}`);
      await unknown.arrayBuffer();
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// Vak review (szerver) K8: az adatbázisos tároló kulcsalak-őre és a jegyzék vágása — adatbázis nélkül, ál-kapcsolattal.
test("K8: a tároló hibás alakú kulcsra nem kérdez az adatbázistól; a jegyzék legfeljebb 200 érvényes kulcsot kérdez, egy lekérdezéssel", async () => {
  const queries: number[] = [];
  const dialect = new PgDialect();
  const database = { execute: async (query: SQL) => { queries.push(dialect.sqlToQuery(query).params.length); return { rows: [] }; } };
  const store = new DbTtsAudioStore(async () => database as never);
  for (const bad of ["", "abc", ID.toUpperCase(), `${ID}0`, "'; SELECT 1; --"]) assert.equal(await store.get(bad), null, bad);
  assert.deepEqual(queries, [], "hibás kulcsra nincs lekérdezés");
  assert.equal(await store.get(ID), null);
  assert.deepEqual(queries, [1]);
  queries.length = 0;
  const many = Array.from({ length: 260 }, (_, i) => i.toString(16).padStart(32, "0"));
  assert.deepEqual(await store.existing([...many, "nem-kulcs", many[0]]), []);
  assert.deepEqual(queries, [200], "egyetlen lekérdezés, a darabszám-plafonra vágva, érvénytelen és ismételt kulcs nélkül");
  queries.length = 0;
  assert.deepEqual(await store.existing(["nem-kulcs", ""]), []);
  assert.deepEqual(queries, [], "érvényes kulcs híján nincs lekérdezés");
});
test("a Vercel a leckehangot gyorsítótárazhatja (nincs no-store, átírás-gyorsítótár bekapcsolva), a többi /api választ nem", () => {
  const cfg = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };
  const noStore = cfg.headers.filter((h) => h.headers.some((x) => x.key === "Cache-Control" && x.value.includes("no-store")));
  const hits = (path: string) => noStore.some((h) => new RegExp(`^${h.source}$`).test(path));
  assert.equal(hits(`/api/tts/lesson-audio/${ID}`), false);
  assert.equal(hits("/api/tts/lesson-audio"), true);
  assert.equal(hits("/api/tts/lesson-audio/available"), false, "a jegyzék rövid gyorsítótárát a szerver fejléce adja");
  assert.equal(hits("/api/tts"), true);
  assert.equal(hits("/api/tts/other"), true);
  const rule = cfg.headers.find((h) => h.source === "/api/tts/lesson-audio/(.*)");
  assert.equal(rule?.headers.find((x) => x.key === "x-vercel-enable-rewrite-caching")?.value, "1");
});
