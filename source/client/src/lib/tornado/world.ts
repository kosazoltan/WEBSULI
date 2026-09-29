/**
 * Tornado Hunter 200 — the drivable world.
 *
 * The brief asks for a large, freely drivable map with roads, farms, forests,
 * rivers, hills and mud. Storing that as assets would be megabytes; instead the
 * world is a pure FUNCTION of a seed, so the terrain height, the road grid and
 * every prop position are recomputed identically on every machine and nothing
 * ships in the bundle.
 *
 * The Three.js layer asks this module what stands near the player and only
 * builds meshes for that neighbourhood — that is what keeps a 4 km² map running
 * on a school laptop.
 */

export const WORLD_SIZE = 2400;
export const HALF_WORLD = WORLD_SIZE / 2;
/** Spacing of the main road grid, world units. */
export const ROAD_SPACING = 300;
/** World units per kilometre (the HUD converts distance with this). */
export const UNITS_PER_KM = 260;

export type SurfaceKind = "asphalt" | "dirt" | "grass" | "mud" | "water";

export type PropKind =
  | "house"
  | "barn"
  | "silo"
  | "tree"
  | "bush"
  | "pole"
  | "fuel"
  | "watertower"
  | "fence";

export type WorldProp = {
  kind: PropKind;
  x: number;
  z: number;
  /** Radians. */
  rotation: number;
  scale: number;
};

/** Deterministic hash → [0,1). Same input, same value, no state. */
function hash2(x: number, z: number, salt: number): number {
  let h = Math.imul(Math.round(x) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(z) | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 13), 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise on a grid of the given cell size. */
function valueNoise(x: number, z: number, cell: number, salt: number): number {
  const gx = Math.floor(x / cell);
  const gz = Math.floor(z / cell);
  const fx = smooth(x / cell - gx);
  const fz = smooth(z / cell - gz);
  const n00 = hash2(gx, gz, salt);
  const n10 = hash2(gx + 1, gz, salt);
  const n01 = hash2(gx, gz + 1, salt);
  const n11 = hash2(gx + 1, gz + 1, salt);
  return (n00 * (1 - fx) + n10 * fx) * (1 - fz) + (n01 * (1 - fx) + n11 * fx) * fz;
}

/**
 * Terrain height at a world position.
 *
 * Three octaves: broad hills, medium rolls, and a small ripple so the ground is
 * never a billiard table — the brief explicitly rules out a flat map.
 */
export function terrainHeight(x: number, z: number): number {
  return baseTerrainHeight(x, z) - riverCarve(x, z);
}

/** The field and the road cuttings, without the river bed. Bridge decks follow this height. */
export function baseTerrainHeight(x: number, z: number): number {
  const hills = valueNoise(x, z, 420, 11) - 0.5;
  const rolls = valueNoise(x, z, 150, 29) - 0.5;
  const ripple = valueNoise(x, z, 48, 71) - 0.5;
  const base = hills * 26 + rolls * 8 + ripple * 2.2;
  // Roads sit in shallow cuttings so a driver can find them from a distance. The cutting is a V
  // across the 18-unit band (up to ~6 units deep on a hill); a bridge cannot follow a V and a
  // V-shaped road would sit below its own river bed, so near a bridge the road climbs out of the
  // cutting onto the field level (`bridgeInfluence`, a smooth ramp).
  const onRoad = roadFactor(x, z);
  if (onRoad === 0) return base;
  return base * (1 - onRoad * 0.55 * (1 - bridgeInfluence(x, z)));
}

/* ============================ river & bridges ============================ */
/*
 * Spec 2026-09-29-tornado-fizika H1. The river used to be paint on a flat field, painted over the
 * asphalt, and `surfaceAt` reported water on the road: the car forded every crossing. Now the river
 * has a bed and every road over it is a bridge deck at the road's own (uncarved) height.
 */

/** Half-width of the water band (the terrain shader uses the same 22). */
export const RIVER_HALF_WIDTH = 22;
/** Where the bank has climbed back to the field. */
export const RIVER_BANK = 30;
/** Depth of the river bed below the field. */
export const RIVER_DEPTH = 2.6;
/** Half-width of a road band (`roadFactor` reaches 0 here). */
export const ROAD_HALF_WIDTH = 9;
/** A deck reaches this far past the bank, so no carved slope is left open on the road. */
const BRIDGE_MARGIN = 4;
/** The deck sits this much above the uncarved road, clear of the coarse terrain triangles. */
export const DECK_LIFT = 0.35;

/** River: a sine-shaped band running north-south through the map. */
export function riverCenterX(z: number): number {
  return Math.sin(z / 340) * 260 + Math.sin(z / 90) * 40;
}

export function isWater(x: number, z: number): boolean {
  return Math.abs(x - riverCenterX(z)) < RIVER_HALF_WIDTH;
}

/** How deep the river bed is cut at a point: full depth in the water, a smooth bank to the field. */
export function riverCarve(x: number, z: number): number {
  const d = Math.abs(x - riverCenterX(z));
  if (d >= RIVER_BANK) return 0;
  if (d <= RIVER_HALF_WIDTH) return RIVER_DEPTH;
  return RIVER_DEPTH * smooth((RIVER_BANK - d) / (RIVER_BANK - RIVER_HALF_WIDTH));
}

/** The nearest road line to a coordinate. */
export function nearestLine(v: number): number {
  return Math.round((v + HALF_WORLD) / ROAD_SPACING) * ROAD_SPACING - HALF_WORLD;
}

/** Across-road offsets sampled for a road running along x (the river's x changes with z). */
const ACROSS = [-ROAD_HALF_WIDTH, -ROAD_HALF_WIDTH / 2, 0, ROAD_HALF_WIDTH / 2, ROAD_HALF_WIDTH];
const DECK_REACH = RIVER_BANK + BRIDGE_MARGIN;

/** Is the road along x at z = `line` bridged at `x`? (Any part of its width over the carved bed.) */
export function bridgedAlongX(x: number, line: number): boolean {
  for (const off of ACROSS) {
    if (Math.abs(x - riverCenterX(line + off)) < DECK_REACH) return true;
  }
  return false;
}

/** Is the road along z at x = `line` bridged at `z`? Exact: the band [line−9, line+9] vs the river. */
function bridgedAlongZ(line: number, z: number): boolean {
  return Math.max(0, Math.abs(riverCenterX(z) - line) - ROAD_HALF_WIDTH) < DECK_REACH;
}

/** Length of the ramp that lifts a road out of its cutting before a bridge. */
const BRIDGE_RAMP = 30;
/**
 * Uncut road kept before the ramp starts. The terrain mesh samples every 8–20 units, so the last
 * vertex before a deck must already be uncut, or the interpolated road dips under the deck's end.
 */
const RAMP_FLAT = 22;

function rampWeight(riverDist: number): number {
  const t = Math.max(0, Math.min(1, (riverDist - DECK_REACH - RAMP_FLAT) / BRIDGE_RAMP));
  return 1 - smooth(t);
}

/**
 * 1 on and next to a bridge deck, easing to 0 over `BRIDGE_RAMP` along the road. Inside the deck zone
 * the road is not cut, so deck, field and river bed keep their order: bed < deck, deck ≈ field.
 */
export function bridgeInfluence(x: number, z: number): number {
  let best = 0;
  if (distToGridLine(z) < ROAD_HALF_WIDTH) {
    const line = nearestLine(z);
    let minD = Infinity;
    for (const off of ACROSS) minD = Math.min(minD, Math.abs(x - riverCenterX(line + off)));
    best = Math.max(best, rampWeight(minD));
  }
  if (distToGridLine(x) < ROAD_HALF_WIDTH) {
    const line = nearestLine(x);
    best = Math.max(best, rampWeight(Math.max(0, Math.abs(riverCenterX(z) - line) - ROAD_HALF_WIDTH)));
  }
  return best;
}

/** True where the wheels are on a bridge deck. */
export function onBridge(x: number, z: number): boolean {
  if (Math.abs(x) > HALF_WORLD + ROAD_HALF_WIDTH || Math.abs(z) > HALF_WORLD + ROAD_HALF_WIDTH) return false;
  if (distToGridLine(z) < ROAD_HALF_WIDTH && bridgedAlongX(x, nearestLine(z))) return true;
  if (distToGridLine(x) < ROAD_HALF_WIDTH && bridgedAlongZ(nearestLine(x), z)) return true;
  return false;
}

/** Height of the deck surface (only meaningful where `onBridge`). */
export function deckSurfaceHeight(x: number, z: number): number {
  return baseTerrainHeight(x, z) + DECK_LIFT;
}

/** What the wheels stand on: the deck on a bridge, the ground (or river bed) elsewhere. */
export function groundHeight(x: number, z: number): number {
  return onBridge(x, z) ? deckSurfaceHeight(x, z) : terrainHeight(x, z);
}

/**
 * One stretch of bridge deck inside a chunk.
 * `axis: "x"` — the road runs along x at z = `line`; `from..to` are x values.
 * `axis: "z"` — the road runs along z at x = `line`; `from..to` are z values.
 */
export type BridgeSpan = { axis: "x" | "z"; line: number; from: number; to: number };

/** Along-road sampling step for spans, world units. */
const SPAN_STEP = 1;

/**
 * Every bridge stretch whose road line belongs to this chunk (`floor(line / CHUNK_SIZE)`), clipped to
 * the chunk's [base, base + CHUNK_SIZE] along the road — neighbouring chunks meet exactly at the edge.
 * Deterministic in (cx, cz), like `propsInChunk`.
 */
export function bridgeSpansInChunk(cx: number, cz: number): BridgeSpan[] {
  const spans: BridgeSpan[] = [];
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;
  if (Math.abs(baseX) > HALF_WORLD || Math.abs(baseZ) > HALF_WORLD) return spans;

  const collect = (axis: "x" | "z", line: number, start: number, test: (s: number) => boolean) => {
    let from: number | null = null;
    // The mesh errs on the long side by one step, so the deck always covers where `onBridge` is true.
    for (let s = start; s <= start + CHUNK_SIZE; s += SPAN_STEP) {
      const on = test(s);
      if (on && from === null) from = Math.max(start, s - SPAN_STEP);
      if (!on && from !== null) {
        spans.push({ axis, line, from, to: s });
        from = null;
      }
    }
    if (from !== null) spans.push({ axis, line, from, to: start + CHUNK_SIZE });
  };

  for (let line = -HALF_WORLD; line <= HALF_WORLD; line += ROAD_SPACING) {
    if (Math.floor(line / CHUNK_SIZE) === cz) collect("x", line, baseX, (x) => bridgedAlongX(x, line));
    if (Math.floor(line / CHUNK_SIZE) === cx) collect("z", line, baseZ, (z) => bridgedAlongZ(line, z));
  }
  return spans;
}

/** Map a point along a span (`s` along the road, `across` from its centreline) to world x, z. */
export function spanPoint(span: BridgeSpan, s: number, across: number): { x: number; z: number } {
  return span.axis === "x" ? { x: s, z: span.line + across } : { x: span.line + across, z: s };
}

/**
 * The railing pieces of a span: the whole span, minus a gap wherever a crossing road passes through
 * (the (0,0), (−300,−600), (300,600) junctions sit in the river zone). Meshes and colliders share it.
 */
export function bridgeRailSegments(span: BridgeSpan): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let from: number | null = null;
  for (let s = span.from; s <= span.to; s += SPAN_STEP) {
    const open = distToGridLine(s) < ROAD_HALF_WIDTH;
    if (!open && from === null) from = s;
    if (open && from !== null) {
      if (s - SPAN_STEP > from) out.push({ from, to: s - SPAN_STEP });
      from = null;
    }
  }
  if (from !== null && span.to > from) out.push({ from, to: span.to });
  return out;
}

/** 0 = off-road, 1 = on the centreline of a road. */
export function roadFactor(x: number, z: number): number {
  const near = Math.min(distToGridLine(x), distToGridLine(z));
  const halfWidth = 9;
  if (near >= halfWidth) return 0;
  return 1 - near / halfWidth;
}

/** Distance from a coordinate to the nearest road line (lines at -HALF_WORLD + k·ROAD_SPACING). */
function distToGridLine(v: number): number {
  // Positive modulo, so coordinates west/north of the map edge stay in range too.
  const m = (((v + HALF_WORLD) % ROAD_SPACING) + ROAD_SPACING) % ROAD_SPACING;
  return Math.min(m, ROAD_SPACING - m);
}

/**
 * What the wheels are on.
 *
 * Grip matters twice: it limits cornering, and the anchor refuses to hold in
 * mud (see `scoring.anchorOutcome`), which is the brief's "keresni kell egy jó
 * helyet a horgonyzáshoz" turned into a rule.
 */
export function surfaceAt(x: number, z: number): SurfaceKind {
  // A bridge deck is tarmac even though the river runs beneath it.
  if (onBridge(x, z)) return "asphalt";
  if (isWater(x, z)) return "water";
  if (roadFactor(x, z) > 0.55) return "asphalt";
  const dirt = valueNoise(x, z, 190, 5);
  if (dirt > 0.72) return "dirt";
  const wet = valueNoise(x, z, 110, 47);
  // Mud gathers in the low ground near the river.
  if (wet > 0.78 && Math.abs(x - riverCenterX(z)) < 160) return "mud";
  return "grass";
}

export const SURFACE_GRIP: Record<SurfaceKind, number> = {
  asphalt: 1,
  dirt: 0.78,
  grass: 0.62,
  mud: 0.3,
  water: 0.12,
};

export const SURFACE_LABEL: Record<SurfaceKind, string> = {
  asphalt: "Aszfalt",
  dirt: "Földút",
  grass: "Mező",
  mud: "Sáros terep",
  water: "Víz",
};

export function gripAt(x: number, z: number): number {
  return SURFACE_GRIP[surfaceAt(x, z)];
}

/* ============================ props ============================ */

/** Props are generated per 100×100 chunk, so only the visible ones are built. */
export const CHUNK_SIZE = 100;

export type ChunkKey = string;

export function chunkKey(cx: number, cz: number): ChunkKey {
  return `${cx}:${cz}`;
}

export function chunkCoordsFor(x: number, z: number): { cx: number; cz: number } {
  return { cx: Math.floor(x / CHUNK_SIZE), cz: Math.floor(z / CHUNK_SIZE) };
}

/**
 * Everything standing in one chunk.
 *
 * Deterministic in (cx, cz): the same chunk always yields the same props, so a
 * player can drive away and come back to an unchanged village.
 */
export function propsInChunk(cx: number, cz: number): WorldProp[] {
  const props: WorldProp[] = [];
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;
  if (Math.abs(baseX) > HALF_WORLD || Math.abs(baseZ) > HALF_WORLD) return props;

  const roll = hash2(cx, cz, 101);
  const settlement = roll > 0.86;
  const forest = !settlement && roll < 0.24;
  const farm = !settlement && !forest && roll > 0.66;

  const count = settlement ? 12 : forest ? 16 : farm ? 7 : 4;
  for (let i = 0; i < count; i++) {
    const rx = hash2(cx * 31 + i, cz * 17, 7);
    const rz = hash2(cx * 13, cz * 41 + i, 19);
    const x = baseX + rx * CHUNK_SIZE;
    const z = baseZ + rz * CHUNK_SIZE;

    // Nothing sits in the river or on the tarmac.
    if (isWater(x, z)) continue;
    if (roadFactor(x, z) > 0.35) continue;
    if (onBridge(x, z)) continue;

    const pick = hash2(i * 7 + cx, i * 13 + cz, 53);
    let kind: PropKind;
    if (settlement) {
      kind = pick < 0.62 ? "house" : pick < 0.76 ? "pole" : pick < 0.88 ? "fuel" : "watertower";
    } else if (forest) {
      kind = pick < 0.82 ? "tree" : "bush";
    } else if (farm) {
      kind = pick < 0.42 ? "barn" : pick < 0.66 ? "silo" : pick < 0.86 ? "fence" : "tree";
    } else {
      kind = pick < 0.5 ? "tree" : pick < 0.72 ? "bush" : pick < 0.9 ? "fence" : "pole";
    }

    props.push({
      kind,
      x,
      z,
      rotation: hash2(i + cx, i - cz, 89) * Math.PI * 2,
      scale: 0.8 + hash2(cx - i, cz + i, 97) * 0.6,
    });
  }
  return props;
}

/** Chunk keys within `radius` world units of a position. */
export function chunksAround(x: number, z: number, radius: number): { cx: number; cz: number }[] {
  const r = Math.ceil(radius / CHUNK_SIZE);
  const { cx, cz } = chunkCoordsFor(x, z);
  const out: { cx: number; cz: number }[] = [];
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      out.push({ cx: cx + dx, cz: cz + dz });
    }
  }
  return out;
}

/** Keep a position inside the map. */
export function clampToWorld(value: number): number {
  return Math.max(-HALF_WORLD + 20, Math.min(HALF_WORLD - 20, value));
}

/** World units → kilometres, for the HUD. */
export function toKm(units: number): number {
  return units / UNITS_PER_KM;
}

export function fromKm(km: number): number {
  return km * UNITS_PER_KM;
}
