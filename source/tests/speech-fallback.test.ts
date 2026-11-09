import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { hasVoiceFor, isSoftSpeechError, isTtsAudioSubPath, TtsAudioCache, parseAudioRange, parseTtsAudioQuery, ttsAudioUrl, ttsLang, TTS_AUDIO_CACHE_CONTROL, TTS_AUDIO_CDN_CACHE_CONTROL, TTS_AUDIO_MAX_CHARS } from "../shared/speech-fallback";

// Spec 2026-11-09-felolvasas-tartalek.
test("nyelvkód: a szolgáltatás alapnyelve (a régiós kódot nem fogadja el), ismeretlen nyelv → null", () => {
  assert.equal(ttsLang("en-GB"), "en");
  assert.equal(ttsLang("en_us"), "en");
  assert.equal(ttsLang("en-AU"), "en");
  assert.equal(ttsLang("de-AT"), "de");
  assert.equal(ttsLang("hu-HU"), "hu");
  assert.equal(ttsLang("ja-JP"), null);
});

test("a tartalék hang címe azonos eredetű, kódolt lekérdezéssel", () => {
  assert.equal(ttsAudioUrl("slender", "en-GB"), "/api/tts/audio?text=slender&lang=en");
  assert.equal(ttsAudioUrl("My sister is tall & slender.", "en-GB"), "/api/tts/audio?text=My+sister+is+tall+%26+slender.&lang=en");
  assert.equal(ttsAudioUrl("  ", "en-GB"), null);
  assert.equal(ttsAudioUrl("x".repeat(TTS_AUDIO_MAX_CHARS + 1), "en-GB"), null);
  assert.equal(ttsAudioUrl("konnichiwa", "ja-JP"), null);
});

test("a GET végpont bemenet-ellenőrzése", () => {
  assert.deepEqual(parseTtsAudioQuery({ text: " slender ", lang: "en-GB" }), { text: "slender", lang: "en" });
  assert.deepEqual(parseTtsAudioQuery({ text: "alma" }), { text: "alma", lang: "hu" });
  assert.ok("error" in parseTtsAudioQuery({}));
  assert.ok("error" in parseTtsAudioQuery({ text: ["a", "b"], lang: "en" }));
  assert.ok("error" in parseTtsAudioQuery({ text: "x".repeat(TTS_AUDIO_MAX_CHARS + 1), lang: "en" }));
  assert.ok("error" in parseTtsAudioQuery({ text: "x", lang: "xx-YY" }));
});

test("puha hibák (megszakítás) nem hibák", () => {
  assert.equal(isSoftSpeechError("interrupted"), true);
  assert.equal(isSoftSpeechError("canceled"), true);
  assert.equal(isSoftSpeechError("synthesis-failed"), false);
  assert.equal(isSoftSpeechError(undefined), false);
});

test("van-e böngészőhang a nyelvhez", () => {
  assert.equal(hasVoiceFor([], "en-GB"), true, "üres lista: még tölt");
  assert.equal(hasVoiceFor([{ lang: "hu-HU" }], "en-GB"), false);
  assert.equal(hasVoiceFor([{ lang: "hu-HU" }, { lang: "en_US" }], "en-GB"), true);
  assert.equal(hasVoiceFor([{ lang: "en" }], "en-GB"), true);
});

// Spec 2026-11-09-felolvasas-tartalek, módosítás (gyorsítótár + tartománykérés).
test("tartománykérés: iOS Safari `bytes=0-1`, nyitott vég, utótag, teljesíthetetlen", () => {
  assert.equal(parseAudioRange(undefined, 100), null);
  assert.equal(parseAudioRange("items=0-1", 100), null);
  assert.equal(parseAudioRange("bytes=0-1,5-9", 100), null, "több tartomány: teljes válasz");
  assert.deepEqual(parseAudioRange("bytes=0-1", 100), { start: 0, end: 1 });
  assert.deepEqual(parseAudioRange("bytes=10-", 100), { start: 10, end: 99 });
  assert.deepEqual(parseAudioRange("bytes=90-500", 100), { start: 90, end: 99 });
  assert.deepEqual(parseAudioRange("bytes=-20", 100), { start: 80, end: 99 });
  assert.equal(parseAudioRange("bytes=100-", 100), "invalid");
  assert.equal(parseAudioRange("bytes=5-2", 100), "invalid");
  assert.equal(parseAudioRange("bytes=-0", 100), "invalid");
});

// Review #410: az Express útválasztása nem érzékeny a kis-/nagybetűre és a záró perjelre — a korlát-kihagyás sem lehet az.
test("a külön hangkorlát útvonala: /audio, /audio/, /Audio — más nem", () => {
  for (const path of ["/audio", "/audio/", "/Audio", "/AUDIO/"]) assert.equal(isTtsAudioSubPath(path), true, path);
  for (const path of ["/", "", "/audio/x", "/audiox", "/x/audio"]) assert.equal(isTtsAudioSubPath(path), false, path);
});

// Review #410: a tartománykérés (206) nem kerül a CDN-be, ezért a szerver őrzi a teljes hangot.
test("hangtár: találat, LRU-kiszorítás darabszám és bájtméret szerint", () => {
  const cache = new TtsAudioCache<Uint8Array>(10, 2);
  const bytes = (n: number) => new Uint8Array(n);
  cache.set("a", bytes(4));
  cache.set("b", bytes(4));
  assert.equal(cache.get("a")?.length, 4, "találat, és az „a” lesz a legfrissebb");
  cache.set("c", bytes(4));
  assert.equal(cache.get("b"), undefined, "a legrégebben használt esik ki");
  assert.equal(cache.get("a")?.length, 4);
  assert.equal(cache.size, 2);
  cache.set("d", bytes(8));
  assert.equal(cache.get("a"), undefined, "bájtkeret: 4 + 4 + 8 > 10");
  assert.equal(cache.get("c"), undefined);
  assert.equal(cache.get("d")?.length, 8);
  cache.set("nagy", bytes(11));
  assert.equal(cache.get("nagy"), undefined, "a keretnél nagyobb elem nem kerül be");
  assert.equal(cache.get("d")?.length, 8, "és mást sem szorít ki");
  cache.set("d", bytes(2));
  assert.equal(cache.get("d")?.length, 2, "felülírás");
});

test("a Vercel nem tiltja a hangtartalék gyorsítótárazását, a többi /api válaszét igen", () => {
  const cfg = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };
  const noStore = cfg.headers.filter(h => h.headers.some(x => x.key === "Cache-Control" && x.value.includes("no-store")));
  const hits = (path: string) => noStore.some(h => new RegExp(`^${h.source}$`).test(path));
  assert.equal(hits("/api/tts/audio"), false);
  assert.equal(hits("/api/tts"), true);
  assert.equal(hits("/api/tts/audio/x"), true);
  assert.equal(hits("/api/html-files"), true);
  const audio = cfg.headers.find(h => h.source === "/api/tts/audio");
  assert.equal(audio?.headers.find(x => x.key === "x-vercel-enable-rewrite-caching")?.value, "1");
  assert.match(TTS_AUDIO_CACHE_CONTROL, /public, max-age=\d+/);
  assert.match(TTS_AUDIO_CDN_CACHE_CONTROL, /max-age=\d+/);
});
