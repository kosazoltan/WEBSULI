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
  const hills = valueNoise(x, z, 420, 11) - 0.5;
  const rolls = valueNoise(x, z, 150, 29) - 0.5;
  const ripple = valueNoise(x, z, 48, 71) - 0.5;
  const base = hills * 26 + rolls * 8 + ripple * 2.2;
  // Roads sit in shallow cuttings so a driver can find them from a distance.
  const onRoad = roadFactor(x, z);
  return base * (1 - onRoad * 0.55);
}

/** River: a sine-shaped band running north-south through the map. */
export function riverCenterX(z: number): number {
  return Math.sin(z / 340) * 260 + Math.sin(z / 90) * 40;
}

export function isWater(x: number, z: number): boolean {
  return Math.abs(x - riverCenterX(z)) < 22;
}

/** 0 = off-road, 1 = on the centreline of a road. */
export function roadFactor(x: number, z: number): number {
  const dx = Math.abs(((x + HALF_WORLD) % ROAD_SPACING) - ROAD_SPACING / 2);
  const dz = Math.abs(((z + HALF_WORLD) % ROAD_SPACING) - ROAD_SPACING / 2);
  const near = Math.min(ROAD_SPACING / 2 - dx, ROAD_SPACING / 2 - dz);
  const halfWidth = 9;
  if (near >= halfWidth) return 1;
  if (near <= 0) return 0;
  return near / halfWidth;
}

/**
 * What the wheels are on.
 *
 * Grip matters twice: it limits cornering, and the anchor refuses to hold in
 * mud (see `scoring.anchorOutcome`), which is the brief's "keresni kell egy jó
 * helyet a horgonyzáshoz" turned into a rule.
 */
export function surfaceAt(x: number, z: number): SurfaceKind {
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
