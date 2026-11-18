import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * S13 / E21 (M11): a three r184 a `PCFSoftShadowMap`-et elavultnak jelzi — első árnyékos rajzoláskor
 * „WebGLShadowMap: PCFSoftShadowMap has been deprecated” konzol-figyelmeztetést ad, amit a mobil mérő hibának vesz.
 * A közös játék-renderer ezért közvetlenül `PCFShadowMap`-et állít, és egyetlen játéklap sem tér vissza a régihez.
 */
const root = fileURLToPath(new URL("../client/src/", import.meta.url));
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("a közös applyRendererLook PCFShadowMap-et állít, nem PCFSoftShadowMap-et", () => {
  const src = read("game-engine/three-look/renderer.ts");
  assert.match(src, /renderer\.shadowMap\.type = THREE\.PCFShadowMap;/);
  assert.doesNotMatch(src, /shadowMap\.type\s*=\s*THREE\.PCFSoftShadowMap/);
});

test("játéklap és game-engine nem állít PCFSoftShadowMap-et (a Kockavadász lapszintű kerülőútja sem kell)", () => {
  const dirs = ["pages", "game-engine", "tornado", "lib"];
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(root, dir))) {
      const rel = join(dir, name);
      if (statSync(join(root, rel)).isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(name) && /shadowMap\.type\s*(?:=|===)\s*THREE\.PCFSoftShadowMap/.test(read(rel))) hits.push(rel);
    }
  };
  for (const d of dirs) walk(d);
  assert.deepEqual(hits, []);
});
