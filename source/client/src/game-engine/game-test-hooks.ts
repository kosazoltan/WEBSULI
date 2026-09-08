/**
 * D1 — game E2E hooks, gated by VITE_ENABLE_GAME_TEST_HOOKS=1 (see build:e2e).
 *
 * Production builds must tree-shake these call sites the same way as
 * VITE_ENABLE_RUNTIME_PROBE routes in App.tsx.
 */

export const GAME_TEST_HOOKS_ENABLED =
  import.meta.env.VITE_ENABLE_GAME_TEST_HOOKS === "1";

export type GameForcePatch = {
  /** Game phase / screen name understood by the mounted game. */
  phase?: string;
  screen?: string;
  /** Asteroid / BlockCraft win flag when jumping to over. */
  gameWon?: boolean;
  /** Optional correct-answer counter for score consistency checks. */
  correctCount?: number;
};

export type WebsuliGameTestApi = {
  forceState: (patch: GameForcePatch) => void;
};

declare global {
  interface Window {
    __websuliGame?: WebsuliGameTestApi;
  }
}

/** Deterministic seed from `?seed=` when hooks are enabled; otherwise null. */
export function readGameSeed(): number | null {
  if (!GAME_TEST_HOOKS_ENABLED || typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("seed");
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Mulberry32 — tiny seeded PRNG for question order when a seed is present. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Attribute bag for quiz option buttons — empty object when hooks are off. */
export function correctDataAttrs(isCorrect: boolean): { "data-correct"?: "true" | "false" } {
  if (!GAME_TEST_HOOKS_ENABLED) return {};
  return { "data-correct": isCorrect ? "true" : "false" };
}

export function installGameTestApi(api: WebsuliGameTestApi): () => void {
  if (!GAME_TEST_HOOKS_ENABLED || typeof window === "undefined") return () => {};
  window.__websuliGame = api;
  return () => {
    if (window.__websuliGame === api) delete window.__websuliGame;
  };
}
