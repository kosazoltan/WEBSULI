import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Szökőár — a Blender-szkriptből gyártott díszlet keret-őre (terv: docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md 7.2).
 * A játékhoz és a CI-hoz Blender nem kell: a kész GLB követett fájl; ez az őr a méret- és poligonkeretet tartja.
 */
const dir = join(fileURLToPath(new URL("..", import.meta.url)), "client", "public", "models", "szokoar");
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { props: string; bytes: number; triangles: number; models: string[] };

const MAX_TOTAL_BYTES = 600 * 1024;
const MAX_FILE_BYTES = 200 * 1024;
const MAX_TRIANGLES = 15_000;
/** Modellenként egy mesh (a Blender-szkript összevonja a részeket); a rajzolási hívás = a mesh anyag-primitívjei. */
const MAX_MESHES = 20;
const MAX_PRIMITIVES = 60;

test("a manifest GLB-je létezik, tartalom-hashes névvel, és a mérete a manifesttel egyezik", () => {
  assert.match(manifest.props, /^szokoar-props\.[0-9a-f]{10}\.glb$/);
  const file = join(dir, manifest.props);
  assert.ok(existsSync(file), file);
  assert.equal(statSync(file).size, manifest.bytes);
});

test("méret- és poligonkeret: fájl ≤ 200 KB, összesen ≤ 600 KB, ≤ 15 000 háromszög", () => {
  assert.ok(manifest.bytes <= MAX_FILE_BYTES, `${manifest.bytes} B`);
  assert.ok(manifest.bytes <= MAX_TOTAL_BYTES);
  assert.ok(manifest.triangles <= MAX_TRIANGLES, `${manifest.triangles} háromszög`);
});

test("a GLB Meshopt-tömörített, a mesh-ek száma keretben, és megvan minden díszlet-elem, amit a jelenet keres", () => {
  const buf = readFileSync(join(dir, manifest.props));
  assert.equal(buf.toString("ascii", 0, 4), "glTF");
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen)) as { extensionsUsed?: string[]; meshes?: unknown[]; nodes?: { name?: string }[] };
  assert.ok((gltf.extensionsUsed ?? []).some((e) => /meshopt/i.test(e)), `kiterjesztések: ${gltf.extensionsUsed}`);
  assert.ok((gltf.meshes ?? []).length <= MAX_MESHES, `${gltf.meshes?.length} mesh`);
  const prims = (gltf.meshes as { primitives: unknown[] }[]).reduce((n, m) => n + m.primitives.length, 0);
  assert.ok(prims <= MAX_PRIMITIVES, `${prims} primitív (rajzolási hívás modellenként egy példánynál)`);
  const names = new Set((gltf.nodes ?? []).map((n) => n.name));
  for (const n of ["palm_a", "palm_b", "hut_a", "hut_b", "lighthouse", "rock_a", "rock_b", "rock_c", "bush", "debris_plank", "debris_barrel", "debris_crate"]) {
    assert.ok(names.has(n), `hiányzik: ${n}`);
  }
});
