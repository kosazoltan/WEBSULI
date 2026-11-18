# Kabala-maki — bemutató képek fej nélkül (terv K-7): öt nézet + egy hatpózos tabló.
# Futtatás: "$BLENDER_BIN" -b --factory-startup -P source/scripts/blender/kabala-maki/render.py [-- --only 01,05] [--size 1024]
# Kimenet: docs/measurements/kabala-maki/*.png (a szkript helyéből számolva).

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True   # ne keletkezzen __pycache__ a repóban

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

import maki_anim  # noqa: E402
import maki_model  # noqa: E402

OUT_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "..", "..", "docs", "measurements", "kabala-maki"))
BG = maki_model.srgb("#fff4dc")
GROUND = maki_model.srgb("#c9ecd2")


def args():
    extra = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    only, size = None, 1024
    for i, a in enumerate(extra):
        if a == "--only":
            only = set(extra[i + 1].split(","))
        if a == "--size":
            size = int(extra[i + 1])
    return only, size


def setup(scene):
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
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.compression = 100
    scene.render.film_transparent = False

    world = bpy.data.worlds.new("Hatter")
    world.use_nodes = True
    nt = world.node_tree
    bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
    out = next(n for n in nt.nodes if n.type == "OUTPUT_WORLD")
    bg.inputs["Color"].default_value = (*BG, 1.0)
    bg.inputs["Strength"].default_value = 0.55     # ennyivel világít a környezet
    seen = nt.nodes.new("ShaderNodeBackground")    # ezt látja a kamera: a tiszta, világos háttérszín
    seen.inputs["Color"].default_value = (*BG, 1.0)
    seen.inputs["Strength"].default_value = 1.0
    path = nt.nodes.new("ShaderNodeLightPath")
    mixer = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(path.outputs["Is Camera Ray"], mixer.inputs[0])
    nt.links.new(bg.outputs[0], mixer.inputs[1])
    nt.links.new(seen.outputs[0], mixer.inputs[2])
    nt.links.new(mixer.outputs[0], out.inputs["Surface"])
    scene.world = world

    mesh = bpy.data.meshes.new("Talaj")
    n, r = 96, 0.95   # kerek, pasztell „dobogó”; a többi a háttér színe
    ring = [(0.1 + r * math.cos(2 * math.pi * i / n), 0.1 + r * math.sin(2 * math.pi * i / n), 0.0) for i in range(n)]
    mesh.from_pydata(ring, [], [tuple(range(n))])
    mat = bpy.data.materials.new("Talaj")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*GROUND, 1.0)
    bsdf.inputs["Roughness"].default_value = 1.0
    mesh.materials.append(mat)
    ground = bpy.data.objects.new("Talaj", mesh)
    scene.collection.objects.link(ground)

    cam_data = bpy.data.cameras.new("Kamera")
    cam_data.lens = 85.0
    cam = bpy.data.objects.new("Kamera", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    rig = bpy.data.objects.new("Fenyek", None)
    scene.collection.objects.link(rig)
    for name, pos, energy, size, color in (
        ("Fo", (-2.2, -3.2, 3.4), 190.0, 3.0, (1.0, 0.97, 0.92)),
        ("Derito", (3.0, -2.4, 1.6), 60.0, 4.0, (0.92, 0.96, 1.0)),
        ("Kontur", (1.0, 3.2, 2.8), 110.0, 2.0, (1.0, 1.0, 1.0)),
    ):
        light = bpy.data.lights.new(name, "AREA")
        light.energy, light.size, light.color = energy, size, color
        obj = bpy.data.objects.new(name, light)
        obj.location = pos
        obj.parent = rig
        scene.collection.objects.link(obj)
        look_at(obj, Vector((0.1, 0.0, 0.55)))
    return cam, rig


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def place(cam, rig, azimuth_deg, elevation_deg, distance, target):
    """azimuth 0 = szemből (a kamera a −Y oldalon); pozitív = a figura bal oldala (+X) felé kerül."""
    az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
    target = Vector(target)
    cam.location = target + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * distance
    look_at(cam, target)
    rig.rotation_euler = (0.0, 0.0, az)


def render(scene, path, w, h):
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.resolution_percentage = 100
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def load_pixels(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)


def save_pixels(path, arr):
    h, w, _ = arr.shape
    img = bpy.data.images.new("tablo", w, h, alpha=False)
    img.pixels.foreach_set(arr.reshape(-1))
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def label(scene, text, cam):
    curve = bpy.data.curves.new("Felirat", "FONT")
    curve.body = text
    curve.align_x = "CENTER"
    curve.size = 0.11
    mat = bpy.data.materials.new("Felirat")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.05, 0.07, 0.12, 1.0)
    bsdf.inputs["Emission Color"].default_value = (0.05, 0.07, 0.12, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 1.0
    curve.materials.append(mat)
    obj = bpy.data.objects.new("Felirat", curve)
    scene.collection.objects.link(obj)
    return obj


def main():
    only, size = args()
    built = maki_model.build_all()
    scene, arm, face = built["scene"], built["arm"], built["face"]
    cam, rig = setup(scene)
    os.makedirs(OUT_DIR, exist_ok=True)
    print("KABALA-RENDER motor=%s haromszog=%d" % (scene.render.engine, built["tris"]))

    center = (0.10, 0.10, 0.56)
    views = [
        ("01-elol", 0.0, 6.0, 4.6, center),
        ("02-haromnegyed", -35.0, 10.0, 4.6, center),
        ("03-oldal", -90.0, 5.0, 4.6, (0.0, 0.10, 0.56)),
        ("04-hatul", 180.0, 10.0, 4.6, (-0.10, 0.10, 0.56)),
        ("05-arc-kozeli", -12.0, 3.0, 2.3, (0.0, 0.0, 0.70)),
        ("07-haromnegyed-farok", 40.0, 12.0, 4.6, center),
    ]
    maki_anim.show(arm, face, "idle", 0)
    for name, az, el, dist, target in views:
        if only and name[:2] not in only:
            continue
        place(cam, rig, az, el, dist, target)
        render(scene, os.path.join(OUT_DIR, name + ".png"), size, size)

    if only and "06" not in only:
        return
    tiles = [
        ("alap (idle)", "idle", 0), ("integetés (wave)", "wave", 12), ("ugrás (cheer)", "cheer", 18),
        ("szomorú (sad)", "sad", 24), ("pislogás (blink)", "blink", 2), ("mosoly (smile)", None, 0),
    ]
    tile = size // 2
    text = label(scene, "", cam)
    rows = []
    paths = []
    for i, (caption, clip, frame) in enumerate(tiles):
        if clip:
            maki_anim.show(arm, face, clip, frame)
        else:
            pose = maki_anim.Pose(arm).key("smile", 1.0).r("head", "Y", 6.0)
            maki_anim.apply_pose(arm, face, pose)
        place(cam, rig, -18.0, 7.0, 5.6, (0.08, 0.10, 0.62))
        text.data.body = caption
        text.location = Vector((0.08, -0.35, 1.36))
        text.rotation_euler = cam.rotation_euler
        path = os.path.join(OUT_DIR, "_tile%d.png" % i)
        render(scene, path, tile, tile)
        paths.append(path)
    px = [load_pixels(p) for p in paths]
    rows = [np.concatenate(px[3:6], axis=1), np.concatenate(px[0:3], axis=1)]  # a pixelsor alulról indul
    save_pixels(os.path.join(OUT_DIR, "06-tablo.png"), np.concatenate(rows, axis=0))
    for p in paths:
        os.remove(p)


main()
