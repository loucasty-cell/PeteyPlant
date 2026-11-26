"""Build the Laurentii-inspired Snake Plant companion and its web export."""

import argparse
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_monstera import empty, material, mesh, pose_track, sphere, stem, studio


PIGMENT = "Leaf pigment"
SOIL_HEIGHT = .80


def linear_color(hex_color):
    srgb = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return Vector([c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4 for c in srgb])


def leaf_pigment(t, u, seed, back):
    # Warped bands split into unequal chevrons and fade at occasional crossings.
    off_center = u - .12 * math.sin(t * 8 + seed)
    phase = t * (9.7 + seed * .44) - .23 * abs(off_center)
    phase += .13 * math.sin(t * 29 + seed) + .10 * math.sin(u * 9 + t * 19)
    band = (.5 + .5 * math.sin(math.tau * (phase + seed * .21))) ** 1.55
    interrupted = .5 + .5 * math.sin(u * 11.7 + t * 53.4 + seed)
    band *= .60 + .40 * interrupted
    dark = linear_color("225135" if not back else "315741")
    light = linear_color("7c9e6c" if not back else "6c8c63")
    center = dark.lerp(light, band * (.76 + .16 * math.sin(t * 19 + seed) ** 2))
    margin_width = .79 + .044 * math.sin(t * 21 + seed + .7 * u) + .019 * math.cos(t * 48)
    margin = max(0.0, min(1.0, (abs(u) - margin_width) / .17))
    gold = linear_color("c7b951").lerp(linear_color("ebdc75"), .48 + .27 * math.sin(t * 35 + seed))
    color = center.lerp(gold, margin)
    longitudinal_grain = 1.0 + .038 * math.cos(24 * u + seed) * math.sin(7 * t + u)
    color *= (.75 + .25 * min(t * 5, 1.0)) * longitudinal_grain
    return (*color, 1.0)


def unwrap_sweep(obj, columns, rows):
    """Unwrap a closed ring sweep with one seam and two separate end caps."""
    layer = obj.data.uv_layers.new(name="Surface UV")
    side_face_count = (rows - 1) * columns
    for face in obj.data.polygons:
        if face.index < side_face_count:
            row, column = divmod(face.index, columns)
            left = .02 + .96 * column / columns
            right = .02 + .96 * (column + 1) / columns
            low = .02 + .83 * row / (rows - 1)
            high = .02 + .83 * (row + 1) / (rows - 1)
            points = ((left, low), (right, low), (right, high), (left, high))
        else:
            column, cap = divmod(face.index - side_face_count, 2)
            center = (.30 + .40 * cap, .93)
            first, second = (column, column + 1) if cap else (column + 1, column)
            points = (center, *(
                (center[0] + .045 * math.cos(math.tau * index / columns),
                 center[1] + .045 * math.sin(math.tau * index / columns))
                for index in (first, second)
            ))
        for index, point in zip(face.loop_indices, points):
            layer.uv[index].vector = point


def blade(parent, name, location, height, width, azimuth, lean, twist, seed, material_slot):
    """Swept lenticular cross-section, with two convex faces and a sealed apex."""
    hinge = empty(f"{name} control", parent)
    hinge.location = location
    hinge.rotation_euler.z = azimuth
    columns = (-1, -.91, -.79, -.58, -.30, 0, .30, .58, .79, .91, 1)
    ring = [(u, side) for side, values in ((1, columns), (-1, reversed(columns))) for u in values]
    profile = ((0, .32), (.10, .70), (.28, 1.00), (.59, .96), (.76, .74), (.91, .43), (.985, .10))

    def breadth(t):
        for (a, value_a), (b, value_b) in zip(profile, profile[1:]):
            if t <= b:
                return value_a + (value_b - value_a) * (t - a) / (b - a)
        return profile[-1][1]

    def point(t, u, side):
        span = width * breadth(t) * .5
        side_ripple = 1 + .028 * math.sin(t * 33 + seed) * abs(u) ** 2
        x = span * u * side_ripple
        channeled = .023 * (1 - u * u) * math.sin(math.pi * (.22 + t * .70))
        thickness = (.006 + .032 * (1 - u * u)) * (1 - t * .7)
        y = channeled - side * thickness
        angle = twist * t + .05 * math.sin(t * 8 + seed) * t
        return (
            lean[0] * t ** 1.7 + x * math.cos(angle) - y * math.sin(angle),
            lean[1] * t ** 1.5 + x * math.sin(angle) + y * math.cos(angle),
            t * height + u * span * .11 * t,
        )

    segment_count = 68
    vertices, colors = [], []
    for row in range(segment_count + 1):
        t = .985 * row / segment_count
        for u, side in ring:
            vertices.append(point(t, u, side))
            colors.append(leaf_pigment(t, u, seed, side < 0))
    vertices.extend(((0, 0, -.012), (lean[0], lean[1], height)))
    colors.extend((leaf_pigment(0, 0, seed, False), (*linear_color("9d9e44"), 1)))
    cap, tip = len(vertices) - 2, len(vertices) - 1
    size = len(ring)
    faces = []
    for row in range(segment_count):
        for column in range(size):
            next_column = (column + 1) % size
            start, end = row * size, (row + 1) * size
            faces.append((start + column, start + next_column, end + next_column, end + column))
    for column in range(size):
        next_column = (column + 1) % size
        faces.append((cap, next_column, column))
        faces.append((tip, segment_count * size + column, segment_count * size + next_column))

    leaf = mesh(name, vertices, faces, material_slot, hinge)
    pigment = leaf.data.color_attributes.new(name=PIGMENT, type="FLOAT_COLOR", domain="POINT")
    leaf.data.color_attributes.active_color = pigment
    for attr, rgb in zip(pigment.data, colors):
        attr.color = rgb
    unwrap_sweep(leaf, size, segment_count + 1)
    return hinge


def pot(parent, glaze, clay, rim):
    """Closed, thrown ceramic shell with a rolled rim and exposed clay foot."""
    rings = [(.33, 0, 1), (.44, 0, 1), (.50, .025, 1), (.50, .072, 1), (.54, .105, 0),
             (.59, .21, 0), (.625, .37, 0), (.64, .54, 0), (.66, .70, 0), (.683, .738, 2),
             (.69, .78, 2), (.677, .829, 2), (.653, .850, 2), (.627, .848, 2),
             (.604, .823, 2), (.609, .790, 2), (.587, .70, 0), (.558, .53, 0),
             (.528, .33, 0), (.479, .17, 1), (.443, .13, 1), (.30, .13, 1)]
    steps = 64
    vertices = []
    for radius, z, _ in rings:
        for index in range(steps):
            angle = math.tau * index / steps
            thrown = 1 + .004 * math.sin(9 * angle + z * 5) + .004 * math.sin(3 * angle)
            vertices.append((radius * thrown * math.cos(angle), radius * thrown * math.sin(angle), z))
    vertices.extend(((0, 0, 0), (0, 0, .13)))
    bottom, inside = len(vertices) - 2, len(vertices) - 1
    faces, slots = [], []
    for row, (_, _, slot) in enumerate(rings[:-1]):
        for index in range(steps):
            following = (index + 1) % steps
            offset, ahead = row * steps, (row + 1) * steps
            faces.append((offset + index, offset + following, ahead + following, ahead + index))
            slots.append(slot)
    last = (len(rings) - 1) * steps
    for index in range(steps):
        following = (index + 1) % steps
        faces.extend(((bottom, following, index), (inside, last + index, last + following)))
        slots.extend((1, 1))
    ceramic = mesh("Wheel-thrown pot", vertices, faces, glaze, parent)
    ceramic.data.materials.append(clay)
    ceramic.data.materials.append(rim)
    for face, index in zip(ceramic.data.polygons, slots):
        face.material_index = index
    unwrap_sweep(ceramic, steps, len(rings))
    return ceramic


def shaped_inlay(name, location, dimensions, pigment, parent):
    obj = sphere(name, location, dimensions, pigment, parent)
    obj.data.transform(Matrix.Diagonal((*obj.scale, 1)))
    obj.scale = (1, 1, 1)
    return obj


def make():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 1, 79
    root = empty("Snake Plant")
    crown = empty("Leaf crown control", root)
    crown.location.z = SOIL_HEIGHT - .055
    planted = material("Planted substrate", "34271c", .94)
    clay = material("Bare iron-rich terracotta", "89503f", .74)
    glaze = material("Hand-thrown flax glaze", "cda883", .38, .22)
    rim = material("Oxidized olive rim", "657850", .30, .27)
    ink = material("Roasted umber facial inlay", "342623", .41)
    iris = material("Amber iris glaze", "876135", .34, .20)
    porcelain = material("Ivory eye inlay", "f7e7c7", .31, .16)
    cheek = material("Warm clay slip", "c68064", .56)
    leaf_material = material("Laurentii leaf wax", "ffffff", .45, .16)
    shader = next(node for node in leaf_material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    attribute = leaf_material.node_tree.nodes.new("ShaderNodeVertexColor")
    attribute.layer_name = PIGMENT
    leaf_material.node_tree.links.new(attribute.outputs["Color"], shader.inputs["Base Color"])
    pot(root, glaze, clay, rim)
    shaped_inlay("Potting soil", (0, 0, SOIL_HEIGHT - .044), (.612, .612, .063), planted, root)
    for index, (x, y, r) in enumerate([(-.38, -.26, .055), (.29, -.39, .06), (.42, .11, .052),
                                       (-.39, .21, .049), (.15, .41, .06), (.02, -.38, .038)]):
        z = SOIL_HEIGHT - .044 + .062 * math.sqrt(1 - (math.hypot(x, y) / .612) ** 2)
        shaped_inlay(f"Bark fragment {index + 1}", (x, y, z - .015), (r, r * .56, .025), clay, root)

    layout = [
        ("Rear spear", (-.10, .22, .025), 2.05, .39, .05, (-.10, .19), -.20),
        ("Tall center spear", (.12, .085, .013), 1.93, .42, -.22, (.19, .10), .28),
        ("Left upright blade", (-.26, .055, 0), 1.70, .36, .35, (-.39, -.045), -.34),
        ("Right outer blade", (.29, .035, .006), 1.50, .32, -.28, (.44, -.06), .36),
        ("Side-facing rear blade", (.21, .25, .01), 1.46, .30, 1.33, (.24, .32), -.29),
        ("Front center blade", (-.04, -.15, .001), 1.47, .34, .18, (-.14, -.32), .41),
        ("Left basal blade", (-.28, -.18, .004), 1.10, .26, -.23, (-.36, -.22), -.20),
        ("Emerging inner spear", (.17, -.18, .01), 1.00, .215, .47, (.15, -.20), -.46),
        ("Young rear spear", (-.24, .28, .023), 1.38, .29, -.72, (-.25, .24), .29),
    ]
    pivots = [blade(crown, *item, seed=index / 6, material_slot=leaf_material) for index, item in enumerate(layout)]

    eyes, brows = [], []
    for index, x in enumerate((-.222, .222)):
        sign = -1 if x < 0 else 1
        eye = empty(f"Eye {index + 1} blink control", root)
        eye.location = (x, -.596, .486)
        eye.rotation_euler.z = sign * .27
        shaped_inlay(f"Eye {index + 1} porcelain", (0, -.016, 0), (.126, .052, .123), porcelain, eye)
        shaped_inlay(f"Eye {index + 1} iris", (-.007, -.061, .003), (.074, .029, .085), iris, eye)
        shaped_inlay(f"Eye {index + 1} pupil", (-.010, -.083, .006), (.057, .022, .068), ink, eye)
        shaped_inlay(f"Eye {index + 1} catchlight", (-.030, -.101, .039), (.020, .010, .021), porcelain, eye)
        eyes.append(eye)
        shaped_inlay(f"Cheek {index + 1}", (x * 1.58, -.522, .342), (.075, .030, .028), cheek, root).rotation_euler.z = sign * .44
        brow_pivot = empty(f"Brow {index + 1} control", root)
        brow_pivot.location = (x, -.592, .633)
        brow_pivot.rotation_euler.z = sign * .29
        stem(f"Eyebrow {index + 1}", [(-.092, .015, -.013), (-.048, -.015, .008),
                                      (.021, -.019, .017), (.085, .016, .001)], .020, ink, brow_pivot,
             (.52, 1, .89, .42))
        brows.append(brow_pivot)
    stem("Small asymmetric smile", [(-.121, -.614, .323), (-.053, -.645, .284),
                                    (.052, -.645, .285), (.124, -.614, .331)], .021, ink, root,
         (.48, 1, .85, .53))

    clips = {
        "Idle": (79, [(1, 0, 0), (22, .013, -.023), (42, -.020, .021), (61, .013, -.005), (79, 0, 0)]),
        "Notice": (31, [(1, 0, 0), (9, -.067, -.083), (18, -.025, .044), (31, 0, 0)]),
        "Curious": (39, [(1, 0, 0), (16, -.039, -.11), (39, -.031, -.093)]),
        "Concerned": (47, [(1, 0, 0), (17, .077, .053), (33, .050, .066), (47, .067, .053)]),
        "Relieved": (41, [(1, 0, 0), (14, -.066, .037), (31, -.013, .013), (41, -.024, .018)]),
        "Celebrate": (57, [(1, 0, 0), (11, -.052, -.12), (22, .041, .113), (34, -.047, -.089), (57, 0, 0)]),
    }
    for clip, (end, rotations) in clips.items():
        pose_track(crown, clip, "rotation_euler", [(frame, (x, 0, y)) for frame, x, y in rotations])
        scales = {"Notice": 1.15, "Curious": 1.10, "Concerned": .70, "Relieved": .78, "Celebrate": 1.10}
        for index, eye in enumerate(eyes):
            if clip == "Idle":
                keys = [(1, 1), (37 + index, 1), (39 + index, .08), (42 + index, 1), (end, 1)]
            else:
                value = scales[clip]
                held = clip in {"Curious", "Concerned", "Relieved"}
                keys = [(1, 1), (11 + index, value), (end, value if held else 1)]
            pose_track(eye, clip, "scale", [(frame, (1, 1, scale)) for frame, scale in keys])
    for index, brow in enumerate(brows):
        tilt = (-1 if index == 0 else 1) * .14
        z = brow.rotation_euler.z
        pose_track(brow, "Concerned", "rotation_euler", [(1, (0, 0, z)), (13, (0, tilt, z)), (47, (0, tilt, z))])
    for index, pivot in enumerate(pivots):
        z = pivot.rotation_euler.z
        follow = .054 if index % 2 else -.043
        pose_track(pivot, "Celebrate", "rotation_euler", [(1, (0, 0, z)), (14 + index % 3, (follow, -.04, z)),
                                                         (31, (-follow * .55, .02, z)), (57, (0, 0, z))])
    pose_track(root, "Celebrate", "location", [(1, (0, 0, 0)), (11, (0, 0, .115)), (25, (0, 0, .008)),
                                               (35, (0, 0, .057)), (57, (0, 0, 0))])
    scene.frame_set(1)
    return scene, root


def verify_meshes(root):
    for obj in root.children_recursive:
        if obj.type != "MESH":
            continue
        topology = bmesh.new()
        topology.from_mesh(obj.data)
        try:
            assert all(edge.is_manifold and edge.is_contiguous for edge in topology.edges), obj.name
            assert all(face.calc_area() > 1e-9 for face in topology.faces), obj.name
            assert topology.calc_volume(signed=True) > 0, obj.name
        finally:
            topology.free()


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
        raise RuntimeError(f"Unable to export the Snake Plant GLB: {result}")
    for track in tracks:
        track.mute = True
    scene.frame_set(1)
    camera = studio(scene)
    camera.data.ortho_scale = 3.15
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

    camera.location = (1.42, -7, 3.29)
    camera.rotation_euler = (Vector((0, 0, 1.36)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(args.thumbnail.resolve())
    bpy.ops.wm.save_as_mainfile(filepath=str(args.source.resolve()))
    bpy.ops.render.render(write_still=True)
    if args.review:
        scene.render.image_settings.file_format = "PNG"
        for view, position in {"front": (0, -7, 3.05), "side": (7, 0, 3.25), "rear": (0, 7, 3.15)}.items():
            camera.location = position
            camera.rotation_euler = (Vector((0, 0, 1.36)) - camera.location).to_track_quat("-Z", "Y").to_euler()
            scene.render.filepath = str((args.review / f"snake-plant-{view}.png").resolve())
            bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
