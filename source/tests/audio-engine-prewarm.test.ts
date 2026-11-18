import assert from "node:assert/strict";
import test from "node:test";

/**
 * Csiszoló kör 4. pont (C-75): az első `new AudioContext()` a főszálon 0,8–2 s. A `prewarmAudio()` ezt előre (a menü alatt)
 * elvégzi, így az első hang (a kérdés-director suhogása, menet közben) már nem hoz létre kontextust.
 */
test("prewarmAudio egyszer hozza létre a hangkontextust; utána a hangok nem hoznak létre újat", async () => {
  let created = 0;
  class FakeParam {
    value = 0;
    setValueAtTime() {}
    exponentialRampToValueAtTime() {}
    linearRampToValueAtTime() {}
  }
  class FakeNode {
    frequency = new FakeParam();
    gain = new FakeParam();
    type = "sine";
    connect() {
      return this;
    }
    start() {}
    stop() {}
  }
  class FakeAudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    constructor() {
      created += 1;
    }
    createOscillator() {
      return new FakeNode();
    }
    createGain() {
      return new FakeNode();
    }
    resume() {
      return Promise.resolve();
    }
  }
  const store = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    AudioContext: FakeAudioContext,
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const audio = await import("../client/src/lib/audioEngine");
  assert.equal(created, 0, "importáláskor még nincs kontextus");
  audio.prewarmAudio();
  assert.equal(created, 1, "a prewarmAudio létrehozza");
  audio.prewarmAudio();
  audio.sfxWhoosh();
  audio.sfxSuccess();
  assert.equal(created, 1, "a további hívások és hangok ugyanazt használják");
});
