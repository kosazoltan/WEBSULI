import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { buildTerrainChunk, disposeMeshCaches } from "../client/src/tornado/buildMeshes";
import { roadFactor, HALF_WORLD, ROAD_SPACING } from "../client/src/lib/tornado/world";

/*
 * Spec 2026-09-29 (tornado-roadfactor): the terrain shader paints roads PER PIXEL with a GLSL twin of
 * `roadFactor`. When world.ts was fixed, the twin still carried the old, inverted formula — the HUD said
 * "Aszfalt" on a road that rendered as grass. This test runs the shader's own road lines as JavaScript and
 * compares them with `roadFactor` across the map, so the two can never drift apart again.
 */

function shaderRoadLines(): string {
  const mesh = buildTerrainChunk(0, 0, "low");
  const material = mesh.material as THREE.Material;
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: "#include <common>\n#include <project_vertex>",
    fragmentShader: "#include <common>\n#include <color_fragment>",
  };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  const src = shader.fragmentShader;
  const start = src.indexOf("float halfSpacing");
  const end = src.indexOf(";", src.indexOf("float road ")) + 1;
  assert.ok(start > 0 && end > start, "the road block exists in the terrain shader");
  mesh.geometry.dispose();
  return src.slice(start, end);
}

/** Evaluate the GLSL road block for a world position (w.x, w.y = world x, z). */
function makeShaderRoad(block: string): (x: number, z: number) => number {
  const js = block.replace(/\bfloat\s+/g, "let ");
  // The block is our own shader source (not user input); evaluating it is the only way to test the exact
  // formula the GPU runs. The GLSL built-ins it uses are provided below.
  const body = `
    const mod = (a, b) => a - b * Math.floor(a / b);
    const abs = Math.abs, min = Math.min, max = Math.max;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const w = { x, y: z };
    ${js}
    return road;`;
  return new Function("x", "z", body) as (x: number, z: number) => number;
}

test("a terep-shader útszámítása azonos a roadFactor-ral (középvonal 1, mező 0, lecsengés)", () => {
  const road = makeShaderRoad(shaderRoadLines());
  const samples: Array<[number, number]> = [];
  for (let i = 0; i < 400; i++) {
    // Deterministic spread over the map, including points right on and near the road lines.
    const x = -HALF_WORLD + ((i * 97.3) % (2 * HALF_WORLD));
    const z = -HALF_WORLD + ((i * 53.9) % (2 * HALF_WORLD));
    samples.push([x, z]);
  }
  for (let k = 0; k < 6; k++) {
    const line = -HALF_WORLD + k * ROAD_SPACING;
    for (const off of [0, 1.5, 4, 7, 8.9, 9, 12, ROAD_SPACING / 2]) samples.push([line + off, -HALF_WORLD + ROAD_SPACING / 2]);
  }
  for (const [x, z] of samples) {
    assert.ok(Math.abs(road(x, z) - roadFactor(x, z)) < 1e-9, `x=${x.toFixed(2)} z=${z.toFixed(2)}: shader ${road(x, z)} ≠ roadFactor ${roadFactor(x, z)}`);
  }
  const centre = -HALF_WORLD + ROAD_SPACING;
  assert.equal(road(centre, -HALF_WORLD + ROAD_SPACING / 2), 1, "a középvonal aszfalt a képen is");
  assert.equal(road(-HALF_WORLD + ROAD_SPACING / 2, -HALF_WORLD + ROAD_SPACING / 2), 0, "a cella közepe mező a képen is");
  disposeMeshCaches();
});
