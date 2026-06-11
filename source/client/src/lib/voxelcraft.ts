/**
 * Voxelcraft — first-person Minecraft-klón engine-mag a Kockavadász kvízhez.
 *
 * A Minecraft alapmechanikái (minecraft.wiki/w/Gameplay + minecraft.net controls):
 *  - 3D voxel-világ: minden cella egy blokktípus
 *  - First-person nézet: egér = körbenézés, WASD = mozgás, Space = ugrás
 *  - Bal klikk = blokk törése (itt: kvíz-kapuval), jobb klikk = blokk lerakása
 *  - Gravitáció + AABB ütközés; bedrock törhetetlen
 *
 * Ez a modul a TISZTA logikát tartalmazza (worldgen, fizika, raycast) —
 * Three.js renderelés és React-integráció a BlockCraftQuiz.tsx-ben marad.
 */

/* ============== Blokk-típusok ============== */

export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const LOG = 4;
export const LEAVES = 5;
export const COAL = 6;
export const IRON = 7;
export const DIAMOND = 8;
/** Törhetetlen alap (Minecraft-bedrock). */
export const BEDROCK = 9;
export const CREEPER = 10;
export const SAND = 11;
/** Nem szolid, nem bányászható — díszítő tó. */
export const WATER = 12;
export const ZOMBIE = 13;
export const SKELETON = 14;
export const SPIDER = 15;

/* ============== Világ-dimenziók ============== */

/** Világ szélesség (X), magasság (Y), mélység (Z) blokk-egységben. */
export const WX = 48;
export const WY = 14;
export const WZ = 48;

/** Felszín alap-magassága — "sík terep" enyhe dombokkal. */
export const SURFACE_Y = 8;

export type VoxelWorld = Uint8Array;

export function vIdx(x: number, y: number, z: number): number {
  return (y * WZ + z) * WX + x;
}

export function vGet(w: VoxelWorld, x: number, y: number, z: number): number {
  if (x < 0 || y < 0 || z < 0 || x >= WX || y >= WY || z >= WZ) return AIR;
  return w[vIdx(x, y, z)] ?? AIR;
}

export function vSet(w: VoxelWorld, x: number, y: number, z: number, t: number): void {
  if (x < 0 || y < 0 || z < 0 || x >= WX || y >= WY || z >= WZ) return;
  w[vIdx(x, y, z)] = t;
}

/** Szolid = ütközik a játékossal. A víz és a levegő nem. */
export function vSolid(t: number): boolean {
  return t !== AIR && t !== WATER;
}

/** Bányászható = kvízzel törhető. Bedrock / víz / levegő nem. */
export function vMineable(t: number): boolean {
  return t !== AIR && t !== BEDROCK && t !== WATER;
}

/* ============== Worldgen ============== */

function ri(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export type VoxelGenConfig = {
  /** Érc-szorzó (1.0 alap). */
  oreMultiplier: number;
  /** Fa-darabszám a felszínen. */
  treeCount: number;
  /** Felszíni mobok száma (creeper/zombi). */
  surfaceMobCount: number;
  /** Földalatti mobok száma (skeleton/spider) — barlang-falakra. */
  caveMobCount: number;
  /** Tavak száma. */
  lakeCount: number;
  /** Sivatagos foltok száma. */
  sandPatchCount: number;
  /** 3+. szinttől zombi is jöhet a felszínen. */
  allowZombies: boolean;
};

/**
 * Sík terep generálása enyhe dombokkal (Minecraft "plains" biom analógia):
 *  - y=0: bedrock (törhetetlen)
 *  - y<h-3: kő + ércek (szén/vas/gyémánt — mélyebben több gyémánt)
 *  - h-3..h-1: föld
 *  - h: fű
 *  - felette: fák (törzs + lomb), mobok
 *  - néhány tavacska (víz + homokos meder) és homok-folt
 *  - 2-3 kis barlang-üreg a kő-rétegben, mob-spawnnal a falain
 */
export function generateVoxelWorld(cfg: VoxelGenConfig): VoxelWorld {
  const w: VoxelWorld = new Uint8Array(WX * WY * WZ);

  // Heightmap: sík terep ±2 enyhe dombokkal (két átfedő szinusz).
  const heights: number[] = new Array(WX * WZ);
  for (let x = 0; x < WX; x++) {
    for (let z = 0; z < WZ; z++) {
      const h = SURFACE_Y
        + Math.round(Math.sin(x * 0.20) * 1.1 + Math.cos(z * 0.17) * 1.1
        + Math.sin((x + z) * 0.09) * 0.8);
      heights[z * WX + x] = Math.max(SURFACE_Y - 2, Math.min(SURFACE_Y + 2, h));
    }
  }

  // Rétegek + ércek
  const coalP = 0.05 * cfg.oreMultiplier;
  const ironP = 0.025 * cfg.oreMultiplier;
  const diamondPDeep = 0.018 * cfg.oreMultiplier; // y <= 3 mélységben
  const diamondPShallow = 0.004 * cfg.oreMultiplier;
  for (let x = 0; x < WX; x++) {
    for (let z = 0; z < WZ; z++) {
      const h = heights[z * WX + x]!;
      for (let y = 0; y < WY; y++) {
        const i = vIdx(x, y, z);
        if (y === 0) { w[i] = BEDROCK; continue; }
        if (y > h) { w[i] = AIR; continue; }
        if (y === h) { w[i] = GRASS; continue; }
        if (y >= h - 2) { w[i] = DIRT; continue; }
        // Kő-réteg + ércek
        const roll = Math.random();
        const dP = y <= 3 ? diamondPDeep : diamondPShallow;
        if (roll < dP) w[i] = DIAMOND;
        else if (roll < dP + ironP) w[i] = IRON;
        else if (roll < dP + ironP + coalP) w[i] = COAL;
        else w[i] = STONE;
      }
    }
  }

  // Kis barlang-üregek a kő-rétegben (gömb-szerű kivágás)
  const caveCount = 3;
  for (let c = 0; c < caveCount; c++) {
    const cx = ri(6, WX - 7);
    const cy = ri(2, SURFACE_Y - 4);
    const cz = ri(6, WZ - 7);
    const r = ri(2, 3);
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dy * dy + dz * dz <= r * r) {
            const yy = cy + dy;
            if (yy > 0) vSet(w, cx + dx, yy, cz + dz, AIR);
          }
        }
      }
    }
  }

  // Tavak: felszíni kis vízfoltok homok-mederrel
  for (let l = 0; l < cfg.lakeCount; l++) {
    const lx = ri(5, WX - 10);
    const lz = ri(5, WZ - 10);
    const lr = ri(2, 4);
    for (let dx = -lr; dx <= lr; dx++) {
      for (let dz = -lr; dz <= lr; dz++) {
        if (dx * dx + dz * dz > lr * lr) continue;
        const x = lx + dx;
        const z = lz + dz;
        if (x < 1 || z < 1 || x >= WX - 1 || z >= WZ - 1) continue;
        const h = heights[z * WX + x]!;
        // A felszín-blokk és az alatta levő → víz; a meder homok.
        vSet(w, x, h, z, WATER);
        if (h - 1 > 0) vSet(w, x, h - 1, z, WATER);
        if (h - 2 > 0) vSet(w, x, h - 2, z, SAND);
      }
    }
  }

  // Homok-foltok (mini sivatag)
  for (let s = 0; s < cfg.sandPatchCount; s++) {
    const sx = ri(4, WX - 8);
    const sz = ri(4, WZ - 8);
    const sr = ri(2, 4);
    for (let dx = -sr; dx <= sr; dx++) {
      for (let dz = -sr; dz <= sr; dz++) {
        if (dx * dx + dz * dz > sr * sr) continue;
        const x = sx + dx;
        const z = sz + dz;
        if (x < 1 || z < 1 || x >= WX - 1 || z >= WZ - 1) continue;
        const h = heights[z * WX + x]!;
        if (vGet(w, x, h, z) === GRASS) {
          vSet(w, x, h, z, SAND);
          if (h - 1 > 0 && vGet(w, x, h - 1, z) === DIRT) vSet(w, x, h - 1, z, SAND);
        }
      }
    }
  }

  // Fák: törzs (2-3 LOG) + lombkorona (3×3×2 LEAVES)
  for (let t = 0; t < cfg.treeCount; t++) {
    const tx = ri(3, WX - 4);
    const tz = ri(3, WZ - 4);
    const h = heights[tz * WX + tx]!;
    if (vGet(w, tx, h, tz) !== GRASS) continue; // tóra/homokra ne nőjön fa
    const trunkH = ri(2, 3);
    for (let dy = 1; dy <= trunkH; dy++) {
      vSet(w, tx, h + dy, tz, LOG);
    }
    const topY = h + trunkH;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = 0; dy <= 1; dy++) {
          const yy = topY + dy;
          if (dx === 0 && dz === 0 && dy === 0) continue; // törzs teteje
          if (yy < WY && vGet(w, tx + dx, yy, tz + dz) === AIR) {
            vSet(w, tx + dx, yy, tz + dz, LEAVES);
          }
        }
      }
    }
    if (topY + 2 < WY && vGet(w, tx, topY + 2, tz) === AIR) {
      vSet(w, tx, topY + 2, tz, LEAVES); // csúcs-levél
    }
  }

  // Felszíni mobok (creeper / zombi) — a fűre állítva
  let placed = 0;
  let guard = 0;
  while (placed < cfg.surfaceMobCount && guard++ < 200) {
    const mx = ri(2, WX - 3);
    const mz = ri(2, WZ - 3);
    const h = heights[mz * WX + mx]!;
    if (vGet(w, mx, h, mz) !== GRASS) continue;
    if (vGet(w, mx, h + 1, mz) !== AIR) continue;
    const useZombie = cfg.allowZombies && Math.random() < 0.4;
    vSet(w, mx, h + 1, mz, useZombie ? ZOMBIE : CREEPER);
    placed++;
  }

  // Földalatti mobok (skeleton / spider) — kő-cellák, amik üreggel szomszédosak
  let cavePlaced = 0;
  guard = 0;
  while (cavePlaced < cfg.caveMobCount && guard++ < 400) {
    const mx = ri(2, WX - 3);
    const my = ri(2, SURFACE_Y - 3);
    const mz = ri(2, WZ - 3);
    if (vGet(w, mx, my, mz) !== STONE) continue;
    const hasAirNeighbor =
      vGet(w, mx + 1, my, mz) === AIR || vGet(w, mx - 1, my, mz) === AIR ||
      vGet(w, mx, my + 1, mz) === AIR || vGet(w, mx, my - 1, mz) === AIR ||
      vGet(w, mx, my, mz + 1) === AIR || vGet(w, mx, my, mz - 1) === AIR;
    if (!hasAirNeighbor) continue;
    vSet(w, mx, my, mz, Math.random() < 0.5 ? SKELETON : SPIDER);
    cavePlaced++;
  }

  return w;
}

/** Biztonságos spawn-pozíció: a világ közepén, az első szabad cella a felszín felett. */
export function findVoxelSpawn(w: VoxelWorld): { x: number; y: number; z: number } {
  const cx = Math.floor(WX / 2);
  const cz = Math.floor(WZ / 2);
  // Spirálban keresünk olyan oszlopot, ahol 2 magas szabad hely van szolid talajon
  for (let r = 0; r < 12; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = cx + dx;
        const z = cz + dz;
        if (x < 1 || z < 1 || x >= WX - 1 || z >= WZ - 1) continue;
        for (let y = WY - 3; y >= 1; y--) {
          if (
            vSolid(vGet(w, x, y, z)) &&
            !vSolid(vGet(w, x, y + 1, z)) && vGet(w, x, y + 1, z) !== WATER &&
            !vSolid(vGet(w, x, y + 2, z)) && vGet(w, x, y + 2, z) !== WATER
          ) {
            return { x: x + 0.5, y: y + 1.01, z: z + 0.5 };
          }
        }
      }
    }
  }
  return { x: cx + 0.5, y: SURFACE_Y + 2, z: cz + 0.5 };
}

/* ============== Fizika ============== */

/** Játékos AABB fél-szélesség (Minecraft: 0.6 széles → 0.3 fél). */
export const PLAYER_HALF_W = 0.3;
/** Játékos magasság (Minecraft: 1.8). */
export const PLAYER_HEIGHT = 1.8;
/** Szem-magasság a láb fölött (Minecraft: 1.62). */
export const PLAYER_EYE = 1.62;
export const MOVE_SPEED_BPS = 4.3;
export const JUMP_VELOCITY = 8.2;
export const GRAVITY_BPS2 = 24;
/** Terminális esési sebesség — tunneling-védelem része. */
export const MAX_FALL_SPEED = 38;

export type PlayerState = {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number; pitch: number;
  onGround: boolean;
};

/** Igaz, ha a (px,py,pz) láb-pozíciójú játékos-AABB szolid blokkot metsz. */
export function collidesAt(w: VoxelWorld, px: number, py: number, pz: number): boolean {
  const x0 = Math.floor(px - PLAYER_HALF_W);
  const x1 = Math.floor(px + PLAYER_HALF_W);
  const y0 = Math.floor(py);
  const y1 = Math.floor(py + PLAYER_HEIGHT);
  const z0 = Math.floor(pz - PLAYER_HALF_W);
  const z1 = Math.floor(pz + PLAYER_HALF_W);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (vSolid(vGet(w, x, y, z))) return true;
      }
    }
  }
  return false;
}

/**
 * Fizika-léptetés tengelyenkénti ütközés-feloldással + SUB-STEPPING.
 * A sub-stepping a tunneling-bug ellen véd: a 2.5D-s elődben a nagy esési
 * sebesség (>1 blokk/frame) átvitte a játékost a vékony bedrock-rétegen,
 * és "leesett a pályáról". Itt egy lépés max 0.4 blokk elmozdulás lehet.
 */
export function stepPlayerPhysics(w: VoxelWorld, p: PlayerState, dt: number): void {
  // Gravitáció + terminális sebesség
  p.vy = Math.max(-MAX_FALL_SPEED, p.vy - GRAVITY_BPS2 * dt);

  const totalDx = p.vx * dt;
  const totalDy = p.vy * dt;
  const totalDz = p.vz * dt;
  const maxMove = Math.max(Math.abs(totalDx), Math.abs(totalDy), Math.abs(totalDz));
  const steps = Math.max(1, Math.ceil(maxMove / 0.4));
  const sx = totalDx / steps;
  const sy = totalDy / steps;
  const sz = totalDz / steps;

  p.onGround = false;
  for (let s = 0; s < steps; s++) {
    // X tengely
    if (sx !== 0) {
      const nx = p.x + sx;
      if (!collidesAt(w, nx, p.y, p.z)) p.x = nx;
      else p.vx = 0;
    }
    // Z tengely
    if (sz !== 0) {
      const nz = p.z + sz;
      if (!collidesAt(w, p.x, p.y, nz)) p.z = nz;
      else p.vz = 0;
    }
    // Y tengely
    if (sy !== 0) {
      const ny = p.y + sy;
      if (!collidesAt(w, p.x, ny, p.z)) {
        p.y = ny;
      } else {
        if (sy < 0) p.onGround = true;
        p.vy = 0;
      }
    }
  }

  // Biztonsági respawn-küszöb: ha valahogy mégis a világ alá kerül,
  // a hívó detektálja (p.y < -4) és visszateszi a spawnra — NEM game over.
}

/* ============== Voxel raycast (Amanatides-Woo DDA) ============== */

export type VoxelHit = {
  x: number; y: number; z: number;
  /** A blokktípus a találatnál. */
  t: number;
  /** A találati lap normálja — lerakásnál ide kerül az új blokk. */
  nx: number; ny: number; nz: number;
};

/**
 * Sugár-bejárás a voxel-rácson (DDA). `maxDist` blokk-egységben (Minecraft ~4.5).
 * Vizet és levegőt átugorja; az első szolid/mob blokknál áll meg.
 */
export function raycastVoxel(
  w: VoxelWorld,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDist = 4.5,
): VoxelHit | null {
  const len = Math.hypot(dx, dy, dz);
  if (len === 0) return null;
  dx /= len; dy /= len; dz /= len;

  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);

  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;

  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

  let tMaxX = dx !== 0 ? (dx > 0 ? (x + 1 - ox) : (ox - x)) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? (y + 1 - oy) : (oy - y)) * tDeltaY : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? (z + 1 - oz) : (oz - z)) * tDeltaZ : Infinity;

  let nx = 0, ny = 0, nz = 0;
  let dist = 0;

  while (dist <= maxDist) {
    const cell = vGet(w, x, y, z);
    if (cell !== AIR && cell !== WATER) {
      return { x, y, z, t: cell, nx, ny, nz };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      dist = tMaxX;
      tMaxX += tDeltaX;
      x += stepX;
      nx = -stepX; ny = 0; nz = 0;
    } else if (tMaxY < tMaxZ) {
      dist = tMaxY;
      tMaxY += tDeltaY;
      y += stepY;
      nx = 0; ny = -stepY; nz = 0;
    } else {
      dist = tMaxZ;
      tMaxZ += tDeltaZ;
      z += stepZ;
      nx = 0; ny = 0; nz = -stepZ;
    }
    if (x < -1 || y < -1 || z < -1 || x > WX || y > WY || z > WZ) return null;
  }
  return null;
}

/**
 * Látható-e a blokk (van-e legalább egy nem-szolid szomszédja)?
 * A renderelés csak az exposed blokkokat példányosítja (felület-culling).
 */
export function isExposed(w: VoxelWorld, x: number, y: number, z: number): boolean {
  return (
    !vSolid(vGet(w, x + 1, y, z)) || !vSolid(vGet(w, x - 1, y, z)) ||
    !vSolid(vGet(w, x, y + 1, z)) || !vSolid(vGet(w, x, y - 1, z)) ||
    !vSolid(vGet(w, x, y, z + 1)) || !vSolid(vGet(w, x, y, z - 1))
  );
}
