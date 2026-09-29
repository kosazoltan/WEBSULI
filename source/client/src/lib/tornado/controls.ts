/**
 * Keyboard / pause contract for Tornado Hunter 200.
 *
 * The settings screen advertised "C — camera" and "Esc — menu" while the
 * keydown handler did neither. The helpers here are the single source of
 * those decisions so a test can pin them without a browser.
 */

import type { JoystickVector } from "@/game-engine/joystick";

export type CameraMode = "chase" | "cockpit";

/** Analog drive input from the touch stick, both in −1..1 (steer right +, throttle forward +). */
export type TouchDrive = { throttle: number; steer: number };

const STEER_DEAD = 0.2;
const STEER_FULL = 0.85;
const STEER_CURVE = 2;
const THROTTLE_DEAD = 0.12;
const THROTTLE_FULL = 0.6;

function shaped(v: number, dead: number, full: number, curve: number): number {
  const a = Math.abs(v);
  if (!(a > dead)) return 0;
  const t = Math.min(1, (a - dead) / (full - dead));
  return Math.sign(v) * Math.pow(t, curve);
}

/**
 * Spec 2026-09-29-tornado-ut-kormanyzas D3. The stick used to be split into four booleans
 * (`joystickToDirections`, threshold 0.35): nothing steered up to ~23° off vertical, beyond it the full
 * lock (~86°/s) did — a child could not make a small correction and the car wandered off the road.
 * Now the steering is analog with its own axis dead zone and a curve (fine near the centre, full lock at
 * the side); pushing up past 60% is full throttle, as before.
 */
export function touchDriveInput(v: JoystickVector): TouchDrive {
  return {
    throttle: shaped(v.y, THROTTLE_DEAD, THROTTLE_FULL, 1),
    steer: shaped(v.x, STEER_DEAD, STEER_FULL, STEER_CURVE),
  };
}

export type PlayPhase =
  | "seeking"
  | "approach"
  | "quiz"
  | "paused"
  | "result_win"
  | "result_lose"
  | "menu";

export function toggleCamera(mode: CameraMode): CameraMode {
  return mode === "chase" ? "cockpit" : "chase";
}

export function escAction(phase: PlayPhase): "pause" | "exit" | "noop" {
  if (phase === "seeking" || phase === "approach" || phase === "quiz") return "pause";
  if (phase === "paused" || phase === "result_win" || phase === "result_lose") return "exit";
  return "noop";
}

/** The held driving keys (keyboard). */
export type DriveKeys = { fwd: boolean; back: boolean; left: boolean; right: boolean; brake: boolean };

/** Which driving key a `KeyboardEvent.key` holds down, or null. */
export function driveKeyFor(key: string): keyof DriveKeys | null {
  switch (key.toLowerCase()) {
    case "w":
    case "arrowup":
      return "fwd";
    case "s":
    case "arrowdown":
      return "back";
    case "a":
    case "arrowleft":
      return "left";
    case "d":
    case "arrowright":
      return "right";
    case " ":
      return "brake";
    default:
      return null;
  }
}

/**
 * Let go of everything (spec 2026-09-29-tornado-fizika D11).
 *
 * A keyup is delivered to whichever window has focus. Hold S, alt-tab (or a notification steals
 * focus), release — the game never hears it and keeps reversing. `blur` / `visibilitychange` call this.
 */
export function releaseDriveKeys(k: DriveKeys): void {
  k.fwd = false;
  k.back = false;
  k.left = false;
  k.right = false;
  k.brake = false;
}
