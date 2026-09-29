import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { driveKeyFor, releaseDriveKeys, type DriveKeys } from "../client/src/lib/tornado/controls.ts";
import { applyDeadzone, readStandardGamepad, createGamepadRestGate } from "../client/src/lib/tornado/gamepad.ts";

/*
 * Spec 2026-09-29-tornado-fizika H3 (másodlagos) / D11: a held key whose keyup is delivered to another
 * window (alt-tab, notification, browser chrome) stayed pressed forever — measured in Chrome: hold S,
 * window blur, 2 s later the car reverses at −4.97 u/s with nothing touched. A gamepad axis that rests
 * off-centre (or reports NaN) likewise drove the car on its own.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(root, "client/src/pages/TornadoHunter200.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

test("driveKeyFor: WASD, nyilak, szóköz; kis- és nagybetű egyaránt", () => {
  const cases: [string, keyof DriveKeys | null][] = [
    ["w", "fwd"],
    ["W", "fwd"],
    ["ArrowUp", "fwd"],
    ["s", "back"],
    ["S", "back"],
    ["ArrowDown", "back"],
    ["a", "left"],
    ["ArrowLeft", "left"],
    ["d", "right"],
    ["ArrowRight", "right"],
    [" ", "brake"],
    ["f", null],
    ["Escape", null],
  ];
  for (const [key, want] of cases) assert.equal(driveKeyFor(key), want, key);
});

test("releaseDriveKeys minden irányt és a féket is felengedi", () => {
  const k: DriveKeys = { fwd: true, back: true, left: true, right: true, brake: true };
  releaseDriveKeys(k);
  assert.deepEqual(k, { fwd: false, back: false, left: false, right: false, brake: false });
});

test("a játék blur és visibilitychange eseménykor elengedi a billentyűket és a tárcsát", () => {
  assert.match(page, /addEventListener\(\s*["']blur["']/);
  assert.match(page, /addEventListener\(\s*["']visibilitychange["']/);
  assert.match(page, /releaseDriveKeys\(\s*keysRef\.current\s*\)/);
  assert.match(page, /removeEventListener\(\s*["']blur["']/);
  assert.match(page, /removeEventListener\(\s*["']visibilitychange["']/);
});

// -0 and 0 are the same stick position (throttle = -stickY), hence === rather than Object.is.
test("gamepad: NaN / végtelen tengely → 0, soha nem NaN gáz", () => {
  assert.equal(applyDeadzone(Number.NaN), 0);
  assert.equal(applyDeadzone(Number.POSITIVE_INFINITY), 0);
  const d = readStandardGamepad({ axes: [Number.NaN, Number.NaN], buttons: [] });
  assert.ok(d.throttle === 0, `throttle ${d.throttle}`);
  assert.ok(d.steer === 0, `steer ${d.steer}`);
});

test("gamepad nyugalmi kitéréssel (axes[1] = +1) nem vezet, amíg egyszer semlegesbe nem áll", () => {
  const gate = createGamepadRestGate();
  const resting = { axes: [0, 1], buttons: [] };
  const drive = (gp: { axes: number[]; buttons: never[] } | null) => readStandardGamepad(gate(gp) ? gp : null);
  for (let i = 0; i < 30; i++) {
    const d = drive(resting);
    assert.ok(d.throttle === 0, `frame ${i}: throttle ${d.throttle}`);
    assert.ok(d.steer === 0, `steer ${d.steer}`);
  }
  assert.ok(drive({ axes: [0, 0], buttons: [] }).throttle === 0);
  // After one neutral reading the stick drives normally.
  assert.equal(drive({ axes: [0, -1], buttons: [] }).throttle, 1);
  // The pad disappearing re-arms the gate.
  assert.ok(drive(null).throttle === 0);
  assert.ok(drive(resting).throttle === 0);
});

test("a játékhurok a gamepadot a nyugalmi kapun át olvassa", () => {
  assert.match(page, /createGamepadRestGate\(\)/);
  assert.match(page, /readStandardGamepad\(\s*padGateRef\.current\(/);
});

// Review PR #137 (1): a NaN wake-up sample read as "centred" (applyDeadzone(NaN) === 0) and armed the
// gate, so the resting [0, 1] right after it drove full reverse. Only FINITE raw axes may count.
test("NaN ébredési minta nem élesíti a kaput: NaN → nyugalmi kitérés nem ad gázt", () => {
  const gate = createGamepadRestGate();
  const drive = (gp: { axes: number[]; buttons: never[] }) => readStandardGamepad(gate(gp) ? gp : null);
  assert.ok(drive({ axes: [Number.NaN, Number.NaN], buttons: [] }).throttle === 0);
  assert.ok(drive({ axes: [0, Number.NaN], buttons: [] }).throttle === 0);
  assert.ok(drive({ axes: [Number.POSITIVE_INFINITY, 0], buttons: [] }).throttle === 0);
  for (let i = 0; i < 10; i++) {
    const d = drive({ axes: [0, 1], buttons: [] });
    assert.ok(d.throttle === 0, `frame ${i} after NaN: throttle ${d.throttle}`);
  }
  // A real centred reading still arms it.
  assert.ok(drive({ axes: [0.02, -0.03], buttons: [] }).throttle === 0);
  assert.equal(drive({ axes: [0, -1], buttons: [] }).throttle, 1);
});
