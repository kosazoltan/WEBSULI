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
