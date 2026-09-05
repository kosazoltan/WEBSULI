import assert from "node:assert/strict";
import test from "node:test";

import {
  readAloudEnabled,
  speak,
  type ReadAloudGate,
} from "../client/src/lib/tts";

/**
 * LS-4 — the TTS gate (master plan §4).
 *
 * The decision logic is pure so it can be pinned without a DOM: readAloud=false
 * is always silent, reduced-motion users are never spoken to, and the speaker
 * itself is a no-op outside a browser. The gesture requirement is structural:
 * `speak` has exactly one production call site — the read-aloud button's click
 * handler — so speech cannot start without a user gesture.
 */

test("readAloud: false → nincs felolvasás, bármi is a többi beállítás", () => {
  const base: ReadAloudGate = { readAloud: false, reducedMotion: false, supported: true };
  assert.equal(readAloudEnabled(base), false);
  assert.equal(readAloudEnabled({ ...base, reducedMotion: false }), false);
  assert.equal(readAloudEnabled({ ...base, supported: true }), false);
});

test("reduced-motion → nincs felolvasás akkor sem, ha a blokk kérné", () => {
  assert.equal(readAloudEnabled({ readAloud: true, reducedMotion: true, supported: true }), false);
});

test("támogatás nélkül (nincs speechSynthesis) → nincs felolvasás", () => {
  assert.equal(readAloudEnabled({ readAloud: true, reducedMotion: false, supported: false }), false);
});

test("minden rendben → van felolvasás", () => {
  assert.equal(readAloudEnabled({ readAloud: true, reducedMotion: false, supported: true }), true);
});

test("a speak Node környezetben no-op — nem dob, nem hív semmit", () => {
  // A tesztek Node alatt futnak: nincs window, nincs speechSynthesis. A hívásnak
  // csendben vissza kell térnie (a böngésző a saját klikk-kezelőjében hívja).
  assert.doesNotThrow(() => speak("A sejt az élőlények alapegysége."));
});
