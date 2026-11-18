# A Websuli makija — animációs klipek (terv: docs/specs/2026-11-18-kabala-maki.md, 7. szakasz).
# A pózokat a csontváz terében (világ-tengelyek) adjuk meg; a segéd váltja a csont helyi terébe.
# Tengelyek: +X forgás = előre bólint; +Y forgás = a fej teteje +X felé dől; +Z = balra fordul.
# Minden kulcs PÁROS képkockán van (az export 2 képkockánként mintavételez).

import math

import bpy
from mathutils import Matrix, Quaternion, Vector

FPS = 24
CLIPS = {
    # név: (utolsó képkocka, hurkolható)
    "idle": (48, True),
    "wave": (48, False),
    "cheer": (36, False),
    "sad": (60, False),
    "blink": (24, False),
    "sunbathe": (72, False),
}
TAIL = range(2, 9)


def sstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


class Pose:
    """Egy képkocka póza: csontonként világ-forgás, eltolás; alakkulcs-értékek."""

    def __init__(self, arm):
        self.arm = arm
        self.rot, self.loc, self.keys = {}, {}, {}

    def r(self, bone, axis, deg):
        m = Matrix.Rotation(math.radians(deg), 3, axis)
        self.rot[bone] = m @ self.rot.get(bone, Matrix.Identity(3))
        return self

    def aim(self, bone, target, amount=1.0):
        b = self.arm.data.bones[bone]
        rest = (b.tail_local - b.head_local).normalized()
        q = rest.rotation_difference(Vector(target).normalized())
        q = Quaternion().slerp(q, amount)
        self.rot[bone] = q.to_matrix() @ self.rot.get(bone, Matrix.Identity(3))
        return self

    def move(self, bone, delta):
        self.loc[bone] = Vector(delta)
        return self

    def key(self, name, value):
        self.keys[name] = value
        return self


def idle_pose(arm, f):
    p = Pose(arm)
    ph = 2.0 * math.pi * f / 48.0
    s = math.sin(ph)
    p.r("chest", "X", -1.6 * s).move("chest", (0.0, 0.0, 0.005 * s))
    p.r("head", "X", 1.2 * s).r("head", "Y", 1.4 * math.sin(ph - 0.6))
    p.r("arm.L", "Y", 2.5 * s).r("arm.R", "Y", -2.5 * s)
    for i in TAIL:
        p.r("tail%d" % i, "Z", 3.5 * math.sin(ph - 0.7 * i)).r("tail%d" % i, "X", 1.6 * math.sin(ph - 0.7 * i + 1.2))
    return p


def wave_pose(arm, f):
    p = Pose(arm)
    up = sstep(0, 8, f) * (1.0 - sstep(40, 48, f))
    swing = math.sin(2.0 * math.pi * (f - 8) / 12.0) if 8 <= f <= 40 else 0.0
    p.aim("arm.R", (-0.74, -0.34, 0.58), up)
    p.aim("forearm.R", (-0.22, -0.30, 0.93), up).r("forearm.R", "Y", 24.0 * swing * up)
    p.r("head", "Y", 7.0 * up).r("chest", "Y", 2.5 * up)
    p.r("ear.R", "Y", 5.0 * swing * up)
    p.key("smile", up)
    return p


def cheer_pose(arm, f):
    p = Pose(arm)
    heights = {0: 0.0, 4: -0.04, 12: 0.16, 18: 0.24, 24: 0.06, 28: -0.03, 32: 0.005, 36: 0.0}
    p.move("hips", (0.0, 0.0, heights.get(f, 0.0)))
    up = sstep(2, 12, f) * (1.0 - sstep(26, 36, f))
    air = sstep(4, 16, f) * (1.0 - sstep(20, 28, f))
    squash = 1.0 if f in (4, 28) else 0.0
    for side, sfx in ((1.0, "L"), (-1.0, "R")):
        p.aim("arm." + sfx, (0.70 * side, -0.30, 0.65), up)
        p.aim("forearm." + sfx, (0.30 * side, -0.25, 0.92), up)
        p.r("ear." + sfx, "Y", -8.0 * side * up)
        p.r("thigh." + sfx, "X", -26.0 * air - 22.0 * squash).r("shin." + sfx, "X", 34.0 * air + 40.0 * squash)
        p.r("foot." + sfx, "X", -18.0 * squash)
    p.r("head", "X", 6.0 * squash - 8.0 * up).r("chest", "X", 5.0 * squash - 3.0 * up)
    for i in TAIL:
        p.r("tail%d" % i, "Z", 6.0 * up * math.sin(f / 36.0 * 2.0 * math.pi - 0.6 * i))
    p.key("smile", sstep(2, 10, f) * (1.0 - sstep(30, 36, f)))
    return p


def sad_pose(arm, f):
    p = Pose(arm)
    down = sstep(0, 16, f) * (1.0 - sstep(46, 60, f))
    sway = math.sin(2.0 * math.pi * f / 30.0) * down
    p.r("chest", "X", 7.0 * down).r("head", "X", 14.0 * down).r("head", "Y", 5.0 * down + 2.0 * sway)
    p.r("ear.L", "Y", 48.0 * down).r("ear.R", "Y", -48.0 * down)
    p.r("arm.L", "Y", -8.0 * down).r("arm.R", "Y", 8.0 * down).r("arm.L", "X", 10.0 * down).r("arm.R", "X", 10.0 * down)
    # a magasra tartott farok lekonyul: földközeli ívben fekszik a figura mellett
    for i, deg in zip(TAIL, (26.0, 34.0, 30.0, 14.0, -8.0, -16.0, -12.0)):
        p.r("tail%d" % i, "Y", deg * down).r("tail%d" % i, "Z", 1.5 * sway)
    p.r("tail1", "X", -10.0 * down)
    p.key("blink", 0.20 * down).key("smile", -0.8 * down)
    return p


def blink_pose(arm, f):
    p = Pose(arm)
    p.key("blink", 1.0 if f in (2, 10) else 0.0)
    return p


def sunbathe_pose(arm, f):
    """A gyűrűsfarkú makik „napozó” póza: felegyenesedve ül, karjai széttárva a nap felé, szeme behunyva."""
    p = Pose(arm)
    sit = sstep(0, 18, f) * (1.0 - sstep(56, 72, f))
    breathe = math.sin(2.0 * math.pi * f / 24.0) * sit
    p.move("hips", (0.0, 0.03 * sit, -0.225 * sit))
    p.r("hips", "X", -9.0 * sit).r("chest", "X", -5.0 * sit - 1.2 * breathe).r("head", "X", -3.0 * sit - 1.0 * breathe)
    for side, sfx in ((1.0, "L"), (-1.0, "R")):
        # lábak előre nyújtva, kissé széttárva; a talp előre néz
        p.r("thigh." + sfx, "X", -88.0 * sit).r("thigh." + sfx, "Z", 26.0 * side * sit)
        p.r("shin." + sfx, "X", 22.0 * sit).r("foot." + sfx, "X", -6.0 * sit)
        # karok széttárva, tenyér előre-felfelé
        p.aim("arm." + sfx, (0.90 * side, -0.22, -0.30), sit)
        p.aim("forearm." + sfx, (0.86 * side, -0.38, 0.30), sit).r("forearm." + sfx, "Y", -3.0 * side * breathe)
        p.r("ear." + sfx, "Y", 6.0 * side * sit)
    for i, deg in zip(TAIL, (-4.0, 8.0, 6.0, 0.0, 0.0, 0.0, 0.0)):
        p.r("tail%d" % i, "X", deg * sit).r("tail%d" % i, "Z", 2.0 * breathe)
    p.key("blink", 1.0 * sit).key("smile", 0.45 * sit)
    return p


POSES = {"idle": idle_pose, "wave": wave_pose, "cheer": cheer_pose, "sad": sad_pose, "blink": blink_pose, "sunbathe": sunbathe_pose}
FRAMES = {
    "idle": list(range(0, 49, 4)),
    "wave": list(range(0, 49, 2)),
    "cheer": [0, 4, 12, 18, 24, 28, 32, 36],
    "sad": list(range(0, 61, 2)),
    "blink": [0, 2, 4, 8, 10, 12, 24],
    "sunbathe": list(range(0, 73, 2)),
}


def apply_pose(arm, face, pose):
    """A pózt a csontokra és az alakkulcsokra írja (kulcsolás nélkül)."""
    for pb in arm.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector((0.0, 0.0, 0.0))
        pb.scale = Vector((1.0, 1.0, 1.0))
    for bone, rw in pose.rot.items():
        b = arm.data.bones[bone].matrix_local.to_3x3()
        arm.pose.bones[bone].rotation_quaternion = (b.inverted() @ rw @ b).to_quaternion()
    for bone, delta in pose.loc.items():
        b = arm.data.bones[bone].matrix_local.to_3x3()
        arm.pose.bones[bone].location = b.inverted() @ delta
    blocks = face.data.shape_keys.key_blocks
    for name in ("blink", "smile"):
        blocks[name].value = pose.keys.get(name, 0.0)


def show(arm, face, clip, frame):
    """Rendereléshez: a klip adott képkockájának póza közvetlenül (animációs adat nélkül)."""
    apply_pose(arm, face, POSES[clip](arm, frame))
    bpy.context.view_layer.update()


def build_actions(arm, face):
    """Klipenként egy akció a csontváznak (+ egy az alakkulcsoknak), azonos nevű NLA-sávon — az export sávonként egy animációt ad."""
    shape_keys = face.data.shape_keys
    arm.animation_data_create()
    shape_keys.animation_data_create()
    made = []
    for clip in CLIPS:
        frames = FRAMES[clip]
        poses = [POSES[clip](arm, f) for f in frames]
        bones = sorted({b for p in poses for b in p.rot} | {b for p in poses for b in p.loc})
        movers = {b for p in poses for b in p.loc}
        keyed = sorted({k for p in poses for k in p.keys})

        if bones:
            action = bpy.data.actions.new(clip)
            arm.animation_data.action = action
            last = {}
            for f, pose in zip(frames, poses):
                apply_pose(arm, face, pose)
                for bone in bones:
                    pb = arm.pose.bones[bone]
                    q = pb.rotation_quaternion.copy()
                    if bone in last and last[bone].dot(q) < 0.0:
                        q.negate()
                        pb.rotation_quaternion = q
                    last[bone] = q
                    pb.keyframe_insert("rotation_quaternion", frame=f)
                    if bone in movers:
                        pb.keyframe_insert("location", frame=f)
            arm.animation_data.action = None
            track = arm.animation_data.nla_tracks.new()
            track.name = clip
            track.strips.new(clip, 0, action)

        if keyed:
            action = bpy.data.actions.new(clip + "_arc")
            shape_keys.animation_data.action = action
            for f, pose in zip(frames, poses):
                for name in keyed:
                    block = shape_keys.key_blocks[name]
                    block.value = pose.keys.get(name, 0.0)
                    block.keyframe_insert("value", frame=f)
            shape_keys.animation_data.action = None
            track = shape_keys.animation_data.nla_tracks.new()
            track.name = clip
            track.strips.new(clip, 0, action)
        made.append(clip)

    apply_pose(arm, face, Pose(arm))
    return made
