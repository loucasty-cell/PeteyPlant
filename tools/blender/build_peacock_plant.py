"""Author and export Petey's Goeppertia makoyana companion."""

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_monstera import empty, material, mesh, pose_track, stem, studio
from build_snake_plant import linear_color, pot, shaped_inlay, unwrap_sweep, verify_meshes


PIGMENT = "Peacock pattern"
SOIL = .75


def blend(a, b, amount):
    return a.lerp(b, max(0.0, min(1.0, amount)))


def foliage_palette(hex_values):
    return tuple(linear_color(value) for value in hex_values)


def patterned_leaf_color(t, u, top, seed, upper, lower):
    inside, outside, marking, vein = upper if top else lower
    flank = abs(u)
    half = 1 if u >= 0 else -1
    slate = .19 + .36 * flank + .07 * math.sin(t * 12.6 + u * 3 + seed)
    color = blend(inside, outside, slate)
    for mark in range(7):
        along = .15 + .108 * mark + .020 * half * math.sin(mark + seed)
        length = .042 - .012 * (mark / 6) ** 2
        wing = .32 + .018 * math.sin(mark * 1.73 + seed)
        elliptical = ((flank - .48) / wing) ** 2 + ((t - along - .072 * (flank - .48)) / length) ** 2
        color = blend(color, marking, (1.08 - elliptical) * 4.0)
        vein_offset = t - along - .085 * (flank - .25)
        color = blend(color, vein, .33 * math.exp(-((vein_offset / .009) ** 2)))
    centerline = math.exp(-((u / .041) ** 2))
    color = blend(color, vein, .78 * centerline)
    color = blend(color, marking, (flank - (.92 + .035 * math.sin(t * 38 + seed))) * 20)
    return (*color, 1.0)


def leaf(parent, name, at, toward, facing, length, width, seed, pigment_material, upper, lower):
    pivot = empty(f"{name} pulvinus", parent)
    pivot.location = at
    axis = Vector(toward).normalized()
    side = axis.cross(Vector(facing)).normalized()
    normal = side.cross(axis).normalized()
    pivot.rotation_mode = "QUATERNION"
    pivot.rotation_quaternion = Matrix((side, -normal, axis)).transposed().to_quaternion()

    columns = tuple(-1 + index / 9 for index in range(19))
    ring = [(u, direction) for direction, values in ((1, columns), (-1, reversed(columns))) for u in values]
    segment_count = 46
    vertices, colors = [], []
    for row in range(segment_count + 1):
        t = .017 + .966 * row / segment_count
        spread = math.sin(math.pi * t ** .84) ** .80 * (.97 + .06 * math.cos(t * 3.2))
        sweep = .047 * length * math.sin(math.pi * t) * math.sin(seed)
        for u, direction in ring:
            waves = .014 * abs(u) ** 3 * math.sin(t * 38 + u * 2 + seed)
            folded = .065 * math.sin(math.pi * t) * u * u + .11 * t ** 2
            ridge = -.012 * math.exp(-((u / .15) ** 2)) * math.sin(math.pi * t)
            thickness = (.003 + .003 * (1 - u * u)) * math.sin(math.pi * (.09 + t * .86))
            vertices.append((sweep + u * width * spread + waves, folded + ridge - direction * thickness, length * t))
            colors.append(patterned_leaf_color(t, u, direction > 0, seed, upper, lower))
    vertices.extend(((0, 0, 0), (0, .11, length)))
    colors.extend(((*upper[2], 1.0), (*upper[2], 1.0)))
    base, tip = len(vertices) - 2, len(vertices) - 1
    size = len(ring)
    faces = []
    for row in range(segment_count):
        for column in range(size):
            before, after = row * size, (row + 1) * size
            following = (column + 1) % size
            faces.append((before + column, before + following, after + following, after + column))
    last = segment_count * size
    for column in range(size):
        following = (column + 1) % size
        faces.extend(((base, following, column), (tip, last + column, last + following)))
    blade = mesh(name, vertices, faces, pigment_material, pivot)
    attr = blade.data.color_attributes.new(name=PIGMENT, type="FLOAT_COLOR", domain="POINT")
    blade.data.color_attributes.active_color = attr
    for target, pigment in zip(attr.data, colors):
        target.color = pigment
    unwrap_sweep(blade, size, segment_count + 1)
    return pivot


def make():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 1, 89
    root = empty("Peacock Plant")
    crown = empty("Canopy tilt control", root)
    crown.location.z = SOIL - .055

    plum = material("Warm plum satin ceramic", "8c5066", .33, .22)
    clay = material("Unglazed burnt rose foot", "693d3e", .82)
    lip = material("Mulberry gloss rim", "66394f", .29, .28)
    soil = material("Deep humus", "35261e", .93)
    petiole = material("Maroon-green petiole", "6e494d", .58)
    accent = material("Damson facial inlay", "372331", .36, .11)
    cream = material("Rose-white porcelain", "f8e6d0", .30, .22)
    iris = material("Pale moss iris", "899759", .35, .18)
    blush = material("Satin coral slip", "bf7883", .53)
    pigment_material = material("Goeppertia leaf satin", "ffffff", .54, .14)
    shader = next(node for node in pigment_material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    color = pigment_material.node_tree.nodes.new("ShaderNodeVertexColor")
    color.layer_name = PIGMENT
    pigment_material.node_tree.links.new(color.outputs["Color"], shader.inputs["Base Color"])
    upper = foliage_palette(("ccd7a0", "b0bf83", "2e6245", "5d8b56"))
    lower = foliage_palette(("ac748b", "94566e", "613249", "c48e9d"))

    vessel = pot(root, plum, clay, lip)
    vessel.name = "Rounded plum ceramic"
    for vertex in vessel.data.vertices:
        x, y, z = vertex.co
        belly = 1 + .18 * math.exp(-((z - .38) / .19) ** 2)
        lip_inset = 1 - .045 * min(1, max(0, (z - .56) / .23))
        ceramic_ripples = 1 + .0035 * math.sin(z * 145)
        radius = belly * lip_inset * ceramic_ripples
        vertex.co = (x * radius, y * radius, z * SOIL / .80)
    vessel.data.update()
    shaped_inlay("Substrate mound", (0, 0, SOIL - .044), (.589, .589, .055), soil, root)
    bark = ((-.29, -.37, .048, .027), (.35, -.31, .037, .027), (.32, .25, .061, .027), (-.38, .20, .043, .015))
    for index, (x, y, width, depth) in enumerate(bark):
        shaped_inlay(f"Substrate bark {index + 1}", (x, y, SOIL - depth), (width, .028, .020), clay, root)

    arrangement = [
        ("Top feather", (-.12, .20, 1.30), (-.24, .12, .97), (0, -1, .24), .99, .32),
        ("High right oval", (.42, .08, 1.10), (.62, .06, .73), (0, -1, .38), 1.03, .39),
        ("High left oval", (-.46, .02, 1.04), (-.66, -.05, .70), (.04, -1, .50), .99, .38),
        ("Front facing feather", (.03, -.34, .72), (.12, -.18, .94), (.04, -1, .62), .84, .35),
        ("Low left feather", (-.64, -.10, .64), (-.86, -.10, .39), (.03, -1, .64), .82, .32),
        ("Low right feather", (.66, -.10, .62), (.84, -.13, .41), (0, -1, .52), .84, .32),
        ("Turned wine leaf", (.33, .26, 1.28), (.42, .29, .85), (.40, 1, .13), .78, .29),
        ("Young wine leaf", (-.32, .29, .69), (-.57, .44, .65), (-.13, 1, .23), .70, .26),
    ]
    blades = []
    for index, (name, at, toward, facing, length, width) in enumerate(arrangement):
        x, y, z = at
        start = (x * .23, y * .35, -.035)
        bend = (x * .59 - .033, y * .66, z * .52)
        shoulder = (x * .84, y * .86, z * .88)
        stem(f"{name} petiole", (start, bend, shoulder, at), .029, petiole, crown, (1, .90, .69, .50))
        blade = leaf(crown, name, at, toward, facing, length, width, index / 2.8, pigment_material, upper, lower)
        shaped_inlay(f"{name} petiole joint", (0, 0, .006), (.023, .017, .033), petiole, blade)
        blades.append(blade)

    eyes = []
    for index, x in enumerate((-.216, .216)):
        direction = -1 if x < 0 else 1
        eye = empty(f"Eye {index + 1} blink control", root)
        eye.location = (x, -.664, .461)
        eye.rotation_euler.z = direction * .31
        shaped_inlay(f"Eye {index + 1} base", (0, -.005, 0), (.114, .043, .128), cream, eye)
        shaped_inlay(f"Eye {index + 1} iris", (.015, -.045, .003), (.076, .024, .091), iris, eye)
        shaped_inlay(f"Eye {index + 1} pupil", (.021, -.063, .007), (.054, .022, .071), accent, eye)
        shaped_inlay(f"Eye {index + 1} light", (.003, -.080, .042), (.022, .009, .023), cream, eye)
        eyes.append(eye)
        cheek = shaped_inlay(f"Cheek {index + 1}", (x * 1.66, -.625, .340), (.082, .031, .026), blush, root)
        cheek.rotation_euler.z = direction * .51
        brow = empty(f"Brow {index + 1} mount", root)
        brow.location = (x, -.642, .614)
        brow.rotation_euler.z = direction * .31
        stem(f"Brow {index + 1}", ((-.079, .006, -.014), (-.026, -.020, .015), (.048, -.007, .014),
                                   (.085, .006, -.016)), .015, accent, brow, (.35, 1, .80, .27))
    stem("Quiet side smile", ((-.092, -.687, .322), (-.034, -.716, .282), (.048, -.716, .287),
                             (.104, -.690, .343)), .019, accent, root, (.44, 1, .92, .45))

    clips = {
        "Idle": (89, [(1, 0), (24, .035), (47, -.025), (70, .020), (89, 0)], 1),
        "Notice": (32, [(1, 0), (11, -.13), (22, .046), (32, 0)], 1.12),
        "Curious": (42, [(1, 0), (15, -.062), (30, -.084), (42, -.064)], 1.06),
        "Concerned": (51, [(1, 0), (19, .182), (37, .147), (51, .168)], .69),
        "Relieved": (45, [(1, 0), (16, -.108), (33, -.049), (45, -.061)], .86),
        "Celebrate": (58, [(1, 0), (12, -.151), (25, .089), (40, -.068), (58, 0)], 1.15),
    }
    for clip, (end, poses, openness) in clips.items():
        tilt = .03 if clip == "Idle" else .13 if clip in {"Notice", "Celebrate"} else .07
        pose_track(crown, clip, "rotation_euler", [(frame, (pitch * .4, 0, tilt * math.sin(value)))
                                                     for (frame, pitch), value in zip(poses, (0, -1.8, 1.6, -.48, 0))])
        for index, blade in enumerate(blades):
            base = blade.rotation_quaternion.copy()
            scale = (.76 + (index % 3) * .13) * (-1 if index in (6, 7) else 1)
            keys = []
            for frame, pitch in poses:
                roll = math.sin(index * 2.08) * pitch * .28
                keys.append((frame, base @ Euler((pitch * scale, 0, roll)).to_quaternion()))
            pose_track(blade, clip, "rotation_quaternion", keys)
        for index, eye in enumerate(eyes):
            if clip == "Idle":
                keyframes = [(1, 1), (40 + index, 1), (42 + index, .08), (45 + index, 1), (end, 1)]
            else:
                hold = clip in {"Concerned", "Curious", "Relieved"}
                keyframes = [(1, 1), (12 + index, openness), (end, openness if hold else 1)]
            pose_track(eye, clip, "scale", [(frame, (1, 1, size)) for frame, size in keyframes])
    pose_track(root, "Celebrate", "location", [(1, (0, 0, 0)), (12, (0, 0, .109)), (27, (0, 0, .005)),
                                               (39, (0, 0, .063)), (58, (0, 0, 0))])
    scene.frame_set(1)
    return scene, root


def main():
    parser = argparse.ArgumentParser()
    for name in ("source", "glb", "thumbnail", "review"):
        parser.add_argument(f"--{name}", type=Path, required=name != "review")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    for path in (args.source.parent, args.glb.parent, args.thumbnail.parent):
        path.mkdir(parents=True, exist_ok=True)
    if args.review:
        args.review.mkdir(parents=True, exist_ok=True)
    scene, root = make()
    verify_meshes(root)
    bpy.ops.object.select_all(action="DESELECT")
    tracks = []
    for obj in [root, *root.children_recursive]:
        obj.select_set(True)
        if obj.animation_data:
            tracks.extend(obj.animation_data.nla_tracks)
    for track in tracks:
        track.mute = False
    bpy.context.view_layer.objects.active = root
    result = bpy.ops.export_scene.gltf(filepath=str(args.glb.resolve()), export_format="GLB", use_selection=True,
                                       export_animations=True, export_animation_mode="NLA_TRACKS", export_frame_range=False)
    if result != {"FINISHED"}:
        raise RuntimeError(f"Unable to export Peacock Plant GLB: {result}")
    for track in tracks:
        track.mute = True
    scene.frame_set(1)
    camera = studio(scene)
    camera.data.ortho_scale = 3.65
    bpy.data.objects["Backdrop"].hide_render = True
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = 420
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.quality = 86
    bpy.context.preferences.filepaths.save_version = 0
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"
    aim = Vector((0, 0, 1.52))
    camera.location = (1.55, -7, 3.47)
    camera.rotation_euler = (aim - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(args.thumbnail.resolve())
    bpy.ops.wm.save_as_mainfile(filepath=str(args.source.resolve()))
    bpy.ops.render.render(write_still=True)
    if args.review:
        scene.render.image_settings.file_format = "PNG"
        for view, position in {"front": (0, -7, 3.20), "side": (7, 0, 3.40), "rear": (0, 7, 3.35)}.items():
            camera.location = position
            camera.rotation_euler = (aim - camera.location).to_track_quat("-Z", "Y").to_euler()
            scene.render.filepath = str((args.review / f"peacock-plant-{view}.png").resolve())
            bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
