"""Reload the saved asset, fail on open leaf edges, and render expression samples."""

import argparse
import json
import sys
from pathlib import Path

import bmesh
import bpy

parser = argparse.ArgumentParser()
parser.add_argument("directory", type=Path)
parser.add_argument("--thumbnail", type=Path)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
directory = args.directory
directory.mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene
root = bpy.data.objects["Monstera"]
meshes = {}
for obj in root.children_recursive:
    if obj.type != "MESH" or not obj.name.endswith("lamina"):
        continue
    editable = bmesh.new()
    editable.from_mesh(obj.data)
    meshes[obj.name] = {
        "faces": len(editable.faces),
        "non_manifold_edges": sum(not edge.is_manifold for edge in editable.edges),
    }
    editable.free()
if len(meshes) != 6 or any(data["non_manifold_edges"] for data in meshes.values()):
    raise RuntimeError(f"Unexpected lamina topology: {meshes}")
print("Lamina topology:", json.dumps(meshes), flush=True)

scene.cycles.samples = 8
scene.render.resolution_x = scene.render.resolution_y = 360
for name, frame in (("Idle", 1), ("Curious", 17), ("Concerned", 23), ("Celebrate", 14)):
    for obj in [root, *root.children_recursive]:
        if obj.animation_data:
            for track in obj.animation_data.nla_tracks:
                track.mute = track.name != name
    scene.frame_set(frame)
    scene.render.filepath = str((directory / f"monstera-pose-{name.lower()}.png").resolve())
    bpy.ops.render.render(write_still=True)


for obj in [root, *root.children_recursive]:
    if obj.animation_data:
        for track in obj.animation_data.nla_tracks:
            track.mute = True
scene.frame_set(1)
backdrop = bpy.data.objects["Backdrop"]
backdrop.hide_render = True
scene.render.film_transparent = True
if args.thumbnail:
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.quality = 82
    scene.render.filepath = str(args.thumbnail.resolve())
    bpy.ops.render.render(write_still=True)
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
mask = bpy.data.materials.new("Silhouette")
mask.use_nodes = True
nodes = mask.node_tree.nodes
output_node = next(node for node in nodes if node.type == "OUTPUT_MATERIAL")
flat = nodes.new("ShaderNodeEmission")
flat.inputs["Color"].default_value = (0, 0, 0, 1)
mask.node_tree.links.new(flat.outputs[0], output_node.inputs["Surface"])
bpy.context.view_layer.material_override = mask
scene.render.filepath = str((directory / "monstera-silhouette.png").resolve())
bpy.ops.render.render(write_still=True)
