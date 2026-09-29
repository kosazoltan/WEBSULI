/**
 * Keyboard / pause contract for Tornado Hunter 200.
 *
 * The settings screen advertised "C — camera" and "Esc — menu" while the
 * keydown handler did neither. The helpers here are the single source of
 * those decisions so a test can pin them without a browser.
 */

export type CameraMode = "chase" | "cockpit";

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
