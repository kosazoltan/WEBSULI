/**
 * Tornado Hunter 200 — vehicle upgrades.
 *
 * Six tracks, exactly the six the brief lists (engine, suspension, tires,
 * chassis, anchor, instruments). Cost and effect are formulas rather than
 * tables so a track cannot accidentally get a level whose price is lower than
 * the one before it — the tests assert that monotonicity.
 */

export type UpgradeTrackId = "engine" | "suspension" | "tires" | "chassis" | "anchor" | "instruments";

export type UpgradeTrack = {
  id: UpgradeTrackId;
  label: string;
  /** What the child sees as the promise. */
  effectLabel: string;
  /** Which vehicle stat it improves, for the garage stat bars. */
  stat: "acceleration" | "handling" | "grip" | "stability" | "anchorPower" | "instruments";
  baseCost: number;
  /** Percentage points added to the stat per level (before the level curve). */
  step: number;
};

export const MAX_UPGRADE_LEVEL = 5;

export const UPGRADE_TRACKS: readonly UpgradeTrack[] = [
  { id: "engine", label: "Motor", effectLabel: "Gyorsulás", stat: "acceleration", baseCost: 900, step: 8 },
  { id: "suspension", label: "Felfüggesztés", effectLabel: "Irányíthatóság", stat: "handling", baseCost: 800, step: 7 },
  { id: "tires", label: "Gumiabroncs", effectLabel: "Tapadás", stat: "grip", baseCost: 700, step: 9 },
  { id: "chassis", label: "Alváz", effectLabel: "Stabilitás", stat: "stability", baseCost: 1100, step: 7 },
  { id: "anchor", label: "Horgony", effectLabel: "Rögzítés ereje", stat: "anchorPower", baseCost: 1300, step: 10 },
  { id: "instruments", label: "Mérőrendszer", effectLabel: "Viharadatok pontossága", stat: "instruments", baseCost: 1000, step: 12 },
] as const;

const TRACK_BY_ID = new Map(UPGRADE_TRACKS.map((t) => [t.id, t] as const));

export type UpgradeState = Record<UpgradeTrackId, number>;

export function emptyUpgrades(): UpgradeState {
  return { engine: 0, suspension: 0, tires: 0, chassis: 0, anchor: 0, instruments: 0 };
}

export function isUpgradeTrackId(value: unknown): value is UpgradeTrackId {
  return typeof value === "string" && TRACK_BY_ID.has(value as UpgradeTrackId);
}

/** Price of stepping from `level - 1` to `level` (1-based). */
export function upgradeCost(track: UpgradeTrackId, level: number): number {
  const t = TRACK_BY_ID.get(track);
  if (!t) return Number.POSITIVE_INFINITY;
  const n = Math.max(1, Math.min(MAX_UPGRADE_LEVEL, Math.round(level)));
  // Geometric growth: each level costs ~1.9x the previous one.
  return Math.round(t.baseCost * Math.pow(1.9, n - 1));
}

/** Percentage bonus at a given upgrade level (0 at level 0). */
export function upgradeEffect(track: UpgradeTrackId, level: number): number {
  const t = TRACK_BY_ID.get(track);
  if (!t) return 0;
  const n = Math.max(0, Math.min(MAX_UPGRADE_LEVEL, Math.round(level)));
  // Slightly diminishing returns, but strictly increasing.
  return Math.round(t.step * n * (1 - n * 0.04) * 10) / 10;
}

/** Total SC already sunk into a vehicle — shown in the garage. */
export function investedInVehicle(state: UpgradeState): number {
  let sum = 0;
  for (const track of UPGRADE_TRACKS) {
    for (let lvl = 1; lvl <= (state[track.id] ?? 0); lvl++) sum += upgradeCost(track.id, lvl);
  }
  return sum;
}

export function upgradeTrack(id: UpgradeTrackId): UpgradeTrack | undefined {
  return TRACK_BY_ID.get(id);
}

/** Multiplier applied to a vehicle stat, e.g. 1.24 for +24%. */
export function statMultiplier(state: UpgradeState, track: UpgradeTrackId): number {
  return 1 + upgradeEffect(track, state[track] ?? 0) / 100;
}
