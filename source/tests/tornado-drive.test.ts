import assert from "node:assert/strict";
import test from "node:test";

import { fromKm, toKm, UNITS_PER_KM } from "../client/src/lib/tornado/world.ts";
import { stepVehicle, maxSpeedUnits, accelUnits } from "../client/src/lib/tornado/drive.ts";

const SCOUT = { speedKmh: 168, acceleration: 68, handling: 76 };

function body(over: Partial<{ x: number; z: number; heading: number; speed: number; anchored: boolean }> = {}) {
  return { x: 0, z: 0, heading: 0, speed: 0, anchored: false, ...over };
}

test("maxSpeedUnits: 168 km/h ≈ 12.13 world-units/s, NEM *60-szoros", () => {
  const u = maxSpeedUnits(168);
  almost(u, fromKm(168 / 3600), 1e-9);
  almost(toKm(u) * 3600, 168, 0.01);
  assert.ok(u < 20, `168 km/h must not be ${u} u/s (the old *60 bug)`);
});

test("1 s full throttle on a 168 km/h scout covers tens of metres, not kilometres", () => {
  let p = body();
  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) {
    p = stepVehicle(p, { throttle: 1, steer: 0, brake: false }, dt, { ...SCOUT, grip: 1, windPush: 0, windAngle: 0 });
  }
  const km = toKm(Math.hypot(p.x, p.z));
  assert.ok(km > 0.02 && km < 0.25, `1s distance ${km} km (want ~0.02–0.25)`);
  const kmh = toKm(Math.abs(p.speed)) * 3600;
  assert.ok(kmh > 20 && kmh < 180, `speed after 1s ${kmh} km/h`);
});

test("steer works from ~2 km/h, not from 72 km/h", () => {
  const crawling = fromKm(3 / 3600); // 3 km/h
  const a = stepVehicle(
    body({ speed: crawling, heading: 0 }),
    { throttle: 0, steer: 1, brake: false },
    0.05,
    { ...SCOUT, grip: 1, windPush: 0, windAngle: 0 },
  );
  assert.ok(a.heading > 0.01, `heading ${a.heading} should change at 3 km/h`);
  const parked = stepVehicle(
    body({ speed: 0, heading: 0 }),
    { throttle: 0, steer: 1, brake: false },
    0.05,
    { ...SCOUT, grip: 1, windPush: 0, windAngle: 0 },
  );
  assert.equal(parked.heading, 0);
});

test("analog throttle 0.3 is weaker than 1.0 (stick must not be digital)", () => {
  const dt = 1 / 60;
  let full = body();
  let partial = body();
  for (let i = 0; i < 30; i++) {
    full = stepVehicle(full, { throttle: 1, steer: 0, brake: false }, dt, { ...SCOUT, grip: 1, windPush: 0, windAngle: 0 });
    partial = stepVehicle(partial, { throttle: 0.3, steer: 0, brake: false }, dt, { ...SCOUT, grip: 1, windPush: 0, windAngle: 0 });
  }
  assert.ok(Math.abs(full.speed) > Math.abs(partial.speed) * 1.5);
});

function almost(a: number, b: number, eps: number) {
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`);
}

void UNITS_PER_KM;
void accelUnits;
