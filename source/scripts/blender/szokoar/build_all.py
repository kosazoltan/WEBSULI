"""
Szökőár — a díszlet modelljeinek legyártása Blenderrel, fej nélkül (terv: docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md 7.2).

Futtatás (a repó gyökeréből vagy a source mappából; a Blender helye a BLENDER_BIN környezeti változóból vagy a PATH-ból):
    "$BLENDER_BIN" -b -P source/scripts/blender/szokoar/build_all.py

Kimenet: source/client/public/models/szokoar/szokoar-props.<hash>.glb + manifest.json (Meshopt-tömörítve).
Determinisztikus (rögzített seed); a játékhoz és a CI-hoz Blender nem kell — a kész GLB követett fájl.

Stílus: stilizált, lekerekített low-poly, egységes meleg paletta; minden modell egy-egy névvel ellátott gyökér-objektum
(a jelenet név szerint klónozza): palm_a, palm_b, rock_a, rock_b, rock_c, hut_a, hut_b, lighthouse, debris_plank,
debris_barrel, debris_crate, pier_post, bush.
"""
import hashlib
import json
import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT_DIR = os.path.join(SOURCE, "client", "public", "models", "szokoar")

random.seed(20261118)

PALETTE = {
    "sand": (0.95, 0.80, 0.58),
    "sand_dark": (0.82, 0.64, 0.42),
    "grass": (0.42, 0.74, 0.40),
    "grass_dark": (0.27, 0.56, 0.33),
    "leaf": (0.30, 0.68, 0.36),
    "leaf_dark": (0.20, 0.50, 0.30),
    "trunk": (0.62, 0.42, 0.26),
    "rock": (0.56, 0.50, 0.46),
    "rock_dark": (0.42, 0.38, 0.36),
    "wood": (0.72, 0.48, 0.29),
    "wood_dark": (0.52, 0.33, 0.20),
    "white": (0.97, 0.95, 0.90),
    "red": (0.88, 0.30, 0.27),
    "teal": (0.16, 0.62, 0.66),
    "yellow": (1.00, 0.84, 0.35),
    "glass": (1.00, 0.93, 0.62),
    "wall_a": (1.00, 0.86, 0.68),
    "wall_b": (0.80, 0.90, 0.98),
    "roof_a": (0.86, 0.36, 0.30),
    "roof_b": (0.30, 0.52, 0.80),
    "barrel": (0.66, 0.40, 0.22),
    "metal": (0.45, 0.47, 0.50),
}
_materials = {}


def mat(name):
    if name in _materials:
        return _materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    r, g, b = PALETTE[name]
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.85
    if name == "glass":
        bsdf.inputs["Emission Color"].default_value = (1.0, 0.85, 0.4, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 2.0
    _materials[name] = m
    return m


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def finish(obj, material, bevel=0.0, smooth=True, segments=2):
    """Lekerekítés (bevel módosító alkalmazva), simított árnyalás, anyag."""
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    if bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if smooth:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
    obj.data.materials.clear()
    obj.data.materials.append(mat(material))
    obj.select_set(False)
    return obj


def add(kind, **kw):
    getattr(bpy.ops.mesh, "primitive_" + kind + "_add")(**kw)
    return bpy.context.active_object


def jitter(obj, amount, seed):
    rnd = random.Random(seed)
    for v in obj.data.vertices:
        v.co += Vector((rnd.uniform(-amount, amount), rnd.uniform(-amount, amount), rnd.uniform(-amount, amount)))


def group(name, parts):
    """Egy névvel ellátott gyökér (üres) alá rendezi a részeket — a jelenet ezt klónozza."""
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    for p in parts:
        p.parent = root
    return root


# --------------------------------------------------------------------------------------------------------------------
# Modellek (Blender: Z felfelé; a glTF-export Y-felfelére fordít)
# --------------------------------------------------------------------------------------------------------------------

def palm_leaf(base, angle, length, seed):
    """Ívelt, középen gerinces, a vége felé keskenyedő és lehajló pálmalevél (szalag), nem keresztlap."""
    rnd = random.Random(100 + seed)
    me = bpy.data.meshes.new("leaf")
    bm = bmesh.new()
    segs = 7
    rows = []
    for i in range(segs + 1):
        t = i / segs
        d = length * t
        droop = -0.9 * t * t * length + 0.35 * t
        w = 0.28 * math.sin(math.pi * min(1.0, t * 1.08 + 0.05)) * (1.0 - 0.15 * t)
        cx, cy = math.cos(angle) * d, math.sin(angle) * d
        nx, ny = -math.sin(angle), math.cos(angle)
        mid = bm.verts.new((base.x + cx, base.y + cy, base.z + droop + 0.06 * t))
        left = bm.verts.new((base.x + cx + nx * w, base.y + cy + ny * w, base.z + droop - 0.05 * w))
        right = bm.verts.new((base.x + cx - nx * w, base.y + cy - ny * w, base.z + droop - 0.05 * w))
        rows.append((left, mid, right))
    for i in range(segs):
        l0, m0, r0 = rows[i]
        l1, m1, r1 = rows[i + 1]
        bm.faces.new((l0, m0, m1, l1))
        bm.faces.new((m0, r0, r1, m1))
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new("leaf", me)
    bpy.context.scene.collection.objects.link(obj)
    sol = obj.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = 0.025
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=sol.name)
    obj.select_set(False)
    return obj


def palm(name, lean, height, x):
    parts = []
    segs = 7
    for i in range(segs):
        t = i / segs
        r = 0.16 - 0.06 * t
        seg = add("cylinder", vertices=7, radius=r, depth=height / segs * 1.05,
                  location=(x + math.sin(t * 1.4) * lean, 0, height * (t + 0.5 / segs)))
        seg.rotation_euler = (0, math.atan(lean * 1.4 * math.cos(t * 1.4) / height * segs / 6), 0)
        parts.append(finish(seg, "trunk" if i % 2 == 0 else "wood_dark", smooth=False))
    top = Vector((x + math.sin(1.4) * lean, 0, height))
    for k in range(8):
        a = k / 8 * math.tau + (0.2 if k % 2 else 0.0)
        parts.append(finish(palm_leaf(top, a, 1.35 + 0.15 * (k % 3), k), "leaf" if k % 2 else "leaf_dark"))
    coco = add("ico_sphere", subdivisions=1, radius=0.12, location=top + Vector((0.1, 0.05, -0.2)))
    parts.append(finish(coco, "wood_dark"))
    return group(name, parts)


def rock(name, size, seed):
    r = add("ico_sphere", subdivisions=2, radius=size)
    jitter(r, size * 0.22, seed)
    r.scale = (1.0, 0.85, 0.62)
    bpy.ops.object.transform_apply(scale=True)
    r.location.z = size * 0.3
    return group(name, [finish(r, "rock" if seed % 2 else "rock_dark")])


def bush(name):
    parts = []
    for i, (dx, dz, s) in enumerate([(0, 0.25, 0.42), (0.38, 0.18, 0.32), (-0.34, 0.16, 0.3)]):
        b = add("ico_sphere", subdivisions=1, radius=s, location=(dx, 0, dz))
        jitter(b, 0.04, 30 + i)
        parts.append(finish(b, "grass" if i else "grass_dark"))
    return group(name, parts)


def hut(name, wall, roof):
    body = add("cube", size=1.0, location=(0, 0, 0.45))
    body.scale = (1.3, 1.0, 0.9)
    bpy.ops.object.transform_apply(scale=True)
    finish(body, wall, bevel=0.05)
    rf = add("cylinder", vertices=3, radius=0.95, depth=1.25, location=(0, 0, 1.12))
    rf.rotation_euler = (math.radians(90), 0, math.radians(90))
    rf.scale = (1.0, 0.62, 1.0)
    finish(rf, roof, bevel=0.04, smooth=False)
    door = add("cube", size=1.0, location=(0, -0.51, 0.3))
    door.scale = (0.28, 0.04, 0.5)
    finish(door, "wood_dark", smooth=False)
    win = add("cube", size=1.0, location=(0.4, -0.51, 0.55))
    win.scale = (0.22, 0.04, 0.2)
    finish(win, "glass", smooth=False)
    stilts = []
    for sx in (-0.55, 0.55):
        for sy in (-0.4, 0.4):
            s = add("cylinder", vertices=6, radius=0.06, depth=0.5, location=(sx, sy, -0.2))
            stilts.append(finish(s, "wood_dark", smooth=False))
    return group(name, [body, rf, door, win, *stilts])


def lighthouse(name):
    """A menedék: csíkos, vaskos világítótorony lámpaházzal és egy kis házzal a tövében."""
    parts = []
    h = 3.4
    bands = 6
    for i in range(bands):
        z0 = h * i / bands
        r0 = 0.62 - 0.22 * (i / bands)
        r1 = 0.62 - 0.22 * ((i + 1) / bands)
        c = add("cone", vertices=14, radius1=r0, radius2=r1, depth=h / bands, location=(0, 0, z0 + h / bands / 2))
        parts.append(finish(c, "red" if i % 2 else "white"))
    gallery = add("cylinder", vertices=14, radius=0.56, depth=0.12, location=(0, 0, h + 0.06))
    parts.append(finish(gallery, "metal", bevel=0.02))
    lamp = add("cylinder", vertices=10, radius=0.3, depth=0.5, location=(0, 0, h + 0.37))
    parts.append(finish(lamp, "glass"))
    cap = add("cone", vertices=14, radius1=0.42, radius2=0.05, depth=0.5, location=(0, 0, h + 0.87))
    parts.append(finish(cap, "red"))
    ball = add("uv_sphere", segments=8, ring_count=6, radius=0.07, location=(0, 0, h + 1.15))
    parts.append(finish(ball, "yellow"))
    base = add("cylinder", vertices=14, radius=0.85, depth=0.3, location=(0, 0, 0.0))
    parts.append(finish(base, "rock", bevel=0.06))
    cottage = hut(name + "_cottage", "wall_a", "roof_a")
    cottage.location = (-1.25, 0.2, 0.15)
    cottage.scale = (0.7, 0.7, 0.7)
    root = group(name, parts)
    cottage.parent = root
    flag_pole = add("cylinder", vertices=5, radius=0.025, depth=1.0, location=(0.85, 0, 0.6))
    flag = add("cube", size=1.0, location=(1.05, 0, 0.98))
    flag.scale = (0.4, 0.02, 0.24)
    for p, m in ((flag_pole, "white"), (flag, "teal")):
        finish(p, m, smooth=False)
        p.parent = root
    return root


def debris_plank(name):
    p = add("cube", size=1.0)
    p.scale = (1.4, 0.32, 0.1)
    bpy.ops.object.transform_apply(scale=True)
    jitter(p, 0.02, 7)
    return group(name, [finish(p, "wood", bevel=0.03)])


def debris_barrel(name):
    b = add("cylinder", vertices=10, radius=0.32, depth=0.8)
    finish(b, "barrel", bevel=0.05)
    hoops = []
    for z in (-0.25, 0.25):
        h = add("torus", major_radius=0.33, minor_radius=0.025, major_segments=10, minor_segments=4, location=(0, 0, z))
        hoops.append(finish(h, "metal", smooth=False))
    root = group(name, [b, *hoops])
    root.rotation_euler = (math.radians(90), 0, 0.3)
    return root


def debris_crate(name):
    c = add("cube", size=0.6)
    finish(c, "wood", bevel=0.04)
    slat = add("cube", size=1.0, location=(0, -0.31, 0))
    slat.scale = (0.62, 0.02, 0.1)
    finish(slat, "wood_dark", smooth=False)
    return group(name, [c, slat])


def pier_post(name):
    p = add("cylinder", vertices=8, radius=0.1, depth=1.0, location=(0, 0, -0.5))
    return group(name, [finish(p, "wood_dark", bevel=0.02)])


def build():
    reset()
    palm("palm_a", 0.5, 2.6, 0)
    palm("palm_b", -0.35, 2.1, 0)
    rock("rock_a", 0.6, 1)
    rock("rock_b", 0.45, 2)
    rock("rock_c", 0.8, 3)
    bush("bush")
    hut("hut_a", "wall_a", "roof_a")
    hut("hut_b", "wall_b", "roof_b")
    lighthouse("lighthouse")
    debris_plank("debris_plank")
    debris_barrel("debris_barrel")
    debris_crate("debris_crate")
    pier_post("pier_post")
    # Modellenként egy mesh (a részek összevonva, az anyagok megmaradnak) — kevesebb csomópont és rajzolási hívás.
    roots = [o for o in bpy.context.scene.objects if o.parent is None]
    for root in roots:
        meshes = [o for o in root.children_recursive if o.type == "MESH"]
        if not meshes:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for m in meshes:
            m.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        joined = bpy.context.active_object
        joined.name = root.name + "_mesh"
        mw = joined.matrix_world.copy()
        joined.parent = root
        joined.matrix_world = mw
    for o in [o for o in bpy.context.scene.objects if o.type == "EMPTY" and o.parent is not None]:
        bpy.data.objects.remove(o, do_unlink=True)
    # A gyökerek egymás mellé (a jelenet úgyis név szerint klónoz).
    for i, o in enumerate(sorted(roots, key=lambda o: o.name)):
        o.location.x += i * 4.0

    os.makedirs(OUT_DIR, exist_ok=True)
    tmp = os.path.join(OUT_DIR, "_build.glb")
    bpy.ops.export_scene.gltf(
        filepath=tmp,
        export_format="GLB",
        export_apply=True,
        export_meshopt_compression_enable=True,
        export_yup=True,
        export_extras=False,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )
    with open(tmp, "rb") as f:
        data = f.read()
    digest = hashlib.sha256(data).hexdigest()[:10]
    for old in os.listdir(OUT_DIR):
        if old.startswith("szokoar-props.") and old.endswith(".glb"):
            os.remove(os.path.join(OUT_DIR, old))
    final = "szokoar-props.%s.glb" % digest
    os.replace(tmp, os.path.join(OUT_DIR, final))
    tris = 0
    for o in bpy.context.scene.objects:
        if o.type == "MESH":
            tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
    manifest = {"props": final, "bytes": len(data), "triangles": tris, "models": sorted(o.name for o in roots)}
    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("SZOKOAR_BUILD", json.dumps(manifest))


build()
