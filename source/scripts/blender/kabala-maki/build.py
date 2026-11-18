# Kabala-maki — építés és export: egy Draco-tömörített GLB tartalom-hash-sel a nevében + manifest.
# Futtatás (a repó gyökeréből vagy bárhonnan): "$BLENDER_BIN" -b --factory-startup -P source/scripts/blender/kabala-maki/build.py
# A kimenet helye a szkript helyéből számolódik (gépfüggő útvonal nincs). Időbélyeg nem kerül a kimenetbe.

import hashlib
import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True   # ne keletkezzen __pycache__ a repóban

import bpy  # noqa: E402

import maki_anim  # noqa: E402
import maki_model  # noqa: E402

OUT_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "..", "client", "public", "models", "kabala"))
BASENAME = "kabala-maki"


def read_glb_json(path):
    with open(path, "rb") as fh:
        data = fh.read()
    magic, _version, _length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF":
        raise RuntimeError("Nem GLB: " + path)
    chunk_len, chunk_type = struct.unpack_from("<I4s", data, 12)
    if chunk_type != b"JSON":
        raise RuntimeError("Az első darab nem JSON")
    return json.loads(data[20:20 + chunk_len].decode("utf-8")), data


def stats(gltf):
    tris = 0
    for mesh in gltf.get("meshes", []):
        for prim in mesh["primitives"]:
            tris += gltf["accessors"][prim["indices"]]["count"] // 3
    clips = []
    for anim in gltf.get("animations", []):
        end = 0.0
        for sampler in anim["samplers"]:
            end = max(end, gltf["accessors"][sampler["input"]]["max"][0])
        clips.append({"name": anim["name"], "duration": round(end, 3), "channels": len(anim["channels"])})
    morphs = []
    for mesh in gltf.get("meshes", []):
        for name in (mesh.get("extras") or {}).get("targetNames", []):
            if name not in morphs:
                morphs.append(name)
    return tris, clips, morphs


def main():
    built = maki_model.build_all()
    maki_anim.build_actions(built["arm"], built["face"])
    os.makedirs(OUT_DIR, exist_ok=True)
    tmp = os.path.join(OUT_DIR, BASENAME + ".tmp.glb")
    bpy.ops.export_scene.gltf(
        filepath=tmp,
        export_format="GLB",
        export_copyright="Websuli",
        export_yup=True,
        export_apply=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_texcoords=True,      # az arc festett textúrájához
        export_image_format="AUTO",
        export_normals=True,
        export_tangents=False,
        export_vertex_color="MATERIAL",
        export_skins=True,
        export_all_influences=False,
        export_def_bones=False,
        export_rest_position_armature=True,
        export_morph=True,
        export_morph_normal=False,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_force_sampling=True,
        export_frame_step=2,
        export_frame_range=False,
        export_anim_slide_to_zero=True,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=False,
        export_optimize_animation_keep_anim_object=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_color_quantization=10,
        export_draco_generic_quantization=12,
    )
    gltf, data = read_glb_json(tmp)
    digest = hashlib.sha256(data).hexdigest()
    name = "%s.%s.glb" % (BASENAME, digest[:8])
    for old in sorted(os.listdir(OUT_DIR)):
        if old.startswith(BASENAME + ".") and old.endswith(".glb") and old != os.path.basename(tmp):
            os.remove(os.path.join(OUT_DIR, old))
    os.replace(tmp, os.path.join(OUT_DIR, name))

    tris, clips, morphs = stats(gltf)
    loops = {c: maki_anim.CLIPS[c][1] for c in maki_anim.CLIPS}
    for clip in clips:
        clip["loop"] = bool(loops.get(clip["name"], False))
    manifest = {
        "name": "A Websuli makija",
        "file": name,
        "sha256": digest,
        "bytes": len(data),
        "triangles": tris,
        "bones": len(built["arm"].data.bones),
        "materials": len(gltf.get("materials", [])),
        "meshes": [m["name"] for m in gltf.get("meshes", [])],
        "morphTargets": morphs,
        "clips": sorted(clips, key=lambda c: c["name"]),
        "compression": "KHR_draco_mesh_compression" if "KHR_draco_mesh_compression" in gltf.get("extensionsUsed", []) else "none",
        "fps": maki_anim.FPS,
        "generator": "source/scripts/blender/kabala-maki/build.py",
    }
    with open(os.path.join(OUT_DIR, BASENAME + ".manifest.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print("KABALA-BUILD " + json.dumps(manifest, ensure_ascii=False))


main()
