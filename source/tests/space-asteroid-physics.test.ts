import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAYER_MAX_SPEED,
  integratePlayer,
  spawnReady,
  splitRock,
  enemyRenderSpin,
  starScrollY,
  GAME_H,
} from "../client/src/lib/spaceAsteroid/physics.ts";

function almost(a: number, b: number, eps = 0.08): void {
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b} (±${eps})`);
}

function coast(input: { mx: number; my: number }, seconds: number) {
  // Mid-band so a 0.45 s burst cannot hit the walls (that would zero velocity
  // and make the speed invariant unmeasurable).
  let p = { x: 0, y: -6.4, vx: 0, vy: 0, bobPhase: 0 };
  const dt = 0.01;
  for (let t = 0; t < seconds; t += dt) {
    p = integratePlayer(p, input, dt);
  }
  return p;
}

test("átlós input nem gyorsabb a tengely szerintinél (normalizálás)", () => {
  // 0.2 s stays in the linear-accel window (max is reached at ~0.29 s).
  const diag = coast({ mx: 1, my: 1 }, 0.2);
  const axis = coast({ mx: 1, my: 0 }, 0.2);
  const diagSpeed = Math.hypot(diag.vx, diag.vy);
  const axisSpeed = Math.hypot(axis.vx, axis.vy);
  almost(diagSpeed, axisSpeed, 0.12);
  assert.ok(diagSpeed > 3, `should have accelerated, got ${diagSpeed}`);
});

test("nincs input: 0.4 s alatt a sebesség < 15% a maxnak (súrlódás)", () => {
  let p = coast({ mx: 1, my: 0 }, 0.45);
  assert.ok(Math.hypot(p.vx, p.vy) > 4, `pre-coast speed ${Math.hypot(p.vx, p.vy)}`);
  const dt = 0.01;
  for (let t = 0; t < 0.4; t += dt) {
    p = integratePlayer(p, { mx: 0, my: 0 }, dt);
  }
  assert.ok(
    Math.hypot(p.vx, p.vy) < PLAYER_MAX_SPEED * 0.15,
    `coast speed ${Math.hypot(p.vx, p.vy)} should be < ${PLAYER_MAX_SPEED * 0.15}`,
  );
});

test("spawnReady: az elapsed óra (nem a fali idő) dönt — kvíz alatt nem érik be", () => {
  assert.equal(spawnReady({ elapsed: 5.0, lastSpawnAt: 4.2, interval: 1, emptyField: false }), false);
  assert.equal(spawnReady({ elapsed: 5.3, lastSpawnAt: 4.2, interval: 1, emptyField: false }), true);
  // Pause: elapsed frozen at 5.0 — still not due
  assert.equal(spawnReady({ elapsed: 5.0, lastSpawnAt: 4.2, interval: 1, emptyField: false }), false);
});

test("spawnReady: üres pálya azonnal kész (első spawn)", () => {
  assert.equal(spawnReady({ elapsed: 0, lastSpawnAt: 0, interval: 1.4, emptyField: true }), true);
});

test("splitRock: két gyerek ellentétes vx-szel szétrepül, nem zuhan ki", () => {
  const rng = (() => {
    let i = 0;
    const seq = [0.1, 0.9, 0.2, 0.8, 0.3, 0.7];
    return () => seq[i++ % seq.length]!;
  })();
  const kids = splitRock({ x: 0, y: 4, vx: 0.2, vy: -1.2, size: 3 }, rng);
  assert.equal(kids.length, 2);
  assert.equal(kids[0]!.size, 2);
  assert.equal(kids[1]!.size, 2);
  assert.ok(kids[0]!.vx * kids[1]!.vx < 0, "children vx must have opposite signs");
  const floor = -2.8;
  for (const k of kids) {
    assert.ok(k.vy >= floor, `child vy ${k.vy} steeper than ${floor}`);
  }
});

test("enemyRenderSpin: a vadász nem bukfencezik X/Y-on", () => {
  const a = enemyRenderSpin("fighter", 1.0, 0.4, 2);
  const b = enemyRenderSpin("fighter", 8.0, 1.1, -2);
  almost(a.x, b.x, 0.001);
  almost(a.y, b.y, 0.001);
  assert.ok(Math.abs(a.z) < 0.6);
});

test("enemyRenderSpin: a szikla forog mindhárom tengelyen", () => {
  const a = enemyRenderSpin("rock", 1.0, 0.2, 0);
  const b = enemyRenderSpin("rock", 3.0, 0.2, 0);
  assert.ok(Math.abs(a.x - b.x) > 0.2);
  assert.ok(Math.abs(a.y - b.y) > 0.2);
});

test("starScrollY dt-arányos és wrappel", () => {
  const y1 = starScrollY(0, 1, true);
  const y2 = starScrollY(0, 0.5, true);
  almost(y1, y2 * 2, 0.05);
  const wrapped = starScrollY(-GAME_H * 1.21, 0.01, true);
  assert.ok(wrapped > 0, "below the floor wraps to the top");
});
