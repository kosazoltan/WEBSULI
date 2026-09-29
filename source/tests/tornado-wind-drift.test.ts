import assert from "node:assert/strict";
import test from "node:test";

import { stepVehicle, maxSpeedUnits, windDriftUnits, type DriveStats } from "../client/src/lib/tornado/drive.ts";
import { windSpeedAt, windForceOn, bearingBetween, type WindState } from "../client/src/lib/tornado/wind.ts";
import { levelSpec } from "../client/src/lib/tornado/levels.ts";

/*
 * Spec 2026-09-29-tornado-fizika H3/D10: „Érintés nélkül egyszer csak hátra elindult az autó.”
 * The wind drift was (1) applied to a parked car with no input, (2) rotated 90° by a cos/sin axis mix-up
 * (windDirection is 0 = North (−Z), clockwise), which turned the tangential gust into a radial push away
 * from the funnel — straight backwards for a car facing it — and (3) still scaled for the old *60 physics.
 */

const SCOUT = { speedKmh: 168, acceleration: 68, handling: 76 };

function stats(windPush: number, windAngle: number, grip = 1): DriveStats {
  return { ...SCOUT, grip, windPush, windAngle };
}

function body(over: Partial<{ x: number; z: number; heading: number; speed: number; anchored: boolean }> = {}) {
  return { x: 10, z: 20, heading: 0, speed: 0, anchored: false, ...over };
}

test("álló, input nélküli autó 5 s erős szélben sem mozdul (bármely irányból)", () => {
  for (const deg of [0, 45, 90, 135, 180, 225, 270, 315]) {
    let p = body({ heading: 0.7 });
    for (let i = 0; i < 300; i++) {
      p = stepVehicle(p, { throttle: 0, steer: 0, brake: false }, 1 / 60, stats(8, (deg * Math.PI) / 180));
    }
    assert.equal(p.x, 10, `x drifted under ${deg}° wind`);
    assert.equal(p.z, 20, `z drifted under ${deg}° wind`);
    assert.equal(p.speed, 0);
  }
});

test("a sodrás iránya a szélirány (0 = észak = −Z, óramutató szerint), sebességként × dt", () => {
  const moving = body({ heading: 0, speed: 5 });
  const calm = stepVehicle(moving, { throttle: 0, steer: 0, brake: false }, 0.1, stats(0, 0));
  // East (90°) wind of 2 u/s for 0.1 s → +0.2 on x, nothing on z.
  const east = stepVehicle(moving, { throttle: 0, steer: 0, brake: false }, 0.1, stats(2, Math.PI / 2));
  assert.ok(Math.abs(east.x - calm.x - 0.2) < 1e-9, `east drift dx=${east.x - calm.x}`);
  assert.ok(Math.abs(east.z - calm.z) < 1e-9, `east drift dz=${east.z - calm.z}`);
  // North (0°) wind → −z.
  const north = stepVehicle(moving, { throttle: 0, steer: 0, brake: false }, 0.1, stats(2, 0));
  assert.ok(Math.abs(north.x - calm.x) < 1e-9);
  assert.ok(Math.abs(north.z - calm.z + 0.2) < 1e-9, `north drift dz=${north.z - calm.z}`);
});

test("a tölcsér felé haladó autót a szél oldalra sodorja, nem hátra", () => {
  // Player south of the funnel, heading north (towards it); the vane settles at bearing + 90°.
  const player = { x: 0, z: 400 };
  const bearing = bearingBetween(player.x, player.z, 0, 0);
  const windDeg = (bearing + 90) % 360;
  const moving = body({ ...player, heading: 0, speed: 3 });
  const calm = stepVehicle(moving, { throttle: 0, steer: 0, brake: false }, 0.1, stats(0, 0));
  const windy = stepVehicle(moving, { throttle: 0, steer: 0, brake: false }, 0.1, stats(3, (windDeg * Math.PI) / 180));
  const dx = windy.x - calm.x;
  const dz = windy.z - calm.z;
  const toFunnel = { x: -player.x, z: -player.z };
  const len = Math.hypot(toFunnel.x, toFunnel.z);
  const radial = (dx * toFunnel.x + dz * toFunnel.z) / len;
  assert.ok(Math.hypot(dx, dz) > 0.1, "the wind still pushes a moving car");
  assert.ok(Math.abs(radial) < 1e-9, `radial drift component ${radial} (must be tangential)`);
});

test("windDriftUnits a #200-as arányt tartja (30 / 60), és a horgonyzósávban sem nő a végsebesség negyede fölé", () => {
  assert.equal(windDriftUnits(1), 0.5);
  assert.equal(windDriftUnits(0), 0);
  const scoutMax = maxSpeedUnits(168);
  for (let level = 1; level <= 200; level++) {
    const spec = levelSpec(level);
    const wind = { currentWindSpeed: windSpeedAt(spec.anchorBand.min, spec.windPeak) } as WindState;
    const drift = windDriftUnits(windForceOn(wind, 40));
    assert.ok(drift < scoutMax * 0.25, `level ${level}: drift ${drift.toFixed(2)} u/s vs vmax ${scoutMax.toFixed(2)}`);
  }
});
