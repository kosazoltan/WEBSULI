/**
 * Szökőár kép-eltolás (terv 7.7, „A nyugalom-jelző oka”): a jelenet csillapítása és a lap „nyugalomban” döntése egy modulból.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { SHIFT_DAMPING, SHIFT_MAX_STEP_S, SHIFT_SETTLED_PX, dampShift, isShiftSettled } from "../client/src/lib/tsunami/shift";

test("a nyugalom a kirajzolt eltoláshoz kötött: 1 px-en belül igen, azon túl nem; kirajzolt érték nélkül azonnali", () => {
  assert.equal(SHIFT_SETTLED_PX, 1);
  assert.equal(isShiftSettled(149.5, 150), true);
  assert.equal(isShiftSettled(148.9, 150), false);
  assert.equal(isShiftSettled(-0.4, 0), true);
  assert.equal(isShiftSettled(undefined, 150), true, "WebGL nélkül nincs kirajzolt eltolás: azonnali");
  assert.equal(isShiftSettled(null, 150), true);
  assert.equal(isShiftSettled(Number.NaN, 150), true);
});

test("a csillapítás lassú képkockáknál is ~300 ms falióra alatt ér célba (nem a játékmenet 50 ms-os dt-jével)", () => {
  // 150 px-es eltolás 100 ms-os képkockákkal (6× lassított CPU nagyságrendje): 4 képkocka (400 ms) után 1 px-en belül.
  let shown = 0;
  for (let i = 0; i < 4; i++) shown = dampShift(shown, 150, 0.1);
  assert.ok(isShiftSettled(shown, 150), `4 × 100 ms után: ${shown.toFixed(2)} px`);
  // 60 fps-nél ugyanez ~300 ms.
  shown = 0;
  let frames = 0;
  while (!isShiftSettled(shown, 150) && frames < 200) {
    shown = dampShift(shown, 150, 1 / 60);
    frames += 1;
  }
  assert.ok(frames / 60 <= 0.35 && frames / 60 >= 0.25, `60 fps-nél ${(frames / 60).toFixed(3)} s`);
});

test("egy hosszú megakadás (háttérbe tett lap) után a lépés korlátozott, és sosem lő túl", () => {
  const afterStall = dampShift(0, 150, 5);
  assert.ok(afterStall <= 150 && afterStall > 0);
  assert.ok(Math.abs(afterStall - (150 - 150 * Math.exp(-SHIFT_DAMPING * SHIFT_MAX_STEP_S))) < 1e-9);
  assert.equal(dampShift(10, 10, 0.1), 10);
  assert.equal(dampShift(0, 150, -1), 0, "negatív lépésköz nem mozdít");
});
