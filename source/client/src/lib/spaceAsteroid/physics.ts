/**
 * Galaktikus Aszteroida — the bits of motion a unit test can pin.
 *
 * The page remains a shmup (Galaga-like), not wrap-around Asteroids.
 * This module owns: player inertia, spawn clock, rock split, mesh facing,
 * star-field scroll. The React/Three page calls these; it does not invent
 * a second set of numbers.
 */

export const GAME_W = 18;
export const GAME_H = 24;

export const PLAYER_MAX_SPEED = 8.2;
export const PLAYER_ACCEL = 28;
/** Exponential damping (1/s). After 0.4 s of no input, speed is ~11% of max. */
export const PLAYER_FRICTION = 5.5;

const PLAYER_X_PAD = 0.7;

/**
 * G-11 — a hajó nem csúszhat le a KÉPERNYŐRŐL.
 *
 * Élesben mérve (2026-09-07, Pixel 7): a hajó a jobb szélen félig kilógott a
 * játéktérből. A határolás megvolt (±8,3 egység), csak nem azt korlátozta, ami
 * számít: a pálya 18 egység széles, a kamera viszont FÜGGŐLEGES látószöggel néz,
 * és a vízszintes kiterjedés ebből a képaránnyal jön. Álló telefonon a látható
 * sáv jóval keskenyebb 18 egységnél — a hajó a pályán belül maradt, a képen
 * mégis kicsúszott.
 */

/**
 * A hajó félszélessége a modelljéből.
 *
 * Mérve a `buildPlayerShip` geometriájából: a szárny 0,85 széles doboz, a
 * középtől 0,7-re eltolva → 0,7 + 0,425 = 1,125. A korábbi 0,7-es ráhagyás
 * ennél KISEBB volt, ezért a szélen a szárny fele lelógott a képről (élesben
 * ellenőrizve, Pixel 7).
 */
export const PLAYER_HALF_WIDTH = 1.125;

/** A játéksíkon látható félszélesség a kamera adataiból. */
export function visibleHalfWidth(fovDeg: number, aspect: number, distance: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return GAME_W / 2;
  const halfHeight = Math.tan((fovDeg * Math.PI) / 360) * distance;
  return halfHeight * aspect;
}

/**
 * A hajó vízszintes határa: a pálya széle VAGY a látható sáv széle — amelyik
 * szűkebb. A `PLAYER_X_PAD` mindkettőtől elhúz, hogy a hajó orra se érjen a
 * szélére.
 */
export function playerXLimit(halfWidth: number): number {
  const fromField = GAME_W / 2 - PLAYER_X_PAD;
  if (!Number.isFinite(halfWidth) || halfWidth <= 0) return fromField;
  // A látható szélétől a hajó TELJES félszélességével húzunk el, nem a régi
  // 0,7-es pályaráhagyással: különben a szárny lelóg a képről.
  return Math.max(1, Math.min(fromField, halfWidth - PLAYER_HALF_WIDTH));
}
export const PLAYER_Y_MIN = -GAME_H / 2 + 1.6;
/** Lower 40% of the field — the old clamp used ~20% and felt like a rail. */
export const PLAYER_Y_MAX = -GAME_H / 2 + GAME_H * 0.4;

/* ------------------------------ kamera ---------------------------------- *
 * G-12: a játékos hajója a KÉPEN legyen.
 *
 * Mérve (2026-09-07, Pixel 7, three.js vetítéssel): a korábbi kameraállással
 * (pozíció y=-2.5, lookAt y=1.5) a hajó kiinduló helye ndc y = -1,26-ra
 * vetült — vagyis a képernyő alsó éle ALATT. A teljes mozgássáv (-10,4 … -2,4)
 * ndc -1,36 … -0,42 közé esett, tehát a gyerek a saját hajóját csak akkor
 * látta, ha feltolta a képbe. Böngészőben ellenőrizve: alaphelyzetben nincs
 * hajó a képen, felfelé húzásra megjelenik.
 *
 * A látható függőleges sáv ~18,7 egység, a pálya 24 — az egészet nem lehet
 * mutatni. A döntés: a JÁTÉKOS sávja legyen bent, a pálya teteje lóghat ki,
 * mert az aszteroidák onnan érkeznek befelé.
 */
export const CAMERA_FOV_DEG = 46;
export const CAMERA_Z = 22;
export const CAMERA_Y = -7;
export const CAMERA_LOOK_Y = -2.5;

export const SPLIT_VY_FLOOR = -2.8;
const STAR_SCROLL = 1.4;
const STAR_IDLE = 0.4;
const STAR_WRAP = GAME_H * 1.2;

export type Vec2 = { x: number; y: number };
export type PlayerBody = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bobPhase: number;
};
export type StickInput = { mx: number; my: number };
export type EnemyKind = "rock" | "crystal" | "alien" | "fighter" | "boss";

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function normalizeStick(mx: number, my: number): { mx: number; my: number } {
  const len = Math.hypot(mx, my);
  if (len > 1) return { mx: mx / len, my: my / len };
  return { mx, my };
}

export function integratePlayer(
  p: PlayerBody,
  input: StickInput,
  dt: number,
  /**
   * A vízszintes határ (`playerXLimit`). Elhagyva a régi, konstans pálya-szélt
   * használja — így a meglévő hívók viselkedése nem változik.
   */
  xLimit?: number,
): PlayerBody {
  const stick = normalizeStick(input.mx, input.my);
  const pressing = Math.hypot(stick.mx, stick.my) > 0;
  let vx = p.vx;
  let vy = p.vy;
  if (pressing) {
    vx += stick.mx * PLAYER_ACCEL * dt;
    vy += stick.my * PLAYER_ACCEL * dt;
  } else {
    const damp = Math.exp(-PLAYER_FRICTION * dt);
    vx *= damp;
    vy *= damp;
  }
  const speed = Math.hypot(vx, vy);
  if (speed > PLAYER_MAX_SPEED) {
    const s = PLAYER_MAX_SPEED / speed;
    vx *= s;
    vy *= s;
  }
  const limit = xLimit !== undefined && Number.isFinite(xLimit) && xLimit > 0
    ? xLimit
    : GAME_W / 2 - PLAYER_X_PAD;
  const xMin = -limit;
  const xMax = limit;
  const x = clamp(p.x + vx * dt, xMin, xMax);
  const y = clamp(p.y + vy * dt, PLAYER_Y_MIN, PLAYER_Y_MAX);
  if (x === xMin || x === xMax) vx = 0;
  if (y === PLAYER_Y_MIN || y === PLAYER_Y_MAX) vy = 0;
  return { x, y, vx, vy, bobPhase: p.bobPhase + dt * 4 };
}

export function spawnReady(args: {
  elapsed: number;
  lastSpawnAt: number;
  interval: number;
  emptyField: boolean;
}): boolean {
  if (args.emptyField) return true;
  return args.elapsed >= args.lastSpawnAt + args.interval;
}

export type RockShard = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: 1 | 2;
};

/** Two children fly apart (opposite vx). vy is floored so they don't fall off-screen in 0.3 s. */
export function splitRock(
  parent: { x: number; y: number; vx: number; vy: number; size: 2 | 3 },
  rng: () => number,
): [RockShard, RockShard] {
  const size = (parent.size - 1) as 1 | 2;
  const kick = 1.8 + rng() * 0.8;
  const jitter = (n: number) => (rng() - 0.5) * n;
  const child = (side: -1 | 1): RockShard => ({
    x: parent.x + side * 0.35,
    y: parent.y + jitter(0.3),
    vx: parent.vx + side * kick,
    vy: Math.max(SPLIT_VY_FLOOR, parent.vy + jitter(1.0)),
    size,
  });
  return [child(-1), child(1)];
}

export type Euler = { x: number; y: number; z: number };

/**
 * Facing for the 3D mesh. Rocks tumble; saucers spin on Z only; fighters
 * keep their nose down and bank with vx — they do not somersault.
 */
export function enemyRenderSpin(kind: EnemyKind, now: number, rot: number, vx: number): Euler {
  if (kind === "fighter") {
    // Mesh is already nose-down; tumbling the group would somersault it.
    return { x: 0, y: 0, z: clamp(vx * 0.12, -0.5, 0.5) };
  }
  if (kind === "alien") {
    return { x: 0, y: 0, z: rot + now * 0.6 };
  }
  return { x: now * 0.3 + rot, y: now * 0.25 + rot, z: rot };
}

export function starScrollY(y: number, dt: number, moving: boolean): number {
  let next = y - (moving ? STAR_SCROLL : STAR_IDLE) * dt;
  if (next < -STAR_WRAP) next = STAR_WRAP;
  return next;
}
