import assert from "node:assert/strict";
import test from "node:test";
import { hasVoiceFor, isSoftSpeechError, parseTtsAudioQuery, ttsAudioUrl, ttsLang, TTS_AUDIO_MAX_CHARS } from "../shared/speech-fallback";

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
