import assert from "node:assert/strict";
import test from "node:test";

import * as world from "../client/src/lib/tornado/world.ts";
import { collidersForProp, type Collider } from "../client/src/lib/tornado/collision.ts";

/**
 * Spec 2026-09-29-tornado-ut-kormanyzas H1 / E1–E2. A house stood half on the asphalt: `propsInChunk`
 * only kept the prop's CENTRE 5.85 units off the centreline and ignored its size, so 325 solid props
 * (70 houses, 72 barns, 112 trees …) reached into the 9-unit road band — and since #137 they block it.
 * The world is the same function on every level (no seed), so walking every chunk of the map is
 * exhaustive: every level, every "seed".
 */

const { HALF_WORLD, ROAD_SPACING, ROAD_HALF_WIDTH, CHUNK_SIZE, propsInChunk, chunkCoordsFor } = world;
const CLEARANCE = ROAD_HALF_WIDTH + 1.5;
const LAST = HALF_WORLD / CHUNK_SIZE;

type Extent = { ex: number; ez: number };
type Footprint = { kind: "circle"; r: number } | { kind: "box"; hx: number; hz: number; rotation: number };
type WorldPlus = {
  PROP_ROAD_CLEARANCE?: number;
  propFootprint?: (p: world.WorldProp) => Footprint;
};
const extra = world as unknown as WorldPlus;

function distToLine(v: number): number {
  const m = (((v + HALF_WORLD) % ROAD_SPACING) + ROAD_SPACING) % ROAD_SPACING;
  return Math.min(m, ROAD_SPACING - m);
}

function extentOf(c: { kind: "circle"; r: number } | { kind: "box"; hx: number; hz: number; rotation: number }): Extent {
  if (c.kind === "circle") return { ex: c.r, ez: c.r };
  const s = Math.abs(Math.sin(c.rotation));
  const co = Math.abs(Math.cos(c.rotation));
  return { ex: c.hx * co + c.hz * s, ez: c.hx * s + c.hz * co };
}

function allProps(): { cx: number; cz: number; p: world.WorldProp }[] {
  const out: { cx: number; cz: number; p: world.WorldProp }[] = [];
  for (let cx = -LAST - 1; cx <= LAST; cx++) {
    for (let cz = -LAST - 1; cz <= LAST; cz++) for (const p of propsInChunk(cx, cz)) out.push({ cx, cz, p });
  }
  return out;
}

/** How far the collider's edge is from the nearest road centreline (either axis). */
function edgeGap(c: Collider): number {
  const e = extentOf(c);
  return Math.min(distToLine(c.x) - e.ex, distToLine(c.z) - e.ez);
}

test("egyetlen szilárd ütköző sem nyúlik az út sávjába (+1,5 biztonsági távolság), a teljes térképen", () => {
  const props = allProps();
  assert.ok(props.length > 3000, `the map has props (${props.length})`);
  const bad: string[] = [];
  let solid = 0;
  for (const { p } of props) {
    for (const c of collidersForProp(p)) {
      solid++;
      const gap = edgeGap(c);
      if (gap < CLEARANCE - 1e-9) bad.push(`${p.kind}@(${p.x.toFixed(1)}, ${p.z.toFixed(1)}) edge ${gap.toFixed(2)}`);
    }
  }
  assert.ok(solid > 2000, `solid colliders checked: ${solid}`);
  assert.equal(bad.length, 0, `${bad.length} colliders reach into the road band, e.g. ${bad.slice(0, 5).join("; ")}`);
});

test("a lábnyom (bokor, tető, lomb is) távol marad az úttól, és minden ütköző benne van", () => {
  assert.equal(typeof extra.propFootprint, "function", "world.propFootprint is missing");
  for (const { p } of allProps()) {
    const fp = extra.propFootprint!(p);
    const fe = extentOf(fp);
    const gap = Math.min(distToLine(p.x) - fe.ex, distToLine(p.z) - fe.ez);
    assert.ok(gap >= CLEARANCE - 1e-9, `${p.kind}@(${p.x.toFixed(1)}, ${p.z.toFixed(1)}) footprint edge ${gap.toFixed(2)}`);
    for (const c of collidersForProp(p)) {
      const ce = extentOf(c);
      // The collider may sit off the prop's centre (fuel posts); its far edge must stay inside the footprint.
      assert.ok(Math.abs(c.x - p.x) + ce.ex <= fe.ex + 1e-9, `${p.kind}: collider x-extent outside the footprint`);
      assert.ok(Math.abs(c.z - p.z) + ce.ez <= fe.ez + 1e-9, `${p.kind}: collider z-extent outside the footprint`);
    }
  }
});

test("propsInChunk determinisztikus, és minden tárgy a saját chunkjában marad", () => {
  for (const { cx, cz, p } of allProps()) {
    const c = chunkCoordsFor(p.x, p.z);
    assert.deepEqual(c, { cx, cz }, `${p.kind}@(${p.x}, ${p.z}) left chunk ${cx}:${cz}`);
    assert.equal(world.isWater(p.x, p.z), false, `${p.kind} in the river`);
    assert.equal(world.onBridge(p.x, p.z), false, `${p.kind} on a bridge`);
  }
  for (const [cx, cz] of [[0, 0], [-12, 5], [7, -3], [3, 8]] as const) {
    assert.deepEqual(propsInChunk(cx, cz), propsInChunk(cx, cz));
  }
});

test("a biztonsági távolság: az út fél-szélessége + 1,5", () => {
  assert.equal(extra.PROP_ROAD_CLEARANCE, ROAD_HALF_WIDTH + 1.5);
});
