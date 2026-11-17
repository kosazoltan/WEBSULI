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

/* ===================== J7a — a fejlesztések hatása (közös számítás) ===================== */

/** A járműnek az a része, amelyből a hatás számolódik (a `Vehicle` típus részhalmaza). */
export type UpgradeBaseStats = {
  speed: number;
  acceleration: number;
  handling: number;
  stability: number;
  windResistance: number;
  anchorPower: number;
};

/** Menet közben a horgony ennyi ideig tart a sikeres rögzítés és az elfogás között (ms), fejlesztés nélkül. */
export const ANCHOR_HOLD_BASE_MS = 2600;
/** A horgony-készenléti idő alsó korlátja: a siker látványa és a hang ennél rövidebbre nem fér be. */
export const ANCHOR_HOLD_MIN_MS = 1300;

/**
 * Az öt fejlesztési sáv HATÁSA ugyanazokkal a számokkal a játékban és a garázsban (J7a, terv 5.7 „Javítás”):
 *  - `engine` → gyorsulás, `suspension` → irányíthatóság (a régi, már működő hatás);
 *  - `tires` → tapadás: a talaj tapadásának szorzója (sáron / füvön kisebb a kanyar-csúszás);
 *  - `chassis` → stabilitás: ütközéskor kisebb sebességvesztés ÉS kisebb szélsodrás (a „Stabilitás” sáv egy száma);
 *  - `anchor` → horgony-készenléti idő: gyorsabban rögzül és az elfogás hamarabb jön;
 *  - `instruments` → a mérési (horgonyzási) sáv külső széle kijjebb kerül (a belső, veszélyes él nem mozdul).
 */
export type EffectiveStats = {
  speed: number;
  acceleration: number;
  handling: number;
  /** 100 = alap; a talaj tapadásának szorzója ennek századrésze. */
  grip: number;
  stability: number;
  windResistance: number;
  anchorPower: number;
  /** 100 = alap; a mérési sáv szélességének szorzója ennek századrésze. */
  instruments: number;
  /** A talaj tapadásának szorzója (`tires`). */
  gripFactor: number;
  /** Az ütközési sebességvesztés szorzója (1 = alap, < 1 = kisebb vesztés; `chassis`). */
  crashLossFactor: number;
  /** A horgony rögzülése után az elfogásig eltelő idő, ms (`anchor`). */
  anchorHoldMs: number;
  /** A mérési sáv szélességének szorzója (`instruments`). */
  bandWidthFactor: number;
};

export function effectiveStats(base: UpgradeBaseStats, state: UpgradeState): EffectiveStats {
  const mEngine = statMultiplier(state, "engine");
  const mSusp = statMultiplier(state, "suspension");
  const mTires = statMultiplier(state, "tires");
  const mChassis = statMultiplier(state, "chassis");
  const mAnchor = statMultiplier(state, "anchor");
  const mInst = statMultiplier(state, "instruments");
  return {
    speed: base.speed,
    acceleration: base.acceleration * mEngine,
    handling: base.handling * mSusp,
    grip: 100 * mTires,
    stability: base.stability * mChassis,
    windResistance: base.windResistance * mChassis,
    anchorPower: base.anchorPower * mAnchor,
    instruments: 100 * mInst,
    gripFactor: mTires,
    crashLossFactor: 1 / mChassis,
    anchorHoldMs: Math.max(ANCHOR_HOLD_MIN_MS, Math.round(ANCHOR_HOLD_BASE_MS / mAnchor)),
    bandWidthFactor: mInst,
  };
}

/**
 * A fejlesztett mérési sáv. A belső (veszélyes) él marad, a külső él a sáv szélességének `bandWidthFactor`-szorosára
 * tolódik — a műszer messzebbről is mér, de közelebb merészkedni nem kell hozzá.
 */
export function effectiveAnchorBand(
  band: { min: number; max: number },
  bandWidthFactor: number,
): { min: number; max: number } {
  const width = Math.max(0, band.max - band.min);
  return { min: band.min, max: band.min + width * Math.max(1, bandWidthFactor) };
}

/** A talaj tapadása a fejlesztett gumikkal; a fizika 1-nél nem kér többet. */
export function effectiveSurfaceGrip(surfaceGrip: number, gripFactor: number): number {
  return Math.min(1, Math.max(0, surfaceGrip) * Math.max(1, gripFactor));
}

/**
 * Ütközési sebességvesztés tompítása. `before` az ütközés előtti, `after` a (nyers) ütközés utáni sebesség;
 * a vesztés `crashLossFactor`-ral szorzódik, az előjel és az irány nem változik.
 */
export function softenImpact(before: number, after: number, crashLossFactor: number): number {
  if (!(Math.abs(before) > 0) || (after !== 0 && Math.sign(before) !== Math.sign(after))) return after;
  if (crashLossFactor >= 1) return after; // fejlesztés nélkül a nyers eredmény, lebegőpontos zaj nélkül
  const kept = after / before;
  if (!(kept < 1)) return after;
  const loss = (1 - Math.max(0, kept)) * Math.min(1, Math.max(0, crashLossFactor));
  return before * (1 - loss);
}
