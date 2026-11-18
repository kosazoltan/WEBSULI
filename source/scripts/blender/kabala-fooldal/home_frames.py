# A Websuli makija a főoldalon — képkockák renderelése (terv: docs/specs/2026-11-18-kabala-fooldal.md, 4. szakasz).
# Ezt a szkriptet a `source/scripts/blender/kabala-fooldal/build.mjs` indítja (Blender, fej nélkül); önállóan is futtatható:
#   "$BLENDER_BIN" -b --factory-startup -P source/scripts/blender/kabala-fooldal/home_frames.py -- --out <mappa> [--size 448] [--only idle,point]
# Bemenet: a kabala modellje és klipjei (`source/scripts/blender/kabala-maki/maki_model.py`, `maki_anim.py`) — importálva, nem másolva:
# a modell változása után az újrafuttatás az új figurát rendereli. Kimenet: <mappa>/<klip>-<sorszám>.png (átlátszó háttér) és
# <mappa>/frames.json (klipenként a képkockák, a sebesség, az ismétlődés és a lap által adott emelkedés). Gépfüggő útvonal és időbélyeg nincs benne.

import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MAKI_DIR = os.environ.get("KABALA_MAKI_DIR") or os.path.normpath(os.path.join(HERE, "..", "kabala-maki"))
sys.path.insert(0, MAKI_DIR)
sys.dont_write_bytecode = True   # ne keletkezzen __pycache__ a repóban

import bpy  # noqa: E402
from bpy_extras.object_utils import world_to_camera_view  # noqa: E402
from mathutils import Quaternion, Vector  # noqa: E402

import maki_anim  # noqa: E402
import maki_model  # noqa: E402

TAIL = range(2, 9)

# A kamera minden képkockán UGYANOTT áll: a képkockák így illeszkednek egymásra (nincs remegés), a közös kivágást a build.mjs számolja.
CAMERA = {"azimuth": -14.0, "elevation": 6.0, "distance": 7.4, "target": (0.10, 0.10, 0.82), "lens": 85.0}

# A gyári klipekből vett minták: (klip, képkockák). A `cheer` függőleges elmozdulását (ugrás) a lap CSS-e adja, ezért a csípő
# emelkedése a képkockákból kimarad (a guggolás benne marad) — így kisebb a cella, és az ugrás íve 60 képkocka/mp-es.
STOCK = {
    "idle": ("idle", list(range(0, 48, 6))),
    "wave": ("wave", list(range(0, 48, 4))),
    "cheer": ("cheer", list(range(0, 36, 4))),
}
# Lejátszás: név → (képkocka/mp, ismétlődik-e). A lap (manifest) innen kapja; a böngészőben nincs beégetve.
PLAY = {"idle": (4, True), "blink": (12, False), "wave": (8, False), "cheer": (6, False), "point-in": (10, False), "point": (5, True), "hop": (10, False)}
# A szökkenés íve méterben (a figura magasságához mérve); a `cheer` emelkedése a klipből jön.
HOP_LIFT = [0.0, 0.11, 0.15, 0.08, 0.0]


def sstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


def point_pose(arm, amount, bob):
    """A bal kar (a képen jobbra) az ajánlott tananyag felé mutat; a fej és a törzs arra fordul. `bob`: −1…1 apró bólogatás."""
    p = maki_anim.Pose(arm)
    p.aim("arm.L", (0.93, -0.30, -0.10), amount)
    p.aim("forearm.L", (0.96, -0.28, -0.04), amount).r("forearm.L", "Y", 7.0 * bob * amount)
    p.r("head", "Z", 16.0 * amount).r("head", "Y", 5.0 * amount).r("head", "X", 3.0 * bob * amount)
    p.r("chest", "Z", 6.0 * amount).r("chest", "Y", 3.0 * amount)
    p.r("ear.L", "Y", -6.0 * amount)
    p.aim("arm.R", (-0.42, -0.30, -0.85), 0.5 * amount)
    for i in TAIL:
        p.r("tail%d" % i, "Z", 5.0 * amount * math.sin(0.9 * i) + 3.0 * bob * amount)
    p.key("smile", 0.75 * amount)
    return p


def hop_pose(arm, crouch, air):
    """Szökkenés: `crouch` = guggolás (elrugaszkodás / érkezés), `air` = a levegőben. A helyváltoztatást a lap CSS-e adja."""
    p = maki_anim.Pose(arm)
    p.move("hips", (0.0, 0.0, -0.045 * crouch))
    for side, sfx in ((1.0, "L"), (-1.0, "R")):
        p.r("thigh." + sfx, "X", -24.0 * air - 22.0 * crouch).r("shin." + sfx, "X", 32.0 * air + 40.0 * crouch)
        p.r("foot." + sfx, "X", -18.0 * crouch + 14.0 * air)
        p.aim("arm." + sfx, (0.80 * side, -0.25, 0.25), 0.75 * air)
        p.aim("forearm." + sfx, (0.62 * side, -0.30, 0.66), 0.75 * air)
        p.r("ear." + sfx, "Y", -9.0 * side * air + 6.0 * side * crouch)
    p.r("head", "X", 7.0 * crouch - 7.0 * air).r("chest", "X", 6.0 * crouch - 3.0 * air)
    for i in TAIL:
        p.r("tail%d" % i, "X", 5.0 * crouch - 4.0 * air)
    p.key("smile", 0.9 * air + 0.3 * crouch)
    return p


def blink_pose(arm, closed):
    return maki_anim.Pose(arm).key("blink", closed)


# Saját (csak a főoldalon használt) mozdulatok: név → póz-függvények listája.
CUSTOM = {
    "blink": [lambda a: blink_pose(a, 0.55), lambda a: blink_pose(a, 1.0), lambda a: blink_pose(a, 0.55)],
    "point-in": [lambda a, t=t: point_pose(a, sstep(0.0, 1.0, t), 0.0) for t in (0.35, 0.72, 1.0)],
    "point": [lambda a, k=k: point_pose(a, 1.0, math.sin(2.0 * math.pi * k / 4.0)) for k in range(4)],
    "hop": [lambda a: hop_pose(a, 1.0, 0.0), lambda a: hop_pose(a, 0.0, 0.7), lambda a: hop_pose(a, 0.0, 1.0),
            lambda a: hop_pose(a, 0.0, 0.55), lambda a: hop_pose(a, 0.9, 0.0)],
}
ORDER = ["idle", "blink", "wave", "cheer", "point-in", "point", "hop"]


def args():
    extra = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out, size, only = None, 448, None
    for i, a in enumerate(extra):
        if a == "--out":
            out = extra[i + 1]
        if a == "--size":
            size = int(extra[i + 1])
        if a == "--only":
            only = set(extra[i + 1].split(","))
    if not out:
        raise SystemExit("Hiányzik: --out <mappa>")
    return os.path.abspath(out), size, only


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup(scene, size):
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "CYCLES"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    if scene.render.engine == "CYCLES":
        scene.cycles.samples = 48
        scene.cycles.use_denoising = True
    else:
        for attr, value in (("taa_render_samples", 64), ("use_raytracing", False)):
            if hasattr(scene.eevee, attr):
                setattr(scene.eevee, attr, value)
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 15
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.resolution_percentage = 100

    world = bpy.data.worlds.new("Hatter")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (*maki_model.srgb("#fff4dc"), 1.0)
    bg.inputs["Strength"].default_value = 0.62
    scene.world = world

    cam_data = bpy.data.cameras.new("Kamera")
    cam_data.lens = CAMERA["lens"]
    cam = bpy.data.objects.new("Kamera", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    az, el = math.radians(CAMERA["azimuth"]), math.radians(CAMERA["elevation"])
    target = Vector(CAMERA["target"])
    cam.location = target + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * CAMERA["distance"]
    look_at(cam, target)

    rig = bpy.data.objects.new("Fenyek", None)
    scene.collection.objects.link(rig)
    for name, pos, energy, lsize, color in (
        ("Fo", (-2.2, -3.2, 3.4), 190.0, 3.0, (1.0, 0.97, 0.92)),
        ("Derito", (3.0, -2.4, 1.6), 70.0, 4.0, (0.92, 0.96, 1.0)),
        ("Kontur", (1.0, 3.2, 2.8), 150.0, 2.0, (1.0, 1.0, 1.0)),
    ):
        light = bpy.data.lights.new(name, "AREA")
        light.energy, light.size, light.color = energy, lsize, color
        obj = bpy.data.objects.new(name, light)
        obj.location = pos
        obj.parent = rig
        scene.collection.objects.link(obj)
        look_at(obj, Vector((0.1, 0.0, 0.55)))
    rig.rotation_euler = (0.0, 0.0, az)
    bpy.context.view_layer.update()
    a = world_to_camera_view(scene, cam, target)
    b = world_to_camera_view(scene, cam, target + Vector((0.0, 0.0, 1.0)))
    return abs(b.y - a.y) * size   # képpont / méter a figura síkjában


def snapshot(arm, face):
    """A pillanatnyi póz csontonként (forgás, eltolás) és alakkulcsonként."""
    blocks = face.data.shape_keys.key_blocks
    return (
        {pb.name: (pb.rotation_quaternion.copy(), pb.location.copy()) for pb in arm.pose.bones},
        {name: blocks[name].value for name in ("blink", "smile")},
    )


def restore(arm, face, snap):
    bones, keys = snap
    for pb in arm.pose.bones:
        q, loc = bones[pb.name]
        pb.rotation_quaternion = q
        pb.location = loc
        pb.scale = Vector((1.0, 1.0, 1.0))
    blocks = face.data.shape_keys.key_blocks
    for name, value in keys.items():
        blocks[name].value = value
    bpy.context.view_layer.update()


def assign(anim_data, action):
    anim_data.action = action
    if action is not None and hasattr(anim_data, "action_slot") and anim_data.action_slot is None and len(getattr(action, "slots", [])):
        anim_data.action_slot = action.slots[0]


def sample_stock(scene, arm, face):
    """A gyári klipek pózai a klip SAJÁT görbéiből (ugyanaz az interpoláció, mint a GLB-ben), képkockánként rögzítve."""
    maki_anim.build_actions(arm, face)
    keys = face.data.shape_keys
    for owner in (arm, keys):
        for track in owner.animation_data.nla_tracks:
            track.mute = True
    out, lifts = {}, {}
    for name, (clip, frames) in STOCK.items():
        assign(arm.animation_data, bpy.data.actions.get(clip))
        assign(keys.animation_data, bpy.data.actions.get(clip + "_arc"))
        # ami az előző klipből megmaradt volna (nem kulcsolt csatorna), alaphelyzetbe
        maki_anim.apply_pose(arm, face, maki_anim.Pose(arm))
        snaps, lift = [], []
        for f in frames:
            for pb in arm.pose.bones:
                pb.rotation_quaternion = Quaternion()
                pb.location = Vector((0.0, 0.0, 0.0))
            for key_name in ("blink", "smile"):
                keys.key_blocks[key_name].value = 0.0
            scene.frame_set(f)
            bones, shape = snapshot(arm, face)
            q, loc = bones["hips"]
            rest = arm.data.bones["hips"].matrix_local.to_3x3()
            world = rest @ loc
            lift.append(round(max(world.z, 0.0), 4))
            world.z = min(world.z, 0.0)   # az emelkedést a lap animációja adja; a guggolás a képkockában marad
            bones["hips"] = (q, rest.inverted() @ world)
            snaps.append((bones, shape))
        out[name] = snaps
        lifts[name] = lift
    # az animációs adat lekapcsolása: a renderelés a kézzel beállított pózt lássa
    for owner in (arm, keys):
        owner.animation_data_clear()
    return out, lifts


def main():
    out_dir, size, only = args()
    built = maki_model.build_all()
    scene, arm, face = built["scene"], built["arm"], built["face"]
    px_per_meter = setup(scene, size)
    os.makedirs(out_dir, exist_ok=True)

    clips = {}
    stock, lifts = sample_stock(scene, arm, face)
    lifts["hop"] = HOP_LIFT
    for name in ORDER:
        if name in stock:
            clips[name] = stock[name]
        else:
            snaps = []
            for make in CUSTOM[name]:
                maki_anim.apply_pose(arm, face, make(arm))
                snaps.append(snapshot(arm, face))
            clips[name] = snaps

    meta = {"size": size, "pxPerMeter": round(px_per_meter, 3), "camera": CAMERA, "triangles": built["tris"], "engine": scene.render.engine, "clips": []}
    for name in ORDER:
        files = []
        for i, snap in enumerate(clips[name]):
            fname = "%s-%02d.png" % (name, i)
            files.append(fname)
            if only and name not in only:
                continue
            restore(arm, face, snap)
            scene.render.filepath = os.path.join(out_dir, fname)
            bpy.ops.render.render(write_still=True)
        fps, loop = PLAY[name]
        lift = lifts.get(name) or [0.0] * len(files)
        if len(lift) != len(files):
            raise SystemExit("Az emelkedés-lista hossza nem egyezik a képkockákéval: " + name)
        meta["clips"].append({"name": name, "frames": files, "fps": fps, "loop": loop, "lift": lift})
    with open(os.path.join(out_dir, "frames.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print("KABALA-FOOLDAL-FRAMES " + json.dumps({"frames": sum(len(c["frames"]) for c in meta["clips"]), "size": size}))


main()
