import assert from "node:assert/strict";
import test from "node:test";

import {
  isSharedGeometry,
  shouldDisposeGeometry,
  markSharedGeometry,
} from "../client/src/tornado/meshLifetime";

/**
 * Audit #1 — chunk unload must not dispose the geo()/mat() cache.
 *
 * The world streams 100×100 chunks. Houses/trees share BufferGeometry from
 * `geo("house-w")`. Disposing that geometry on unload empties every remaining
 * instance. Terrain chunks own a unique PlaneGeometry and MAY be disposed.
 *
 * The decision lives in a DOM-free helper so the test does not need WebGL.
 */

test("a megosztottnak jelölt geometry-t TILOS dispose-olni", () => {
  const geo = markSharedGeometry({ uuid: "house-w" });
  assert.equal(isSharedGeometry(geo), true);
  assert.equal(shouldDisposeGeometry(geo), false);
});

test("a saját (nem cache-elt) geometry dispose-olható", () => {
  const geo = { uuid: "terrain-chunk-3:4" };
  assert.equal(isSharedGeometry(geo), false);
  assert.equal(shouldDisposeGeometry(geo), true);
});

test("null / undefined soha nem dispose", () => {
  assert.equal(shouldDisposeGeometry(null), false);
  assert.equal(shouldDisposeGeometry(undefined), false);
});

test("ugyanaz az objektum kétszer megjelölve is megosztott marad", () => {
  const geo = { uuid: "tree-c" };
  markSharedGeometry(geo);
  markSharedGeometry(geo);
  assert.equal(shouldDisposeGeometry(geo), false);
});
