# A Websuli makija — a figura hálója, anyagai, csontváza, súlyai és alakkulcsai.
# Terv: docs/specs/2026-11-18-kabala-maki.md, 7. szakasz (második változat: élethűbb gyűrűsfarkú maki, összefüggő háló).
# Minden eljárással készül: nincs külső fájl, nincs véletlen. Blenderben a figura a −Y irányba néz, Z a „fel”.
#
# Felépítés:
#   1. „puha” alapformák (fej, pofa, fül, pofaszőr, nyak, törzs, végtagok, faroktő) címkével, képletes színnel és súllyal;
#   2. ezekből voxel-remesh → simítás → decimálás: EGY összefüggő háló, varrat nélkül;
#   3. a címke, a szín és a súly a legközelebbi alapforma-csúcsokról kerül át az új hálóra (KD-fa);
#   4. az arc festett textúrát kap (éles foltszélek), a többi csúcsszínt;
#   5. „kemény”, pontos paraméteres részek: szem, orr, gyűrűs farok; külön alakkulcsos arc-háló (szemhéj, pillaív, száj).

import math

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

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


GREY = srgb("#87868d")        # hát, végtagok külseje (határozott, enyhén meleg szürke)
CAP = srgb("#77777f")         # fejtető-„sapka”, tarkó
WHITE_FUR = srgb("#fbf8f1")   # arc, has, mellkas
PATCH = srgb("#25242a")       # szem körüli folt
MUZZLE = srgb("#3a3940")      # orrtájék
LID = srgb("#5a5961")         # szemhéj
LASH = srgb("#0e0d10")        # pillaív
PAW = srgb("#3b3b43")         # kéz, láb
RING_DARK = srgb("#24242a")   # farokgyűrű
NOSE = srgb("#1b1a1f")
BLUSH = srgb("#f6b1b3")
EAR_IN = srgb("#cdb9b8")      # a fül belseje
PUPIL = srgb("#15100d")
IRIS = srgb("#f29a24")
IRIS_RIM = srgb("#8a4812")
MOUTH = srgb("#5e2532")
TONGUE = srgb("#f58fa0")
WHITE = (1.0, 1.0, 1.0)

MAT_FUR, MAT_EYE, MAT_SHINE, MAT_FACE = 0, 1, 2, 3
TEX_SIZE = 512
UV_POW = 0.8                 # az arc felé több textúra-felbontás

# ---------------------------------------------------------------- méretek (méter; a figura füllel ~1,15, farokkal ~1,3 magas)

HC = Vector((0.0, 0.0, 0.875))          # a fej közepe
HR = Vector((0.235, 0.215, 0.205))      # a fej sugarai  → fej : test magasság ≈ 1 : 1,63
SNOUT_A = HC + Vector((0.0, -0.100, -0.034))
SNOUT_B = HC + Vector((0.0, -0.326, -0.082))
NOSE_C = HC + Vector((0.0, -0.320, -0.060))
EYE_R = Vector((0.070, 0.074, 0.045))   # helyi: x jobbra, y fel, z előre (a pólus)
EYE_DIR_X = 0.50
EYE_UP = 0.13

BODY_C = Vector((0.0, 0.015, 0.470))
BODY_R = Vector((0.158, 0.138, 0.218))

SHOULDER = Vector((0.138, 0.0, 0.610))
ELBOW = Vector((0.252, -0.020, 0.500))
HAND = Vector((0.292, -0.075, 0.386))
HIP = Vector((0.098, 0.0, 0.310))
KNEE = Vector((0.116, -0.040, 0.185))
ANKLE = Vector((0.116, 0.0, 0.062))
TOE = Vector((0.120, -0.185, 0.032))

TAIL_PTS = [
    Vector((0.00, 0.100, 0.320)), Vector((0.10, 0.300, 0.265)), Vector((0.30, 0.390, 0.340)),
    Vector((0.45, 0.350, 0.620)), Vector((0.485, 0.290, 0.950)), Vector((0.43, 0.210, 1.250)),
    Vector((0.305, 0.130, 1.410)), Vector((0.175, 0.085, 1.370)), Vector((0.150, 0.080, 1.245)),
]
TAIL_BONES = 8
TAIL_BANDS = 14              # váltakozó világos–sötét; az utolsó (a farokvég) sötét
SOFT_TRIS = 19000            # az összefüggő háló cél-háromszögszáma
VOXEL = 0.0085


def mirror(v, side):
    return Vector((v.x * side, v.y, v.z))


# ---------------------------------------------------------------- geometria-gyűjtő és alapformák


class Geo:
    def __init__(self):
        self.verts, self.faces, self.cols, self.weights, self.mats, self.tags, self.uvs = [], [], [], [], [], [], []

    def add(self, verts, faces, cols, weights, mat, tag="body", uvs=None):
        off = len(self.verts)
        self.verts.extend(verts)
        self.cols.extend(cols)
        self.weights.extend(weights)
        self.tags.extend([tag] * len(verts))
        self.uvs.extend(uvs if uvs is not None else [(0.0, 0.0)] * len(verts))
        for f in faces:
            self.faces.append(tuple(i + off for i in f))
            self.mats.append(mat)
        return range(off, off + len(verts))


def sphere(center, radii, nu, nv, rot=None, deform=None, ring_pow=1.0):
    """UV-gömb; a pólus a helyi Z; ring_pow > 1 a +Z pólus felé sűríti a gyűrűket. Vissza: (világ-pontok, lapok, helyi egységvektorok)."""
    rot = rot or Matrix.Identity(3)
    units = [Vector((0.0, 0.0, 1.0))]
    for k in range(1, nv):
        th = math.pi * (k / nv) ** ring_pow
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


def catmull_at(points, t):
    """Catmull–Rom görbe pontja, t ∈ [0, 1] (egyenletes paraméter)."""
    pts = [points[0]] + list(points) + [points[-1]]
    segs = len(points) - 1
    g = max(0.0, min(1.0, t)) * segs
    i = min(int(g), segs - 1)
    u = g - i
    p0, p1, p2, p3 = pts[i], pts[i + 1], pts[i + 2], pts[i + 3]
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u)


_TAIL_LUT = []


def tail_at(t):
    """A farok pályájának pontja ÍVHOSSZ szerint (t ∈ [0, 1]): egyenlő hosszú gyűrűk és csontok."""
    if not _TAIL_LUT:
        n = 800
        pts = [catmull_at(TAIL_PTS, i / n) for i in range(n + 1)]
        acc = [0.0]
        for i in range(n):
            acc.append(acc[-1] + (pts[i + 1] - pts[i]).length)
        _TAIL_LUT.extend((pts, acc))
    pts, acc = _TAIL_LUT
    target = max(0.0, min(1.0, t)) * acc[-1]
    lo, hi = 0, len(acc) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if acc[mid] <= target:
            lo = mid
        else:
            hi = mid
    span = acc[hi] - acc[lo]
    return pts[lo].lerp(pts[hi], (target - acc[lo]) / span if span > 1e-12 else 0.0)


def catmull(points, samples):
    ts = [s / samples for s in range(samples + 1)]
    return [catmull_at(points, t) for t in ts], ts


def tube(path, radii, sides):
    """Cső a pontsor mentén (párhuzamosan vitt kerettel), lezárva. A radii eleme szám vagy oldalankénti lista.
    Vissza: (pontok, lapok, gyűrű-index csúcsonként)."""
    n = len(path)
    tangents = []
    for i in range(n):
        a, b = path[max(i - 1, 0)], path[min(i + 1, n - 1)]
        d = b - a
        tangents.append(d.normalized() if d.length > 1e-9 else tangents[-1])
    ref = Vector((1.0, 0.0, 0.0)) if abs(tangents[0].x) < 0.9 else Vector((0.0, 1.0, 0.0))
    normal = (ref - tangents[0] * ref.dot(tangents[0])).normalized()
    verts, ring_of, faces = [], [], []
    for i in range(n):
        t = tangents[i]
        normal = (normal - t * normal.dot(t)).normalized()
        binormal = t.cross(normal)
        for j in range(sides):
            a = 2.0 * math.pi * j / sides
            r = radii[i][j] if isinstance(radii[i], (list, tuple)) else radii[i]
            verts.append(path[i] + (normal * math.cos(a) + binormal * math.sin(a)) * r)
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


def frame(axis):
    """Forgatás, amely a helyi Z-t az adott irányba viszi (a helyi X vízszintes marad)."""
    ez = Vector(axis).normalized()
    ref = Vector((0.0, 0.0, 1.0)) if abs(ez.z) < 0.95 else Vector((0.0, 1.0, 0.0))
    ex = ref.cross(ez).normalized()
    ey = ez.cross(ex).normalized()
    return Matrix((ex, ey, ez)).transposed()


# ---------------------------------------------------------------- a szem kerete


def eye_frame(side):
    """A szem közepe és helyi tengelyei (oszlopok: jobbra, fel, előre)."""
    e = Vector((EYE_DIR_X * side, -1.0, EYE_UP)).normalized()
    surface = HC + Vector((HR.x * e.x, HR.y * e.y, HR.z * e.z))
    axis = (e * 0.40 + Vector((0.0, -1.0, 0.0)) * 0.60).normalized()
    center = surface - axis * 0.020
    ex = Vector((0.0, 0.0, 1.0)).cross(axis).normalized()
    ey = axis.cross(ex).normalized()
    return center, Matrix((ex, ey, axis)).transposed()


def angles_of(v):
    """Irány a fej közepéből → (oldalszög, emelkedés) fokban; az oldalszög +X felé pozitív, 0 = előre."""
    d = (Vector(v) - HC).normalized()
    return math.degrees(math.atan2(d.x, -d.y)), math.degrees(math.asin(max(-1.0, min(1.0, d.z))))


# ---------------------------------------------------------------- az arc festése (irány → szín), numpy-val


def nstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def nmix(a, b, t):
    return a * (1.0 - t[..., None]) + np.asarray(b) * t[..., None]


def face_paint(dirs):
    """dirs: (N, 3) egységvektor a fej közepéből. Vissza: (N, 3) lineáris RGB. A gyűrűsfarkú maki arca:
    fehér arc, sötétszürke sapka homlokcsúccsal, kifelé-lefelé nyúló sötét szemfolt, sötét orrtájék, halvány pír."""
    az = np.degrees(np.arctan2(dirs[:, 0], -dirs[:, 1]))
    el = np.degrees(np.arcsin(np.clip(dirs[:, 2], -1.0, 1.0)))
    aaz = np.abs(az)
    col = nmix(np.tile(np.asarray(GREY), (len(az), 1)), CAP, nstep(8.0, 42.0, el))

    # fehér arc: széles a pofánál, fölfelé szűkül; a szemöldökvonal a homlok közepén csúcsban lenyúlik
    half = 82.0 - 20.0 * nstep(0.0, 40.0, el)
    brow = 17.0 + 24.0 * nstep(5.0, 24.0, aaz) - 14.0 * nstep(50.0, 82.0, aaz)
    s = np.minimum(np.minimum(half - aaz, brow - el), el + 78.0)
    col = nmix(col, WHITE_FUR, nstep(-0.9, 0.9, s))

    eaz, eel = angles_of(eye_frame(1.0)[0])
    for side in (-1.0, 1.0):
        out = side * az - eaz                     # kifelé pozitív
        up = el - eel
        ca, sa = math.cos(math.radians(30.0)), math.sin(math.radians(30.0))
        along = out * ca - up * sa - 3.0          # a csepp tengelye kifelé-lefelé mutat
        across = out * sa + up * ca
        rl = np.where(along > 0.0, 26.0, 22.0)
        rs = 22.0 * (1.0 - 0.30 * nstep(0.0, 26.0, along))
        d = np.sqrt((along / rl) ** 2 + (across / rs) ** 2)
        col = nmix(col, PATCH, 1.0 - nstep(0.965, 1.035, d))
        b = np.sqrt(((out - 23.0) / 11.0) ** 2 + ((up + 27.0) / 8.0) ** 2)
        col = nmix(col, BLUSH, (1.0 - nstep(0.3, 1.0, b)) * 0.55)

    naz, nel = angles_of(NOSE_C)
    # az orr töve: az orr SAJÁT színe, pontosan az orr alá festve — az orr így a pofa végéből nő ki
    # (korábban itt egy nagyobb, szürke folt volt az orr mögött: attól látszott úgy, mintha az orr a levegőben lógna)
    m = np.sqrt((az / 5.6) ** 2 + ((el - nel - 0.4) / 4.6) ** 2)
    col = nmix(col, NOSE, 1.0 - nstep(0.93, 1.05, m))
    return col


def dir_to_uv(d):
    th = math.acos(max(-1.0, min(1.0, -d.y)))
    rho = (th / math.pi) ** UV_POW
    ph = math.atan2(d.z, d.x)
    return (0.5 + 0.5 * rho * math.cos(ph), 0.5 + 0.5 * rho * math.sin(ph)), th


def make_face_texture():
    n = TEX_SIZE
    xs = (np.arange(n) + 0.5) / n * 2.0 - 1.0
    gx, gy = np.meshgrid(xs, xs)                  # sor = v (alulról), oszlop = u
    rho = np.clip(np.sqrt(gx * gx + gy * gy), 0.0, 1.0)
    th = np.pi * rho ** (1.0 / UV_POW)
    ph = np.arctan2(gy, gx)
    dirs = np.stack([np.sin(th) * np.cos(ph), -np.cos(th), np.sin(th) * np.sin(ph)], axis=-1).reshape(-1, 3)
    lin = np.clip(face_paint(dirs), 0.0, 1.0)
    enc = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1.0 / 2.4) - 0.055)
    enc = np.round(enc * 255.0) / 255.0           # 8 bitre kerekítve: a mentett PNG bájtra megismételhető
    rgba = np.concatenate([enc, np.ones((n * n, 1))], axis=1).astype(np.float32)
    img = bpy.data.images.new("MakiArcfestes", n, n, alpha=False)
    img.pixels.foreach_set(rgba.reshape(-1))
    img.pack()
    return img


# ---------------------------------------------------------------- 1. puha alapformák


def limb_color(direction, side, t_dark):
    """Végtag: kívül szürke, a test felé eső belső oldalon világos; a vége (kéz / láb) sötét."""
    inner = sstep(0.50, 0.95, direction.dot(Vector((-side, -0.35, 0.0)).normalized()))
    return mix(mix(GREY, WHITE_FUR, inner * 0.45), PAW, t_dark)


def build_soft(g):
    hd = {"head": 1.0}

    # fej + megnyúlt, rókaszerű pofa (a színt később a festés adja; itt csak jelző)
    v, f, units = sphere(HC, HR, 40, 28)
    g.add(v, f, [WHITE_FUR] * len(v), [hd] * len(v), MAT_FUR, "head")
    n = 12
    path = [SNOUT_A.lerp(SNOUT_B, i / n) for i in range(n + 1)]
    radii = []
    for i in range(n + 1):
        s = i / n
        r = 0.128 + (0.052 - 0.128) * s ** 0.85
        radii.append(r * (math.sqrt(max(0.0, 1.0 - sstep(0.88, 1.0, s) ** 2)) * 0.9 + 0.1))
    path = [p + Vector((0.0, 0.0, -0.012 * math.sin(math.pi * i / n))) for i, p in enumerate(path)]
    v, f, ring_of = tube(path, radii, 20)
    g.add(v, f, [WHITE_FUR] * len(v), [hd] * len(v), MAT_FUR, "head")

    # pofaszőr: három-három kifelé-lefelé-hátra ívelő tincs; az összeolvasztás után „tépett” körvonalat ad
    for side in (-1.0, 1.0):
        for el, ln, r0, back in ((4.0, 0.075, 0.060, 0.18), (-16.0, 0.100, 0.068, 0.24), (-36.0, 0.090, 0.064, 0.30), (-54.0, 0.060, 0.052, 0.34)):
            a = math.radians(el)
            d = Vector((math.cos(a) * 0.96 * side, -0.16, math.sin(a))).normalized()
            start = HC + Vector((HR.x * d.x, HR.y * d.y, HR.z * d.z)) * 0.80
            aim = Vector((0.90 * side, back, -0.16 + math.sin(a) * 0.55)).normalized()
            path, radii = [], []
            for i in range(9):
                s = i / 8.0
                path.append(start + aim * (ln * s) + Vector((0.0, 0.02 * s * s, -0.012 * s * s)))
                radii.append(r0 * (1.0 - s) ** 0.75 + 0.008)
            v, f, ring_of = tube(path, radii, 12)
            g.add(v, f, [WHITE_FUR] * len(v), [hd] * len(v), MAT_FUR, "head")

    # fül: felálló, fölfelé hegyesedő; a belseje és a pereme fehér szőr
    for side, bone in ((1.0, "ear.L"), (-1.0, "ear.R")):
        def pointed(local, u):
            k = 1.0 - 0.50 * sstep(0.0, 1.0, u.z) ** 1.4
            return Vector((local.x * k, local.y * (0.6 + 0.4 * k), local.z))

        c = HC + Vector((0.165 * side, 0.025, 0.200))
        rot = Matrix.Rotation(math.radians(-24.0 * side), 3, "Y")
        v, f, units = sphere(c, Vector((0.078, 0.036, 0.112)), 22, 16, rot, deform=pointed)
        cols, ws = [], []
        for u in units:
            front = sstep(-0.25, 0.15, -u.y)
            inner = (1.0 - sstep(0.30, 0.62, math.hypot(u.x, u.z + 0.05))) * sstep(0.2, 0.6, -u.y)
            col = mix(CAP, WHITE_FUR, front)
            cols.append(mix(col, EAR_IN, inner))
            w = sstep(-0.5, 0.3, u.z)
            ws.append({bone: w, "head": 1.0 - w})
        g.add(v, f, cols, ws, MAT_FUR, "ear")

    # nyak
    v, f, units = sphere(Vector((0.0, 0.005, 0.672)), Vector((0.112, 0.100, 0.080)), 18, 12)
    cols = [mix(GREY, WHITE_FUR, sstep(0.35, 0.80, -u.y)) for u in units]
    g.add(v, f, cols, [{"chest": 0.5, "head": 0.5}] * len(v), MAT_FUR)

    # törzs: karcsú körte; fehér has és mellkas
    def pear(local, u):
        s = 1.0 + 0.16 * max(0.0, -u.z)
        return Vector((local.x * s, local.y * s, local.z))

    v, f, units = sphere(BODY_C, BODY_R, 28, 20, deform=pear)
    cols, ws = [], []
    for p, u in zip(v, units):
        belly = 1.0 - ((u.x / 0.60) ** 2 + ((u.z - 0.05) / 1.05) ** 2)
        cols.append(mix(GREY, WHITE_FUR, sstep(-0.10, 0.10, belly) * sstep(0.0, 0.3, -u.y)))
        t = (p.z - 0.26) / 0.40
        chest = sstep(0.55, 0.85, t)
        hips = 1.0 - sstep(0.15, 0.45, t)
        ws.append({"hips": hips, "chest": chest, "spine": max(0.0, 1.0 - hips - chest)})
    g.add(v, f, cols, ws, MAT_FUR)
    # bolyhos fehér mellkas
    v, f, units = sphere(Vector((0.0, -0.066, 0.560)), Vector((0.090, 0.060, 0.115)), 16, 10)
    g.add(v, f, [WHITE_FUR] * len(v), [{"chest": 1.0}] * len(v), MAT_FUR)
    # faroktő
    v, f, units = sphere(Vector((0.0, 0.100, 0.315)), Vector((0.100, 0.085, 0.090)), 14, 10)
    g.add(v, f, [GREY] * len(v), [{"hips": 1.0}] * len(v), MAT_FUR)

    # karok: karcsú, a vállnál a törzsbe olvad (a kézfej külön, pontos rész: build_hard)
    for side, sfx in ((1.0, "L"), (-1.0, "R")):
        pts = [mirror(SHOULDER, side) + Vector((-0.045 * side, 0.0, -0.005)), mirror(ELBOW, side), mirror(HAND, side)]
        v, f, units = sphere(mirror(SHOULDER, side) + Vector((-0.012 * side, 0.0, -0.012)), Vector((0.062, 0.060, 0.062)), 14, 10)
        g.add(v, f, [limb_color(u, side, 0.0) for u in units], [{"arm." + sfx: 0.5, "chest": 0.5}] * len(v), MAT_FUR)
        path, ts = catmull(pts, 14)
        radii = [0.046 + 0.012 * (1.0 - sstep(0.0, 0.30, t)) - 0.004 * t for t in ts]
        v, f, ring_of = tube(path, radii, 14)
        cols, ws = [], []
        for p, r in zip(v, ring_of):
            w = sstep(0.38, 0.62, ts[r])
            root = 1.0 - sstep(0.0, 0.16, ts[r])
            ws.append({"arm." + sfx: (1.0 - w) * (1.0 - 0.5 * root), "forearm." + sfx: w, "chest": 0.5 * root})
            direction = (p - path[r])
            cols.append(limb_color(direction.normalized() if direction.length > 1e-6 else Vector((side, 0, 0)), side, sstep(0.80, 0.95, ts[r])))
        g.add(v, f, cols, ws, MAT_FUR)

    # hátsó láb: erős comb, karcsúbb lábszár (a lábfej külön, pontos rész: build_hard)
    for side, sfx in ((1.0, "L"), (-1.0, "R")):
        c = Vector((0.098 * side, 0.0, 0.275))
        v, f, units = sphere(c, Vector((0.092, 0.104, 0.128)), 18, 14)
        cols, ws = [], []
        for u in units:
            cols.append(limb_color(u, side, 0.0))
            w = 1.0 - 0.75 * sstep(-0.2, 0.8, u.z)
            ws.append({"thigh." + sfx: w, "hips": 1.0 - w})
        g.add(v, f, cols, ws, MAT_FUR)
        pts = [mirror(KNEE, side) + Vector((0.0, 0.01, 0.03)), mirror(KNEE, side), mirror(ANKLE, side)]
        path, ts = catmull(pts, 10)
        radii = [0.064 - 0.014 * t for t in ts]
        v, f, ring_of = tube(path, radii, 12)
        cols, ws = [], []
        for p, r in zip(v, ring_of):
            w = sstep(0.05, 0.40, ts[r])
            ws.append({"thigh." + sfx: 1.0 - w, "shin." + sfx: w})
            direction = (p - path[r])
            cols.append(limb_color(direction.normalized() if direction.length > 1e-6 else Vector((side, 0, 0)), side, sstep(0.72, 0.95, ts[r])))
        g.add(v, f, cols, ws, MAT_FUR)


# ---------------------------------------------------------------- 2–3. összeolvasztás és adatátvitel


def remesh(g, target_tris):
    """Az alapformákból egy összefüggő háló: voxel-remesh → simítás → decimálás. Vissza: (pontok, háromszögek)."""
    mesh = bpy.data.meshes.new("MakiAlap")
    mesh.from_pydata([tuple(v) for v in g.verts], [], g.faces)
    mesh.update()
    obj = bpy.data.objects.new("MakiAlap", mesh)
    bpy.context.scene.collection.objects.link(obj)
    rm = obj.modifiers.new("Remesh", "REMESH")
    rm.mode = "VOXEL"
    rm.voxel_size = VOXEL
    rm.adaptivity = 0.0
    sm = obj.modifiers.new("Smooth", "SMOOTH")
    sm.factor = 0.5
    sm.iterations = 7
    bpy.context.view_layer.update()

    def evaluated():
        dg = bpy.context.evaluated_depsgraph_get()
        dg.update()
        return bpy.data.meshes.new_from_object(obj.evaluated_get(dg))

    full = evaluated()
    count = sum(len(p.vertices) - 2 for p in full.polygons)
    bpy.data.meshes.remove(full)
    dec = obj.modifiers.new("Decimate", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = min(1.0, target_tris / max(1, count))
    dec.use_collapse_triangulate = True
    out = evaluated()
    verts = [v.co.copy() for v in out.vertices]
    faces = []
    for p in out.polygons:
        idx = list(p.vertices)
        for k in range(1, len(idx) - 1):
            faces.append((idx[0], idx[k], idx[k + 1]))
    bpy.data.meshes.remove(out)
    bpy.data.objects.remove(obj)
    bpy.data.meshes.remove(mesh)
    return verts, faces


def transfer(src, verts):
    """Címke, szín és súly a legközelebbi alapforma-csúcsokról (távolsággal súlyozva, legfeljebb 4 csont)."""
    tree = KDTree(len(src.verts))
    for i, v in enumerate(src.verts):
        tree.insert(v, i)
    tree.balance()
    tags, cols, weights = [], [], []
    for v in verts:
        near = tree.find_n(v, 4)
        tags.append(src.tags[near[0][1]])
        total, col, acc = 0.0, [0.0, 0.0, 0.0], {}
        for _co, i, dist in near:
            w = 1.0 / (dist + 0.002) ** 2
            if src.tags[i] == tags[-1]:      # szín csak azonos címkéjű forrásból (a fej jelzőszíne ne szivárogjon a nyakra)
                total += w
                for c in range(3):
                    col[c] += src.cols[i][c] * w
            for bone, x in src.weights[i].items():
                acc[bone] = acc.get(bone, 0.0) + x * w
        cols.append(tuple(c / total for c in col))
        top = sorted(acc.items(), key=lambda kv: (-kv[1], kv[0]))[:4]
        norm = sum(x for _b, x in top)
        weights.append({b: x / norm for b, x in top})
    return tags, cols, weights


def relax(verts, faces, tags, weights):
    """Célzott simítás a kész hálón: Taubin-simítás (zsugorodás nélkül) a testen és a fej hátulján — az arc és a fül
    érintetlen —, valamint a csontsúlyok lágyítása a testen (puhább csípő, térd, váll)."""
    n = len(verts)
    sets = [set() for _ in range(n)]
    for a, b, c in faces:
        sets[a].update((b, c))
        sets[b].update((a, c))
        sets[c].update((a, b))
    nbr = [sorted(x) for x in sets]
    strength = []
    for i, v in enumerate(verts):
        if tags[i] == "body":
            strength.append(1.0)
        elif tags[i] == "head":
            strength.append(sstep(0.10, 0.50, (v - HC).normalized().y))     # csak a fej hátulja
        else:
            strength.append(0.0)
    pts = [v.copy() for v in verts]
    for _ in range(26):
        for lam in (0.60, -0.62):
            nxt = []
            for i in range(n):
                k = strength[i]
                if k <= 0.0 or not nbr[i]:
                    nxt.append(pts[i])
                    continue
                avg = Vector((0.0, 0.0, 0.0))
                for j in nbr[i]:
                    avg += pts[j]
                avg /= len(nbr[i])
                nxt.append(pts[i] + (avg - pts[i]) * (lam * k))
            pts = nxt
    for _ in range(5):
        nxt = []
        for i in range(n):
            if tags[i] != "body" or not nbr[i]:
                nxt.append(weights[i])
                continue
            acc = {b: x * 0.5 for b, x in weights[i].items()}
            share = 0.5 / len(nbr[i])
            for j in nbr[i]:
                for b, x in weights[j].items():
                    acc[b] = acc.get(b, 0.0) + x * share
            top = sorted(acc.items(), key=lambda kv: (-kv[1], kv[0]))[:4]
            norm = sum(x for _b, x in top)
            nxt.append({b: x / norm for b, x in top})
        weights = nxt
    return pts, weights


def build_skin(g):
    """A puha részekből az összefüggő, színezett, súlyozott háló → g-be. Vissza: BVH-fa (a száj vetítéséhez)."""
    src = Geo()
    build_soft(src)
    verts, faces = remesh(src, SOFT_TRIS)
    tags, cols, weights = transfer(src, verts)
    verts, weights = relax(verts, faces, tags, weights)

    head_idx = [i for i, t in enumerate(tags) if t == "head"]
    dirs = np.array([tuple((verts[i] - HC).normalized()) for i in head_idx], dtype=np.float64)
    painted = face_paint(dirs)
    uvs = [(0.0, 0.0)] * len(verts)
    theta = [9.0] * len(verts)
    for k, i in enumerate(head_idx):
        cols[i] = tuple(float(c) for c in painted[k])
        uvs[i], theta[i] = dir_to_uv((verts[i] - HC).normalized())
    # a fül töve a fej festésének színét veszi át (különben a két anyag határa fogazott lenne)
    ear_idx = [i for i, t in enumerate(tags) if t == "ear"]
    if ear_idx:
        ear_paint = face_paint(np.array([tuple((verts[i] - HC).normalized()) for i in ear_idx], dtype=np.float64))
        for k, i in enumerate(ear_idx):
            rel = verts[i] - HC
            q = math.sqrt((rel.x / HR.x) ** 2 + (rel.y / HR.y) ** 2 + (rel.z / HR.z) ** 2)
            cols[i] = mix(tuple(float(c) for c in ear_paint[k]), cols[i], sstep(1.04, 1.22, q))

    off = len(g.verts)
    g.verts.extend(verts)
    g.cols.extend(cols)
    g.weights.extend(weights)
    g.tags.extend(tags)
    g.uvs.extend(uvs)
    for f in faces:
        textured = all(theta[i] < 2.55 for i in f)     # a tarkó (a vetítés szinguláris pontja) csúcsszínes marad
        g.faces.append(tuple(i + off for i in f))
        g.mats.append(MAT_FACE if textured else MAT_FUR)
    return BVHTree.FromPolygons([tuple(v) for v in verts], faces)


# ---------------------------------------------------------------- 5. kemény részek


def eye_color(u):
    th = math.acos(max(-1.0, min(1.0, u.z)))
    col = mix(PUPIL, IRIS_RIM, sstep(0.64, 0.72, th))
    col = mix(col, IRIS, sstep(0.70, 0.82, th) * (1.0 - sstep(1.04, 1.18, th)))
    col = mix(col, srgb("#ffd070"), sstep(0.78, 1.0, th) * (1.0 - sstep(1.0, 1.16, th)) * sstep(0.0, -0.8, u.y) * 0.6)
    col = mix(col, PUPIL, sstep(1.14, 1.24, th))
    return col


def tail_rings():
    """A farok mintavételi pontjai: sávonként 6 gyűrű, a sávhatáron két szorosan egymás melletti gyűrű → éles gyűrűszél."""
    out = []
    per = 6
    for band in range(TAIL_BANDS):
        for k in range(per):
            frac = 0.02 + 0.96 * k / (per - 1)
            out.append(((band + frac) / TAIL_BANDS, band, frac))
    return out


def digit(base, direction, length, radius, bend):
    """Egy ujj: rövid, lekerekített végű cső, enyhe hajlással."""
    path, radii = [], []
    for i in range(6):
        k = i / 5.0
        path.append(base + direction * (length * k) + bend * (k * k))
        radii.append(radius * (1.0 - 0.18 * k))
    path.append(base + direction * (length * 1.10) + bend * 1.15)
    radii.append(radius * 0.42)
    return tube(path, radii, 8)


def build_paws(g):
    """Kéz (tenyér + négy ujj + hüvelyk) és láb (talp + öt lábujj): sötét, jól olvasható ujjakkal."""
    for side, sfx in ((1.0, "L"), (-1.0, "R")):
        fw = {"forearm." + sfx: 1.0}
        wrist = mirror(HAND, side)
        d = (wrist - mirror(ELBOW, side)).normalized()
        across = d.cross(Vector((0.0, -1.0, 0.0))).normalized()
        fwd = across.cross(d).normalized()
        rot = Matrix((across, d.cross(across).normalized(), d)).transposed()
        palm = wrist + d * 0.020
        v, f, units = sphere(palm, Vector((0.041, 0.023, 0.040)), 14, 10, rot)
        g.add(v, f, [PAW] * len(v), [fw] * len(v), MAT_FUR, "paw")
        for off, ln in ((-0.028, 0.040), (-0.0095, 0.049), (0.0095, 0.050), (0.028, 0.043)):
            v, f, _ = digit(palm + d * 0.028 + across * off, (d + across * (off * 7.0)).normalized(), ln, 0.0125, fwd * 0.010)
            g.add(v, f, [PAW] * len(v), [fw] * len(v), MAT_FUR, "paw")
        inward = across * side                      # a test felé
        v, f, _ = digit(palm + inward * 0.030 + d * 0.004, (inward * 0.85 + d * 0.50).normalized(), 0.036, 0.0135, fwd * 0.008)
        g.add(v, f, [PAW] * len(v), [fw] * len(v), MAT_FUR, "paw")

        fw = {"foot." + sfx: 1.0}
        c = Vector((0.118 * side, -0.066, 0.036))
        v, f, units = sphere(c, Vector((0.058, 0.104, 0.036)), 16, 10)
        g.add(v, f, [PAW] * len(v), [fw] * len(v), MAT_FUR, "paw")
        for k, off in enumerate((-0.040, -0.020, 0.0, 0.020, 0.040)):
            big = 1.18 if off * side < -0.03 else 1.0       # a belső (nagy) lábujj vastagabb
            base = Vector((0.118 * side + off, -0.150 + 0.010 * abs(off) / 0.04, 0.026))
            v, f, _ = digit(base, Vector((off * 3.0, -1.0, -0.06)).normalized(), 0.046 - 0.006 * abs(off) / 0.04, 0.0145 * big, Vector((0.0, 0.0, -0.004)))
            g.add(v, f, [PAW] * len(v), [fw] * len(v), MAT_FUR, "paw")


def build_hard(g):
    hd = {"head": 1.0}
    build_paws(g)

    # orr
    v, f, units = sphere(NOSE_C, Vector((0.031, 0.027, 0.023)), 16, 10)
    g.add(v, f, [NOSE] * len(v), [hd] * len(v), MAT_EYE)

    # szemek
    for side in (-1.0, 1.0):
        c, rot = eye_frame(side)
        v, f, units = sphere(c, EYE_R, 24, 16, rot)
        g.add(v, f, [eye_color(u) for u in units], [hd] * len(v), MAT_EYE)

    # farok: hosszú, bozontos, 14 egyenlő gyűrű, fekete vég; a körvonalon gyűrűnként néhány puha tincs
    rings = tail_rings()
    sides = 14
    path, radii, ring_cols, ts = [], [], [], []
    for t, band, frac in rings:
        path.append(tail_at(t))
        ts.append(t)
        r = 0.049 + 0.013 * sstep(0.0, 0.20, t) - 0.007 * sstep(0.70, 1.0, t)
        r *= 1.0 + 0.15 * math.sin(math.pi * frac)
        if band == TAIL_BANDS - 1:
            r *= math.sqrt(max(0.0, 1.0 - sstep(0.35, 1.0, frac) ** 2)) * 0.97 + 0.03
        row = [r * (1.0 + 0.12 * math.sin(math.pi * frac) ** 2 * math.cos(5.0 * 2.0 * math.pi * j / sides + band * 1.7)) for j in range(sides)]
        radii.append(row)
        col = RING_DARK if band % 2 == 1 else WHITE_FUR
        ring_cols.append(mix(GREY, col, sstep(0.0, 0.03, t)))
    v, f, ring_of = tube(path, radii, sides)
    ws = []
    for r in ring_of:
        s = ts[r] * TAIL_BONES - 0.5
        i0 = max(0, min(TAIL_BONES - 2, int(math.floor(s))))
        fr = max(0.0, min(1.0, s - i0))
        fr = fr * fr * (3.0 - 2.0 * fr)
        ws.append({"tail%d" % (i0 + 1): 1.0 - fr, "tail%d" % (i0 + 2): fr})
    g.add(v, f, [ring_cols[r] for r in ring_of], ws, MAT_FUR, "tail")


# ---------------------------------------------------------------- alakkulcsos arc-rész

LID_OPEN_DEG = 66.0      # nyitva: a szemhéj a szem felső ívén áll (nem takar bele az íriszbe)
LID_TOP_DEG = 86.0
LID_BOTTOM_DEG = -58.0


def lid_grid(side, low_deg, nu=14, nv=7):
    c, rot = eye_frame(side)
    pts = []
    for iu in range(nu + 1):
        al = math.radians(-88.0 + 176.0 * iu / nu)
        for iv in range(nv + 1):
            ph = math.radians(LID_TOP_DEG + (low_deg - LID_TOP_DEG) * iv / nv)
            pts.append(c + rot @ Vector((EYE_R.x * 1.06 * math.sin(al),
                                         EYE_R.y * 1.06 * math.cos(al) * math.sin(ph),
                                         EYE_R.z * 1.16 * math.cos(al) * math.cos(ph))))
    faces = []
    for iu in range(nu):
        for iv in range(nv):
            a = iu * (nv + 1) + iv
            b = (iu + 1) * (nv + 1) + iv
            faces.append((a, a + 1, b + 1, b))
    return pts, faces


def lash_tube(side, deg, thick, n=14):
    """Pillaív: sötét cső a szemhéj alsó éle mentén (nyitva vékony szemkontúr, csukva jól látható, lefelé hajló ív)."""
    c, rot = eye_frame(side)
    ph = math.radians(deg)
    path, radii = [], []
    for i in range(n + 1):
        al = math.radians(-70.0 + 140.0 * i / n)
        path.append(c + rot @ Vector((EYE_R.x * 1.07 * math.sin(al),
                                      EYE_R.y * 1.07 * math.cos(al) * math.sin(ph),
                                      EYE_R.z * 1.22 * math.cos(al) * math.cos(ph))))
        radii.append(thick * math.sqrt(max(0.0, 1.0 - (2.0 * i / n - 1.0) ** 2)) + 0.0009)
    return tube(path, radii, 6)


MOUTH_Z = HC.z - 0.104


def mouth_grid(bvh, smile, nu=16, nv=5):
    """A száj lapja a kész háló felszínére vetítve; smile=0: vékony mosolyvonal, smile=1: nyitott, nevető száj."""
    width = 0.027 + 0.011 * smile
    lift = 0.010 + 0.010 * smile
    depth = 0.0065 + 0.024 * smile

    def front_y(x, z):
        hit = bvh.ray_cast(Vector((x, -2.0, z)), Vector((0.0, 1.0, 0.0)))
        return hit[0].y if hit[0] is not None else None

    pts = []
    for iu in range(nu + 1):
        u = -1.0 + 2.0 * iu / nu
        x = u * width
        top = MOUTH_Z + lift * u * u + 0.003 * smile
        th = depth * max(0.0, 1.0 - u * u) ** 0.6
        y_top = front_y(x, top)
        if y_top is None:
            y_top = SNOUT_B.y
        for iv in range(nv + 1):
            z = top - th * iv / nv
            y = front_y(x, z)
            y = y_top + 0.012 if y is None else min(y, y_top + 0.012)   # a pofa alá nem „esik le” a száj
            pts.append(Vector((x, y - 0.003, z)))
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


def build_face(g, bvh):
    """Az alakkulcsos rész. Vissza: {kulcsnév: {csúcsindex: cél-pont}}."""
    hd = {"head": 1.0}
    keys = {"blink": {}, "smile": {}}
    for side in (-1.0, 1.0):
        pts, faces = lid_grid(side, LID_OPEN_DEG)
        closed, _ = lid_grid(side, LID_BOTTOM_DEG)
        idx = g.add(pts, faces, [LID] * len(pts), [hd] * len(pts), MAT_FUR)
        for i, p in zip(idx, closed):
            keys["blink"][i] = p
        v, f, _ = lash_tube(side, LID_OPEN_DEG, 0.0026)
        closed_v, _, _ = lash_tube(side, LID_BOTTOM_DEG + 4.0, 0.0056)
        idx = g.add(v, f, [LASH] * len(v), [hd] * len(v), MAT_FUR)
        for i, p in zip(idx, closed_v):
            keys["blink"][i] = p
        # fénypontok: pislogáskor a szembe süllyednek
        c, rot = eye_frame(side)
        for (ox, oy, r) in ((-0.36, 0.40, 0.0190), (0.34, -0.36, 0.0090)):
            d = Vector((ox, oy, math.sqrt(max(0.0, 1.0 - ox * ox - oy * oy))))
            p = c + rot @ Vector((d.x * EYE_R.x, d.y * EYE_R.y, d.z * EYE_R.z * 1.02))
            v, f, units = sphere(p, Vector((r, r, r * 0.35)), 12, 6, rot)
            idx = g.add(v, f, [WHITE] * len(v), [hd] * len(v), MAT_SHINE)
            sink = rot @ Vector((0.0, 0.0, -0.020))
            for i, q in zip(idx, v):
                keys["blink"][i] = q + sink
    pts, faces, cols = mouth_grid(bvh, 0.0)
    opened, _, _ = mouth_grid(bvh, 1.0)
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
    for name, rough, emit in (("Bunda", 0.85, 0.0), ("Szem", 0.12, 0.0), ("Csillogas", 0.4, 1.0), ("Fej", 0.85, 0.0)):
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
        elif name == "Fej":
            tex = nt.nodes.new("ShaderNodeTexImage")
            tex.image = make_face_texture()
            tex.interpolation = "Linear"
            tex.extension = "EXTEND"
            nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        else:
            attr = nt.nodes.new("ShaderNodeVertexColor")
            attr.layer_name = "Col"
            nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
        mats.append(m)
    return mats


def make_mesh_object(name, g, mats):
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
    uv = mesh.uv_layers.new(name="UVMap")
    for loop in mesh.loops:
        uv.data[loop.index].uv = g.uvs[loop.vertex_index]
    mesh.update()
    mesh.validate()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    groups = {}
    for i, w in enumerate(g.weights):
        total = sum(x for x in w.values() if x > 1e-4)
        for bone, x in sorted(w.items()):
            if x <= 1e-4:
                continue
            if bone not in groups:
                groups[bone] = obj.vertex_groups.new(name=bone)
            groups[bone].add([i], x / total, "REPLACE")
    return obj


def bone_table():
    """(név, fej, farokvég, szülő) — a sorrend adja a hierarchiát. 25 csont."""
    rows = [
        ("root", (0, 0, 0), (0, 0, 0.10), None),
        ("hips", (0, 0.02, 0.30), (0, 0.02, 0.40), "root"),
        ("spine", (0, 0.02, 0.40), (0, 0.02, 0.52), "hips"),
        ("chest", (0, 0.02, 0.52), (0, 0.02, 0.66), "spine"),
        ("head", (0, 0.01, 0.67), (0, 0.01, 0.95), "chest"),
    ]
    for side, sfx in ((1.0, "L"), (-1.0, "R")):
        rows.append(("ear." + sfx, tuple(HC + Vector((0.13 * side, 0.02, 0.15))), tuple(HC + Vector((0.19 * side, 0.02, 0.30))), "head"))
        rows.append(("arm." + sfx, tuple(mirror(SHOULDER, side)), tuple(mirror(ELBOW, side)), "chest"))
        rows.append(("forearm." + sfx, tuple(mirror(ELBOW, side)), tuple(mirror(HAND, side) + Vector((0.008 * side, -0.012, -0.035))), "arm." + sfx))
        rows.append(("thigh." + sfx, tuple(mirror(HIP, side)), tuple(mirror(KNEE, side)), "hips"))
        rows.append(("shin." + sfx, tuple(mirror(KNEE, side)), tuple(mirror(ANKLE, side)), "thigh." + sfx))
        rows.append(("foot." + sfx, tuple(mirror(ANKLE, side)), tuple(mirror(TOE, side)), "shin." + sfx))
    joints = [tail_at(i / TAIL_BONES) for i in range(TAIL_BONES + 1)]
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

    g = Geo()
    bvh = build_skin(g)
    build_hard(g)
    gf = Geo()
    keys = build_face(gf, bvh)

    arm = make_armature()
    body = make_mesh_object("Maki", g, mats)
    bind(body, arm)
    face = make_mesh_object("MakiArc", gf, mats)
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
