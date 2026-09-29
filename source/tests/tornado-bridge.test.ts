import assert from "node:assert/strict";
import test from "node:test";

import {
  roadFactor,
  surfaceAt,
  isWater,
  riverCenterX,
  terrainHeight,
  baseTerrainHeight,
  groundHeight,
  deckSurfaceHeight,
  onBridge,
  bridgeSpansInChunk,
  propsInChunk,
  RIVER_DEPTH,
  HALF_WORLD,
  ROAD_SPACING,
  CHUNK_SIZE,
  type BridgeSpan,
} from "../client/src/lib/tornado/world.ts";

/*
 * Spec 2026-09-29-tornado-fizika H1: the river was paint on a flat field, painted AFTER the asphalt, and
 * `surfaceAt` checked water first — where a road met the river the car drove through water (grip 0.12)
 * and the picture showed water flowing over the road (1.5% of all asphalt samples). The fix: a carved
 * river bed and a bridge deck on every road–river crossing.
 */

const LINES = Array.from({ length: Math.round((2 * HALF_WORLD) / ROAD_SPACING) + 1 }, (_, k) => -HALF_WORLD + k * ROAD_SPACING);

test("minden útponton (aszfalt) a felület nem víz, és ahol alatta folyó van, az út legalább 2 egységgel a víz fölött fut", () => {
  let crossings = 0;
  for (let x = -HALF_WORLD; x < HALF_WORLD; x += 2) {
    for (let z = -HALF_WORLD; z < HALF_WORLD; z += 2) {
      if (roadFactor(x, z) <= 0.55) continue;
      assert.notEqual(surfaceAt(x, z), "water", `road at (${x}, ${z}) reports water`);
      if (isWater(x, z)) {
        crossings++;
        assert.ok(onBridge(x, z), `(${x}, ${z}) road over water but not a bridge`);
        const clearance = groundHeight(x, z) - terrainHeight(x, z);
        assert.ok(clearance >= 2, `(${x}, ${z}) deck only ${clearance.toFixed(2)} above the water`);
      }
    }
  }
  assert.ok(crossings > 500, `expected many road-over-river samples, got ${crossings}`);
});

test("a folyómeder a folyó közepén RIVER_DEPTH mély, a folyótól messze nincs bevágás", () => {
  for (let z = -HALF_WORLD + 50; z < HALF_WORLD; z += 97) {
    const rc = riverCenterX(z);
    const drop = baseTerrainHeight(rc, z) - terrainHeight(rc, z);
    assert.ok(Math.abs(drop - RIVER_DEPTH) < 1e-9, `z=${z}: bed depth ${drop}`);
    const far = rc + 60;
    assert.equal(terrainHeight(far, z), baseTerrainHeight(far, z), `z=${z}: no carve 60 units from the river`);
  }
});

test("groundHeight: hídon a pálya magassága, máshol a terep", () => {
  // z = -900 road, river at x ≈ -101.6.
  const rc = riverCenterX(-900);
  assert.ok(onBridge(rc, -900));
  assert.equal(groundHeight(rc, -900), deckSurfaceHeight(rc, -900));
  assert.ok(!onBridge(rc + 150, -900), "the road is a bridge only near the river");
  assert.equal(groundHeight(rc + 150, -900), terrainHeight(rc + 150, -900));
  assert.ok(!onBridge(rc, -900 + 40), "off the road the river is just a river");
  assert.equal(groundHeight(rc, -860), terrainHeight(rc, -860));
});

test("bridgeSpansInChunk lefedi mind a 9 vízszintes út–folyó metszetet, és determinisztikus", () => {
  for (const line of LINES) {
    const rc = riverCenterX(line);
    const cx = Math.floor(rc / CHUNK_SIZE);
    const cz = Math.floor(line / CHUNK_SIZE);
    const spans = bridgeSpansInChunk(cx, cz);
    const hit = spans.find((s) => s.axis === "x" && s.line === line && s.from <= rc && rc <= s.to);
    assert.ok(hit, `z=${line}: no bridge span over x=${rc.toFixed(1)} in chunk ${cx}:${cz} → ${JSON.stringify(spans)}`);
    assert.deepEqual(bridgeSpansInChunk(cx, cz), spans, "same chunk, same spans");
  }
});

test("a chunkhatáron átnyúló híd varrat nélkül folytatódik a szomszéd chunkban", () => {
  const all: BridgeSpan[] = [];
  const r = HALF_WORLD / CHUNK_SIZE;
  for (let cx = -r; cx <= r; cx++) for (let cz = -r; cz <= r; cz++) all.push(...bridgeSpansInChunk(cx, cz));
  assert.ok(all.length > 0);
  let seams = 0;
  for (const s of all) {
    if (s.to % CHUNK_SIZE !== 0) continue;
    const next = all.find((o) => o.axis === s.axis && o.line === s.line && o.from === s.to);
    if (onBridge(s.axis === "x" ? s.to + 0.5 : s.line, s.axis === "x" ? s.line : s.to + 0.5)) {
      seams++;
      assert.ok(next, `span ${JSON.stringify(s)} ends at a chunk edge but does not continue`);
    }
  }
  assert.ok(seams > 0, "the long river-side bridges cross chunk edges");
});

test("a hídpálya keresztben sík, és mellette a meder mindenhol a pálya alatt van", () => {
  // Browser check 2026-09-29: the road's V-shaped cutting (up to ~6 units on a hill) made the first
  // deck a trough, with the river banks beside it standing ABOVE the deck.
  const r = HALF_WORLD / CHUNK_SIZE;
  let samples = 0;
  for (let cx = -r; cx <= r; cx++) {
    for (let cz = -r; cz <= r; cz++) {
      for (const s of bridgeSpansInChunk(cx, cz)) {
        for (let t = s.from; t <= s.to; t += 3) {
          const at = (across: number) => (s.axis === "x" ? { x: t, z: s.line + across } : { x: s.line + across, z: t });
          const c = at(0);
          const centre = deckSurfaceHeight(c.x, c.z);
          for (const across of [-9, -4.5, 4.5, 9]) {
            const e = at(across);
            assert.ok(Math.abs(deckSurfaceHeight(e.x, e.z) - centre) < 1, `deck not flat at ${JSON.stringify(e)}`);
          }
          for (const beside of [-14, 14]) {
            const b = at(beside);
            if (!isWater(b.x, b.z)) continue;
            samples++;
            assert.ok(terrainHeight(b.x, b.z) < centre - 1.5, `river bed beside the deck at ${JSON.stringify(b)} is not below it`);
          }
        }
      }
    }
  }
  assert.ok(samples > 50, `checked ${samples} river samples beside decks`);
});

test("kellék nem áll hídon", () => {
  const r = HALF_WORLD / CHUNK_SIZE;
  for (let cx = -r; cx < r; cx++) {
    for (let cz = -r; cz < r; cz++) {
      for (const p of propsInChunk(cx, cz)) assert.ok(!onBridge(p.x, p.z), `${p.kind} on a bridge at (${p.x}, ${p.z})`);
    }
  }
});
