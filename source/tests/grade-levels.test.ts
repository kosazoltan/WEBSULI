import assert from "node:assert/strict";
import test from "node:test";

import { DIFFICULTY_FLOOR } from "../client/src/game-engine/difficulty";
import {
  GRADE_LEVEL_COUNT,
  LEVEL_BAND_SPREAD,
  clampToLevel,
  levelBand,
  loadUnlockedLevel,
  unlockNextLevel,
  type LevelStorage,
} from "../client/src/game-engine/gradeLevels";

// Spec 2026-09-29-palyak-szoletra-nyelvek (1. döntés).

const memory = (): LevelStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

test("E1 levelBand: 10 pálya, szigorúan növekvő, 0,15-től 0,95-ig", () => {
  assert.equal(GRADE_LEVEL_COUNT, 10);
  assert.equal(levelBand(1), DIFFICULTY_FLOOR);
  assert.ok(Math.abs(levelBand(10) - 0.95) < 1e-9);
  for (let l = 2; l <= 10; l++) assert.ok(levelBand(l) > levelBand(l - 1), `${l}. pálya`);
  assert.equal(levelBand(0), levelBand(1), "tartományon kívül a szélső pálya");
  assert.equal(levelBand(99), levelBand(10));
  assert.equal(levelBand(Number.NaN), levelBand(1));
});

test("E1 clampToLevel: az adaptív sáv a pálya sávja ±0,15-ön belül, és a közös tartományban marad", () => {
  for (let l = 1; l <= 10; l++) {
    for (const band of [0, 0.2, 0.5, 0.8, 1]) {
      const c = clampToLevel(band, l);
      assert.ok(Math.abs(c - levelBand(l)) <= LEVEL_BAND_SPREAD + 1e-9, `${l}. pálya, ${band} → ${c}`);
      assert.ok(c >= DIFFICULTY_FLOOR && c <= 1);
    }
  }
  assert.ok(clampToLevel(1, 1) < clampToLevel(0, 10), "a 10. pálya legkönnyebb állapota is nehezebb az 1. legnehezebbjénél");
});

test("E2 haladás: alapból 1, teljesítéskor +1, legfeljebb 10; sérült érték → 1; kulcs játékonként és évfolyamonként", () => {
  const s = memory();
  assert.equal(loadUnlockedLevel("asteroid", 7, s), 1);
  assert.equal(unlockNextLevel("asteroid", 7, 1, s), 2);
  assert.equal(loadUnlockedLevel("asteroid", 7, s), 2);
  assert.equal(unlockNextLevel("asteroid", 7, 1, s), 2, "korábbi pálya ismételt teljesítése nem csökkent és nem ugrik");
  assert.equal(loadUnlockedLevel("asteroid", 8, s), 1, "évfolyamonként külön");
  assert.equal(loadUnlockedLevel("tornado", 7, s), 1, "játékonként külön");
  for (let l = 2; l <= 12; l++) unlockNextLevel("asteroid", 7, l, s);
  assert.equal(loadUnlockedLevel("asteroid", 7, s), 10);
  for (const bad of ["", "x", "-3", "0", "11.5", "NaN"]) {
    s.data.set("websuli.levels.asteroid.9", bad);
    const v = loadUnlockedLevel("asteroid", 9, s);
    assert.ok(v >= 1 && v <= 10 && Number.isInteger(v), `${bad} → ${v}`);
  }
  s.data.set("websuli.levels.asteroid.9", "x");
  assert.equal(loadUnlockedLevel("asteroid", 9, s), 1);
});

test("E2 a tárolás hibája nem dob", () => {
  const broken: LevelStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(loadUnlockedLevel("asteroid", 5, broken), 1);
  assert.equal(unlockNextLevel("asteroid", 5, 1, broken), 2);
});
