import * as THREE from "three";

import { LOOK_BUDGET, type LookTier } from "./tier";

export type RendererLookOptions = {
  /** Tone-mapping exposure; ACES darkens mid-tones, so bright cartoon scenes want ~1.1. */
  exposure?: number;
  /** Set false for scenes that never use shadow maps, even on tiers that allow them. */
  shadows?: boolean;
};

/**
 * One renderer look for every game: filmic tone mapping (bright emissive colours
 * roll off instead of clipping to flat white), sRGB output, and the tier's pixel
 * ratio cap — a DPR-3 phone rendering at full resolution is the single most
 * common cause of a hot, stuttering game.
 */
export function applyRendererLook(
  renderer: THREE.WebGLRenderer,
  tier: LookTier,
  opts: RendererLookOptions = {},
): void {
  const budget = LOOK_BUDGET[tier];
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure ?? 1.05;
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  renderer.setPixelRatio(Math.min(dpr, budget.maxPixelRatio));
  const shadows = budget.shadows && opts.shadows !== false;
  renderer.shadowMap.enabled = shadows;
  if (shadows) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

/** Renderer for a new scene layer, or null when WebGL is unavailable. */
export function createGameRenderer(
  canvas: HTMLCanvasElement,
  tier: LookTier,
  opts: RendererLookOptions & { alpha?: boolean } = {},
): THREE.WebGLRenderer | null {
  try {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: tier !== "low",
      alpha: opts.alpha ?? false,
      powerPreference: tier === "high" ? "high-performance" : "default",
    });
    applyRendererLook(renderer, tier, opts);
    return renderer;
  } catch {
    return null;
  }
}
