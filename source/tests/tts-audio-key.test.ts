import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  hasPreparedAudio, isTtsLessonAudioSubPath, normalizeSpeechLanguage, normalizeSpeechText, ttsAudioHash, ttsAudioPath,
  TTS_AUDIO_ID, TTS_AUDIO_LANGUAGES, TTS_VOICE_VERSION,
} from "../shared/tts-audio-key";

// Terv 2026-11-18-tananyag-gyartas-minoseg, S8b: a hangkulcs — rögzített bemenetre rögzített lenyomat.
test("rögzített bemenetre rögzített kulcs: sha256(verzió ⏎ nyelv ⏎ normalizált szöveg) első 32 hexa jegye", async () => {
  assert.equal(TTS_VOICE_VERSION, "gb-1");
  assert.deepEqual([...TTS_AUDIO_LANGUAGES], ["en-GB"]);
  assert.equal(await ttsAudioHash("triangle", "en-GB"), "7e7f2ba7194d719aa506cefd97009da4");
  assert.equal(await ttsAudioHash("This is a triangle.", "en-GB"), "c73ab2445abe0b3369f3ddd97d10abf4");
  const independent = createHash("sha256").update("gb-1\nen-GB\ntriangle").digest("hex").slice(0, 32);
  assert.equal(await ttsAudioHash("triangle", "en-GB"), independent, "a WebCrypto és a node:crypto egyezik");
  assert.match(await ttsAudioHash("triangle", "en-GB"), TTS_AUDIO_ID);
  assert.equal(ttsAudioPath("7e7f2ba7194d719aa506cefd97009da4"), "/api/tts/lesson-audio/7e7f2ba7194d719aa506cefd97009da4");
});

test("normalizálás: a kiejtést nem érintő írásmód-különbség nem ad második fájlt", async () => {
  assert.equal(normalizeSpeechText("  This\u00A0is \t a\r\n triangle.  "), "This is a triangle.");
  assert.equal(normalizeSpeechText("don\u2019t"), "don't");
  assert.equal(normalizeSpeechText("\u201CHello\u201D"), '"Hello"');
  assert.equal(normalizeSpeechText("tri\u00ADan\u200Bgle"), "triangle");
  assert.equal(normalizeSpeechText("tri\uFEFFangle"), "triangle", "a szó közepi BOM törlődik, nem bont két szóra");
  assert.equal(normalizeSpeechText("cafe\u0301"), "caf\u00E9", "NFC: bontott és összetett ékezet azonos");
  const base = await ttsAudioHash("I don't know.", "en-GB");
  for (const variant of ["  I don't   know. ", "I don\u2019t know.", "I\u00A0don't\nknow.", "I do\u200Bn't know."]) assert.equal(await ttsAudioHash(variant, "en-GB"), base, JSON.stringify(variant));
  for (const language of ["en_GB", "en-gb", " EN-gb "]) assert.equal(await ttsAudioHash("I don't know.", language), base, language);
});

test("ami a kiejtést módosítja, az megmarad: kis- / nagybetű és írásjel külön kulcsot ad", async () => {
  assert.equal(normalizeSpeechText("Polish"), "Polish");
  // Review A2: NFC, nem NFKC — a kompatibilitási alakok (felső index, ligatúra, teljes szélességű betű) nem olvadnak össze.
  for (const [compat, plain] of [["x\u00B2", "x2"], ["\uFB01sh", "fish"], ["\uFF21", "A"], ["\u2460", "1"]]) {
    assert.equal(normalizeSpeechText(compat), compat);
    assert.notEqual(normalizeSpeechText(compat), plain);
    assert.notEqual(await ttsAudioHash(compat, "en-GB"), await ttsAudioHash(plain, "en-GB"), plain);
  }
  const keys = await Promise.all(["Polish", "polish", "Really?", "Really.", "Really", "read", "red"].map((text) => ttsAudioHash(text, "en-GB")));
  assert.equal(new Set(keys).size, keys.length);
});

// Mutációs ellenpróbák: a kulcs mindhárom lába számít, és két különböző hármas nem eshet egybe.
test("mutáció: más hangverzió, más nyelv vagy más szöveg → más kulcs; a mezőhatár nem csúsztatható el", async () => {
  const base = await ttsAudioHash("triangle", "en-GB");
  assert.notEqual(await ttsAudioHash("triangle", "en-GB", "gb-2"), base, "a hang cseréje új kulcsokat ad");
  assert.notEqual(await ttsAudioHash("triangle", "en-US"), base);
  assert.notEqual(await ttsAudioHash("triangles", "en-GB"), base);
  // A szövegbe írt sortörés szóközzé válik, így a „verzió ⏎ nyelv ⏎ szöveg” határai nem hamisíthatók.
  assert.notEqual(await ttsAudioHash("GB\ntriangle", "en"), await ttsAudioHash("triangle", "en-GB"));
  assert.equal(await ttsAudioHash("a\nb", "en-GB"), await ttsAudioHash("a b", "en-GB"));
  assert.notEqual(await ttsAudioHash("a b", "en-GB"), await ttsAudioHash("ab", "en-GB"), "a szóköz törlése már más szöveg");
});

test("ütközésmentesség mintán: 3 000 különböző szöveg 3 000 különböző kulcsot ad", async () => {
  const texts = Array.from({ length: 3000 }, (_, i) => `word ${i} ${i % 7 === 0 ? "?" : "."}`);
  const keys = await Promise.all(texts.map((text) => ttsAudioHash(text, "en-GB")));
  assert.equal(new Set(keys).size, texts.length);
});

test("hibás bemenet: üres szöveg, értelmezhetetlen nyelv vagy verzió → hiba; érvénytelen kulcsból nem lesz cím", async () => {
  await assert.rejects(ttsAudioHash("  \u00A0 ", "en-GB"), /Üres/);
  for (const language of ["", "english", "en-GB-x", "en\nGB", "e"]) await assert.rejects(ttsAudioHash("triangle", language), /nyelvkód/, JSON.stringify(language));
  for (const version of ["", "gb\n1", "GB-1", "x".repeat(17)]) await assert.rejects(ttsAudioHash("triangle", "en-GB", version), /hangverzió/, JSON.stringify(version));
  for (const id of ["", "abc", "7E7F2BA7194D719AA506CEFD97009DA4", "../../etc/passwd", `${"a".repeat(32)}?t=1`, "g".repeat(32)]) assert.throws(() => ttsAudioPath(id), /Érvénytelen/, id);
  assert.equal(normalizeSpeechLanguage("en"), "en");
  assert.equal(normalizeSpeechLanguage("de_at"), "de-AT");
});

test("előre gyártott hang csak a brit leckékhez van; a végpont útvonala a korlát kiválasztásához felismerhető", () => {
  assert.equal(hasPreparedAudio("en-GB"), true);
  assert.equal(hasPreparedAudio("en_gb"), true);
  for (const language of ["en-US", "en", "de-DE", "hu-HU", ""]) assert.equal(hasPreparedAudio(language), false, language);
  for (const path of [`/lesson-audio/${"a".repeat(32)}`, "/lesson-audio/x/", "/Lesson-Audio/abc"]) assert.equal(isTtsLessonAudioSubPath(path), true, path);
  for (const path of ["/", "/audio", "/lesson-audio", "/lesson-audio/", "/lesson-audio/a/b", "/x/lesson-audio/a"]) assert.equal(isTtsLessonAudioSubPath(path), false, path);
});
