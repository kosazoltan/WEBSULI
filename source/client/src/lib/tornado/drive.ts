/**
 * Tornado Hunter — vehicle integration.
 *
 * The play loop used `fromKm(kmh/3600) * 60` for top speed (a 168 km/h scout
 * became 10 080 km/h) and gated steering at `fromKm(0.02)` = 72 km/h. Analog
 * sticks mapped onto that formula feel like a rocket that cannot turn.
 *
 * Units: world units / second. `UNITS_PER_KM = 260`.
 */

import { clampToWorld, fromKm } from "./world";

export type VehicleBody = {
  x: number;
  z: number;
  heading: number;
  speed: number;
  anchored: boolean;
};

export type DriveInput = {
  /** -1..1  (forward positive). Analog. */
  throttle: number;
  /** -1..1  (right positive). Analog. */
  steer: number;
  brake: boolean;
};

export type DriveStats = {
  speedKmh: number;
  acceleration: number;
  handling: number;
  grip: number;
  windPush: number;
  windAngle: number;
};

/** World units / second at the vehicle's rated km/h. */
export function maxSpeedUnits(speedKmh: number): number {
  return fromKm(speedKmh / 3600);
}

/**
 * Acceleration in world units / s².
 * Scaled to the vehicle's own top speed: a 60-stat engine reaches vmax
 * in ~1 s without drag (arcade, not a 10 080 km/h rocket).
 */
export function accelUnits(accelerationStat: number, speedKmh: number): number {
  return maxSpeedUnits(speedKmh) * (accelerationStat / 60);
}

const STEER_MIN_SPEED = fromKm(2 / 3600);
/** Below this, the HUD/anchor treats the vehicle as stopped. ~8 km/h. */
export const STOPPED_SPEED = fromKm(8 / 3600);

export function stepVehicle(
  p: VehicleBody,
  input: DriveInput,
  dt: number,
  stats: DriveStats,
): VehicleBody {
  if (p.anchored) return { ...p, speed: 0 };

  const throttle = clamp(input.throttle, -1, 1);
  const steer = clamp(input.steer, -1, 1);
  const max = maxSpeedUnits(stats.speedKmh);
  const accel = accelUnits(stats.acceleration, stats.speedKmh);
  const grip = clamp(stats.grip, 0.05, 1);
  const turn = 1.6 * (stats.handling / 80);

  let speed = p.speed + throttle * accel * dt;
  if (input.brake) speed *= 1 - Math.min(1, dt * 4);
  speed *= 1 - Math.min(1, dt * (0.15 + (1 - grip) * 1.2));
  speed = Math.max(-max * 0.4, Math.min(max, speed));

  let heading = p.heading;
  if (Math.abs(speed) > STEER_MIN_SPEED) {
    heading += steer * turn * dt * Math.sign(speed) * grip;
  }

  const nx = clampToWorld(p.x + Math.sin(heading) * speed * dt);
  const nz = clampToWorld(p.z - Math.cos(heading) * speed * dt);
  const px = clampToWorld(nx + Math.cos(stats.windAngle) * stats.windPush);
  const pz = clampToWorld(nz + Math.sin(stats.windAngle) * stats.windPush);

  return { x: px, z: pz, heading, speed, anchored: false };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
