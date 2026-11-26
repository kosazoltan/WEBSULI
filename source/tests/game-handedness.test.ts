import test from "node:test";
import assert from "node:assert/strict";

import { GAME_HAND_KEY, readHand, writeHand } from "../client/src/game-engine/handedness";

/** JK-1 (docs/specs/2026-11-26-jatek-kezesseg.md): a közös kezesség-preferencia tárolója. */

function memoryStorage(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => { data.set(k, v); },
  };
}

test("alapérték jobbkezes; csak a „left” / „right” érték számít", () => {
  assert.equal(readHand(memoryStorage()), "right");
  assert.equal(readHand(memoryStorage({ [GAME_HAND_KEY]: "left" })), "left");
  assert.equal(readHand(memoryStorage({ [GAME_HAND_KEY]: "right" })), "right");
  assert.equal(readHand(memoryStorage({ [GAME_HAND_KEY]: "bal" })), "right", "ismeretlen érték → alapérték");
  assert.equal(readHand(null), "right", "tároló nélkül alapérték");
});

test("a régi játékkulcs tartalék: csak ha a közös kulcs nincs beállítva", () => {
  const legacy = "websuli.brainrot.hand";
  assert.equal(readHand(memoryStorage({ [legacy]: "left" }), legacy), "left");
  assert.equal(readHand(memoryStorage({ [legacy]: "left", [GAME_HAND_KEY]: "right" }), legacy), "right", "a közös választás az újabb");
});

test("írás: a közös kulcsba és (ha van) a régi kulcsba is; tárolóhiba nem dob", () => {
  const s = memoryStorage();
  writeHand(s, "left", "websuli.brainrot.hand");
  assert.equal(s.data.get(GAME_HAND_KEY), "left");
  assert.equal(s.data.get("websuli.brainrot.hand"), "left");
  const broken = { getItem: () => { throw new Error("privát mód"); }, setItem: () => { throw new Error("megtelt"); } };
  assert.doesNotThrow(() => writeHand(broken, "left"));
  assert.equal(readHand(broken), "right");
});
