/**
 * Tornado Hunter — solid props (spec 2026-09-29-tornado-fizika H2, D6–D9).
 *
 * The car used to drive straight through houses, trees and poles: the play loop moved it with
 * `stepVehicle` and nothing else. Colliders here come from the same deterministic `propsInChunk`
 * list the renderer draws, so what you see is what you hit, on every machine.
 *
 * Shapes are deliberately simple — circles and rotated boxes on the ground plane — and match the
 * primitive meshes in `buildMeshes.ts`. Bushes are soft (no collider). Nothing in the game removes a
 * prop today; if the tornado ever flattens one, filter it out here with the same key as the renderer.
 */

import type { Vehicle } from "./vehicles";
import {
  bridgeRailSegments,
  bridgeSpansInChunk,
  chunkKey,
  chunksAround,
  propsInChunk,
  spanPoint,
  ROAD_HALF_WIDTH,
  type BridgeSpan,
  type WorldProp,
} from "./world";

export type Collider =
  | { kind: "circle"; x: number; z: number; r: number }
  /** `rotation` follows three.js `rotation.y`: local (lx, lz) → world (lx·cos + lz·sin, −lx·sin + lz·cos). */
  | { kind: "box"; x: number; z: number; hx: number; hz: number; rotation: number };

export type VehicleDims = { width: number; length: number; height: number };

/** Body size per silhouette — `buildVehicle` draws exactly this box. */
export function vehicleDimensions(silhouette: Vehicle["silhouette"]): VehicleDims {
  const heavy = silhouette === "tank" || silhouette === "beast";
  return {
    width: heavy ? 3.1 : silhouette === "van" ? 2.7 : 2.4,
    length: heavy ? 6.4 : silhouette === "van" ? 6.0 : 5.2,
    height: silhouette === "van" ? 1.9 : heavy ? 1.7 : 1.3,
  };
}

/** Local offset rotated like three.js `rotation.y`. */
function rotate(lx: number, lz: number, rotation: number): { x: number; z: number } {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return { x: lx * c + lz * s, z: -lx * s + lz * c };
}

/** The solid parts of one prop (sizes from the meshes in buildMeshes.ts, times `scale`). */
export function collidersForProp(p: WorldProp): Collider[] {
  const k = p.scale;
  const box = (hx: number, hz: number): Collider => ({ kind: "box", x: p.x, z: p.z, hx: hx * k, hz: hz * k, rotation: p.rotation });
  const circle = (r: number, lx = 0, lz = 0): Collider => {
    const o = rotate(lx * k, lz * k, p.rotation);
    return { kind: "circle", x: p.x + o.x, z: p.z + o.z, r: r * k };
  };
  switch (p.kind) {
    case "house":
      return [box(3.5, 4)];
    case "barn":
      return [box(5.5, 8)];
    case "fence":
      return [box(4.5, 0.11)];
    case "silo":
      return [circle(2.6)];
    case "watertower":
      // The tank is 13 units up; only the leg stands in the way.
      return [circle(0.7)];
    case "tree":
      // The crown starts above the cab; the trunk is what stops a car.
      return [circle(0.6)];
    case "pole":
      return [circle(0.28)];
    case "fuel":
      // The canopy is 6 units up; the car drives under it between the two posts.
      return [circle(0.35, -6, 0), circle(0.35, 6, 0)];
    case "bush":
    default:
      return [];
  }
}

const RAIL_HALF_THICKNESS = 0.15;
const RAIL_INSET = 0.2;

/** Railing boxes along both edges of a bridge span, with the same gaps as the railing mesh. */
export function bridgeColliders(span: BridgeSpan): Collider[] {
  const out: Collider[] = [];
  for (const seg of bridgeRailSegments(span)) {
    const half = (seg.to - seg.from) / 2;
    const mid = (seg.from + seg.to) / 2;
    for (const side of [-1, 1]) {
      const c = spanPoint(span, mid, side * (ROAD_HALF_WIDTH - RAIL_INSET));
      out.push(
        span.axis === "x"
          ? { kind: "box", x: c.x, z: c.z, hx: half, hz: RAIL_HALF_THICKNESS, rotation: 0 }
          : { kind: "box", x: c.x, z: c.z, hx: RAIL_HALF_THICKNESS, hz: half, rotation: 0 },
      );
    }
  }
  return out;
}

const chunkCache = new Map<string, Collider[]>();
const CHUNK_CACHE_LIMIT = 256;

function chunkColliders(cx: number, cz: number): Collider[] {
  const key = chunkKey(cx, cz);
  const hit = chunkCache.get(key);
  if (hit) return hit;
  const list: Collider[] = [];
  for (const p of propsInChunk(cx, cz)) list.push(...collidersForProp(p));
  for (const s of bridgeSpansInChunk(cx, cz)) list.push(...bridgeColliders(s));
  if (chunkCache.size >= CHUNK_CACHE_LIMIT) chunkCache.clear();
  chunkCache.set(key, list);
  return list;
}

/** Largest reach of a collider from its chunk: a scaled barn half-diagonal (≈ 13.6) or a railing. */
const QUERY_RADIUS = 20;

/** Every collider that can touch a car at (x, z). Deterministic. */
export function collidersNear(x: number, z: number): Collider[] {
  const out: Collider[] = [];
  for (const { cx, cz } of chunksAround(x, z, QUERY_RADIUS)) out.push(...chunkColliders(cx, cz));
  return out;
}

type Push = { x: number; z: number; depth: number };

/** How far (and which way) a circle must move to leave a collider; null when apart. */
function pushOut(c: Collider, x: number, z: number, r: number): Push | null {
  if (c.kind === "circle") {
    const dx = x - c.x;
    const dz = z - c.z;
    const d = Math.hypot(dx, dz);
    const depth = r + c.r - d;
    if (depth <= 0) return null;
    if (d < 1e-9) return { x: 0, z: 1, depth };
    return { x: dx / d, z: dz / d, depth };
  }
  // Into the box's frame (inverse rotation), find the closest point, back out.
  const cos = Math.cos(c.rotation);
  const sin = Math.sin(c.rotation);
  const dx = x - c.x;
  const dz = z - c.z;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const inside = Math.abs(lx) <= c.hx && Math.abs(lz) <= c.hz;
  let nx: number;
  let nz: number;
  let depth: number;
  if (inside) {
    // Leave through the nearest face.
    const ex = c.hx - Math.abs(lx);
    const ez = c.hz - Math.abs(lz);
    if (ex < ez) {
      nx = lx < 0 ? -1 : 1;
      nz = 0;
      depth = ex + r;
    } else {
      nx = 0;
      nz = lz < 0 ? -1 : 1;
      depth = ez + r;
    }
  } else {
    const qx = Math.max(-c.hx, Math.min(c.hx, lx));
    const qz = Math.max(-c.hz, Math.min(c.hz, lz));
    const ox = lx - qx;
    const oz = lz - qz;
    const d = Math.hypot(ox, oz);
    depth = r - d;
    if (depth <= 0) return null;
    nx = ox / d;
    nz = oz / d;
  }
  const w = rotate(nx, nz, c.rotation);
  return { x: w.x, z: w.z, depth };
}

export type CollisionResult = { x: number; z: number; speed: number; hit: boolean };

/** |cos| of the angle between travel and the wall normal above which a contact is a head-on crash. */
const HEAD_ON = 0.6;
/** Speed lost per second while scraping along a wall, per unit of |cos|. */
const SCRAPE_FRICTION = 2;

/**
 * Push the car out of every collider and take away the part of its speed that drove into them (D7–D8).
 *
 * The footprint is two circles on the long axis (radius = half width), which fits a box-shaped car
 * far better than one circle. A crash (travel within ~53° of the wall normal) kills the speed; a
 * glancing contact only scrapes a little off per second, and the push-out slides the car along the
 * wall — the scalar speed along the heading keeps the tangential part moving.
 */
export function resolveVehicleCollisions(
  body: { x: number; z: number; heading: number; speed: number },
  dims: Pick<VehicleDims, "width" | "length">,
  colliders: readonly Collider[],
  dt = 1 / 60,
): CollisionResult {
  const r = dims.width / 2;
  const off = Math.max(0, dims.length / 2 - r);
  const fx = Math.sin(body.heading);
  const fz = -Math.cos(body.heading);
  let x = body.x;
  let z = body.z;
  let speed = body.speed;
  let hit = false;

  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const sign of [1, -1]) {
      for (const c of colliders) {
        const cx = x + fx * off * sign;
        const cz = z + fz * off * sign;
        const push = pushOut(c, cx, cz, r);
        if (!push) continue;
        x += push.x * push.depth;
        z += push.z * push.depth;
        moved = true;
        hit = true;
        // Direction of travel against the wall normal: −1 head-on, 0 parallel.
        const travel = Math.sign(speed);
        const into = (fx * push.x + fz * push.z) * travel;
        if (into < -HEAD_ON) speed *= 1 + into;
        else if (into < 0) speed *= Math.max(0, 1 + into * SCRAPE_FRICTION * dt);
      }
    }
    if (!moved) break;
  }
  return { x, z, speed, hit };
}
