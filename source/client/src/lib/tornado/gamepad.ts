/**
 * Standard Gamepad mapping (W3C) — Steam Deck, DualShock, Xbox, most browsers.
 *
 * axes[0] left stick X  (right +)
 * axes[1] left stick Y  (down + in the spec → invert for throttle)
 * button 6 LT, 7 RT, 0 A/Cross, 1 B/Circle, 2 X/Square, 3 Y/Triangle
 */

export const GAMEPAD_DEADZONE = 0.18;

export type GamepadButtonLike = { pressed: boolean; value: number };
export type GamepadLike = {
  axes: readonly number[];
  buttons: readonly GamepadButtonLike[];
};

export type GamepadDrive = {
  throttle: number;
  steer: number;
  brake: boolean;
  anchor: boolean;
};

const NEUTRAL: GamepadDrive = { throttle: 0, steer: 0, brake: false, anchor: false };

export function applyDeadzone(v: number, zone = GAMEPAD_DEADZONE): number {
  const mag = Math.abs(v);
  if (mag < zone) return 0;
  const sign = v < 0 ? -1 : 1;
  return sign * Math.min(1, (mag - zone) / (1 - zone));
}

export function readStandardGamepad(gp: GamepadLike | null | undefined): GamepadDrive {
  if (!gp || gp.axes.length < 2) return { ...NEUTRAL };

  const steer = applyDeadzone(gp.axes[0] ?? 0);
  const stickY = applyDeadzone(gp.axes[1] ?? 0);
  // Spec: axes[1] down is +, so forward (stick up) is negative.
  let throttle = -stickY;

  const rt = analogButton(gp, 7);
  const lt = analogButton(gp, 6);
  if (rt > 0.1) throttle = Math.max(throttle, rt);
  const brake = lt > 0.4 || pressed(gp, 1);
  const anchor = pressed(gp, 2) || pressed(gp, 0);

  return {
    throttle: clamp(throttle, -1, 1),
    steer: clamp(steer, -1, 1),
    brake,
    anchor,
  };
}

function analogButton(gp: GamepadLike, i: number): number {
  const b = gp.buttons[i];
  if (!b) return 0;
  if (typeof b.value === "number") return b.value;
  return b.pressed ? 1 : 0;
}

function pressed(gp: GamepadLike, i: number): boolean {
  return Boolean(gp.buttons[i]?.pressed);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
