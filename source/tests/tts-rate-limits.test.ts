import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { mountTtsRateLimits, TTS_RATE_LIMITS } from "../server/tts/rate-limits";
import { readFileSync } from "node:fs";
import { lessonAudioRateLimitMax, LESSON_AUDIO_PRELOAD_MAX, LESSON_AUDIO_RATE_LIMIT } from "../shared/tts-audio-key";
import { SPEECH_PRELOAD } from "../shared/speech-preload";

// Terv 2026-11-18-tananyag-gyartas-minoseg, S8d (vak review K4): a felolvasás három sebességkorlátjának BEKÖTÉSE valódi HTTP-n —
// ugyanaz a `mountTtsRateLimits`, amelyet a szerver (server/index.ts) hív. Forrásszöveg-egyezés helyett viselkedés.
const ID = "7e7f2ba7194d719aa506cefd97009da4";
async function withApp(run: (base: string) => Promise<void>) {
  const app = express();
  app.set("trust proxy", 1);
  mountTtsRateLimits(app);
  app.get("/api/tts/lesson-audio/available", (_req, res) => { res.json({ available: [] }); });
  app.get("/api/tts/lesson-audio/:id", (_req, res) => { res.json({ ok: true }); });
  app.get("/api/tts/audio", (_req, res) => { res.json({ ok: true }); });
  app.post("/api/tts", (_req, res) => { res.json({ ok: true }); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}
/** `count` kérés (50-es csomagokban), a válaszkódok darabszáma. */
async function burst(url: string, count: number, init?: RequestInit): Promise<Record<number, number>> {
  const statuses: Record<number, number> = {};
  for (let sent = 0; sent < count; sent += 50) {
    const batch = await Promise.all(Array.from({ length: Math.min(50, count - sent) }, async () => { const response = await fetch(url, init); await response.arrayBuffer(); return response.status; }));
    for (const status of batch) statuses[status] = (statuses[status] ?? 0) + 1;
  }
  return statuses;
}

test("a korlátok értékei: általános 60, szerveres tartalék 600, hangtár 4 500 kérés / 15 perc / IP", () => {
  assert.deepEqual(TTS_RATE_LIMITS, {
    general: { windowMs: 900_000, max: 60 }, fallback: { windowMs: 900_000, max: 600 }, lessonAudio: { windowMs: 900_000, max: 4500 },
  });
  assert.equal(TTS_RATE_LIMITS.lessonAudio.max, LESSON_AUDIO_RATE_LIMIT.max);
});

// Vak review (szerver) K3: a sebességkeret és az előtöltés plafonja UGYANABBÓL az állandóból számol — nem válhatnak szét.
test("K3: a hangtár kerete az előtöltés plafonjából számol — egy 30 fős osztály teljes előtöltése tartalékkal belefér; ha a plafon nő, a keret vele nő", () => {
  assert.equal(SPEECH_PRELOAD.maxElements, LESSON_AUDIO_PRELOAD_MAX, "az előtöltés plafonja a közös állandó");
  assert.equal(LESSON_AUDIO_RATE_LIMIT.textsPerLesson, LESSON_AUDIO_PRELOAD_MAX);
  assert.equal(LESSON_AUDIO_RATE_LIMIT.max, lessonAudioRateLimitMax(SPEECH_PRELOAD.maxElements));
  const classLoad = LESSON_AUDIO_RATE_LIMIT.classSize * SPEECH_PRELOAD.maxElements * LESSON_AUDIO_RATE_LIMIT.requestsPerAudio + LESSON_AUDIO_RATE_LIMIT.classSize;
  assert.equal(classLoad, 3630, "30 tanuló × 60 előtöltött hang × 2 kérés (tartománykérés) + 30 jegyzék-kérés");
  assert.ok(LESSON_AUDIO_RATE_LIMIT.max >= classLoad * 1.2, "20% tartalék");
  assert.equal(LESSON_AUDIO_RATE_LIMIT.max, 4500);
  assert.equal(lessonAudioRateLimitMax(40), 3000);
  assert.equal(lessonAudioRateLimitMax(120), 9000, "nagyobb plafonhoz nagyobb keret");
  for (const preload of [1, 20, 60, 61, 100, 200]) assert.ok(lessonAudioRateLimitMax(preload) >= (30 * preload * 2 + 30) * 1.2, `plafon ${preload}`);
});

// Vak review (szerver) K1: a VALÓDI szerver a korlátokat ezzel a függvénnyel köti be — a hívás törlése vagy az útvonalak mögé kerülése bukás.
test("K1 bekötés-őr: a szerver belépési pontja a korlátokat pontosan egyszer, az útvonalak felcsatolása ELŐTT köti be", () => {
  const index = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8");
  const calls = [...index.matchAll(/^mountTtsRateLimits\(app\);/gm)];
  assert.equal(calls.length, 1, "a hívás megvan, és nem megjegyzésben / feltételben áll");
  assert.match(index, /^import \{ mountTtsRateLimits \} from "\.\/tts\/rate-limits";$/m);
  const routes = index.search(/\bmountAppRoutes\(app\)/);
  assert.ok(routes > 0 && calls[0].index! < routes, "a korlát az útvonalak ELŐTT áll (különben a kérés korlát nélkül ér a kezelőhöz)");
  assert.doesNotMatch(index, /app\.use\(\s*["`]\/api\/tts/, "a felolvasás útjaira a belépési pont más korlátot nem köt");
});

test("K1 viselkedés: minden felolvasó út a SAJÁT korlátját kapja (a válasz szabványos korlát-fejléce mutatja, melyiket)", async () => {
  await withApp(async (base) => {
    const limit = async (path: string, init?: RequestInit) => { const response = await fetch(`${base}${path}`, init); await response.arrayBuffer(); return response.headers.get("ratelimit-limit"); };
    assert.equal(await limit(`/api/tts/lesson-audio/available?keys=${ID}`), "4500");
    assert.equal(await limit(`/api/tts/lesson-audio/${ID}`), "4500");
    assert.equal(await limit("/api/tts/audio?text=a&lang=en"), "600");
    assert.equal(await limit("/api/tts", { method: "POST" }), "60");
  });
});

// Vak review (szerver) K2: a hangtár útjain a Vercel nem tesz `no-store`-t — a 429 fejléce a szerveren múlik.
test("K2: a hangtár kimerült keretének 429-es válasza kifejezetten `no-store`, és megmondja, mikor lehet újra próbálni", async () => {
  await withApp(async (base) => {
    await burst(`${base}/api/tts/lesson-audio/${ID}`, LESSON_AUDIO_RATE_LIMIT.max);
    const limited = await fetch(`${base}/api/tts/lesson-audio/${ID}`);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("cache-control"), "no-store");
    assert.ok(Number(limited.headers.get("retry-after")) > 0, "Retry-After");
    assert.match(await limited.text(), /Túl sok felolvasási kérés/);
    const manifest = await fetch(`${base}/api/tts/lesson-audio/available?keys=${ID}`);
    assert.deepEqual([manifest.status, manifest.headers.get("cache-control")], [429, "no-store"], "a jegyzék ugyanazon a kereten van");
    await manifest.arrayBuffer();
  });
});

test("K4: a hangtár útjai (jegyzék és hangfájl) NEM fogyasztják az általános 60-as keretet — 61 kérés után sincs 429", async () => {
  await withApp(async (base) => {
    assert.deepEqual(await burst(`${base}/api/tts/lesson-audio/available?keys=${ID}`, 61), { 200: 61 }, "jegyzék");
    assert.deepEqual(await burst(`${base}/api/tts/lesson-audio/${ID}`, 61), { 200: 61 }, "hangfájl");
    // Az általános proxy kerete közben érintetlen maradt: pontosan 60 kérést enged, a 61. már 429.
    assert.deepEqual(await burst(`${base}/api/tts`, 61, { method: "POST" }), { 200: 60, 429: 1 });
  });
});

test("a három korlát független: a kimerült általános keret mellett a hangtár és a szerveres tartalék tovább megy", async () => {
  await withApp(async (base) => {
    assert.deepEqual(await burst(`${base}/api/tts`, 70, { method: "POST" }), { 200: 60, 429: 10 });
    assert.deepEqual(await burst(`${base}/api/tts/lesson-audio/${ID}`, 100), { 200: 100 });
    assert.deepEqual(await burst(`${base}/api/tts/audio?text=a&lang=en`, 100), { 200: 100 });
  });
});

test("a szerveres tartalék 600-as kerete nem közös a hangtáréval — egyik kimerülése sem fogja meg a másikat", async () => {
  await withApp(async (base) => {
    assert.deepEqual(await burst(`${base}/api/tts/audio?text=a&lang=en`, 650), { 200: 600, 429: 50 }, "a tartalék saját kerete 600");
    assert.deepEqual(await burst(`${base}/api/tts/lesson-audio/${ID}`, 650), { 200: 650 }, "a hangtár közben szabad");
  });
});

test("a hangtár saját kerete: egy egyszerre megnyitó osztály teljes előtöltése (3 630 kérés) belefér, a keret fölötti kérés 429", async () => {
  await withApp(async (base) => {
    const classLoad = LESSON_AUDIO_RATE_LIMIT.classSize * LESSON_AUDIO_RATE_LIMIT.textsPerLesson * LESSON_AUDIO_RATE_LIMIT.requestsPerAudio + LESSON_AUDIO_RATE_LIMIT.classSize;
    assert.equal(classLoad, 3630);
    assert.deepEqual(await burst(`${base}/api/tts/lesson-audio/${ID}`, classLoad), { 200: classLoad }, "az osztály teljes előtöltése nem fut 429-be");
    const rest = await burst(`${base}/api/tts/lesson-audio/available?keys=${ID}`, LESSON_AUDIO_RATE_LIMIT.max - classLoad + 25);
    assert.deepEqual(rest, { 200: LESSON_AUDIO_RATE_LIMIT.max - classLoad, 429: 25 }, "a jegyzék és a hangfájl közös hangtár-kereten van");
    assert.deepEqual(await burst(`${base}/api/tts/audio?text=a&lang=en`, 20), { 200: 20 }, "a kimerült hangtár-keret a tartalékot nem fogja meg");
  });
});
