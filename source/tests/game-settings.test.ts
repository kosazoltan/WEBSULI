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
 * Hibánál / ismeretlen verziónál az alapérték `{ v: 1, tts: true, joystickSide: "right" }`, kivétel soha.
 *
 * SPEC-VÁLTOZÁS 2026-11-18 (docs/specs/2026-11-18-joystick-jobb-kez.md D1): a beállítás új, additív mezőt kapott
 * (`joystickSide`, alap: "right"), ezért a tárolt / betöltött alak pontos egyezései ezzel a mezővel bővültek. A `tts`
 * viselkedésére vonatkozó állítások változatlanok.
 */
const DEFAULTS = { v: 1, tts: true, joystickSide: "right" } as const;

test("üres tár → alapérték (felolvasás BE, D4 (a))", () => {
  assert.deepEqual(loadGameSettings(memoryStorage()), DEFAULTS);
  assert.deepEqual(loadGameSettings(null), DEFAULTS);
});

test("mentés → visszaolvasás; a tárolt alak { v: 1, tts, joystickSide }", () => {
  const s = memoryStorage();
  saveGameSettings(s, { v: 1, tts: false, joystickSide: "right" });
  assert.deepEqual(JSON.parse(s.data.get(GAME_SETTINGS_KEY)!), { v: 1, tts: false, joystickSide: "right" });
  assert.deepEqual(loadGameSettings(s), { v: 1, tts: false, joystickSide: "right" });
  saveGameSettings(s, { v: 1, tts: true, joystickSide: "right" });
  assert.deepEqual(loadGameSettings(s), DEFAULTS);
});

test("joystick oldala: alap a jobb; a bal megmarad; a régi (mező nélküli) alak és az ismeretlen érték → jobb", () => {
  const s = memoryStorage();
  saveGameSettings(s, { v: 1, tts: true, joystickSide: "left" });
  assert.deepEqual(JSON.parse(s.data.get(GAME_SETTINGS_KEY)!), { v: 1, tts: true, joystickSide: "left" });
  assert.equal(loadGameSettings(s).joystickSide, "left");

  // A mező bevezetése ELŐTT tárolt alak: érvényes marad, a felolvasás-beállítás megőrződik.
  s.data.set(GAME_SETTINGS_KEY, JSON.stringify({ v: 1, tts: false }));
  assert.deepEqual(loadGameSettings(s), { v: 1, tts: false, joystickSide: "right" });

  for (const bad of ["LEFT", "bal", "", 1, null, true, { side: "left" }]) {
    s.data.set(GAME_SETTINGS_KEY, JSON.stringify({ v: 1, tts: true, joystickSide: bad }));
    assert.equal(loadGameSettings(s).joystickSide, "right", JSON.stringify(bad));
  }
  // Írásnál is normalizál: érvénytelen érték nem kerül a tárba.
  saveGameSettings(s, { v: 1, tts: true, joystickSide: "fent" as unknown as "left" });
  assert.equal(JSON.parse(s.data.get(GAME_SETTINGS_KEY)!).joystickSide, "right");
});

test("sérült JSON, ismeretlen v, rossz típus → alapérték, kivétel nélkül", () => {
  for (const raw of ["{nem json", JSON.stringify({ v: 2, tts: false }), JSON.stringify([1, 2]), "null", JSON.stringify({ v: 1, tts: "nem" })]) {
    const s = memoryStorage();
    s.data.set(GAME_SETTINGS_KEY, raw);
    assert.deepEqual(loadGameSettings(s), DEFAULTS, raw);
  }
});

test("dobó tár (privát mód / megtelt) → olvasás alapérték, írás csendben elmarad", () => {
  assert.deepEqual(loadGameSettings(memoryStorage({ failGet: true })), DEFAULTS);
  assert.doesNotThrow(() => saveGameSettings(memoryStorage({ failSet: true }), { v: 1, tts: false, joystickSide: "left" }));
  assert.doesNotThrow(() => saveGameSettings(null, { v: 1, tts: false, joystickSide: "left" }));
});
