import assert from "node:assert/strict";
import test from "node:test";

import { maxSpeedUnits, stepVehicle, type DriveStats } from "../client/src/lib/tornado/drive.ts";

// Spec 2026-09-29-tornado-motorfek.
const STATS: DriveStats = { speedKmh: 168, acceleration: 68, handling: 76, grip: 0.8, windPush: 0, windAngle: 0 };
const vmax = maxSpeedUnits(STATS.speedKmh);

function coast(hz: number, seconds: number) {
  const dt = 1 / hz;
  let p = { x: 0, z: 0, heading: 0, speed: vmax, anchored: false };
  for (let t = 0; t < seconds - 1e-9; t += dt) p = stepVehicle(p, { throttle: 0, steer: 0, brake: false }, dt, STATS);
  return p.speed;
}

test("E1 gáz nélkül 2,5 s után az autó a végsebesség 5%-a alá lassul (30/60/144 Hz)", () => {
  for (const hz of [30, 60, 144]) {
    const v = coast(hz, 2.5);
    assert.ok(v < vmax * 0.05, `${hz} Hz: ${(100 * v / vmax).toFixed(1)}% maradt`);
  }
});

test("E2 teljes gázzal a végsebesség nem változik", () => {
  const dt = 1 / 60;
  let p = { x: 0, z: 0, heading: 0, speed: 0, anchored: false };
  for (let i = 0; i < 600; i++) p = stepVehicle(p, { throttle: 1, steer: 0, brake: false }, dt, { ...STATS, grip: 1 });
  assert.ok(Math.abs(p.speed - vmax) / vmax < 0.2, `teljes gázzal ${p.speed} vs ${vmax}`);
});
