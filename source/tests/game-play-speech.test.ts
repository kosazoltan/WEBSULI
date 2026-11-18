import assert from "node:assert/strict";
import test from "node:test";

import { SPEECH_LANG, createGameSpeech } from "../client/src/game-engine/play/speech";

/**
 * J0c — felolvasás a játékban (végrehajtás J0c 3. lépés; terv D4, J14; LS-4: `L/tts.ts:1-10`).
 * Függőség-befecskendezéssel: nincs beszéd `arm` előtt, csökkentett mozgásnál, `tts: false`-nál, nem támogatott
 * böngészőben; a nyelvi kód leképezése.
 */

type Env = { supported: boolean; reduced: boolean; tts: boolean; throws?: boolean };

function setup(env: Partial<Env> = {}) {
  const e: Env = { supported: true, reduced: false, tts: true, ...env };
  const spoken: Array<[string, string]> = [];
  const speech = createGameSpeech({
    speak: (t, lang) => {
      if (e.throws) throw new Error("nincs hang");
      spoken.push([t, lang]);
    },
    supported: () => e.supported,
    reducedMotion: () => e.reduced,
    ttsEnabled: () => e.tts,
  });
  return { speech, spoken, env: e };
}

test("a nyelvi kód leképezése: en → en-GB, de → de-DE, fr → fr-FR", () => {
  assert.deepEqual(SPEECH_LANG, { en: "en-GB", de: "de-DE", fr: "fr-FR" });
  const { speech, spoken } = setup();
  speech.arm();
  assert.equal(speech.say("apple", "en"), true);
  assert.equal(speech.say("Apfel", "de"), true);
  assert.equal(speech.say("pomme", "fr"), true);
  assert.deepEqual(spoken, [["apple", "en-GB"], ["Apfel", "de-DE"], ["pomme", "fr-FR"]]);
});

test("nincs beszéd az első koppintás (arm) előtt — utána van", () => {
  const { speech, spoken } = setup();
  assert.equal(speech.say("apple", "en"), false);
  assert.equal(spoken.length, 0);
  speech.arm();
  assert.equal(speech.say("apple", "en"), true);
  assert.equal(spoken.length, 1);
});

test("csökkentett mozgásnál nincs beszéd (LS-4), és available() false", () => {
  const { speech, spoken } = setup({ reduced: true });
  speech.arm();
  assert.equal(speech.available(), false);
  assert.equal(speech.say("apple", "en"), false);
  assert.equal(spoken.length, 0);
});

test("tts: false beállításnál nincs beszéd; visszakapcsolva azonnal van", () => {
  const { speech, spoken, env } = setup({ tts: false });
  speech.arm();
  assert.equal(speech.available(), false);
  assert.equal(speech.say("apple", "en"), false);
  env.tts = true;
  assert.equal(speech.available(), true);
  assert.equal(speech.say("apple", "en"), true);
  assert.equal(spoken.length, 1);
});

test("nem támogatott böngészőben nincs beszéd", () => {
  const { speech, spoken } = setup({ supported: false });
  speech.arm();
  assert.equal(speech.available(), false);
  assert.equal(speech.say("apple", "en"), false);
  assert.equal(spoken.length, 0);
});

test("üres szöveg, ismeretlen nyelv és dobó beszéd-motor → false, kivétel nélkül", () => {
  const { speech, spoken } = setup();
  speech.arm();
  assert.equal(speech.say("   ", "en"), false);
  assert.equal(speech.say("hola", "es" as never), false);
  assert.equal(spoken.length, 0);
  const t = setup({ throws: true });
  t.speech.arm();
  assert.doesNotThrow(() => t.speech.say("apple", "en"));
  assert.equal(t.speech.say("apple", "en"), false);
});
