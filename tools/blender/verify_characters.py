"""Check saved source Idle actions and plant attachment points in Blender."""

import json
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
POSE_TOLERANCE = 1e-5


def verify_idle(scene):
    controls = []
    frame_ranges = []
    for obj in scene.objects:
        animation = obj.animation_data
        if not animation:
            continue
        idle = [strip for track in animation.nla_tracks if track.name == "Idle" for strip in track.strips]
        if not idle:
            continue
        assert len(idle) == 1, f"{obj.name} has multiple Idle strips"
        strip = idle[0]
        # Sample the saved action and slot directly to isolate it from other NLA tracks.
        animation.use_nla = False
        animation.action = strip.action
        animation.action_slot = strip.action_slot
        frame_ranges.append(tuple(strip.action.frame_range))
        controls.append(obj)

    assert controls, "Missing Idle action"
    start = min(start for start, _ in frame_ranges)
    end = max(end for _, end in frame_ranges)

    def pose(frame):
        whole = int(frame)
        scene.frame_set(whole, subframe=frame - whole)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        return tuple(
            value for obj in controls for row in obj.evaluated_get(depsgraph).matrix_world for value in row
        )

    def distance(a, b):
        return max(abs(left - right) for left, right in zip(a, b))

    first = pose(start)
    seam = distance(first, pose(end))
    motion = max(distance(first, pose(start + (end - start) * step / 24)) for step in range(1, 24))
    assert seam < POSE_TOLERANCE, f"Idle seam changes pose by {seam:.7f}"
    assert motion > POSE_TOLERANCE, "Idle action is static"
    return seam, motion


def verify_ficus(scene):
    trunk = scene.objects["Tapered, gently leaning trunk"]
    branches = [obj for obj in scene.objects if obj.name.endswith("woody petiole")]
    assert len(branches) == 7, "Expected seven woody petioles"
    anchors = [point.co for point in trunk.data.splines[0].bezier_points]
    for branch in branches:
        assert branch.parent == trunk.parent, f"{branch.name} has a different motion pivot"
        start = branch.data.splines[0].bezier_points[0].co
        assert min((anchor - start).length for anchor in anchors) < 1e-6, f"{branch.name} starts off the trunk"


def verify_begonia(scene):
    canes = [obj for obj in scene.objects if obj.name.startswith("Leaf-scarred cane")]
    petioles = [obj for obj in scene.objects if obj.name.startswith("Begonia petiole")]
    assert len(canes) == 3 and len(petioles) == 6, "Expected three canes and six petioles"
    anchors = [point.co for cane in canes for point in cane.data.splines[0].bezier_points]
    for petiole in petioles:
        start = petiole.data.splines[0].bezier_points[0].co
        assert petiole.parent == canes[0].parent, f"{petiole.name} has a different motion pivot"
        assert min((point - start).length for point in anchors) < 1e-6, f"{petiole.name} starts off the cane"


def verify_orchid(scene):
    def named(prefix):
        return [obj for obj in scene.objects if obj.name.startswith(prefix)]

    def points(curve):
        return [point.co for point in curve.data.splines[0].bezier_points]

    spikes = named("Arching flowering spike")
    pedicels = named("Attached flower pedicel")
    roots = named("Aerial root with silver velamen")
    tips = named("Living green root tip")
    assert len(spikes) == 2 and len(pedicels) == 6
    assert len(roots) == len(tips) == 5
    for branches, anchors in ((pedicels, [p for s in spikes for p in points(s)]),
                              (tips, [points(root)[-1] for root in roots])):
        for branch in branches:
            assert branch.parent == spikes[0].parent, f"{branch.name} has a different motion pivot"
            assert min((point - points(branch)[0]).length for point in anchors) < 1e-6, (
                f"{branch.name} has a gap at its attachment"
            )


def verify_thanksgiving_cactus(scene):
    def pad_cap(pad, index):
        vertices = pad.data.polygons[index].vertices
        return sum((pad.data.vertices[i].co for i in vertices), Vector()) / len(vertices)

    for shoot in range(1, 8):
        pads = [scene.objects[f"Clawed pad {shoot}:{number}"] for number in range(1, 5)]
        assert pad_cap(pads[0], 0).z < 0, f"Shoot {shoot} starts above its soil line"
        for parent, child in zip(pads, pads[1:]):
            assert child.parent == parent.parent, f"{child.name} has a different motion pivot"
            # Measure the two cap centers after undoing the modeled overlap.
            a = pad_cap(parent, -1)
            b = pad_cap(child, 0)
            parent_axis = (a - pad_cap(parent, 0)).normalized()
            child_axis = (pad_cap(child, -1) - b).normalized()
            assert ((a - parent_axis * .012) - (b + child_axis * .012)).length < 1e-6, (
                f"{child.name} has a pad joint gap"
            )
        tube = scene.objects.get(f"Flower tube {shoot}")
        if shoot % 2:
            assert tube and tube.parent == pads[-1].parent, f"Missing terminal tube for shoot {shoot}"
            tip = pad_cap(pads[-1], -1)
            axis = (tip - pad_cap(pads[-1], 0)).normalized()
            assert (tip - axis * .012 - tube.data.splines[0].bezier_points[0].co).length < 1e-6


def main():
    specs = sorted((ROOT / "assets/characters").glob("*/spec.json"))
    assert specs, "Missing character specs"
    for path in specs:
        spec = json.loads(path.read_text(encoding="utf-8"))
        bpy.ops.wm.open_mainfile(filepath=str(ROOT / spec["source"]), use_scripts=False)
        scene = bpy.context.scene
        try:
            seam, motion = verify_idle(scene)
            if spec["id"] == "ficus":
                verify_ficus(scene)
            if spec["id"] == "polka-dot-begonia":
                verify_begonia(scene)
            if spec["id"] == "moth-orchid":
                verify_orchid(scene)
            if spec["id"] == "thanksgiving-cactus":
                verify_thanksgiving_cactus(scene)
        except AssertionError as error:
            raise AssertionError(f"{spec['id']}: {error}") from error
        print(f"{spec['id']}: Idle seam {seam:.7f}, sampled motion {motion:.5f}", flush=True)


if __name__ == "__main__":
    main()
