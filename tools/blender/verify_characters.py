"""Check saved source Idle actions and the Ficus branch joints in Blender."""

import json
from pathlib import Path

import bpy

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
        except AssertionError as error:
            raise AssertionError(f"{spec['id']}: {error}") from error
        print(f"{spec['id']}: Idle seam {seam:.7f}, sampled motion {motion:.5f}", flush=True)


if __name__ == "__main__":
    main()
