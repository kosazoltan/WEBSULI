/**
 * J1a — „Hegyre fel!”: seedelt akadály- és kagyló-generátor a háromsávos futáshoz (végrehajtás J1a 3.; terv 5.1, Q7, Q8;
 * K.5 KSZ-2, KSZ-5, KSZ-6, KSZ-11).
 *
 * TISZTA TS: nincs DOM, three, React, `Math.random`, `Date.now` (őr: `T/game-sim-determinism-guard.test.ts`). A véletlen a mag
 * seedelt RNG-je (`rng: () => number`). Minden tárgy előre lefoglalt készletből (pool) jön, a „halott” elem `alive = false` —
 * a forró hurokban nincs allokáció.
 *
 * KOORDINÁTÁK: a pálya mentén `at` méter (a futó `distance`-ével azonos skála), sáv 0 (bal) · 1 (közép) · 2 (jobb).
 *
 * SZABÁLYOK (terv 5.1, végrehajtás J1a 3., D-J1a-3, D-J1a-6):
 *  - két akadálysor között legalább `sebesség × MIN_REACTION_SEC` (0,9 mp) — a reakcióidőhöz;
 *  - az első 30 mp (tanító szakasz) ritkább; az első 15 mp-ben csak egy, sávváltós (nem ugorható) akadály soronként;
 *  - minden sorban van járható út: szabad sáv vagy ugorható akadály (három sávos ugorható „fal” csak a 45. mp után);
 *  - a kapu-pillanat (`blocked` tartomány: a kapu előtti 4 mp és utána 6 m) üres: oda nem kerül sem akadály, sem kagyló.
 */

export type ObstacleKind = "log" | "fence" | "car";
export type Lane = 0 | 1 | 2;

export type Obstacle = { id: number; alive: boolean; kind: ObstacleKind; lane: Lane; at: number; hit: boolean };
export type Shell = { id: number; alive: boolean; lane: Lane; at: number; row: number };

/** Akadályfajták: hossz a pálya mentén (m), átugorható-e, és milyen magasan kell lenni az átugráshoz (m). */
export const OBSTACLE_SPECS: Record<ObstacleKind, { length: number; jumpable: boolean; clearY: number }> = {
  log: { length: 0.9, jumpable: true, clearY: 0.55 },
  fence: { length: 0.5, jumpable: true, clearY: 0.75 },
  car: { length: 2.6, jumpable: false, clearY: Number.POSITIVE_INFINITY },
};

/** A készletek kapacitása (KSZ-6): a 70 m-es előre-nézésben ennél több tárgy sosem él egyszerre. */
export const OBSTACLE_CAP = 32;
export const SHELL_CAP = 48;
/** Ennyi méterrel a futó előtt már legenerált a pálya (a nézet ködén túl). */
export const LOOKAHEAD_M = 70;
/** Ennyi méterrel a futó mögött a tárgy kikerül a készletből. */
export const DESPAWN_BEHIND_M = 6;
export const MIN_REACTION_SEC = 0.9;
export const TUTORIAL_SEC = 30;
export const TUTORIAL_LANE_ONLY_SEC = 15;
export const WALL_AFTER_SEC = 45;
/** Egy kagylósor hossza és a kagylók távolsága (m). */
export const SHELL_ROW = 5;
export const SHELL_STEP_M = 1.6;
/** Kagylósorok gyűrűje (a teljes sor felszedését ennyi soron át követjük). */
export const SHELL_ROW_RING = 8;

export type TrackPools = {
  obstacles: Obstacle[];
  shells: Shell[];
};

export function createTrackPools(): TrackPools {
  const obstacles: Obstacle[] = [];
  for (let i = 0; i < OBSTACLE_CAP; i++) obstacles.push({ id: i, alive: false, kind: "log", lane: 1, at: 0, hit: false });
  const shells: Shell[] = [];
  for (let i = 0; i < SHELL_CAP; i++) shells.push({ id: i, alive: false, lane: 1, at: 0, row: 0 });
  return { obstacles, shells };
}

export type TrackGen = {
  /** A következő akadálysor helye (m). */
  nextRowAt: number;
  /** A legutóbb kiosztott kagylósor sorszáma. */
  rowSeq: number;
};

export function createTrackGen(firstRowAt: number): TrackGen {
  return { nextRowAt: firstRowAt, rowSeq: 0 };
}

function spawnObstacle(pools: TrackPools, kind: ObstacleKind, lane: Lane, at: number): boolean {
  const list = pools.obstacles;
  for (let i = 0; i < list.length; i++) {
    const o = list[i]!;
    if (o.alive) continue;
    o.alive = true;
    o.kind = kind;
    o.lane = lane;
    o.at = at;
    o.hit = false;
    return true;
  }
  return false;
}

function spawnShell(pools: TrackPools, lane: Lane, at: number, row: number): boolean {
  const list = pools.shells;
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!;
    if (s.alive) continue;
    s.alive = true;
    s.lane = lane;
    s.at = at;
    s.row = row;
    return true;
  }
  return false;
}

/** A tartomány (m), ahová nem kerülhet tárgy (kapu-pillanat). `from > to` = nincs tiltás. */
export type BlockedRange = { from: number; to: number };

function inBlocked(at: number, b: BlockedRange): boolean {
  return b.from <= b.to && at >= b.from && at <= b.to;
}

function pickLane(rng: () => number): Lane {
  return Math.min(2, Math.floor(rng() * 3)) as Lane;
}

function pickKind(rng: () => number, allowJump: boolean): ObstacleKind {
  if (!allowJump) return "car";
  const u = rng();
  return u < 0.4 ? "log" : u < 0.7 ? "fence" : "car";
}

/**
 * Feltölti a pályát `distance + LOOKAHEAD_M`-ig. `timeSec` a menet világideje (a tanító szakaszhoz), `speed` az alap
 * futósebesség (m/s). A kapu-pillanat tartományába eső sort a tartomány mögé tolja. Visszaadja, hány sort rakott le.
 */
export function fillTrack(
  pools: TrackPools,
  gen: TrackGen,
  distance: number,
  timeSec: number,
  speed: number,
  blocked: BlockedRange,
  rng: () => number,
): number {
  let rows = 0;
  const horizon = distance + LOOKAHEAD_M;
  // Egy hívásban legfeljebb 8 sor (a menet elején egyszerre töltődik fel a 70 m).
  while (gen.nextRowAt <= horizon && rows < 8) {
    let at = gen.nextRowAt;
    if (inBlocked(at, blocked)) at = blocked.to + speed * MIN_REACTION_SEC;
    // A sor „ideje” a futó jelenlegi idejéből és a távolságból becsülve (a tanító szakasz határához).
    const etaSec = timeSec + Math.max(0, at - distance) / Math.max(1, speed);
    const tutorial = etaSec < TUTORIAL_SEC;
    const laneOnly = etaSec < TUTORIAL_LANE_ONLY_SEC;
    const u = rng();
    if (laneOnly) {
      spawnObstacle(pools, "car", pickLane(rng), at);
    } else if (!tutorial && etaSec >= WALL_AFTER_SEC && u < 0.14) {
      // Ugorható fal mindhárom sávban (kötelező ugrás).
      const kind: ObstacleKind = rng() < 0.5 ? "log" : "fence";
      for (let l = 0; l < 3; l++) spawnObstacle(pools, kind, l as Lane, at);
    } else if (!tutorial && u < 0.46) {
      // Két sáv zárva, a harmadik szabad.
      const free = pickLane(rng);
      for (let l = 0; l < 3; l++) if (l !== free) spawnObstacle(pools, pickKind(rng, true), l as Lane, at);
    } else {
      spawnObstacle(pools, pickKind(rng, !laneOnly), pickLane(rng), at);
    }
    // Kagylósor a következő akadálysorig (ha van hely), egy szabad sávban.
    const gapSec = (tutorial ? 1.8 : 1) * (1.35 + 0.8 * rng());
    const step = Math.max(speed * MIN_REACTION_SEC, speed * gapSec);
    const next = at + step;
    const rowLen = (SHELL_ROW - 1) * SHELL_STEP_M;
    if (rng() < 0.6 && step - 6 >= rowLen) {
      const lane = pickLane(rng);
      const start = at + 3 + rng() * Math.max(0, step - 6 - rowLen);
      gen.rowSeq += 1;
      for (let k = 0; k < SHELL_ROW; k++) {
        const sAt = start + k * SHELL_STEP_M;
        if (!inBlocked(sAt, blocked)) spawnShell(pools, lane, sAt, gen.rowSeq);
      }
    }
    gen.nextRowAt = next;
    rows += 1;
  }
  return rows;
}

/** A kapu-pillanat kitakarítása: a tartományba eső élő akadály és kagyló kikerül. A kitakarított akadályok száma. */
export function clearRange(pools: TrackPools, range: BlockedRange, onCleared?: (o: Obstacle) => void): number {
  let n = 0;
  for (let i = 0; i < pools.obstacles.length; i++) {
    const o = pools.obstacles[i]!;
    if (!o.alive || !inBlocked(o.at, range)) continue;
    o.alive = false;
    n += 1;
    onCleared?.(o);
  }
  for (let i = 0; i < pools.shells.length; i++) {
    const s = pools.shells[i]!;
    if (s.alive && inBlocked(s.at, range)) s.alive = false;
  }
  return n;
}

/** A futó mögé került tárgyak kivétele a készletből. */
export function despawnBehind(pools: TrackPools, distance: number): void {
  const limit = distance - DESPAWN_BEHIND_M;
  for (let i = 0; i < pools.obstacles.length; i++) {
    const o = pools.obstacles[i]!;
    if (o.alive && o.at + OBSTACLE_SPECS[o.kind].length / 2 < limit) o.alive = false;
  }
  for (let i = 0; i < pools.shells.length; i++) {
    const s = pools.shells[i]!;
    if (s.alive && s.at < limit) s.alive = false;
  }
}
