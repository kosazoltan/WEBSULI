import assert from "node:assert/strict";
import test from "node:test";

import { stepVehicle, maxSpeedUnits } from "../client/src/lib/tornado/drive.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  collidersForProp,
  collidersNear,
  resolveVehicleCollisions,
  vehicleDimensions,
  type Collider,
} from "../client/src/lib/tornado/collision.ts";
import { propsInChunk, riverCenterX, type WorldProp } from "../client/src/lib/tornado/world.ts";

/*
 * Spec 2026-09-29-tornado-fizika H2: the car drove straight through houses, trees and poles — the play
 * loop moved it with `stepVehicle` and nothing else. D6–D8: circle / rotated-box colliders from the
 * deterministic prop list; head-on stops, a glancing hit slides along.
 */

const SCOUT = { speedKmh: 168, acceleration: 68, handling: 76, grip: 1, windPush: 0, windAngle: 0 };
const DIMS = vehicleDimensions("pickup");

type Body = { x: number; z: number; heading: number; speed: number; anchored: boolean };

function drive(start: Body, colliders: Collider[], seconds: number, steer = 0): Body {
  let p = { ...start };
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) {
    p = stepVehicle(p, { throttle: 1, steer, brake: false }, dt, SCOUT);
    const r = resolveVehicleCollisions(p, DIMS, colliders);
    p = { ...p, x: r.x, z: r.z, speed: r.speed };
  }
  return p;
}

/** The two footprint circles of the car (D7). */
function circles(p: Body) {
  const halfW = DIMS.width / 2;
  const off = DIMS.length / 2 - halfW;
  const fx = Math.sin(p.heading);
  const fz = -Math.cos(p.heading);
  return [
    { x: p.x + fx * off, z: p.z + fz * off, r: halfW },
    { x: p.x - fx * off, z: p.z - fz * off, r: halfW },
  ];
}

/** Distance from a point to a collider's surface (negative inside). */
function surfaceDistance(c: Collider, x: number, z: number): number {
  if (c.kind === "circle") return Math.hypot(x - c.x, z - c.z) - c.r;
  const cos = Math.cos(c.rotation);
  const sin = Math.sin(c.rotation);
  const dx = x - c.x;
  const dz = z - c.z;
  // Inverse of three.js rotation.y.
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const qx = Math.abs(lx) - c.hx;
  const qz = Math.abs(lz) - c.hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}

function assertNoPenetration(p: Body, colliders: Collider[], label: string) {
  for (const c of colliders) {
    for (const k of circles(p)) {
      const d = surfaceDistance(c, k.x, k.z) - k.r;
      assert.ok(d > -0.05, `${label}: car penetrates ${c.kind} by ${(-d).toFixed(3)}`);
    }
  }
}

const house: WorldProp = { kind: "house", x: 0, z: 0, rotation: 0, scale: 1 };

test("frontálisan házba hajtva az autó megáll a falnál, nem hatol be", () => {
  const colliders = collidersForProp(house);
  assert.equal(colliders.length, 1);
  const end = drive({ x: 0, z: 20, heading: 0, speed: 0, anchored: false }, colliders, 4);
  assertNoPenetration(end, colliders, "house head-on");
  assert.ok(end.z < 4 + DIMS.length / 2 + 0.5, `the car reached the wall (z=${end.z.toFixed(2)})`);
  assert.ok(Math.abs(end.speed) < maxSpeedUnits(168) * 0.05, `head-on speed ${end.speed.toFixed(3)} must be ~0`);
});

test("45°-ban elforgatott ház: sehol sem hatol be", () => {
  const rotated = collidersForProp({ ...house, rotation: Math.PI / 4, scale: 1.3 });
  for (const lateral of [-4, -2, 0, 2, 4]) {
    const end = drive({ x: lateral, z: 25, heading: 0, speed: 0, anchored: false }, rotated, 4);
    assertNoPenetration(end, rotated, `rotated house, lateral ${lateral}`);
  }
});

test("fatörzsbe hajtva megáll; oszlop, siló, víztorony, kerítés is szilárd", () => {
  for (const kind of ["tree", "pole", "silo", "watertower", "fence", "barn"] as const) {
    const cs = collidersForProp({ kind, x: 0, z: 0, rotation: 0, scale: 1 });
    assert.ok(cs.length >= 1, `${kind} has a collider`);
    const end = drive({ x: 0, z: 30, heading: 0, speed: 0, anchored: false }, cs, 5);
    assertNoPenetration(end, cs, kind);
    assert.ok(end.z > 0, `${kind}: the car did not pass through (z=${end.z.toFixed(2)})`);
  }
});

test("kútnál a tető alatt át lehet hajtani, de az oszlopokba nem", () => {
  const cs = collidersForProp({ kind: "fuel", x: 0, z: 0, rotation: 0, scale: 1 });
  assert.equal(cs.length, 2);
  const through = drive({ x: 0, z: 30, heading: 0, speed: 0, anchored: false }, cs, 5);
  assert.ok(through.z < -10, `the car drives under the canopy between the posts (z=${through.z.toFixed(2)})`);
  const post = drive({ x: 6, z: 30, heading: 0, speed: 0, anchored: false }, cs, 5);
  assertNoPenetration(post, cs, "fuel post");
});

test("a bokor puha: nincs ütközője", () => {
  assert.deepEqual(collidersForProp({ kind: "bush", x: 0, z: 0, rotation: 0, scale: 1 }), []);
});

test("30°-os szögben a falhoz érve a fal mentén csúszik tovább", () => {
  const wall: Collider[] = [{ kind: "box", x: 0, z: 0, hx: 200, hz: 0.5, rotation: 0 }];
  const heading = Math.PI / 2 - Math.PI / 6; // mostly east, 30° into the wall (towards −z)
  const end = drive({ x: -60, z: 8, heading, speed: maxSpeedUnits(168) * 0.6, anchored: false }, wall, 4);
  assertNoPenetration(end, wall, "wall slide");
  // 4 s along the wall at ~0.87 × vmax is ≥ 30 units even with the approach and the scrape friction.
  assert.ok(end.x > -30, `slid along the wall (x=${end.x.toFixed(1)})`);
  assert.ok(Math.abs(end.z - (0.5 + DIMS.width / 2)) < 1, `stayed against the wall (z=${end.z.toFixed(2)})`);
  assert.ok(Math.abs(end.speed) > maxSpeedUnits(168) * 0.2, `kept speed while sliding (${end.speed.toFixed(2)})`);
});

test("collidersNear: a valódi kellékekből, determinisztikusan; a hídon korlát-ütköző van", () => {
  let found: WorldProp | null = null;
  for (let cx = -5; cx <= 5 && !found; cx++) {
    for (const p of propsInChunk(cx, 3)) {
      if (p.kind === "house") {
        found = p;
        break;
      }
    }
  }
  assert.ok(found, "a house exists in the sample row");
  const near = collidersNear(found.x, found.z);
  assert.deepEqual(collidersNear(found.x, found.z), near);
  assert.ok(
    near.some((c) => c.kind === "box" && Math.abs(c.x - found!.x) < 1e-9 && Math.abs(c.z - found!.z) < 1e-9),
    "the house collider is returned",
  );
  const rc = riverCenterX(-900);
  const rails = collidersNear(rc, -900).filter((c) => c.kind === "box" && Math.abs(Math.abs(c.z - -900) - 9) < 1);
  assert.ok(rails.length >= 2, `bridge railings on both edges of the z=-900 bridge: ${JSON.stringify(rails)}`);
});

test("a hídon végighajtva a korlát nem akaszt meg", () => {
  const rc = riverCenterX(-900);
  const start: Body = { x: rc - 60, z: -900, heading: Math.PI / 2, speed: 0, anchored: false };
  let p = { ...start };
  // ~110 units at ≤ 12 u/s: give it 14 s.
  for (let i = 0; i < 14 * 60; i++) {
    p = stepVehicle(p, { throttle: 1, steer: 0, brake: false }, 1 / 60, SCOUT);
    const r = resolveVehicleCollisions(p, DIMS, collidersNear(p.x, p.z));
    p = { ...p, x: r.x, z: r.z, speed: r.speed };
  }
  assert.ok(p.x > rc + 40, `crossed the bridge (x=${p.x.toFixed(1)}, river at ${rc.toFixed(1)})`);
});

// Review PR #137 (3): the play loop called resolveVehicleCollisions without the frame dt, so the scrape
// friction assumed 60 Hz — at 144 Hz a car grinding along a wall slowed much faster than at 60 Hz.
test("falmenti súrlódás 30, 60 és 144 Hz-en 1 s alatt közel azonos lassulást ad", () => {
  const wall: Collider[] = [{ kind: "box", x: 0, z: 0, hx: 400, hz: 0.5, rotation: 0 }];
  const heading = Math.PI / 2 - Math.PI / 6;
  const halfW = DIMS.width / 2;
  const off = DIMS.length / 2 - halfW;
  // Front circle touching the wall face (z = 0.5).
  const startZ = 0.5 + halfW + Math.cos(heading) * off;
  const end: number[] = [];
  for (const hz of [30, 60, 144]) {
    const dt = 1 / hz;
    let p: Body = { x: -100, z: startZ, heading, speed: 8, anchored: false };
    for (let i = 0; i < hz; i++) {
      // Exactly the play loop's frame: stepVehicle, then the collision pass with the same dt.
      const next = stepVehicle(p, { throttle: 0, steer: 0, brake: false }, dt, SCOUT);
      const r = resolveVehicleCollisions(next, DIMS, wall, dt);
      p = { ...next, x: r.x, z: r.z, speed: r.speed };
    }
    end.push(p.speed);
  }
  const [s30, s60, s144] = end as [number, number, number];
  // Spec 2026-09-29-tornado-motorfek (dokumentált változás): a gáz nélküli kigurulás motorfékkel erősebb, ezért az
  // abszolút „> 1” alsó határ helyett a falat egy fal NÉLKÜLI kigurulási alapvonalhoz mérjük (szigorúbb: a súrlódás
  // hatását különíti el); a „nem áll meg azonnal” feltétel megmarad (> a kezdősebesség 5%-a).
  let free: Body = { x: -100, z: startZ, heading, speed: 8, anchored: false };
  for (let i = 0; i < 60; i++) free = stepVehicle(free, { throttle: 0, steer: 0, brake: false }, 1 / 60, SCOUT);
  assert.ok(s60 < free.speed * 0.99, `the scrape really slows the car at 60 Hz beyond coasting: ${s60} vs ${free.speed}`);
  assert.ok(s60 > 8 * 0.05, `the scrape does not stop the car at once: ${s60}`);
  for (const [label, s] of [["30 Hz", s30], ["144 Hz", s144]] as const) {
    assert.ok(Math.abs(s - s60) / s60 < 0.05, `${label}: ${s.toFixed(3)} vs 60 Hz ${s60.toFixed(3)}`);
  }
});

test("a játékhurok a képkocka dt-jével hívja az ütközésfeloldást", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const page = readFileSync(join(root, "client/src/pages/TornadoHunter200.tsx"), "utf8");
  const calls = page.match(/resolveVehicleCollisions\([^;]*\)/g) ?? [];
  assert.ok(calls.length >= 1, "the play loop resolves collisions");
  for (const call of calls) assert.match(call, /,\s*dt\s*\)$/, `collision pass without the frame dt: ${call}`);
});
