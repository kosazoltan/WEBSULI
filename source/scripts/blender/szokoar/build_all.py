"""
Szökőár — a díszlet és a figura modelljeinek legyártása Blenderrel, fej nélkül
(terv: docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md 7.2 és 7.4).

Futtatás (a repó gyökeréből vagy a source mappából; a Blender helye a BLENDER_BIN környezeti változóból vagy a PATH-ból):
    "$BLENDER_BIN" -b -P source/scripts/blender/szokoar/build_all.py

Kimenet: source/client/public/models/szokoar/szokoar-props.<hash>.glb (díszlet) + szokoar-kid.<hash>.glb (figura) +
manifest.json (Meshopt-tömörítve).
A forma determinisztikus (rögzített seed), de a kimenet NEM bájtazonos futásról futásra (mérve 2026-11-18: a tömörített
pufferek néhány bájttal eltérnek, a fájlnév hash-e ezért buildenként változik) — újragyártás után a manifestet és a GLB-ket
együtt kell commitolni. A játékhoz és a CI-hoz Blender nem kell: a kész GLB követett fájl.

Stílus: stilizált, lekerekített low-poly; a sziklák lapolt (facettás), rétegzett felületűek. Textúra nincs: minden modell EGY
közös anyagot használ, a szín csúcs-színből jön (sRGB-ben megadott paletta → lineáris, finom függőleges átmenettel), így
modellenként egy primitív (egy rajzolási hívás) készül. Minden modell egy névvel ellátott gyökér-objektum (a jelenet név
szerint keresi):
    díszlet:  palm_a, palm_b, rock_a, rock_b, bush, hut_a, hut_b, lighthouse, cliff, hill
    törmelék: debris_plank, debris_barrel, debris_crate, debris_log
    figura:   kid_board, kid_torso, kid_head, kid_arm, kid_leg  (a kar és a láb a jelenetben tükrözve kétszer szerepel;
              mindegyik rész origója a saját forgáspontja)
"""
import hashlib
import json
import math
import os
import random

import bpy
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT_DIR = os.path.join(SOURCE, "client", "public", "models", "szokoar")

random.seed(20261118)

# A paletta sRGB-ben (ahogy a képernyőn látszani fog); a csúcs-szín lineáris, az átváltást a `lin()` végzi.
PALETTE = {
    "sand": "#f4d28f",
    "sand_dark": "#d9a55f",
    "grass": "#58c956",
    "grass_light": "#8be05a",
    "grass_dark": "#2c9a4b",
    "leaf": "#3fc257",
    "leaf_dark": "#1c8c44",
    "trunk": "#a8703d",
    "rock": "#978b80",
    "rock_light": "#b3a798",
    "rock_warm": "#b78d6a",
    "rock_dark": "#6f655e",
    "rock_wet": "#514d52",
    "wood": "#c98a4d",
    "wood_light": "#e3b077",
    "wood_dark": "#8a5730",
    "white": "#fbf5e8",
    "red": "#e8433b",
    "teal": "#14a9bd",
    "yellow": "#ffd23f",
    "glass": "#ffe98f",
    "wall_a": "#ffd8a3",
    "wall_b": "#bfe4ff",
    "roof_a": "#e2553e",
    "roof_b": "#2f80d8",
    "barrel": "#b5672f",
    "metal": "#6c7684",
    "skin": "#f7c79d",
    "hair": "#6b3a1b",
    "vest": "#ff7a1a",
    "shirt": "#19b4c8",
    "shorts": "#3654d6",
    "eye": "#1a1a22",
    "cheek": "#ff8fa3",
    "mouth": "#a3183c",
}


def lin(name):
    """sRGB hex → lineáris RGB."""
    h = PALETTE[name].lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


_material = None


def shared_material():
    """Az egyetlen közös anyag: az alapszín a „Col” csúcs-színből jön."""
    global _material
    if _material is None:
        m = bpy.data.materials.new("szokoar")
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Roughness"].default_value = 0.85
        attr = m.node_tree.nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "Col"
        m.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
        _material = m
    return _material


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def paint(obj, color, lo=0.84, hi=1.07, jitter_amount=0.0, seed=0):
    """
    Csúcs-szín a hálóra. `color`: palettanév, vagy függvény (lap közepe, lap normálisa) → palettanév. `lo`–`hi`: függőleges
    fényesség-átmenet az objektum aljától a tetejéig; `jitter_amount`: laponkénti véletlen fényesség (sziklák facettáihoz).
    """
    me = obj.data
    rnd = random.Random(1000 + seed)
    zs = [v.co.z for v in me.vertices]
    z0, z1 = min(zs), max(zs)
    span = max(1e-6, z1 - z0)
    ca = me.color_attributes.get("Col") or me.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")
    flat = [0.0] * (len(me.loops) * 4)
    for poly in me.polygons:
        name = color(poly.center, poly.normal) if callable(color) else color
        r, g, b = lin(name)
        fj = 1.0 + (rnd.uniform(-jitter_amount, jitter_amount) if jitter_amount else 0.0)
        for li in poly.loop_indices:
            t = (me.vertices[me.loops[li].vertex_index].co.z - z0) / span
            f = (lo + (hi - lo) * t) * fj
            flat[li * 4:li * 4 + 4] = (min(1.0, r * f), min(1.0, g * f), min(1.0, b * f), 1.0)
    ca.data.foreach_set("color", flat)
    me.color_attributes.active_color = ca
    me.color_attributes.render_color_index = me.color_attributes.find("Col")
    me.materials.clear()
    me.materials.append(shared_material())


def apply_all(obj):
    """A hely / forgatás / méretezés beégetése a hálóba: a csúcsok innentől világ-koordinátában vannak, az origó (0, 0, 0)."""
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def finish(obj, color, bevel=0.0, smooth=True, segments=2, lo=0.84, hi=1.07, jitter_amount=0.0, seed=0):
    """Transzformáció beégetése, lekerekítés (bevel), árnyalás (sima / lapolt), csúcs-szín."""
    apply_all(obj)
    if bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if smooth:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
    else:
        bpy.ops.object.shade_flat()
    paint(obj, color, lo, hi, jitter_amount, seed)
    obj.select_set(False)
    return obj


def add(kind, **kw):
    getattr(bpy.ops.mesh, "primitive_" + kind + "_add")(**kw)
    return bpy.context.active_object


def ball(radius, location, scale=(1, 1, 1), segments=14, rings=10):
    o = add("uv_sphere", segments=segments, ring_count=rings, radius=radius, location=location)
    o.scale = scale
    return o


def jitter(obj, amount, seed):
    rnd = random.Random(seed)
    for v in obj.data.vertices:
        v.co += Vector((rnd.uniform(-amount, amount), rnd.uniform(-amount, amount), rnd.uniform(-amount, amount)))


def from_bmesh(name, bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def cut(obj, point, normal):
    """A `normal` irányába eső részt levágja (a metszés nyitva marad). A sík világ-koordinátában értendő."""
    apply_all(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=Vector(point), plane_no=Vector(normal), clear_outer=True, clear_inner=False)
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def group(name, parts):
    """Egy névvel ellátott gyökér (üres) alá rendezi a részeket — a jelenet ezt keresi név szerint."""
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    for p in parts:
        p.parent = root
    return root


# --------------------------------------------------------------------------------------------------------------------
# Díszlet (Blender: Z felfelé, a néző felé −Y; a glTF-export Y-felfelére fordít, a néző felé +Z)
# --------------------------------------------------------------------------------------------------------------------

def palm_leaf(base, angle, length, seed):
    """Ívelt, középen gerinces, a vége felé keskenyedő és lehajló pálmalevél (szalag), nem keresztlap."""
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
    obj = from_bmesh("leaf", bm)
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
        parts.append(finish(palm_leaf(top, a, 1.35 + 0.15 * (k % 3), k), "leaf" if k % 2 else "leaf_dark", lo=0.8, hi=1.15))
    coco = add("ico_sphere", subdivisions=1, radius=0.12, location=top + Vector((0.1, 0.05, -0.2)))
    parts.append(finish(coco, "wood_dark"))
    return group(name, parts)


def rock_part(size, seed, location=(0, 0, 0), squash=(1.0, 0.85, 0.62)):
    r = add("ico_sphere", subdivisions=2, radius=size, location=location)
    jitter(r, size * 0.2, seed)
    r.scale = squash
    names = ["rock", "rock_light", "rock_warm"]
    return finish(r, lambda c, n: names[seed % 3] if n.z < 0.55 else "rock_light", smooth=False, lo=0.8, hi=1.1, jitter_amount=0.07, seed=seed)


def rock(name, size, seed):
    return group(name, [rock_part(size, seed, (0, 0, size * 0.3))])


def bush(name):
    parts = []
    for i, (dx, dz, s) in enumerate([(0, 0.25, 0.42), (0.38, 0.18, 0.32), (-0.34, 0.16, 0.3)]):
        b = add("ico_sphere", subdivisions=2, radius=s, location=(dx, 0, dz))
        jitter(b, 0.03, 30 + i)
        parts.append(finish(b, "grass" if i else "grass_dark", lo=0.72, hi=1.18))
    return group(name, parts)


def hut(name, wall, roof):
    body = add("cube", size=1.0, location=(0, 0, 0.45))
    body.scale = (1.3, 1.0, 0.9)
    finish(body, wall, bevel=0.05, lo=0.82, hi=1.05)
    rf = add("cylinder", vertices=3, radius=0.95, depth=1.25, location=(0, 0, 1.12))
    rf.rotation_euler = (math.radians(90), 0, math.radians(90))
    rf.scale = (1.0, 0.62, 1.0)
    finish(rf, roof, bevel=0.04, smooth=False, lo=0.8, hi=1.1)
    door = add("cube", size=1.0, location=(0, -0.51, 0.3))
    door.scale = (0.28, 0.04, 0.5)
    finish(door, "wood_dark", smooth=False)
    win = add("cube", size=1.0, location=(0.4, -0.51, 0.55))
    win.scale = (0.22, 0.04, 0.2)
    finish(win, "glass", smooth=False, lo=1.0, hi=1.0)
    stilts = []
    for sx in (-0.55, 0.55):
        for sy in (-0.4, 0.4):
            s = add("cylinder", vertices=6, radius=0.06, depth=0.5, location=(sx, sy, -0.2))
            stilts.append(finish(s, "wood_dark", smooth=False))
    return group(name, [body, rf, door, win, *stilts])


def lighthouse(name):
    """A menedék: csíkos, vaskos világítótorony lámpaházzal, korláttal és egy kis házzal a tövében."""
    parts = []
    h = 3.4
    bands = 6
    for i in range(bands):
        z0 = h * i / bands
        r0 = 0.62 - 0.22 * (i / bands)
        r1 = 0.62 - 0.22 * ((i + 1) / bands)
        c = add("cone", vertices=16, radius1=r0, radius2=r1, depth=h / bands, location=(0, 0, z0 + h / bands / 2))
        parts.append(finish(c, "red" if i % 2 else "white", lo=0.92, hi=1.04))
    gallery = add("cylinder", vertices=16, radius=0.58, depth=0.12, location=(0, 0, h + 0.06))
    parts.append(finish(gallery, "metal", bevel=0.02))
    lamp = add("cylinder", vertices=10, radius=0.3, depth=0.5, location=(0, 0, h + 0.37))
    parts.append(finish(lamp, "glass", lo=1.0, hi=1.0))
    cap = add("cone", vertices=16, radius1=0.44, radius2=0.05, depth=0.5, location=(0, 0, h + 0.87))
    parts.append(finish(cap, "red"))
    knob = ball(0.07, (0, 0, h + 1.15), segments=8, rings=6)
    parts.append(finish(knob, "yellow"))
    base = add("cylinder", vertices=16, radius=0.85, depth=0.3, location=(0, 0, 0.0))
    parts.append(finish(base, "rock_light", bevel=0.06))
    door = add("cube", size=1.0, location=(0, -0.6, 0.42))
    door.scale = (0.26, 0.08, 0.5)
    parts.append(finish(door, "wood_dark", bevel=0.02, smooth=False))
    for z in (1.45, 2.45):
        win = add("cube", size=1.0, location=(0, -0.62 + 0.065 * z, z))
        win.scale = (0.16, 0.08, 0.22)
        parts.append(finish(win, "glass", smooth=False, lo=1.0, hi=1.0))
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


# A szikla-hegy kiszélesedése a tetőtől a tövéig (a jelenet habgyűrűje ugyanezzel számol: TsunamiScene3D.tsx CLIFF_FLARE).
CLIFF_FLARE = 1.3


def cliff(name):
    """
    A szikla-hegy, amelyen a menedék áll: magas, lapos tetejű, rétegzett, lapolt sziklatömb fűsapkával. Az origó a tető
    közepe (z = 0), a test 15 egységet nyúlik lefelé — a víz az oldalán emelkedik.
    """
    rnd = random.Random(77)
    seg, ring_count, height = 16, 13, 15.0
    bm = bmesh.new()
    rings = []
    for i in range(ring_count + 1):
        t = i / ring_count
        z = -height * t
        base = 1.6 + CLIFF_FLARE * (t ** 0.85) + 0.3 * (math.sin(t * math.pi * 5.0) ** 2) * (0.3 + t)
        if i == 0:
            base = 1.55
        elif i == 1:
            z, base = -0.32, 1.78  # a fűsapka kihajló pereme
        elif i == 2:
            z, base = -0.95, 1.5
        off = rnd.uniform(-0.12, 0.12)
        ring = []
        for s in range(seg):
            a = (s / seg) * math.tau + off
            rr = base * (1 + rnd.uniform(-0.09, 0.09) * (1 if i > 1 else 0.4))
            zz = z + (rnd.uniform(-0.2, 0.2) if 1 < i < ring_count else 0.0)
            ring.append(bm.verts.new((math.cos(a) * rr * 1.12, math.sin(a) * rr * 0.88, zz)))
        rings.append(ring)
    top = bm.verts.new((0, 0, 0.14))
    for s in range(seg):
        bm.faces.new((top, rings[0][s], rings[0][(s + 1) % seg]))
    for i in range(ring_count):
        for s in range(seg):
            bm.faces.new((rings[i][s], rings[i + 1][s], rings[i + 1][(s + 1) % seg], rings[i][(s + 1) % seg]))
    body = from_bmesh(name + "_body", bm)
    strata = ["rock_light", "rock_warm", "rock", "rock_light", "rock_warm", "rock", "rock_light", "rock_warm", "rock", "rock_dark"]

    def body_color(c, n):
        if c.z > -0.2:
            return "grass_light" if (math.sin(c.x * 3.1) * math.cos(c.y * 2.7)) > 0 else "grass"
        if c.z > -0.75:
            return "grass_dark"
        band = int((-c.z + 0.35 * math.sin(c.x * 1.3 + c.y * 1.7)) / 1.25)
        return strata[min(len(strata) - 1, band)]

    parts = [finish(body, body_color, smooth=False, lo=0.78, hi=1.08, jitter_amount=0.06, seed=5)]
    # Kőtömbök és fűcsomók a párkányokon (a néző felé és oldalt), hogy a fal ne legyen sima kúp.
    for k, (ang, z, size) in enumerate([(-1.9, -2.6, 0.75), (-0.9, -5.2, 1.0), (-2.5, -7.8, 1.15), (-1.3, -10.4, 1.3), (0.2, -3.6, 0.7), (3.3, -6.0, 0.9)]):
        t = -z / height
        rad = (1.6 + CLIFF_FLARE * (t ** 0.85)) * 0.98
        parts.append(rock_part(size, 40 + k, (math.cos(ang) * rad * 1.12, math.sin(ang) * rad * 0.88, z), squash=(1.0, 0.9, 0.7)))
    for k, (ang, z, size) in enumerate([(-1.5, -0.1, 0.34), (2.4, -0.05, 0.3), (-2.3, -2.1, 0.42), (-0.7, -4.5, 0.4)]):
        t = max(0.0, -z / height)
        rad = (1.6 + CLIFF_FLARE * (t ** 0.85)) * (0.86 if z > -1 else 1.0)
        b = add("ico_sphere", subdivisions=2, radius=size, location=(math.cos(ang) * rad * 1.12, math.sin(ang) * rad * 0.88, z + size * 0.5))
        jitter(b, 0.03, 60 + k)
        b.scale = (1.2, 1.0, 0.7)
        parts.append(finish(b, "grass" if k % 2 else "grass_dark", lo=0.72, hi=1.15))
    return group(name, parts)


def hill(name):
    """Lekerekített, rétegzett domb a háttérbe (fűtakaró fent, sziklarétegek az oldalán, homok a tövénél)."""
    rnd = random.Random(91)
    h = add("ico_sphere", subdivisions=3, radius=1.0)
    for v in h.data.vertices:
        n = v.co.normalized()
        d = 1 + 0.16 * math.sin(3.1 * n.x + 1.3) * math.sin(2.7 * n.y + 0.4) + 0.1 * math.sin(5.3 * n.z + 2.0 * n.x) + rnd.uniform(-0.035, 0.035)
        v.co = Vector((n.x * d * 1.7, n.y * d * 1.2, max(-0.25, n.z * d) + 0.25))

    def color(c, n):
        if n.z > 0.6 and c.z > 0.3:
            return "grass_light" if math.sin(c.x * 4.0 + c.y * 3.0) > 0.2 else "grass"
        if c.z < 0.14:
            return "sand"
        band = int((c.z + 0.08 * math.sin(c.x * 3.0 + c.y * 2.0)) / 0.2)
        return ["rock_warm", "rock_light", "rock", "rock_light", "rock_warm", "grass_dark", "grass_dark"][min(6, band)]

    return group(name, [finish(h, color, smooth=True, lo=0.74, hi=1.12, jitter_amount=0.04, seed=9)])


# --------------------------------------------------------------------------------------------------------------------
# Sodródó törmelék
# --------------------------------------------------------------------------------------------------------------------

def debris_plank(name):
    p = add("cube", size=1.0)
    p.scale = (1.4, 0.32, 0.1)
    apply_all(p)
    jitter(p, 0.02, 7)
    return group(name, [finish(p, "wood_light", bevel=0.03)])


def debris_barrel(name):
    b = add("cylinder", vertices=12, radius=0.32, depth=0.8)
    finish(b, "barrel", bevel=0.05, lo=0.9, hi=1.05)
    hoops = []
    for z in (-0.25, 0.25):
        h = add("torus", major_radius=0.33, minor_radius=0.03, major_segments=12, minor_segments=4, location=(0, 0, z))
        hoops.append(finish(h, "metal", smooth=False))
    root = group(name, [b, *hoops])
    root.rotation_euler = (math.radians(90), 0, 0.3)
    return root


def debris_crate(name):
    c = add("cube", size=0.6)
    finish(c, "wood", bevel=0.04)
    slats = []
    for z in (-0.18, 0.18):
        slat = add("cube", size=1.0, location=(0, -0.31, z))
        slat.scale = (0.62, 0.03, 0.09)
        slats.append(finish(slat, "wood_dark", smooth=False))
    return group(name, [c, *slats])


def debris_log(name):
    """Uszadékfa: vastag rönk világos vágott véggel és egy ágcsonkkal."""
    lg = add("cylinder", vertices=9, radius=0.16, depth=1.7)
    lg.rotation_euler = (0, math.radians(90), 0)
    apply_all(lg)
    jitter(lg, 0.015, 11)
    finish(lg, lambda c, n: "wood_light" if abs(n.x) > 0.9 else "trunk", bevel=0.02, lo=0.85, hi=1.1)
    stub = add("cylinder", vertices=6, radius=0.06, depth=0.3, location=(0.3, 0, 0.2))
    stub.rotation_euler = (0, math.radians(25), 0)
    finish(stub, "wood_dark", smooth=False)
    return group(name, [lg, stub])


# --------------------------------------------------------------------------------------------------------------------
# A figura: nagyfejű, kerekded gyerek mentőmellényben, szörfdeszkán. Mértékegység: a figura ≈ 1,1 magas. A részek a jelenet
# forgáspontjaihoz készülnek (a rész origója = a forgáspont): deszka (0,0,0); törzs (a lovas origója); fej (nyak);
# kar (váll, lefelé lóg); láb (csípő, lefelé lóg).
# --------------------------------------------------------------------------------------------------------------------

def kid_board(name):
    b = ball(1.0, (0, 0, 0), scale=(0.64, 0.2, 0.05), segments=22, rings=8)

    def color(c, n):
        if n.z < -0.2:
            return "teal"
        if abs(c.y) < 0.03:
            return "red"
        if abs(c.y) < 0.062:
            return "white"
        return "yellow"

    return group(name, [finish(b, color, lo=0.95, hi=1.05)])


def kid_torso(name):
    t = ball(1.0, (0, 0, 0.43), scale=(0.2, 0.165, 0.2), segments=16, rings=12)

    def color(c, n):
        if c.z < 0.3:
            return "shorts"
        if c.z > 0.575:
            return "shirt"
        if 0.395 < c.z < 0.44 or (abs(c.x) < 0.032 and c.y < 0):
            return "yellow"
        return "vest"

    return group(name, [finish(t, color, lo=0.9, hi=1.08)])


def kid_leg(name):
    leg = ball(1.0, (0, 0, -0.125), scale=(0.072, 0.078, 0.14), segments=10, rings=8)
    finish(leg, lambda c, n: "shorts" if c.z > -0.07 else "skin", lo=0.92, hi=1.05)
    shoe = ball(1.0, (0, -0.03, -0.245), scale=(0.088, 0.125, 0.058), segments=10, rings=6)
    finish(shoe, lambda c, n: "red" if c.z < -0.265 else "white", lo=0.95, hi=1.05)
    return group(name, [leg, shoe])


def kid_arm(name):
    arm = ball(1.0, (0, 0, -0.105), scale=(0.06, 0.06, 0.125), segments=10, rings=8)
    finish(arm, lambda c, n: "shirt" if c.z > -0.08 else "skin", lo=0.92, hi=1.05)
    hand = ball(0.064, (0, 0, -0.265), segments=10, rings=8)
    finish(hand, "skin")
    return group(name, [arm, hand])


def kid_head(name):
    parts = []
    cz = 0.215  # a fej közepe a nyak (forgáspont) fölött
    head = ball(0.265, (0, 0, cz), scale=(1.05, 0.96, 0.96), segments=22, rings=16)
    parts.append(finish(head, "skin", lo=0.93, hi=1.05))
    # Haj: a fejnél kicsit nagyobb gömb felső része; a hajvonal elöl magasabban, hátul mélyebben (ferde vágás).
    hair = ball(0.283, (0, 0, cz + 0.005), scale=(1.05, 0.97, 0.97), segments=22, rings=16)
    cut(hair, (0, 0, cz + 0.035), (0, -0.46, -1.0))
    parts.append(finish(hair, "hair", lo=0.85, hi=1.2))
    fringe = ball(0.1, (0.05, -0.2, cz + 0.2), scale=(1.7, 0.75, 0.55), segments=12, rings=8)
    parts.append(finish(fringe, "hair", lo=0.95, hi=1.2))
    tuft = ball(0.07, (-0.02, 0.0, cz + 0.285), scale=(0.8, 0.8, 1.3), segments=8, rings=6)
    parts.append(finish(tuft, "hair", lo=1.0, hi=1.25))
    for side in (-1, 1):
        ear = ball(0.055, (side * 0.27, 0.0, cz - 0.01), scale=(0.6, 0.8, 1.0), segments=8, rings=6)
        parts.append(finish(ear, "skin"))
        eye = ball(0.043, (side * 0.098, -0.228, cz + 0.005), scale=(1.0, 0.55, 1.3), segments=10, rings=8)
        parts.append(finish(eye, "eye", lo=1.0, hi=1.0))
        shine = ball(0.016, (side * 0.098 + 0.015, -0.252, cz + 0.03), segments=6, rings=4)
        parts.append(finish(shine, "white", lo=1.0, hi=1.0))
        cheek = ball(0.045, (side * 0.158, -0.198, cz - 0.07), scale=(1.15, 0.35, 0.75), segments=8, rings=6)
        parts.append(finish(cheek, "cheek", lo=1.0, hi=1.0))
    # Nevető száj: lapított korong alsó fele.
    mouth = ball(0.062, (0, -0.238, cz - 0.075), scale=(1.0, 0.3, 0.8), segments=12, rings=8)
    cut(mouth, (0, 0, cz - 0.07), (0, 0, 1.0))
    parts.append(finish(mouth, "mouth", lo=1.0, hi=1.0))
    return group(name, parts)


# --------------------------------------------------------------------------------------------------------------------

def build():
    reset()
    palm("palm_a", 0.5, 2.6, 0)
    palm("palm_b", -0.35, 2.1, 0)
    rock("rock_a", 0.6, 1)
    rock("rock_b", 0.45, 2)
    bush("bush")
    hut("hut_a", "wall_a", "roof_a")
    hut("hut_b", "wall_b", "roof_b")
    lighthouse("lighthouse")
    cliff("cliff")
    hill("hill")
    debris_plank("debris_plank")
    debris_barrel("debris_barrel")
    debris_crate("debris_crate")
    debris_log("debris_log")
    kid_board("kid_board")
    kid_torso("kid_torso")
    kid_head("kid_head")
    kid_arm("kid_arm")
    kid_leg("kid_leg")
    # Modellenként egy mesh, egy anyaggal (a részek összevonva; a csúcs-szín megmarad) — modellenként egy rajzolási hívás.
    roots = [o for o in bpy.context.scene.objects if o.parent is None]
    for root in roots:
        meshes = [o for o in root.children_recursive if o.type == "MESH"]
        if not meshes:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for m in meshes:
            m.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        if len(meshes) > 1:
            bpy.ops.object.join()
        joined = bpy.context.active_object
        joined.name = root.name + "_mesh"
        joined.data.name = root.name
        mw = joined.matrix_world.copy()
        joined.parent = root
        joined.matrix_world = mw
    for o in [o for o in bpy.context.scene.objects if o.type == "EMPTY" and o.parent is not None]:
        bpy.data.objects.remove(o, do_unlink=True)
    # A gyökerek egymás mellé (a jelenet úgyis név szerint keres, és a saját helyére teszi).
    for i, o in enumerate(sorted(roots, key=lambda o: o.name)):
        o.location.x += i * 8.0

    os.makedirs(OUT_DIR, exist_ok=True)
    for old in os.listdir(OUT_DIR):
        if old.startswith("szokoar-") and old.endswith(".glb"):
            os.remove(os.path.join(OUT_DIR, old))
    known = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())

    def export(prefix, pick):
        """A kiválasztott gyökerek (és hálóik) egy GLB-be; a fájlnév a tartalom hash-ével."""
        bpy.ops.object.select_all(action="DESELECT")
        for root in roots:
            if pick(root.name):
                root.select_set(True)
                for c in root.children_recursive:
                    c.select_set(True)
        tmp = os.path.join(OUT_DIR, "_build.glb")
        options = dict(
            filepath=tmp,
            use_selection=True,
            export_format="GLB",
            export_apply=True,
            export_meshopt_compression_enable=True,
            export_yup=True,
            export_extras=False,
            export_animations=False,
            export_cameras=False,
            export_lights=False,
            export_texcoords=False,
            export_vertex_color="MATERIAL",
            export_all_vertex_colors=False,
        )
        bpy.ops.export_scene.gltf(**{k: v for k, v in options.items() if k in known})
        with open(tmp, "rb") as f:
            data = f.read()
        final = "szokoar-%s.%s.glb" % (prefix, hashlib.sha256(data).hexdigest()[:10])
        os.replace(tmp, os.path.join(OUT_DIR, final))
        return final, len(data)

    # Két fájl (terv 7.2: elemenkénti keret): a díszlet és a figura külön — mindkettő a 200 KB-os fájlkeret alatt.
    props, props_bytes = export("props", lambda n: not n.startswith("kid_"))
    kid, kid_bytes = export("kid", lambda n: n.startswith("kid_"))
    tris = 0
    for o in bpy.context.scene.objects:
        if o.type == "MESH":
            tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
    manifest = {
        "props": props,
        "kid": kid,
        "files": {props: props_bytes, kid: kid_bytes},
        "bytes": props_bytes + kid_bytes,
        "triangles": tris,
        "models": sorted(o.name for o in roots),
    }
    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("SZOKOAR_BUILD", json.dumps(manifest))


build()
