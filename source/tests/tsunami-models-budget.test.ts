import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Szökőár — a Blender-szkriptből gyártott díszlet és figura keret-őre (terv: docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md
 * 7.2 és 7.4). A játékhoz és a CI-hoz Blender nem kell: a kész GLB-k követett fájlok; ez az őr a méret- és poligonkeretet tartja.
 *
 * 7.4 (2026-11-18): két fájl van (díszlet + figura), mindkettő a fájlkeret alatt; a szín csúcs-színből jön, ezért modellenként
 * EGY primitív (egy rajzolási hívás) engedett — a primitív-keret 60-ról a mesh-ek számára (≤ 20) szigorodott.
 */
const dir = join(fileURLToPath(new URL("..", import.meta.url)), "client", "public", "models", "szokoar");
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as {
  props: string;
  kid: string;
  files: Record<string, number>;
  bytes: number;
  triangles: number;
  models: string[];
};

const MAX_TOTAL_BYTES = 600 * 1024;
const MAX_FILE_BYTES = 200 * 1024;
const MAX_TRIANGLES = 15_000;
/** Modellenként egy mesh (a Blender-szkript összevonja a részeket), a két fájlban ÖSSZESEN. */
const MAX_MESHES = 20;

type Gltf = {
  extensionsUsed?: string[];
  meshes?: { name?: string; primitives: { attributes: Record<string, number> }[] }[];
  nodes?: { name?: string }[];
  materials?: unknown[];
  images?: unknown[];
};
function readGlb(name: string): Gltf {
  const buf = readFileSync(join(dir, name));
  assert.equal(buf.toString("ascii", 0, 4), "glTF", name);
  const jsonLen = buf.readUInt32LE(12);
  return JSON.parse(buf.toString("utf8", 20, 20 + jsonLen)) as Gltf;
}
const files = [manifest.props, manifest.kid];

test("a manifest GLB-i léteznek, tartalom-hashes névvel, és a méretük a manifesttel egyezik", () => {
  assert.match(manifest.props, /^szokoar-props\.[0-9a-f]{10}\.glb$/);
  assert.match(manifest.kid, /^szokoar-kid\.[0-9a-f]{10}\.glb$/);
  let total = 0;
  for (const name of files) {
    const file = join(dir, name);
    assert.ok(existsSync(file), file);
    assert.equal(statSync(file).size, manifest.files[name], name);
    total += statSync(file).size;
  }
  assert.equal(total, manifest.bytes);
  assert.deepEqual(Object.keys(manifest.files).sort(), [...files].sort(), "a manifest pontosan a két fájlt sorolja fel");
});

test("méret- és poligonkeret: fájlonként ≤ 200 KB, összesen ≤ 600 KB, ≤ 15 000 háromszög", () => {
  for (const name of files) assert.ok(manifest.files[name]! <= MAX_FILE_BYTES, `${name}: ${manifest.files[name]} B`);
  assert.ok(manifest.bytes <= MAX_TOTAL_BYTES, `${manifest.bytes} B`);
  assert.ok(manifest.triangles <= MAX_TRIANGLES, `${manifest.triangles} háromszög`);
});

test("a GLB-k Meshopt-tömörítettek, textúra nélküliek, a mesh-ek száma keretben, és modellenként egy, csúcs-színes primitív van", () => {
  let meshes = 0;
  let prims = 0;
  for (const name of files) {
    const gltf = readGlb(name);
    assert.ok((gltf.extensionsUsed ?? []).some((e) => /meshopt/i.test(e)), `${name} kiterjesztései: ${gltf.extensionsUsed}`);
    assert.equal((gltf.images ?? []).length, 0, `${name}: textúra nincs`);
    assert.ok((gltf.materials ?? []).length <= 1, `${name}: egy közös anyag (${gltf.materials?.length})`);
    for (const m of gltf.meshes ?? []) {
      meshes += 1;
      prims += m.primitives.length;
      assert.equal(m.primitives.length, 1, `${name} / ${m.name}: modellenként egy primitív (egy rajzolási hívás)`);
      assert.ok("COLOR_0" in m.primitives[0]!.attributes, `${name} / ${m.name}: csúcs-szín (COLOR_0)`);
    }
  }
  assert.ok(meshes <= MAX_MESHES, `${meshes} mesh`);
  assert.equal(prims, meshes);
});

/*
 * Vak ellenőr KICSI 3 (2026-11-19): a háromszögkeret a FÁJLOKBÓL számolva (a glTF accessorok indexszámából), nem a manifest
 * saját számából — egy szkript-elírás így nem viheti át az őrt.
 */
test("a háromszögkeret a GLB-kből számolva is tart, és a manifest száma egyezik vele", () => {
  let tris = 0;
  for (const name of files) {
    const gltf = readGlb(name) as Gltf & { accessors?: { count: number }[]; meshes?: { primitives: { indices?: number; mode?: number }[] }[] };
    for (const m of gltf.meshes ?? []) {
      for (const p of m.primitives) {
        assert.ok(p.mode === undefined || p.mode === 4, `${name}: csak háromszög-primitív (mode ${p.mode})`);
        assert.ok(typeof p.indices === "number", `${name}: indexelt primitív`);
        tris += gltf.accessors![p.indices!]!.count / 3;
      }
    }
  }
  assert.ok(tris <= MAX_TRIANGLES, `${tris} háromszög a fájlokban`);
  assert.equal(tris, manifest.triangles, "a manifest háromszögszáma a fájlokéval egyezik");
});

test("megvan minden díszlet-elem és figura-rész, amit a jelenet keres", () => {
  const names = new Set(files.flatMap((name) => (readGlb(name).nodes ?? []).map((n) => n.name)));
  const scenery = ["palm_a", "palm_b", "hut_a", "hut_b", "lighthouse", "rock_a", "rock_b", "bush", "cliff", "hill"];
  const debris = ["debris_plank", "debris_barrel", "debris_crate", "debris_log"];
  const kid = ["kid_board", "kid_torso", "kid_head", "kid_arm", "kid_leg"];
  for (const n of [...scenery, ...debris, ...kid]) assert.ok(names.has(n), `hiányzik: ${n}`);
  const kidNames = new Set((readGlb(manifest.kid).nodes ?? []).map((n) => n.name));
  for (const n of kid) assert.ok(kidNames.has(n), `a figura-fájlból hiányzik: ${n}`);
});
