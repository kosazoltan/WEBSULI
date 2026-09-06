import assert from "node:assert/strict";
import test from "node:test";

import { applyDeadzone, readStandardGamepad, type GamepadLike } from "../client/src/lib/tornado/gamepad.ts";

test("deadzone: |v|<0.18 → 0, felette rescaled", () => {
  assert.equal(applyDeadzone(0.1), 0);
  assert.equal(applyDeadzone(-0.1), 0);
  assert.ok(applyDeadzone(1) > 0.99);
  assert.ok(applyDeadzone(0.5) > 0.3 && applyDeadzone(0.5) < 0.5);
});

test("Standard Gamepad: left stick Y fel (negatív) = gáz, X jobb = jobbra", () => {
  const gp: GamepadLike = {
    axes: [0.8, -0.9, 0, 0],
    buttons: [{ pressed: false, value: 0 }, { pressed: false, value: 0 }, { pressed: false, value: 0 }, { pressed: false, value: 0 }, { pressed: false, value: 0 }, { pressed: false, value: 0 }, { pressed: false, value: 0 }, { pressed: false, value: 0 }],
  };
  const d = readStandardGamepad(gp);
  assert.ok(d.throttle > 0.7, `throttle ${d.throttle}`);
  assert.ok(d.steer > 0.7, `steer ${d.steer}`);
  assert.equal(d.brake, false);
  assert.equal(d.anchor, false);
});

test("RT gáz, LT fék, X/Square (button 2) horgony, B (button 1) kézifék", () => {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  buttons[7] = { pressed: true, value: 1 }; // RT
  buttons[6] = { pressed: false, value: 0 };
  buttons[2] = { pressed: true, value: 1 }; // X
  buttons[1] = { pressed: true, value: 1 }; // B
  const d = readStandardGamepad({ axes: [0, 0, 0, 0], buttons });
  assert.ok(d.throttle > 0.9);
  assert.equal(d.anchor, true);
  assert.equal(d.brake, true);
});

test("nincs gamepad / üres axes → semleges", () => {
  assert.deepEqual(readStandardGamepad(null), { throttle: 0, steer: 0, brake: false, anchor: false });
  assert.deepEqual(readStandardGamepad({ axes: [], buttons: [] }), { throttle: 0, steer: 0, brake: false, anchor: false });
});
