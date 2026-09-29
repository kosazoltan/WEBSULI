import assert from "node:assert/strict";
import test from "node:test";

import {
  roadFactor,
  surfaceAt,
  propsInChunk,
  HALF_WORLD,
  ROAD_SPACING,
  CHUNK_SIZE,
  type SurfaceKind,
} from "../client/src/lib/tornado/world.ts";

/** Road centrelines: -HALF_WORLD + k·ROAD_SPACING across the whole map. */
const LINE_COUNT = Math.round((2 * HALF_WORLD) / ROAD_SPACING) + 1;
const LINES = Array.from({ length: LINE_COUNT }, (_, k) => -HALF_WORLD + k * ROAD_SPACING);
/** A coordinate halfway between two road lines (cell centre). */
const MID = -HALF_WORLD + ROAD_SPACING / 2;
const HALF_WIDTH = 9;

test("roadFactor: 1 a középvonalon, mindkét tengelyen és a kereszteződésben", () => {
  assert.equal(LINES.length, 9);
  for (const line of LINES) {
    assert.equal(roadFactor(line, MID), 1, `x=${line} centreline`);
    assert.equal(roadFactor(MID, line), 1, `z=${line} centreline`);
  }
  assert.equal(roadFactor(0, 0), 1, "crossing at the origin");
});

test("roadFactor: 0 a cellák belsejében és a félszélességen túl", () => {
  for (let i = 0; i < LINES.length - 1; i++) {
    for (let j = 0; j < LINES.length - 1; j++) {
      const x = MID + i * ROAD_SPACING;
      const z = MID + j * ROAD_SPACING;
      assert.equal(roadFactor(x, z), 0, `cell centre (${x}, ${z})`);
    }
  }
  for (const line of LINES) {
    assert.equal(roadFactor(line + HALF_WIDTH, MID), 0, `x=${line}+${HALF_WIDTH}`);
    assert.equal(roadFactor(line - HALF_WIDTH, MID), 0, `x=${line}-${HALF_WIDTH}`);
  }
});

test("roadFactor: monoton csökken a középvonaltól, szimmetrikusan", () => {
  const line = -HALF_WORLD + ROAD_SPACING;
  let prev = Infinity;
  for (let d = 0; d <= 12; d += 0.25) {
    const right = roadFactor(line + d, MID);
    const left = roadFactor(line - d, MID);
    assert.ok(Math.abs(right - left) < 1e-12, `symmetric at d=${d}: ${right} vs ${left}`);
    if (d < HALF_WIDTH) assert.ok(right < prev, `strictly decreasing at d=${d}: ${right} !< ${prev}`);
    else assert.ok(right <= prev, `non-increasing at d=${d}`);
    prev = right;
  }
});

test("roadFactor: mindig [0, 1], a térképen kívül is", () => {
  for (let x = -HALF_WORLD - 100; x <= HALF_WORLD + 100; x += 7) {
    for (let z = -HALF_WORLD - 100; z <= HALF_WORLD + 100; z += 7) {
      const r = roadFactor(x, z);
      assert.ok(r >= 0 && r <= 1, `roadFactor(${x}, ${z}) = ${r}`);
    }
  }
});

test("surfaceAt: az aszfalt a térkép kis része, a mező a leggyakoribb", () => {
  const counts: Record<SurfaceKind, number> = { asphalt: 0, dirt: 0, grass: 0, mud: 0, water: 0 };
  let n = 0;
  for (let x = -HALF_WORLD; x < HALF_WORLD; x += 4) {
    for (let z = -HALF_WORLD; z < HALF_WORLD; z += 4) {
      counts[surfaceAt(x + 0.5, z + 0.5)]++;
      n++;
    }
  }
  const asphalt = counts.asphalt / n;
  assert.ok(asphalt < 0.3, `asphalt share ${(asphalt * 100).toFixed(2)}% must be well below 30%`);
  assert.ok(asphalt > 0.01, `asphalt share ${(asphalt * 100).toFixed(2)}% — roads must exist`);
  const top = (Object.keys(counts) as SurfaceKind[]).sort((a, b) => counts[b] - counts[a])[0];
  assert.equal(top, "grass", `most common surface: ${JSON.stringify(counts)}`);
});

test("propsInChunk: egyetlen kellék sem áll aszfalton", () => {
  const r = HALF_WORLD / CHUNK_SIZE;
  let total = 0;
  for (let cx = -r; cx < r; cx++) {
    for (let cz = -r; cz < r; cz++) {
      for (const p of propsInChunk(cx, cz)) {
        total++;
        assert.notEqual(surfaceAt(p.x, p.z), "asphalt", `${p.kind} at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
      }
    }
  }
  assert.ok(total > 0, "the map has props");
});
