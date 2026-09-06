/**
 * Tornado Hunter 200 — the wind model.
 *
 * The HUD's "WIND SPEED: 218 km/h" is the game's main feedback channel: it is
 * how a child feels that driving closer is dangerous before anything visibly
 * goes wrong. Two properties are therefore load-bearing and pinned by tests:
 * the reading rises monotonically as the distance shrinks, and the session
 * maximum never goes backwards.
 *
 * Pure and DOM-free; the Three.js layer only reads the numbers.
 */

import type { LevelSpec } from "./levels";
import type { Rng } from "./questions";

export type WindState = {
  /** km/h, what the HUD shows. */
  currentWindSpeed: number;
  /** Largest value seen this run — a statistic and a scoring input. */
  maximumWindSpeed: number;
  /** Degrees, 0 = North, clockwise. */
  windDirection: number;
  /** km/h, always >= currentWindSpeed. */
  windGusts: number;
  /** 0..10, the weather system's overall energy. */
  stormIntensity: number;
  /** 0..10, the funnel itself. */
  tornadoIntensity: number;
};

export type CompassPoint = { label: string; arrow: string; deg: number };

export const COMPASS_POINTS: readonly CompassPoint[] = [
  { label: "N", arrow: "↑", deg: 0 },
  { label: "NE", arrow: "↗", deg: 45 },
  { label: "E", arrow: "→", deg: 90 },
  { label: "SE", arrow: "↘", deg: 135 },
  { label: "S", arrow: "↓", deg: 180 },
  { label: "SW", arrow: "↙", deg: 225 },
  { label: "W", arrow: "←", deg: 270 },
  { label: "NW", arrow: "↖", deg: 315 },
] as const;

export function compassFor(deg: number): CompassPoint {
  const d = ((deg % 360) + 360) % 360;
  const idx = Math.round(d / 45) % 8;
  return COMPASS_POINTS[idx]!;
}

/** Bearing from (x1,z1) to (x2,z2) in degrees, 0 = North (-Z), clockwise. */
export function bearingBetween(x1: number, z1: number, x2: number, z2: number): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const deg = (Math.atan2(dx, -dz) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * Wind speed at a given distance from the funnel.
 *
 * Strictly decreasing in `distanceKm`: a smooth falloff (not a step) so the
 * needle moves continuously while driving, and capped at the level's peak so
 * the number can never exceed what the level advertises.
 */
const AMBIENT_SHARE = 0.06;

export function windSpeedAt(distanceKm: number, peak: number): number {
  const d = Math.max(0, distanceKm);
  // 1/(1+d^1.6) style falloff: peak at the core, ~10% of peak at 3 km.
  const falloff = 1 / (1 + Math.pow(d * 1.35, 1.6));
  // A far-field breeze so the gauge never reads a dead zero out on the plains.
  // Normalised by (1 + AMBIENT_SHARE) so the sum is exactly `peak` at d = 0:
  // the HUD must never show more than the level advertises.
  const ambient = AMBIENT_SHARE * Math.exp(-d / 9);
  return Math.max(0, (peak * (falloff + ambient)) / (1 + AMBIENT_SHARE));
}

export function initialWind(spec: LevelSpec): WindState {
  const base = windSpeedAt(4, spec.windPeak);
  return {
    currentWindSpeed: Math.round(base),
    maximumWindSpeed: Math.round(base),
    windDirection: 45,
    windGusts: Math.round(base * 1.15),
    stormIntensity: Math.max(1, spec.tornadoIntensity - 1.5),
    tornadoIntensity: spec.tornadoIntensity,
  };
}

export type WindStep = {
  distanceKm: number;
  peak: number;
  tornadoIntensity: number;
  /** Seconds since the previous step. */
  dt: number;
  /** Bearing from the player to the funnel, degrees. */
  bearingDeg: number;
  rng?: Rng;
};

/**
 * Advance the wind one frame.
 *
 * The direction lags behind the funnel's bearing (a wind vane does not snap),
 * and gusts sit on top of the sustained value — never below it, which is what
 * the test pins, because a gust reading under the sustained wind would be a
 * meteorological nonsense a child could notice.
 */
export function advanceWind(prev: WindState, step: WindStep): WindState {
  const rng = step.rng ?? Math.random;
  const sustained = windSpeedAt(step.distanceKm, step.peak);
  // Small breathing motion, ±3%, so a parked car does not show a frozen number.
  const breathe = 1 + (rng() - 0.5) * 0.06;
  const current = Math.max(0, sustained * breathe);

  // Wind swirls around the funnel: the vane points ~90° off the bearing.
  const target = (step.bearingDeg + 90) % 360;
  const diff = ((target - prev.windDirection + 540) % 360) - 180;
  const turnRate = Math.min(1, step.dt * 1.6);
  const direction = (prev.windDirection + diff * turnRate + 360) % 360;

  const gustFactor = 1.08 + rng() * (0.05 + step.tornadoIntensity * 0.03);
  const rounded = Math.round(current);

  return {
    currentWindSpeed: rounded,
    maximumWindSpeed: Math.max(prev.maximumWindSpeed, rounded),
    windDirection: direction,
    windGusts: Math.round(current * gustFactor),
    stormIntensity: Math.max(1, Math.min(10, step.tornadoIntensity - 1.5 + (1 - Math.min(1, step.distanceKm / 4)) * 1.5)),
    tornadoIntensity: step.tornadoIntensity,
  };
}

/** Sideways force pushing the vehicle, scaled by its wind resistance stat. */
export function windForceOn(wind: WindState, windResistance: number): number {
  const exposure = 1 - Math.min(0.85, windResistance / 130);
  return (wind.currentWindSpeed / 100) * exposure;
}

/** HUD text for the wind row, e.g. "218 km/h". */
export function formatWind(wind: WindState): string {
  return `${Math.round(wind.currentWindSpeed)} km/h`;
}
