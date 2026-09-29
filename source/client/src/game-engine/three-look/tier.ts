/**
 * Graphics tier for every WebGL scene in the games.
 *
 * The games are played by children on whatever the family owns: a school
 * Chromebook, a five-year-old Android phone, occasionally a gaming PC. A single
 * visual budget would either look flat on the PC or stutter on the phone, and a
 * stuttering game is abandoned faster than an ugly one. So the budget is chosen
 * once per page load from cheap, synchronous signals.
 *
 * `detectLookTierFrom` is pure so the decision table is unit-tested without a
 * browser (tests/three-look.test.ts).
 */

export type LookTier = "low" | "medium" | "high";

export type TierEnv = {
  /** `?look=` URL override, verbatim (null when absent). */
  override: string | null;
  /** Unmasked WebGL renderer string, "" when unknown. */
  rendererName: string;
  cores: number;
  /** `navigator.deviceMemory` in GB; null when the browser hides it (Safari, Firefox). */
  memoryGb: number | null;
  coarsePointer: boolean;
};

export type LookBudget = {
  maxPixelRatio: number;
  /** PMREM room environment for glossy/metal materials. */
  environment: boolean;
  shadows: boolean;
  shadowMapSize: number;
  /** UnrealBloom post-processing. Lower tiers fake glow with additive sprites. */
  bloom: boolean;
  /** Multiplier for decorative particle counts. */
  particleScale: number;
};

export const LOOK_BUDGET: Record<LookTier, LookBudget> = {
  low: { maxPixelRatio: 1, environment: false, shadows: false, shadowMapSize: 0, bloom: false, particleScale: 0.4 },
  medium: { maxPixelRatio: 1.5, environment: true, shadows: true, shadowMapSize: 1024, bloom: false, particleScale: 0.7 },
  high: { maxPixelRatio: 2, environment: true, shadows: true, shadowMapSize: 2048, bloom: true, particleScale: 1 },
};

const SOFTWARE_GL = /swiftshader|llvmpipe|software|softpipe|basic render|microsoft basic/i;

export function isLookTier(value: unknown): value is LookTier {
  return value === "low" || value === "medium" || value === "high";
}

export function detectLookTierFrom(env: TierEnv): LookTier {
  if (isLookTier(env.override)) return env.override;
  // Software rasterisers (headless CI, blocklisted GPUs, VMs) cannot afford
  // post-processing at all; this also keeps the E2E suite fast.
  if (SOFTWARE_GL.test(env.rendererName)) return "low";
  if (env.cores > 0 && env.cores <= 4) return "low";
  if (env.memoryGb !== null && env.memoryGb <= 2) return "low";
  if (env.coarsePointer) return "medium";
  if (env.memoryGb !== null && env.memoryGb <= 4) return "medium";
  return "high";
}

function readRendererName(): string {
  if (typeof document === "undefined") return "";
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return "software (no webgl)";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return typeof name === "string" ? name : "";
  } catch {
    return "";
  }
}

export function readTierEnv(): TierEnv {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { override: null, rendererName: "", cores: 0, memoryGb: null, coarsePointer: false };
  }
  let override: string | null;
  try {
    override = new URLSearchParams(window.location.search).get("look");
  } catch {
    override = null;
  }
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  return {
    override,
    rendererName: readRendererName(),
    cores: navigator.hardwareConcurrency || 0,
    memoryGb: typeof memory === "number" ? memory : null,
    coarsePointer: coarse,
  };
}

let cachedTier: LookTier | null = null;

/** Tier for this page load. Probing creates a throwaway GL context, so it runs once. */
export function detectLookTier(): LookTier {
  if (cachedTier === null) cachedTier = detectLookTierFrom(readTierEnv());
  return cachedTier;
}
