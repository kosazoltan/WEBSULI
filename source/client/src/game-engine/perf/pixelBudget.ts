/**
 * Képpontszám-plafon a 3D vászonra és a „könnyű grafika” döntése (terv: docs/specs/2026-11-17-kockavadasz-telefon-gyors.md, 3/f).
 *
 * A felbontás alapértéke NEM csökken: a plafon csak könnyű grafika módban hat (gyenge eszköz jelei — ugyanaz a szabály, mint a
 * Szökőár `isLowEnd`-je), illetve a `?perf=1` panel kapcsolójával. A HUD natív DOM, azt a plafon nem érinti.
 */

/** A 3D vászon legfeljebb ennyi képpontot rajzol könnyű grafika módban. */
export const LIGHT_GRAPHICS_MAX_PIXELS = 1_000_000;

export type LightGraphicsEnv = {
  tier: string;
  /** Érintős, telefon-méretű eszköz (`pointer: coarse` és a rövidebb képernyőoldal ≤ 1024 CSS px). Asztali gépen hamis. */
  touchDevice: boolean;
  reducedMotion: boolean;
  /** `navigator.deviceMemory` GB-ban; null, ha a böngésző nem adja. */
  memoryGb: number | null;
};

/** Egyszer, betöltéskor dől el: csak érintős, telefon-méretű eszközön (`touchDevice`), és ott az eszköz képessége dönt — nem az ablak mérete. */
export function isLightGraphicsFrom(env: LightGraphicsEnv): boolean {
  // Review F2: a „low” szint egy ≤ 4 magos asztali gépet is jelent — ott a nagy monitoron a plafon látható felbontásvesztés
  // lenne. A plafon ezért csak érintős, telefon-méretű eszközön hat.
  if (!env.touchDevice) return false;
  return env.tier === "low" || env.reducedMotion || (env.memoryGb !== null && env.memoryGb <= 4);
}

/** A Kockavadász oldali érintős-eszköz jel (a közös `tier.ts` változatlan). */
export function isTouchDeviceFrom(coarsePointer: boolean, screenShortSide: number): boolean {
  return coarsePointer && screenShortSide > 0 && screenShortSide <= 1024;
}

/**
 * A renderer képpontaránya adott CSS-méretű vászonhoz. Ha nincs plafon, vagy a `base` aránnyal a kép belefér, `base`;
 * különben az az arány, amellyel a képpontszám éppen a plafon (a képarány változatlan). Soha nem nagyobb `base`-nél.
 */
export function pixelRatioForBudget(cssWidth: number, cssHeight: number, basePixelRatio: number, maxPixels: number | null): number {
  const area = cssWidth * cssHeight;
  if (maxPixels === null || !(area > 0) || !(maxPixels > 0)) return basePixelRatio;
  if (area * basePixelRatio * basePixelRatio <= maxPixels) return basePixelRatio;
  return Math.min(basePixelRatio, Math.sqrt(maxPixels / area));
}
