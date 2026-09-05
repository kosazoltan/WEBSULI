import assert from "node:assert/strict";
import test from "node:test";

import { shouldDownscale, downscaleTargetOf } from "../shared/studio-ui";

/**
 * #163 — client-side image downscale before upload (owner requirement: fewer
 * pixels = cheaper vision calls). Pure decision logic tested here; the canvas
 * work lives in the component and uses exactly these numbers.
 */

test("shouldDownscale: nagy kép igen, kicsi nem, nem-kép soha", () => {
  assert.equal(shouldDownscale("image", 4000, 3000), true);
  assert.equal(shouldDownscale("image", 1200, 800), false);
  assert.equal(shouldDownscale("pdf", 4000, 3000), false, "pdf-oldalt nem rontunk");
});

test("downscaleTargetOf: a leghosszabb él 1600px-re megy, arány tartva", () => {
  assert.deepEqual(downscaleTargetOf(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(downscaleTargetOf(3000, 4000), { width: 1200, height: 1600 });
});

test("downscaleTargetOf: kis kép változatlan marad", () => {
  assert.deepEqual(downscaleTargetOf(800, 600), { width: 800, height: 600 });
});
