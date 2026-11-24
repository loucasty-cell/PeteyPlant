"""Build the Golden Pothos companion in a separate Blender process."""

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_monstera import empty, material, mesh, pose_track, sphere, stem, studio


def make_pot(parent):
    glaze = material("Blue-gray satin glaze", "6f948c", .38, .16)
    clay = material("Unfired stoneware color", "b8ab91", .86)
    lip = material("Glazed cobalt edge", "435c58", .29, .2)
    profile = [(.10, .07), (.52, .07), (.59, .11), (.60, .18), (.65, .27),
               (.73, .43), (.77, .62), (.80, .83), (.80, .91), (.77, .95),
               (.72, .92), (.72, .84), (.70, .64), (.65, .42), (.50, .19), (.10, .19)]
    sides = 96
    vertices = []
    for radius, height in profile:
        for i in range(sides):
            angle = math.tau * i / sides
            flutes = .009 * math.sin(math.pi * min(1, max(0, (height - .12) / .72))) * math.cos(24 * angle)
            vertices.append(((radius + flutes) * math.cos(angle), (radius + flutes) * math.sin(angle), height))
    faces = []
    for band in range(len(profile)):
        for i in range(sides):
            nxt = (i + 1) % sides
            top = ((band + 1) % len(profile)) * sides
            base = band * sides
            faces.append((base + i, base + nxt, top + nxt, top + i))
    pot = mesh("Fluted stoneware", vertices, faces, glaze, parent)
    pot.data.materials.append(clay)
    pot.data.materials.append(lip)
    for polygon in pot.data.polygons:
        band = polygon.index // sides
        polygon.material_index = 1 if band < 3 or band == len(profile) - 1 else 2 if 7 <= band <= 10 else 0


def heart_leaf(parent, name, origin, direction, length, width, colors, seed):
    foliage, midrib = colors
    center = Vector(origin)
    axis = Vector(direction).normalized()
    near = Vector((.12, -1, .62))
    across = axis.cross(near).normalized()
    front = across.cross(axis).normalized()

    def point(t, side):
        broad = .06 + math.sin(math.pi * t ** .55) ** .8 * .94
        taper = (1 - t) ** .42
        # Broad basal shoulders sweep back from the petiole to form the notch.
        notch = .20 * abs(side) ** 1.4 * math.exp(-((t - .13) / .14) ** 2)
        fold = (.055 * math.sin(math.pi * t) * (1 - side ** 2) - .09 * t ** 2) * length
        return center + axis * ((t - notch) * length) + across * (side * width * broad * taper) + front * fold

    columns, rows = 11, 16
    points = [(t / rows, s / (columns // 2) - 1) for t in range(rows) for s in range(columns)]
    points.append((1, 0))
    vertices = [point(t, side) for t, side in points]
    faces = []
    for row in range(rows - 1):
        for column in range(columns - 1):
            i = row * columns + column
            faces.append((i, i + 1, i + columns + 1, i + columns))
    tip = len(points) - 1
    for i in range((rows - 1) * columns, tip - 1):
        faces.append((i, i + 1, tip))
    leaf = mesh(name, vertices, faces, foliage, parent)
    pigment = leaf.data.color_attributes.new(name="Pigment", type="FLOAT_COLOR", domain="POINT")
    leaf.data.color_attributes.active_color = pigment
    for i, (t, side) in enumerate(points):
        marble = (.68 * math.sin(t * 10 + side * 6 + seed + math.sin(t * 10 - side * 4) * 1.2)
                  + .34 * math.sin(t * 19 - side * 11 + seed * 1.6)
                  + .13 * math.sin(t * 32 + side * 17 - seed))
        speckle = max(0, min(1, (marble - .42 - .14 * math.sin(seed)) * 1.8))
        green = (.023 + .015 * t, .135 + .080 * t, .037 + .026 * t)
        yellow = (.56, .48, .099)
        pigment.data[i].color = (*(c + (y - c) * speckle for c, y in zip(green, yellow)), 1)
    body = leaf.modifiers.new("Lamina thickness", "SOLIDIFY")
    body.thickness, body.offset = .009, -1
    stem(f"{name} midrib", [point(t, 0) + front * .003 for t in (.04, .29, .58, .84, .96)], .008, midrib, parent,
         (1, .82, .59, .29, .08))


def make():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end, scene.render.fps = 1, 73, 24
    root = empty("Golden Pothos")
    vines = empty("Trailing canopy control", root)
    vines.location.z = .85
    make_pot(root)
    soil = material("Potting mix", "493c2b", .95)
    green = material("Warm olive stems", "648035", .56)
    foliage = material("Variegated lamina", "ffffff", .42, .19)
    nodes = foliage.node_tree.nodes
    pigment_node = nodes.new("ShaderNodeVertexColor")
    pigment_node.layer_name = "Pigment"
    shader = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    foliage.node_tree.links.new(pigment_node.outputs["Color"], shader.inputs["Base Color"])
    midrib = material("Fresh leaf midrib", "8d9f55", .53)
    ink = material("Engobe charcoal", "213a35", .47)
    cheek = material("Terracotta cheek glaze", "b87c5c", .55)
    pupil_light = material("Cream eye glint", "efe8ca", .34)
    sphere("Soil surface", (0, 0, .847), (.742, .742, .042), soil, root)

    eyes = []
    for i, x in enumerate((-.217, .220)):
        pivot = empty(f"Eye control {i}", root)
        pivot.location = (x, -.71, .56)
        eyes.append(pivot)
        sphere(f"Glazed rounded eye {i}", (0, -.025, 0), (.092, .061, .115), ink, pivot)
        sphere(f"Eye glint {i}", (-.023, -.082, .037), (.024, .011, .027), pupil_light, pivot)
        sphere(f"Cheek slip {i}", (x * 1.6, -.648, .386), (.086, .052, .038), cheek, root)
    stem("Open smile", [(-.093, -.704, .36), (-.045, -.73, .319), (.035, -.732, .315), (.098, -.707, .359)], .017,
         ink, root, (.48, 1, 1, .48))

    layouts = [
        [(0, .09, -.01), (-.36, -.06, .38), (-.76, -.24, .32), (-.97, -.33, .02), (-.99, -.33, -.37)],
        [(.12, .03, -.01), (.41, .00, .43), (.81, -.07, .42), (1.05, -.17, .10), (1.12, -.23, -.31), (1.07, -.27, -.60)],
        [(-.08, .14, 0), (-.35, .34, .41), (-.43, .68, .67), (-.64, .81, .39)],
        [(.12, .12, -.02), (.27, .31, .56), (.58, .59, .65), (.77, .72, .32)],
    ]
    for vine_index, locations in enumerate(layouts):
        side = -1 if vine_index in (0, 2) else 1
        stem(f"Trailing vine {vine_index}", locations, .023, green, vines, [1 - .13 * i for i in range(len(locations))])
        for index, loc in enumerate(locations[1:]):
            outward = index % 2 == 0
            tip = Vector(loc) + Vector((side * (.12 if outward else -.06), -.035 if outward else .09, .055))
            middle = Vector(loc).lerp(tip, .42) + Vector((0, 0, .028))
            stem(f"Petiole {vine_index}-{index}", [loc, middle, tip], .012, green, vines, (1, .77, .5))
            direction = (side * (.65 if outward else -.32), -.28 if outward else .48, .68 - .36 * index)
            length = (.66 if vine_index < 2 else .70) - .055 * index
            heart_leaf(vines, f"Heart leaf {vine_index}-{index}", tip, direction, length, length * .48,
                       (foliage, midrib), vine_index * 5 + index * 1.9)

    clips = {
        "Idle": (73, [(1, 0, 0), (21, .017, -.038), (44, -.015, .034), (73, 0, 0)], 1),
        "Notice": (26, [(1, 0, 0), (9, -.11, .13), (26, 0, 0)], 1.18),
        "Curious": (38, [(1, 0, 0), (18, -.05, -.14), (38, -.05, -.14)], 1.08),
        "Concerned": (44, [(1, 0, 0), (20, .14, .08), (44, .14, .08)], .67),
        "Relieved": (38, [(1, 0, 0), (22, -.035, .04), (38, -.035, .04)], .70),
        "Celebrate": (51, [(1, 0, 0), (14, -.09, .17), (29, .06, -.12), (51, 0, 0)], 1.16),
    }
    for name, (end, gesture, eye_scale) in clips.items():
        pose_track(vines, name, "rotation_euler", [(f, (x, 0, z)) for f, x, z in gesture])
        for eye in eyes:
            keys = ([(1, 1), (32, 1), (34, .1), (37, 1), (end, 1)] if name == "Idle"
                    else [(1, 1), (12, eye_scale), (end, 1 if name in {"Notice", "Celebrate"} else eye_scale)])
            pose_track(eye, name, "scale", [(f, (1, 1, y)) for f, y in keys])
    pose_track(root, "Celebrate", "location", [(1, (0, 0, 0)), (14, (0, 0, .12)), (25, (0, 0, 0)),
                                               (34, (0, 0, .07)), (51, (0, 0, 0))])
    scene.frame_set(1)
    return scene, root


def main():
    parser = argparse.ArgumentParser()
    for name in ("source", "glb", "thumbnail"):
        parser.add_argument(f"--{name}", required=True, type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    for path in vars(args).values():
        path.parent.mkdir(parents=True, exist_ok=True)
    scene, root = make()
    bpy.ops.object.select_all(action="DESELECT")
    tracks = []
    for obj in [root, *root.children_recursive]:
        obj.select_set(True)
        if obj.animation_data:
            tracks.extend(obj.animation_data.nla_tracks)
    for track in tracks:
        track.mute = False
    bpy.context.view_layer.objects.active = root
    status = bpy.ops.export_scene.gltf(filepath=str(args.glb.resolve()), export_format="GLB", use_selection=True,
                                       export_animations=True, export_animation_mode="NLA_TRACKS", export_frame_range=False)
    if status != {"FINISHED"}:
        raise RuntimeError(status)
    for track in tracks:
        track.mute = True
    scene.frame_set(1)
    camera = studio(scene)
    camera.location = (1.35, -7, 3.17)
    camera.rotation_euler = (Vector((0, 0, 1.10)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = 3.0
    bpy.data.objects["Backdrop"].hide_render = True
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = 360
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.quality = 84
    scene.render.filepath = str(args.thumbnail.resolve())
    bpy.context.preferences.filepaths.save_version = 0
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"
    bpy.ops.wm.save_as_mainfile(filepath=str(args.source.resolve()))
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
