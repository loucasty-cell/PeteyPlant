"""Build expansion models with one Blender process per botanical group."""

import argparse
import importlib
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_monstera import empty, material, pose_track, pottery, sphere, stem, studio

CLIPS = ("Idle", "Notice", "Curious", "Concerned", "Relieved", "Celebrate")
PALETTES = (
    ("d28f73", "8a5545"), ("679785", "386251"), ("d0a56a", "8e6439"),
    ("9b8dac", "605175"), ("7890a3", "4b657c"), ("ba7865", "744940"),
    ("d5bab0", "9d756a"), ("89a06e", "586b48"),
)


def character(model):
    root = empty(model["common"])
    crown = empty("Foliage sway", root)
    crown.location.z = 1.07
    model["build"](crown)

    index = sum(model["id"].encode()) % len(PALETTES)
    glaze, trim = model.get("pot", PALETTES[index])
    body = material("Pot glaze", glaze, .44, .12)
    foot = material("Clay foot", trim, .8)
    rim = material("Rim glaze", trim, .48)
    pottery(root, body, foot, rim)
    soil = material("Potting mix", "4a3829", .94)
    sphere("Soil", (0, 0, 1.055), (.65, .59, .055), soil, root)

    dark = material("Espresso face", "30211c", .55)
    ivory = material("Ivory catchlight", "ffedd1", .34)
    cheek = material("Terracotta cheek", "cf7865", .58)
    eyes = []
    for side in (-1, 1):
        eye = empty(f"Eye {side:+}", root)
        eye.location = (side * .24, -.704, .66)
        sphere("Eye", (0, -.024, 0), (.082, .048, .108), dark, eye)
        sphere("Catchlight", (-.022, -.067, .033), (.024, .009, .022), ivory, eye)
        sphere("Cheek", (side * .352, -.655, .49), (.085, .027, .035), cheek, root)
        eyes.append(eye)
    stem("Smile", [(-.106, -.728, .502), (0, -.749, .468), (.106, -.728, .502)], .017, dark, root)
    pose_track(crown, "Idle", "rotation_euler", [
        (1, (0, 0, 0)), (24, (.014, 0, .023)), (49, (-.016, 0, -.025)), (73, (0, 0, 0)),
    ])
    gestures = {
        "Notice": ((-.045, 0, .075), (0, 0, 0)),
        "Curious": ((-.035, 0, .103), (-.022, 0, .086)),
        "Concerned": ((.095, 0, -.035), (.081, 0, -.031)),
        "Relieved": ((-.08, 0, .038), (-.036, 0, .021)),
        "Celebrate": ((-.06, 0, .128), (0, 0, 0)),
    }
    for name, (peak, end) in gestures.items():
        keys = [(1, (0, 0, 0)), (12, peak)]
        if name in ("Notice", "Celebrate"):
            keys.append((24, tuple(-value * .58 for value in peak)))
        pose_track(crown, name, "rotation_euler", [*keys, (37, end)])
    for eye in eyes:
        pose_track(eye, "Idle", "scale", [
            (1, (1, 1, 1)), (34, (1, 1, 1)), (36, (1, 1, .11)), (40, (1, 1, 1)), (73, (1, 1, 1)),
        ])
    return root


def glb_stats(path):
    data = path.read_bytes()
    (length,) = struct.unpack_from("<I", data, 12)
    doc = json.loads(data[20:20 + length])
    triangles = sum(
        doc["accessors"][primitive.get("indices", primitive["attributes"]["POSITION"])]["count"] // 3
        for item in doc["meshes"] for primitive in item["primitives"]
    )
    clips = [entry["name"] for entry in doc["animations"]]
    if set(clips) != set(CLIPS) or len(clips) != len(CLIPS):
        raise ValueError(f"{path.name}: expected six distinct named clips, got {clips}")
    if len(data) > 2_000_000 or triangles > 50_000:
        raise ValueError(f"{path.name}: {len(data)} bytes, {triangles} triangles over budget")
    draw_calls = sum(len(doc["meshes"][node["mesh"]]["primitives"]) for node in doc["nodes"] if "mesh" in node)
    return len(data), triangles, draw_calls


def export_runtime(root, path):
    crown = next(obj for obj in root.children if obj.name == "Foliage sway")
    foliage = [obj for obj in crown.children_recursive if obj.type in {"MESH", "CURVE"}]
    # Each foliage piece follows the same crown action. Consolidate render meshes,
    # while keeping the editable parts in the saved Blender scene.
    if len(foliage) > 1 and not any(obj.animation_data for obj in crown.children_recursive):
        bpy.ops.object.select_all(action="DESELECT")
        for obj in foliage:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = foliage[0]
        bpy.ops.object.convert(target="MESH")
        bpy.ops.object.join()
        bpy.context.object.name = "Foliage draw mesh"
    bpy.ops.object.select_all(action="DESELECT")
    for obj in (root, *root.children_recursive):
        obj.select_set(True)
        if obj.animation_data:
            for track in obj.animation_data.nla_tracks:
                track.mute = False
    bpy.context.view_layer.objects.active = root
    status = bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_animations=True, export_animation_mode="NLA_TRACKS", export_frame_range=False,
    )
    if status != {"FINISHED"}:
        raise RuntimeError(f"GLB export failed for {path.name}: {status}")
    return glb_stats(path)


def export(model, repo, review_dir, samples, publish):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 1, 73
    scene.world = bpy.data.worlds.new("Greenhouse studio")
    root = character(model)
    bpy.context.view_layer.update()
    objects = [root, *root.children_recursive]
    points = [
        obj.matrix_world @ Vector(corner)
        for obj in objects if obj.type in {"MESH", "CURVE"} for corner in obj.bound_box
    ]
    low = [min(point[axis] for point in points) for axis in range(3)]
    high = [max(point[axis] for point in points) for axis in range(3)]
    width, depth, height = (b - a for a, b in zip(low, high))
    if not all(math.isfinite(value) for value in (*low, *high)) or height <= 1.1:
        raise ValueError(f"{model['id']}: no foliage above the pot")

    slug = model["id"]
    spec_path = Path("assets/characters") / slug / "spec.json"
    source = spec_path.parent / "source" / f"{slug}.blend"
    runtime = Path("frontend/public/characters") / f"{slug}-v1.glb"
    preview = runtime.with_name(f"{slug}-v1-preview.webp")
    for path in (spec_path, source, runtime):
        (repo / path).parent.mkdir(parents=True, exist_ok=True)
    scene.frame_set(1)
    camera = studio(scene)
    bpy.data.objects["Backdrop"].hide_render = True
    scene.cycles.samples = samples
    scene.render.threads = 3
    scene.render.resolution_x = scene.render.resolution_y = 320
    scene.render.film_transparent = True
    camera.data.ortho_scale = 1.18 * max(height, width, depth)
    center = Vector(((low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2))
    camera.location = center + Vector((1.8, -6, 2.15))
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.preferences.filepaths.save_version = 0
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"
    bpy.ops.wm.save_as_mainfile(filepath=str(repo / source))

    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.quality = 81
    scene.render.filepath = str(repo / preview)
    bpy.ops.render.render(write_still=True)
    if (repo / preview).stat().st_size > 100_000:
        raise ValueError(f"{slug}: preview over 100 kB")

    if review_dir:
        scene.render.image_settings.file_format = "PNG"
        scene.render.resolution_percentage = 65
        camera.location = center + Vector((6, 1.1, 1.85))
        camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(review_dir / f"{slug}-side.png")
        bpy.ops.render.render(write_still=True)

    byte_count, triangles, primitives = export_runtime(root, repo / runtime)
    stage_scale = round(2.3 / max(height, width * .86, depth * .86), 4)
    spec = {
        "id": slug, "speciesId": model["species"], "acceptedName": model.get("accepted", model["species"]),
        "commonName": model["common"], "rank": model.get("rank", "species"), "version": 1, "design": model["note"],
        "source": source.as_posix(), "runtime": runtime.as_posix(), "thumbnail": preview.as_posix(),
        "clips": list(CLIPS), "status": "INTEGRATED" if publish else "AUTHORED",
        "visualReview": "awaiting-owner-review",
        "provenance": "Original Blender geometry, materials, and keyframes.",
        "blender": bpy.app.version_string, "glbBytes": byte_count, "triangles": triangles,
        "fallback": model["fallback"], "stageScale": stage_scale, "runtimePrimitives": primitives,
    }
    if model.get("sources"):
        spec["identitySources"] = model["sources"]
    (repo / spec_path).write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"PETEY ASSET {slug} {byte_count} bytes {triangles} triangles", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("group", choices=("foliage", "architecture", "bloom"))
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--only", nargs="+")
    parser.add_argument("--review-dir", type=Path)
    parser.add_argument("--samples", type=int, default=5)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    models = importlib.import_module(f"expansion_{args.group}").MODELS
    if args.only:
        models = [model for model in models if model["id"] in args.only]
        if {model["id"] for model in models} != set(args.only):
            parser.error("unknown asset ID in --only")
    if args.review_dir:
        args.review_dir = args.review_dir.resolve()
        args.review_dir.mkdir(parents=True, exist_ok=True)
    for model in models:
        path = args.repo / "assets/characters" / model["id"] / "spec.json"
        integrated = path.is_file() and json.loads(path.read_text(encoding="utf-8"))["status"] == "INTEGRATED"
        export(model, args.repo.resolve(), args.review_dir, args.samples, integrated)


if __name__ == "__main__":
    main()
