/**
 * S2 — közös mobilos játékkeret (`@/game-engine/mobile`).
 * Szerződés: docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md K.7.3.
 */

export type { GameOrientation, GameOrientationPreference, GameScreenState, StorageLike } from "./types";

export { default as GameShell, type GameShellProps } from "./GameShell";
export { default as GameHud, type GameHudProps, type GameHudStat } from "./GameHud";
export { default as PauseMenu, type PauseMenuProps } from "./PauseMenu";
export { default as ResultScreen, type ResultScreenProps } from "./ResultScreen";
export { default as StartScreen, type StartScreenProps } from "./StartScreen";
export { default as RotateHint, type RotateHintProps } from "./RotateHint";

export { detectTouchCapable, useTouchCapable, type TouchEnv } from "./touch";
export { HAPTIC_PATTERNS, shouldVibrate, useHaptics, type HapticKind } from "./haptics";
export { orientationFrom, useOrientation } from "./orientation";
export { attachAutoPause, useAutoPause, type AutoPauseTarget } from "./autoPause";
export { cancelGameFrame, requestGameFrame } from "./modalLayer";
export { computeStars } from "./stars";
export { controlRadiusFor } from "./controlSize";
export { GAME_BEST_KEY, readBest, writeBest, useBestScore } from "./bestScore";
