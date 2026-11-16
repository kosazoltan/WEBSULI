import assert from "node:assert/strict";
import test from "node:test";

import {
  GAME_SETTINGS_KEY,
  loadGameSettings,
  saveGameSettings,
} from "../client/src/game-engine/play/gameSettings";
import { memoryStorage } from "./support/vocab-fixture";

/**
 * J0c — a játékok közös beállításai (végrehajtás J0c „Szerződés” + 3. lépés; terv D4, 8.3).
 * Hibánál / ismeretlen verziónál az alapérték `{ v: 1, tts: true }`, kivétel soha.
 */

test("üres tár → alapérték (felolvasás BE, D4 (a))", () => {
  assert.deepEqual(loadGameSettings(memoryStorage()), { v: 1, tts: true });
  assert.deepEqual(loadGameSettings(null), { v: 1, tts: true });
});

test("mentés → visszaolvasás; a tárolt alak { v: 1, tts }", () => {
  const s = memoryStorage();
  saveGameSettings(s, { v: 1, tts: false });
  assert.deepEqual(JSON.parse(s.data.get(GAME_SETTINGS_KEY)!), { v: 1, tts: false });
  assert.deepEqual(loadGameSettings(s), { v: 1, tts: false });
  saveGameSettings(s, { v: 1, tts: true });
  assert.deepEqual(loadGameSettings(s), { v: 1, tts: true });
});

test("sérült JSON, ismeretlen v, rossz típus → alapérték, kivétel nélkül", () => {
  for (const raw of ["{nem json", JSON.stringify({ v: 2, tts: false }), JSON.stringify([1, 2]), "null", JSON.stringify({ v: 1, tts: "nem" })]) {
    const s = memoryStorage();
    s.data.set(GAME_SETTINGS_KEY, raw);
    assert.deepEqual(loadGameSettings(s), { v: 1, tts: true }, raw);
  }
});

test("dobó tár (privát mód / megtelt) → olvasás alapérték, írás csendben elmarad", () => {
  assert.deepEqual(loadGameSettings(memoryStorage({ failGet: true })), { v: 1, tts: true });
  assert.doesNotThrow(() => saveGameSettings(memoryStorage({ failSet: true }), { v: 1, tts: false }));
  assert.doesNotThrow(() => saveGameSettings(null, { v: 1, tts: false }));
});
