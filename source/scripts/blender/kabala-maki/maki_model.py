# Kabala-maki — a figura hálója, anyagai, csontváza, súlyai és alakkulcsai (terv: docs/specs/2026-11-18-kabala-maki.md).
# Minden eljárással készül: nincs külső fájl, nincs véletlen. Blenderben a figura a −Y irányba néz, Z a „fel”.
# Futtatás: a build.py / render.py tölti be (blender -b --factory-startup -P build.py).

import math

import bpy
from mathutils import Matrix, Vector

# ---------------------------------------------------------------- színek (sRGB hex → lineáris)


def srgb(hex_color):
    h = hex_color.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] * (1.0 - t) + b[i] * t for i in range(3))


def sstep(e0, e1, x):
    if e0 == e1:
        return 0.0 if x < e0 else 1.0
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


GREY = srgb("#9ba3b0")        # bunda
GREY_DARK = srgb("#7f8896")   # fejtető, hát
CREAM = srgb("#fbf5ea")       # pofa, has
PATCH = srgb("#565c69")       # szem körüli folt
LID = srgb("#8d95a3")         # szemhéj
PAW = srgb("#5d6370")         # kéz, láb
RING_DARK = srgb("#3a3d47")   # farokgyűrű
NOSE = srgb("#3b3340")
BLUSH = srgb("#f7a9ad")
EAR_IN = srgb("#f6cfc9")
PUPIL = srgb("#17120f")
IRIS = srgb("#f0a030")
IRIS_RIM = srgb("#8a4a14")
MOUTH = srgb("#6b2a3a")
TONGUE = srgb("#f58fa0")
WHITE = (1.0, 1.0, 1.0)

MAT_FUR, MAT_EYE, MAT_SHINE = 0, 1, 2

# ---------------------------------------------------------------- méretek (méterben; a figura ~1,1 magas)

HC = Vector((0.0, 0.0, 0.715))        # a fej közepe
HR = Vector((0.335, 0.295, 0.285))    # a fej sugarai
MZ_C = HC + Vector((0.0, -0.225, -0.105))   # pofa (orr-rész)
MZ_R = Vector((0.115, 0.085, 0.082))
BODY_C = Vector((0.0, 0.02, 0.30))
BODY_R = Vector((0.185, 0.16, 0.215))
EYE_R = Vector((0.100, 0.112, 0.062))  # helyi: x jobbra, y fel, z előre (a pólus)
EYE_DIR_X = 0.43
EYE_UP = 0.10

TAIL_PTS = [
    Vector((0.00, 0.12, 0.17)), Vector((0.10, 0.30, 0.10)), Vector((0.30, 0.37, 0.19)),
    Vector((0.46, 0.31, 0.43)), Vector((0.53, 0.23, 0.70)), Vector((0.48, 0.17, 0.93)),
    Vector((0.36, 0.14, 1.03)), Vector((0.27, 0.14, 0.95)),
]
TAIL_BONES = 7
TAIL_BANDS = 13

SHOULDER = Vector((0.165, 0.0, 0.435))
ELBOW = Vector((0.268, -0.025, 0.322))
HAND = Vector((0.322, -0.07, 0.200))
HIP = Vector((0.10, 0.0, 0.17))
ANKLE = Vector((0.115, -0.01, 0.05))
TOE = Vector((0.12, -0.15, 0.03))


def mirror(v, side):
    return Vector((v.x * side, v.y, v.z))


# ---------------------------------------------------------------- geometria-gyűjtő


class Geo:
    def __init__(self):
        self.verts, self.faces, self.cols, self.weights, self.mats = [], [], [], [], []

    def add(self, verts, faces, cols, weights, mat):
        off = len(self.verts)
        self.verts.extend(verts)
        self.cols.extend(cols)
        self.weights.extend(weights)
        for f in faces:
            self.faces.append(tuple(i + off for i in f))
            self.mats.append(mat)
        return range(off, off + len(verts))


def sphere(center, radii, nu, nv, rot=None, deform=None):
    """UV-gömb; a pólus a helyi Z. Vissza: (világ-pontok, lapok, helyi egységvektorok)."""
    rot = rot or Matrix.Identity(3)
    units = [Vector((0.0, 0.0, 1.0))]
    for k in range(1, nv):
        th = math.pi * k / nv
        for j in range(nu):
            ph = 2.0 * math.pi * j / nu
            units.append(Vector((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th))))
    units.append(Vector((0.0, 0.0, -1.0)))
    faces = []
    ring = lambda k, j: 1 + (k - 1) * nu + (j % nu)  # noqa: E731
    last = len(units) - 1
    for j in range(nu):
        faces.append((0, ring(1, j), ring(1, j + 1)))
        faces.append((ring(nv - 1, j), last, ring(nv - 1, j + 1)))
    for k in range(1, nv - 1):
        for j in range(nu):
            faces.append((ring(k, j), ring(k + 1, j), ring(k + 1, j + 1), ring(k, j + 1)))
    verts = []
    for u in units:
        local = Vector((u.x * radii.x, u.y * radii.y, u.z * radii.z))
        if deform:
            local = deform(local, u)
        verts.append(center + rot @ local)
    return verts, faces, units


def catmull(points, samples):
    """Catmull–Rom görbe egyenletes paraméterrel; vissza: (pontok, t∈[0,1])."""
    pts = [points[0]] + list(points) + [points[-1]]
    segs = len(points) - 1
    out, ts = [], []
    for s in range(samples + 1):
        g = s / samples * segs
        i = min(int(g), segs - 1)
        t = g - i
        p0, p1, p2, p3 = pts[i], pts[i + 1], pts[i + 2], pts[i + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                          + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
        ts.append(s / samples)
    return out, ts


def tube(path, radii, sides):
    """Cső a pontsor mentén (párhuzamosan vitt kerettel), mindkét végén lezárva. Vissza: (pontok, lapok, gyűrű-index csúcsonként)."""
    n = len(path)
    tangents = []
    for i in range(n):
        a, b = path[max(i - 1, 0)], path[min(i + 1, n - 1)]
        tangents.append((b - a).normalized())
    ref = Vector((1.0, 0.0, 0.0)) if abs(tangents[0].x) < 0.9 else Vector((0.0, 1.0, 0.0))
    normal = (ref - tangents[0] * ref.dot(tangents[0])).normalized()
    verts, ring_of, faces = [], [], []
    for i in range(n):
        t = tangents[i]
        normal = (normal - t * normal.dot(t)).normalized()
        binormal = t.cross(normal)
        for j in range(sides):
            a = 2.0 * math.pi * j / sides
            verts.append(path[i] + (normal * math.cos(a) + binormal * math.sin(a)) * radii[i])
            ring_of.append(i)
    for i in range(n - 1):
        for j in range(sides):
            a, b = i * sides + j, i * sides + (j + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    verts.append(path[0])
    ring_of.append(0)
    verts.append(path[-1])
    ring_of.append(n - 1)
    c0, c1 = len(verts) - 2, len(verts) - 1
    base = (n - 1) * sides
    for j in range(sides):
        faces.append((c0, (j + 1) % sides, j))
        faces.append((c1, base + j, base + (j + 1) % sides))
    return verts, faces, ring_of


def ellipsoid_front_y(center, radii, x, z):
    """Az ellipszoid elülső (−Y) felszínének y-ja az (x, z) pontban; None, ha a pont a körvonalon kívül van."""
    q = 1.0 - ((x - center.x) / radii.x) ** 2 - ((z - center.z) / radii.z) ** 2
    if q <= 0.0:
        return None
    return center.y - radii.y * math.sqrt(q)


def face_front_y(x, z):
    ys = [y for y in (ellipsoid_front_y(HC, HR, x, z), ellipsoid_front_y(MZ_C, MZ_R, x, z)) if y is not None]
    return min(ys) if ys else HC.y


# ---------------------------------------------------------------- a szem kerete


def eye_frame(side):
    """A szem közepe és helyi tengelyei (oszlopok: jobbra, fel, előre)."""
    e = Vector((EYE_DIR_X * side, -1.0, EYE_UP)).normalized()
    surface = HC + Vector((HR.x * e.x, HR.y * e.y, HR.z * e.z))
    axis = (e * 0.45 + Vector((0.0, -1.0, 0.0)) * 0.55).normalized()
    center = surface - axis * 0.030
    ex = Vector((0.0, 0.0, 1.0)).cross(axis).normalized()
    ey = axis.cross(ex).normalized()
    rot = Matrix((ex, ey, axis)).transposed()
    return center, rot


# ---------------------------------------------------------------- részek


def head_color(u):
    fx, fz, facing = u.x, u.z, -u.y
    base = mix(GREY, GREY_DARK, sstep(0.1, 0.8, fz) * 0.8 + sstep(0.0, 0.9, u.y) * 0.3)
    # krémszínű arc: ellipszis, felül a homlok közepén kis „csúcs”
    inside = 1.0 - ((fx / 0.80) ** 2 + ((fz + 0.14) / 0.66) ** 2)
    brow = (0.30 + 0.30 * min(abs(fx), 0.45) - fz) * 2.0
    mask = sstep(-0.16, 0.16, min(inside, brow)) * sstep(0.0, 0.25, facing)
    col = mix(base, CREAM, mask)
    for side in (-1.0, 1.0):
        ex = side * 0.405
        # a szem körüli folt: kifelé-lefelé kicsit megnyúló csepp
        d = math.sqrt(((fx - ex) / 0.36) ** 2 + ((fz - 0.11 + 0.10 * abs(fx - ex)) / 0.45) ** 2)
        col = mix(col, PATCH, (1.0 - sstep(0.80, 1.20, d)) * sstep(0.0, 0.2, facing))
        b = math.sqrt(((fx - side * 0.60) / 0.17) ** 2 + ((fz + 0.33) / 0.11) ** 2)
        col = mix(col, BLUSH, (1.0 - sstep(0.4, 1.0, b)) * 0.75 * sstep(0.0, 0.2, facing))
    return col


def eye_color(u):
    th = math.acos(max(-1.0, min(1.0, u.z)))
    col = mix(PUPIL, IRIS_RIM, sstep(0.66, 0.74, th))
    col = mix(col, IRIS, sstep(0.72, 0.84, th) * (1.0 - sstep(1.02, 1.16, th)))
    # az írisz alul világosabb: „mély” csillogás
    col = mix(col, srgb("#ffd070"), sstep(0.80, 1.0, th) * (1.0 - sstep(1.0, 1.14, th)) * sstep(0.0, -0.8, u.y) * 0.6)
    col = mix(col, PUPIL, sstep(1.12, 1.22, th))
    return col


def build_body(g):
    hd = {"head": 1.0}

    # fej
    v, f, units = sphere(HC, HR, 72, 40)
    g.add(v, f, [head_color(u) for u in units], [hd] * len(v), MAT_FUR)

    # pofa + orr
    v, f, units = sphere(MZ_C, MZ_R, 24, 14)
    g.add(v, f, [CREAM] * len(v), [hd] * len(v), MAT_FUR)
    v, f, units = sphere(MZ_C + Vector((0.0, -0.079, 0.035)), Vector((0.034, 0.020, 0.024)), 14, 8)
    g.add(v, f, [NOSE] * len(v), [hd] * len(v), MAT_EYE)

    # szemek + fénypontok
    for side in (-1.0, 1.0):
        c, rot = eye_frame(side)
        v, f, units = sphere(c, EYE_R, 28, 20, rot)
        g.add(v, f, [eye_color(u) for u in units], [hd] * len(v), MAT_EYE)

    # fülek
    for side, bone in ((1.0, "ear.L"), (-1.0, "ear.R")):
        c = HC + Vector((0.235 * side, 0.02, 0.235))
        rot = Matrix.Rotation(math.radians(-34.0 * side), 3, "Y")
        radii = Vector((0.105, 0.05, 0.125))
        v, f, units = sphere(c, radii, 20, 12, rot)
        cols, ws = [], []
        for u in units:
            inner = (1.0 - sstep(0.50, 0.72, math.hypot(u.x, u.z - 0.05))) * sstep(0.1, 0.4, -u.y)
            cols.append(mix(GREY_DARK, EAR_IN, inner))
            w = sstep(-0.5, 0.3, u.z)
            ws.append({bone: w, "head": 1.0 - w})
        g.add(v, f, cols, ws, MAT_FUR)

    # pofaszőr-pamacsok
    for side in (-1.0, 1.0):
        for k, (dz, ln) in enumerate(((0.02, 0.10), (-0.05, 0.115), (-0.12, 0.095))):
            start = HC + Vector((0.27 * side, -0.07, -0.085 + dz * 0.6))
            direction = Vector((0.95 * side, -0.12, -0.32 + dz * 5.0)).normalized()
            path = [start + direction * (ln * s / 5.0) for s in range(6)]
            radii = [0.060 * (1.0 - (s / 5.0) ** 1.4) + 0.003 for s in range(6)]
            v, f, ring_of = tube(path, radii, 14)
            g.add(v, f, [mix(GREY, CREAM, 0.12 * k)] * len(v), [hd] * len(v), MAT_FUR)

    # test
    def pear(local, u):
        s = 1.0 + 0.22 * max(0.0, -u.z)
        return Vector((local.x * s, local.y * s, local.z))

    v, f, units = sphere(BODY_C, BODY_R, 32, 20, deform=pear)
    cols, ws = [], []
    for p, u in zip(v, units):
        belly = 1.0 - ((u.x / 0.66) ** 2 + ((u.z + 0.10) / 0.86) ** 2)
        cols.append(mix(mix(GREY, GREY_DARK, sstep(0.0, 0.9, u.y) * 0.6), CREAM, sstep(-0.08, 0.08, belly) * sstep(0.05, 0.3, -u.y)))
        t = (p.z - 0.12) / 0.38
        chest = sstep(0.55, 0.85, t)
        hips = 1.0 - sstep(0.15, 0.45, t)
        ws.append({"hips": hips, "chest": chest, "spine": max(0.0, 1.0 - hips - chest)})
    g.add(v, f, cols, ws, MAT_FUR)

    # karok + kezek
    for side, sfx in ((1.0, "L"), (-1.0, "R")):
        pts = [mirror(SHOULDER, side), mirror(ELBOW, side), mirror(HAND, side)]
        path, ts = catmull(pts, 12)
        radii = [0.052 - 0.006 * t for t in ts]
        v, f, ring_of = tube(path, radii, 12)
        ws = []
        for r in ring_of:
            w = sstep(0.38, 0.62, ts[r])
            ws.append({"arm." + sfx: 1.0 - w, "forearm." + sfx: w})
        g.add(v, f, [mix(GREY, PAW, sstep(0.62, 0.92, ts[r])) for r in ring_of], ws, MAT_FUR)
        v, f, units = sphere(pts[2] + Vector((0.004 * side, -0.006, -0.012)), Vector((0.056, 0.056, 0.060)), 14, 10)
        g.add(v, f, [PAW] * len(v), [{"forearm." + sfx: 1.0}] * len(v), MAT_FUR)

    # lábak + lábfejek
    for side, sfx in ((1.0, "L"), (-1.0, "R")):
        pts = [mirror(HIP, side), mirror(ANKLE, side)]
        path = [pts[0].lerp(pts[1], s / 5.0) for s in range(6)]
        v, f, ring_of = tube(path, [0.072 - 0.010 * s / 5.0 for s in range(6)], 12)
        g.add(v, f, [GREY] * len(v), [{"leg." + sfx: 1.0}] * len(v), MAT_FUR)
        c = Vector((0.118 * side, -0.065, 0.040))
        v, f, units = sphere(c, Vector((0.072, 0.108, 0.040)), 16, 10)
        g.add(v, f, [PAW] * len(v), [{"foot." + sfx: 1.0}] * len(v), MAT_FUR)

    # farok: gyűrűs, gyűrűnként kicsit kidomborodó (bozontos) cső
    path, ts = catmull(TAIL_PTS, 78)
    radii, ring_cols = [], []
    for t in ts:
        r = 0.050 + 0.042 * sstep(0.0, 0.30, t) - 0.012 * sstep(0.75, 1.0, t)
        band = t * TAIL_BANDS
        r *= 1.0 + 0.10 * abs(math.sin(math.pi * band))
        r *= math.sqrt(max(0.0, 1.0 - sstep(0.955, 1.0, t) ** 2)) * 0.98 + 0.02
        radii.append(r)
        edge = abs((band % 1.0) - 0.5) * 2.0     # 0 a sáv közepén, 1 a határán
        dark = int(band) % 2 == 0 or t > 0.925
        if t < 0.045:
            ring_cols.append(GREY)
        else:
            a, b = (RING_DARK, CREAM) if dark else (CREAM, RING_DARK)
            ring_cols.append(mix(a, mix(a, b, 0.5), sstep(0.80, 1.0, edge)) if t <= 0.925 else RING_DARK)
    v, f, ring_of = tube(path, radii, 14)
    ws = []
    for r in ring_of:
        s = ts[r] * TAIL_BONES - 0.5
        i0 = max(0, min(TAIL_BONES - 2, int(math.floor(s))))
        fr = max(0.0, min(1.0, s - i0))
        fr = fr * fr * (3.0 - 2.0 * fr)
        ws.append({"tail%d" % (i0 + 1): 1.0 - fr, "tail%d" % (i0 + 2): fr})
    g.add(v, f, [ring_cols[r] for r in ring_of], ws, MAT_FUR)


LID_OPEN_DEG = 40.0     # nyitva: a felső szemhéj alsó éle ennyivel az „előre” fölött
LID_TOP_DEG = 84.0
LID_BOTTOM_DEG = -50.0


def lid_grid(side, low_deg, nu=14, nv=7):
    c, rot = eye_frame(side)
    pts = []
    for iu in range(nu + 1):
        al = math.radians(-88.0 + 176.0 * iu / nu)
        for iv in range(nv + 1):
            ph = math.radians(LID_TOP_DEG + (low_deg - LID_TOP_DEG) * iv / nv)
            local = Vector((EYE_R.x * 1.06 * math.sin(al),
                            EYE_R.y * 1.06 * math.cos(al) * math.sin(ph),
                            EYE_R.z * 1.16 * math.cos(al) * math.cos(ph)))
            pts.append(c + rot @ local)
    faces = []
    for iu in range(nu):
        for iv in range(nv):
            a = iu * (nv + 1) + iv
            b = (iu + 1) * (nv + 1) + iv
            faces.append((a, a + 1, b + 1, b))
    cols = [mix(LID, PUPIL, sstep(0.84, 0.95, iv / nv)) for iu in range(nu + 1) for iv in range(nv + 1)]
    return pts, faces, cols


MOUTH_Z = MZ_C.z - 0.022


def mouth_grid(smile, nu=16, nv=5):
    """A száj lapja a pofa felszínén; smile=0: vékony mosolyvonal, smile=1: nyitott, nevető száj."""
    width = 0.046 + 0.016 * smile
    lift = 0.016 + 0.014 * smile
    depth = 0.010 + 0.036 * smile
    pts = []
    for iu in range(nu + 1):
        u = -1.0 + 2.0 * iu / nu
        x = u * width
        top = MOUTH_Z + lift * u * u + 0.004 * smile
        th = depth * max(0.0, 1.0 - u * u) ** 0.6
        for iv in range(nv + 1):
            z = top - th * iv / nv
            pts.append(Vector((x, face_front_y(x, z) - 0.0035, z)))
    faces = []
    for iu in range(nu):
        for iv in range(nv):
            a = iu * (nv + 1) + iv
            b = (iu + 1) * (nv + 1) + iv
            faces.append((a, a + 1, b + 1, b))
    cols = []
    for iu in range(nu + 1):
        u = -1.0 + 2.0 * iu / nu
        for iv in range(nv + 1):
            cols.append(mix(MOUTH, TONGUE, sstep(0.55, 0.8, iv / nv) * (1.0 - sstep(0.35, 0.75, abs(u)))))
    return pts, faces, cols


def build_face(g):
    """Az alakkulcsos rész. Vissza: {kulcsnév: {csúcsindex: cél-pont}}."""
    hd = {"head": 1.0}
    keys = {"blink": {}, "smile": {}}
    for side in (-1.0, 1.0):
        pts, faces, cols = lid_grid(side, LID_OPEN_DEG)
        closed, _, _ = lid_grid(side, LID_BOTTOM_DEG)
        idx = g.add(pts, faces, cols, [hd] * len(pts), MAT_FUR)
        for i, p in zip(idx, closed):
            keys["blink"][i] = p
        # a fénypontok itt vannak (nem a testhálóban), hogy pislogáskor a szembe húzódva eltűnjenek
        c, rot = eye_frame(side)
        for (ox, oy, r) in ((-0.36, 0.40, 0.030), (0.34, -0.36, 0.014)):
            d = Vector((ox, oy, math.sqrt(max(0.0, 1.0 - ox * ox - oy * oy))))
            p = c + rot @ Vector((d.x * EYE_R.x, d.y * EYE_R.y, d.z * EYE_R.z * 1.02))
            v, f, units = sphere(p, Vector((r, r, r * 0.35)), 12, 6, rot)
            idx = g.add(v, f, [WHITE] * len(v), [hd] * len(v), MAT_SHINE)
            sink = rot @ Vector((0.0, 0.0, -0.030))   # befelé süllyed: félig csukott szemnél még látszik
            for i, q in zip(idx, v):
                keys["blink"][i] = q + sink
    pts, faces, cols = mouth_grid(0.0)
    opened, _, _ = mouth_grid(1.0)
    idx = g.add(pts, faces, cols, [hd] * len(pts), MAT_FUR)
    for i, p in zip(idx, opened):
        keys["smile"][i] = p
    return keys


# ---------------------------------------------------------------- Blender-objektumok


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 0, 48
    return scene


def make_materials():
    mats = []
    for name, rough, emit in (("Bunda", 0.85, 0.0), ("Szem", 0.12, 0.0), ("Csillogas", 0.4, 1.0)):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = 0.0
        if emit > 0.0:
            bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
            bsdf.inputs["Emission Color"].default_value = (1.0, 1.0, 1.0, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emit
        else:
            attr = nt.nodes.new("ShaderNodeVertexColor")
            attr.layer_name = "Col"
            nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
        mats.append(m)
    return mats


def make_mesh_object(name, g, mats, mat_indices):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in g.verts], [], g.faces)
    used = sorted(set(g.mats))
    remap = {m: i for i, m in enumerate(used)}
    for m in used:
        mesh.materials.append(mats[m])
    for poly, m in zip(mesh.polygons, g.mats):
        poly.material_index = remap[m]
        poly.use_smooth = True
    col = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    for i, c in enumerate(g.cols):
        col.data[i].color = (c[0], c[1], c[2], 1.0)
    mesh.color_attributes.active_color = col
    mesh.color_attributes.render_color_index = 0
    mesh.update()
    mesh.validate()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    groups = {}
    for i, w in enumerate(g.weights):
        total = sum(x for x in w.values() if x > 1e-4)
        for bone, x in w.items():
            if x <= 1e-4:
                continue
            if bone not in groups:
                groups[bone] = obj.vertex_groups.new(name=bone)
            groups[bone].add([i], x / total, "REPLACE")
    return obj


def bone_table():
    """(név, fej, farokvég, szülő) — a sorrend adja a hierarchiát."""
    rows = [
        ("root", (0, 0, 0), (0, 0, 0.10), None),
        ("hips", (0, 0.02, 0.17), (0, 0.02, 0.27), "root"),
        ("spine", (0, 0.02, 0.27), (0, 0.02, 0.36), "hips"),
        ("chest", (0, 0.02, 0.36), (0, 0.02, 0.46), "spine"),
        ("head", (0, 0.01, 0.46), (0, 0.01, 0.80), "chest"),
    ]
    for side, sfx in ((1.0, "L"), (-1.0, "R")):
        rows.append(("ear." + sfx, tuple(HC + Vector((0.20 * side, 0.02, 0.17))), tuple(HC + Vector((0.31 * side, 0.02, 0.34))), "head"))
        rows.append(("arm." + sfx, tuple(mirror(SHOULDER, side)), tuple(mirror(ELBOW, side)), "chest"))
        rows.append(("forearm." + sfx, tuple(mirror(ELBOW, side)), tuple(mirror(HAND, side) + Vector((0.01 * side, -0.015, -0.04))), "arm." + sfx))
        rows.append(("leg." + sfx, tuple(mirror(HIP, side)), tuple(mirror(ANKLE, side)), "hips"))
        rows.append(("foot." + sfx, tuple(mirror(ANKLE, side)), tuple(mirror(TOE, side)), "leg." + sfx))
    joints, _ = catmull(TAIL_PTS, TAIL_BONES)
    for i in range(TAIL_BONES):
        rows.append(("tail%d" % (i + 1), tuple(joints[i]), tuple(joints[i + 1]), "hips" if i == 0 else "tail%d" % i))
    return rows


def make_armature():
    data = bpy.data.armatures.new("MakiCsontvaz")
    arm = bpy.data.objects.new("MakiCsontvaz", data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent in bone_table():
        b = data.edit_bones.new(name)
        b.head, b.tail = Vector(head), Vector(tail)
        b.roll = 0.0
        if parent:
            b.parent = data.edit_bones[parent]
            b.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return arm


def bind(obj, arm):
    obj.parent = arm
    mod = obj.modifiers.new("Csontvaz", "ARMATURE")
    mod.object = arm


def build_all():
    """Tiszta jelenetben felépíti a figurát. Vissza: dict(scene, arm, body, face, tris)."""
    scene = reset_scene()
    mats = make_materials()
    arm = make_armature()

    g = Geo()
    build_body(g)
    body = make_mesh_object("Maki", g, mats, None)
    bind(body, arm)

    gf = Geo()
    keys = build_face(gf)
    face = make_mesh_object("MakiArc", gf, mats, None)
    face.shape_key_add(name="Basis")
    for key_name in ("blink", "smile"):
        sk = face.shape_key_add(name=key_name)
        for i, p in keys[key_name].items():
            sk.data[i].co = p
        sk.slider_min = -1.0   # a „smile” negatív értéke lefelé görbülő (szomorú) szájat ad
        sk.value = 0.0
    bind(face, arm)

    tris = sum(len(p.vertices) - 2 for o in (body, face) for p in o.data.polygons)
    return {"scene": scene, "arm": arm, "body": body, "face": face, "tris": tris}
