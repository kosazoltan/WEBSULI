/**
 * Geometry lifetime for the streamed world.
 *
 * Houses/trees share BufferGeometry from `geo("house-w")`. Disposing that
 * geometry when a chunk unloads empties every remaining instance. Terrain
 * chunks own a unique PlaneGeometry and MAY be disposed.
 *
 * Pure WeakSet so the test does not need WebGL. `geo()` in buildMeshes marks
 * every cached geometry as shared at creation time.
 */

export type GeometryLike = { uuid?: string } | null | undefined;

const shared = new WeakSet<object>();

export function markSharedGeometry<T extends object>(geo: T): T {
  shared.add(geo);
  return geo;
}

export function isSharedGeometry(geo: GeometryLike): boolean {
  return Boolean(geo) && typeof geo === "object" && shared.has(geo as object);
}

/** True only for unique, non-cached geometry (terrain chunks). */
export function shouldDisposeGeometry(geo: GeometryLike): boolean {
  if (!geo || typeof geo !== "object") return false;
  return !shared.has(geo);
}
