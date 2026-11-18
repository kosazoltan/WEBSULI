import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Kabala-maki (kísérlet) — a modell méretkerete (terv: docs/specs/2026-11-18-kabala-maki.md, K-4…K-6).
 * A GLB JSON-részéből olvas (Draco-dekódolás nélkül): az index-accessorok darabszáma tömörítve is ott van.
 * Újragyártás: blender -b --factory-startup -P source/scripts/blender/kabala-maki/build.py
 */

const DIR = join(fileURLToPath(new URL(".", import.meta.url)), "..", "client", "public", "models", "kabala");
const MAX_BYTES = 400 * 1024;
const MAX_TRIANGLES = 20_000;
const MAX_MATERIALS = 6;
const CLIPS = ["blink", "cheer", "idle", "sad", "wave"];
const MORPHS = ["blink", "smile"];

interface Manifest {
  file: string;
  sha256: string;
  bytes: number;
  triangles: number;
  bones: number;
  materials: number;
  morphTargets: string[];
  clips: { name: string; duration: number; loop: boolean }[];
}

interface Gltf {
  accessors: { count: number; max?: number[] }[];
  meshes: { primitives: { indices: number; mode?: number }[]; extras?: { targetNames?: string[] } }[];
  materials: unknown[];
  skins: { joints: number[] }[];
  animations: { name: string; samplers: { input: number }[] }[];
  images?: unknown[];
  buffers: { uri?: string }[];
}

function readGlb(bytes: Buffer): Gltf {
  assert.equal(bytes.toString("latin1", 0, 4), "glTF", "GLB fejléc");
  assert.equal(bytes.readUInt32LE(4), 2, "glTF 2.0");
  assert.equal(bytes.readUInt32LE(8), bytes.length, "a fejléc szerinti hossz = a fájl hossza");
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.toString("latin1", 16, 20), "JSON", "az első darab JSON");
  return JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength)) as Gltf;
}

const manifest = JSON.parse(readFileSync(join(DIR, "kabala-maki.manifest.json"), "utf8")) as Manifest;
const glbBytes = readFileSync(join(DIR, manifest.file));
const gltf = readGlb(glbBytes);

test("kabala-maki: pontosan egy GLB van, a neve a tartalom hash-ét hordozza", () => {
  const glbs = readdirSync(DIR).filter((f) => f.endsWith(".glb"));
  assert.deepEqual(glbs, [manifest.file]);
  const digest = createHash("sha256").update(glbBytes).digest("hex");
  assert.equal(digest, manifest.sha256, "a manifest hash-e = a fájl tartalma");
  assert.equal(manifest.file, `kabala-maki.${digest.slice(0, 8)}.glb`);
  assert.equal(manifest.bytes, glbBytes.length);
});

test("kabala-maki: méretkeret — ≤ 400 KB, ≤ 20 000 háromszög, ≤ 6 anyag, önálló fájl", () => {
  assert.ok(glbBytes.length <= MAX_BYTES, `${glbBytes.length} bájt > ${MAX_BYTES}`);
  let triangles = 0;
  for (const mesh of gltf.meshes) {
    for (const prim of mesh.primitives) {
      assert.ok(prim.mode === undefined || prim.mode === 4, "csak háromszög-lista");
      triangles += gltf.accessors[prim.indices].count / 3;
    }
  }
  assert.ok(triangles > 0 && triangles <= MAX_TRIANGLES, `${triangles} háromszög > ${MAX_TRIANGLES}`);
  assert.equal(triangles, manifest.triangles);
  assert.ok(gltf.materials.length <= MAX_MATERIALS, `${gltf.materials.length} anyag > ${MAX_MATERIALS}`);
  assert.equal(gltf.images?.length ?? 0, 0, "nincs textúrafájl (csúcsszín)");
  assert.ok(gltf.buffers.every((b) => b.uri === undefined), "nincs külső puffer");
});

test("kabala-maki: egy csontváz, öt klip (1–3 mp), két alakkulcs", () => {
  assert.equal(gltf.skins.length, 1);
  assert.equal(gltf.skins[0].joints.length, manifest.bones);
  assert.ok(manifest.bones >= 15 && manifest.bones <= 40, `${manifest.bones} csont`);
  assert.deepEqual(gltf.animations.map((a) => a.name).sort(), CLIPS);
  assert.deepEqual(manifest.clips.map((c) => c.name), CLIPS);
  for (const anim of gltf.animations) {
    const end = Math.max(...anim.samplers.map((s) => gltf.accessors[s.input].max?.[0] ?? 0));
    assert.ok(end >= 1 && end <= 3, `${anim.name}: ${end} mp`);
  }
  assert.deepEqual(manifest.clips.filter((c) => c.loop).map((c) => c.name), ["idle"]);
  const morphs = new Set(gltf.meshes.flatMap((m) => m.extras?.targetNames ?? []));
  assert.deepEqual([...morphs].sort(), MORPHS);
  assert.deepEqual([...manifest.morphTargets].sort(), MORPHS);
});
