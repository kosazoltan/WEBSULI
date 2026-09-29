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
  // A NaN / Infinity axis (seen on some drivers while a pad wakes up) must read as centred; NaN
  // used to flow through to the throttle and from there into the vehicle position.
  if (!Number.isFinite(v)) return 0;
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

/**
 * Spec 2026-09-29-tornado-fizika D11 — a pad drives only after it has been seen at rest once.
 *
 * Browsers expose a pad as soon as any of its inputs changes. A device whose axis rests off-centre
 * (non-standard mapping, a throttle lever, a drifting stick) then read as full reverse the moment it
 * appeared — the car set off backwards with nobody touching anything. A real stick is centred when
 * picked up, so waiting for one neutral reading costs a player nothing.
 */
export function createGamepadRestGate(): (gp: GamepadLike | null | undefined) => boolean {
  let armed = false;
  return (gp) => {
    if (!gp || gp.axes.length < 2) {
      armed = false;
      return false;
    }
    if (!armed) {
      const centred = applyDeadzone(gp.axes[0] ?? 0) === 0 && applyDeadzone(gp.axes[1] ?? 0) === 0;
      if (centred) armed = true;
    }
    return armed;
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
