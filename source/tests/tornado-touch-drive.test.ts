import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { joystickToDirections, joystickVector, type JoystickVector } from "../client/src/game-engine/joystick.ts";
import * as controls from "../client/src/lib/tornado/controls.ts";
import * as drive from "../client/src/lib/tornado/drive.ts";
import { resolveVehicleCollisions, vehicleDimensions, type Collider } from "../client/src/lib/tornado/collision.ts";
import { fromKm, gripAt, surfaceAt } from "../client/src/lib/tornado/world.ts";

/**
 * Spec 2026-09-29-tornado-ut-kormanyzas H2 / E3–E6. On a phone the car wandered left and right and
 * would not hold a straight line. Measured root cause: the touch stick was split into four booleans
 * (`joystickToDirections`, threshold 0.35) — up to ~23° off vertical nothing steered, beyond it the full
 * 86°/s lock did. A child cannot make a small correction with that. The wind (0.05 u/s on level 1) was not
 * the cause. Plus: 12.4 u/s top speed looked like a crawl, and the camera rode every bump of the V-shaped
 * road cutting.
 */

type TouchDrive = { throttle: number; steer: number };
const touchDriveInput = (controls as unknown as { touchDriveInput?: (v: JoystickVector) => TouchDrive }).touchDriveInput;
const d = drive as unknown as {
  DRIVE_PACE?: number;
  driveSubsteps?: (dt: number) => number;
  followHeight?: (prev: number, target: number, dt: number, tau?: number) => number;
};

const R = 52;
function stick(deg: number, reach = 0.9): JoystickVector {
  const a = (deg * Math.PI) / 180;
  return joystickVector({ origin: { x: 0, y: 0 }, point: { x: Math.sin(a) * reach * R, y: -Math.cos(a) * reach * R }, radius: R });
}

function need<T>(v: T | undefined, name: string): T {
  assert.ok(v !== undefined, `${name} is missing`);
  return v;
}

test("touchDriveInput: analóg, holtsávos, görbés kormány — 20°-nál alig, 90°-nál teljesen kormányoz", () => {
  const f = need(touchDriveInput, "controls.touchDriveInput");
  assert.deepEqual(f({ x: 0, y: 0, magnitude: 0 }), { throttle: 0, steer: 0 });
  const near = f(stick(20));
  assert.ok(Math.abs(near.steer) < 0.15 && near.steer >= 0, `20° steers ${near.steer} (the old stick: 0 or 1)`);
  assert.equal(near.throttle, 1, "pushing up at 90% reach is full throttle");
  const mid = f(stick(45));
  assert.ok(mid.steer > 0.3 && mid.steer < 0.7, `45° steers ${mid.steer}`);
  const side = f(stick(90));
  assert.equal(side.steer, 1);
  assert.equal(side.throttle, 0);
  assert.equal(f(stick(-90)).steer, -1);
  assert.equal(f(stick(180)).throttle, -1);
  let prev = -Infinity;
  for (let deg = 0; deg <= 90; deg += 3) {
    const o = f(stick(deg));
    assert.ok(o.steer >= prev - 1e-12, `steer not monotone at ${deg}°`);
    assert.ok(Math.abs(o.steer) <= 1 && Math.abs(o.throttle) <= 1);
    prev = o.steer;
  }
});

type Drive = { sigma: number; closed: boolean; seconds: number; mapping: (v: JoystickVector) => TouchDrive };

/**
 * The spec's thumb model: a 6° lean (open loop) or a correcting child (closed loop), plus
 * Ornstein–Uhlenbeck wobble (σ degrees, τ = 0.5 s), stick pushed to 90% of its radius.
 */
function nearlyStraight(seed: number, hz: number, opts: Drive) {
  const substeps = need(d.driveSubsteps, "drive.driveSubsteps");
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  const dt = 1 / hz;
  const lineZ = -900;
  let p = { x: -1000, z: lineZ, heading: Math.PI / 2, speed: 0, anchored: false };
  let wob = 0;
  let onAsphalt = 0;
  let maxLat = 0;
  let headDev5 = 0;
  const delay = Math.round(0.18 * hz); // a child's reaction time
  const seen: number[] = [];
  const N = Math.round(opts.seconds * hz);
  for (let i = 0; i < N; i++) {
    const g = Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
    wob += -wob * (dt / 0.5) + opts.sigma * Math.sqrt((2 * dt) / 0.5) * g;
    // Closed loop: the child pushes the thumb against what it saw ~180 ms ago (lateral + heading error).
    seen.push(p.z - lineZ + (p.heading - Math.PI / 2) * 12);
    const err = seen[Math.max(0, seen.length - 1 - delay)]!;
    const aim = opts.closed ? Math.max(-60, Math.min(60, -err * 25)) : 6;
    const input = opts.mapping(stick(aim + wob));
    const n = substeps(dt);
    for (let k = 0; k < n; k++) {
      p = drive.stepVehicle(p, { throttle: input.throttle, steer: input.steer, brake: false }, dt / n, {
        speedKmh: 172, acceleration: 65, handling: 75, grip: gripAt(p.x, p.z), windPush: 0.05, windAngle: 0,
      });
    }
    if (surfaceAt(p.x, p.z) === "asphalt") onAsphalt++;
    maxLat = Math.max(maxLat, Math.abs(p.z - lineZ));
    if (i * dt < 5) headDev5 = Math.max(headDev5, (Math.abs(p.heading - Math.PI / 2) * 180) / Math.PI);
  }
  return { onAsphalt: onAsphalt / N, maxLat, headDev5, x: p.x };
}

/** The old wiring: the stick split into four booleans (`joystickToDirections`, threshold 0.35). */
function fourWay(v: JoystickVector): TouchDrive {
  const dirs = joystickToDirections(v);
  return { throttle: (dirs.fwd ? 1 : 0) - (dirs.back ? 1 : 0), steer: (dirs.right ? 1 : 0) - (dirs.left ? 1 : 0) };
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

/*
 * No steering law holds a car straight open-loop forever: any wobble that steers at all integrates into a
 * heading random walk. So the open-loop check is a 5 s horizon, compared with the old four-way split in
 * the same harness (the root cause, measured), and the long run is closed-loop (a correcting child).
 */
test("közel egyenes tárcsa (6° + σ=12° remegés, korrekció nélkül, 5 s): tartja az irányt, a négyirányú bontás nem", () => {
  const f = need(touchDriveInput, "controls.touchDriveInput");
  for (const hz of [60, 30]) {
    const dev: number[] = [];
    const old: number[] = [];
    let stayed = 0;
    let oldStayed = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const r = nearlyStraight(seed, hz, { sigma: 12, closed: false, seconds: 5, mapping: f });
      const o = nearlyStraight(seed, hz, { sigma: 12, closed: false, seconds: 5, mapping: fourWay });
      dev.push(r.headDev5);
      old.push(o.headDev5);
      if (r.maxLat < 4.05) stayed++;
      if (o.maxLat < 4.05) oldStayed++;
    }
    assert.ok(mean(dev) < 6, `${hz} Hz: mean heading swing ${mean(dev).toFixed(1)}° within 5 s`);
    assert.ok(mean(old) > 3 * mean(dev), `${hz} Hz: four-way ${mean(old).toFixed(1)}° vs analog ${mean(dev).toFixed(1)}°`);
    assert.ok(stayed > oldStayed, `${hz} Hz: on the asphalt after 5 s in ${stayed}/12 runs (four-way ${oldStayed}/12)`);
  }
});

test("korrigáló vezetővel (σ=20° remegés, 40 s, 1,6× tempó) aszfalton marad és nem cikázik", () => {
  const f = need(touchDriveInput, "controls.touchDriveInput");
  for (const hz of [60, 30]) {
    const dev: number[] = [];
    const old: number[] = [];
    const on: number[] = [];
    const oldOn: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const r = nearlyStraight(seed, hz, { sigma: 20, closed: true, seconds: 40, mapping: f });
      const o = nearlyStraight(seed, hz, { sigma: 20, closed: true, seconds: 40, mapping: fourWay });
      assert.ok(r.onAsphalt >= 0.95, `${hz} Hz seed ${seed}: on asphalt ${(r.onAsphalt * 100).toFixed(1)}%`);
      assert.ok(r.x > -1000 + 600, `${hz} Hz seed ${seed}: it drove (x = ${r.x.toFixed(0)})`);
      dev.push(r.headDev5);
      old.push(o.headDev5);
      on.push(r.onAsphalt);
      oldOn.push(o.onAsphalt);
    }
    // Lane keeping no worse than the four-way split at the same speed; the zig-zag much smaller.
    assert.ok(mean(on) >= mean(oldOn), `${hz} Hz: on asphalt ${(mean(on) * 100).toFixed(2)}% vs four-way ${(mean(oldOn) * 100).toFixed(2)}%`);
    assert.ok(mean(dev) < 12, `${hz} Hz: heading swing ${mean(dev).toFixed(1)}°`);
    assert.ok(mean(old) > 1.5 * mean(dev), `${hz} Hz: four-way ${mean(old).toFixed(1)}° vs analog ${mean(dev).toFixed(1)}°`);
  }
});

test("a végsebesség a névleges km-skála 1,6-szorosa (érezhetően gyorsabb, nem *60)", () => {
  assert.equal(d.DRIVE_PACE, 1.6);
  const rated = fromKm(172 / 3600);
  assert.ok(drive.maxSpeedUnits(172) >= 1.5 * rated, `vmax ${drive.maxSpeedUnits(172)} vs rated ${rated}`);
  assert.ok(drive.maxSpeedUnits(172) < 2 * rated);
});

test("driveSubsteps: részlépés ≤ 1/60 s; 260 km/h, 20 fps mellett sem ugrik át kerítésen", () => {
  const n = need(d.driveSubsteps, "drive.driveSubsteps");
  assert.equal(n(1 / 60), 1);
  assert.equal(n(1 / 144), 1);
  assert.equal(n(1 / 30), 2);
  assert.equal(n(0.05), 3);
  assert.equal(n(0), 1);
  // A fence across the road ahead; the car drives north (−z) into it, 20 fps frames split into substeps.
  const fence: Collider[] = [{ kind: "box", x: 0, z: 0, hx: 50, hz: 0.11, rotation: 0 }];
  const dims = vehicleDimensions("pickup");
  const frame = 0.05;
  // Several start offsets: whether one big step lands past the fence's centre depends on the phase
  // (one step per frame went through for 3 of these 19).
  for (let start = 40; start < 41.95; start += 0.1) {
    let p = { x: 0, z: start, heading: 0, speed: drive.maxSpeedUnits(260), anchored: false };
    for (let i = 0; i < 60; i++) {
      const k = n(frame);
      for (let j = 0; j < k; j++) {
        const next = drive.stepVehicle(p, { throttle: 1, steer: 0, brake: false }, frame / k, {
          speedKmh: 260, acceleration: 100, handling: 80, grip: 1, windPush: 0, windAngle: 0,
        });
        const r = resolveVehicleCollisions(next, dims, fence, frame / k);
        p = { ...next, x: r.x, z: r.z, speed: r.speed };
      }
      assert.ok(p.z > 0, `start ${start.toFixed(1)}, frame ${i}: the car went through the fence (z = ${p.z.toFixed(2)})`);
    }
  }
});

test("followHeight: a kamera-magasság simítása frekvenciafüggetlen, nagy ugrásnál azonnal követ", () => {
  const f = need(d.followHeight, "drive.followHeight");
  const end: number[] = [];
  for (const hz of [30, 60, 144]) {
    let y = 0;
    for (let i = 0; i < hz / 2; i++) y = f(y, 1, 1 / hz);
    end.push(y);
  }
  const [a, b, c] = end as [number, number, number];
  assert.ok(b > 0.9 && b < 1, `0.5 s at 60 Hz reaches ${b}`);
  assert.ok(Math.abs(a - b) < 0.02 && Math.abs(c - b) < 0.02, `30/60/144 Hz: ${a} ${b} ${c}`);
  assert.equal(f(0, 10, 1 / 60), 10, "a teleport is not smoothed");
  assert.ok(f(0, 0.35, 1 / 60) < 0.1, "a bridge-end step (0.35) is smoothed");
});

test("bekötés: a tárcsa touchDriveInput-ot hív, a hurok részlépésez és simítja a kamerát", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const code = readFileSync(join(root, "client/src/pages/TornadoHunter200.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const start = code.indexOf("function TouchControls");
  const block = code.slice(start, code.indexOf("function TouchBtn", start));
  assert.match(block, /touchDriveInput\s*\(/);
  assert.match(code, /driveSubsteps\s*\(/);
  assert.match(code, /followHeight\s*\(/);
});
