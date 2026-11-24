"""Build the first Petey character in a fresh Blender process."""

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

TAU = math.tau


def material(name, hex_color, roughness=0.45, coat=0.0):
    color = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [c / 12.92 if c < 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in color]
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*linear, 1)
    mat.use_nodes = True
    shader = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = mat.diffuse_color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Coat Weight"].default_value = coat
    return mat


def mesh(name, vertices, faces, mat, parent):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    if data.validate():
        raise ValueError(f"Invalid source topology: {name}")
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    data.materials.append(mat)
    for polygon in data.polygons:
        polygon.use_smooth = True
    return obj


def empty(name, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    return obj


def sphere(name, point, scale, mat, parent):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=11, location=point)
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.scale = scale
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def stem(name, points, radius, mat, parent, radii=None):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 5 if radius < .013 else 7
    curve.bevel_depth = radius
    curve.bevel_resolution = 0 if radius < .013 else 2
    curve.use_fill_caps = True
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for i, (point, xyz) in enumerate(zip(spline.bezier_points, points)):
        point.co = xyz
        point.handle_left_type = point.handle_right_type = "AUTO"
        point.radius = radii[i] if radii else 1.0
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    curve.materials.append(mat)
    return obj


def pottery(parent, glaze, foot, lip):
    # Closed cross-section includes the inner wall and the underside.
    profile = [
        (.19, .07), (.50, .07), (.59, .09), (.62, .14), (.64, .19),
        (.73, .29), (.785, .44), (.805, .61), (.812, .83),
        (.797, 1.01), (.780, 1.078), (.798, 1.095), (.802, 1.125),
        (.776, 1.153), (.733, 1.160), (.705, 1.138), (.704, 1.102),
        (.711, .995), (.728, .82), (.715, .55), (.659, .29),
        (.54, .19), (.19, .19),
    ]
    n = 96
    vertices = [
        (r * (1 + .008 * math.sin(3 * a + z * 4)) * math.cos(a),
         r * .92 * math.sin(a), z)
        for r, z in profile for a in (TAU * i / n for i in range(n))
    ]
    faces = []
    for j in range(len(profile)):
        for i in range(n):
            a = j * n + i
            b = j * n + (i + 1) % n
            c = ((j + 1) % len(profile)) * n + (i + 1) % n
            d = ((j + 1) % len(profile)) * n + i
            faces.append((a, b, c, d))
    pot = mesh("Wheel-thrown ceramic", vertices, faces, glaze, parent)
    pot.data.materials.append(foot)
    pot.data.materials.append(lip)
    for polygon in pot.data.polygons:
        band = polygon.index // n
        polygon.material_index = 1 if band < 4 or band == len(profile) - 1 else (2 if 11 <= band <= 15 else 0)
    uv = pot.data.uv_layers.new(name="Wheel UV")
    for polygon in pot.data.polygons:
        line, column = divmod(polygon.index, n)
        for loop, (u, v) in zip(polygon.loop_indices, [(column, line), (column + 1, line), (column + 1, line + 1), (column, line + 1)]):
            uv.data[loop].uv = (u / n, v / len(profile))
    return pot


def blade(name, pivot, length, width, color, veins, cuts, holes, bias):
    rows, cols = 42, 16

    def point(t, s):
        # Width expands at the heart and falls toward the terminal lobe.
        breadth = (math.sin(math.pi * (.045 + .955 * min(t, .9999)))) ** .76 * (1.28 - .50 * t)
        incisions = cuts if s < 0 else tuple(x + bias for x in cuts)
        drop = max((math.exp(-((t - xpos) / .023) ** 2) for xpos in incisions), default=0)
        x = width * (s * breadth * (1 - .65 * drop) + .095 * math.sin(t * math.pi) * bias * 10)
        y = length * (t + .10 * abs(s) * math.exp(-((t - .13) / .13) ** 2) * -1)
        z = .16 * math.sin(t * math.pi) - .16 * t * t - .085 * s * s + .028 * s * math.sin(t * 25)
        return x, y, z

    vertices = [point(i / rows, -1 + 2 * j / cols) for i in range(rows + 1) for j in range(cols + 1)]
    faces = []
    for i in range(rows):
        for j in range(cols):
            a = i * (cols + 1) + j
            faces.append((a, a + 1, a + cols + 2, a + cols + 1))
    leaf = mesh(name, vertices, faces, color, pivot)
    uv = leaf.data.uv_layers.new(name="Blade UV")
    for polygon in leaf.data.polygons:
        for loop in polygon.loop_indices:
            row, column = divmod(leaf.data.loops[loop].vertex_index, cols + 1)
            uv.data[loop].uv = (column / cols, row / rows)
    bpy.context.view_layer.objects.active = leaf
    thickness = leaf.modifiers.new("Lamina thickness", "SOLIDIFY")
    thickness.thickness = .013
    bpy.ops.object.modifier_apply(modifier=thickness.name)
    # Cutters operate before the petiole's final world orientation.
    for t, side, rx, ry in holes:
        cx, cy, _ = point(t, side)
        bpy.ops.mesh.primitive_cylinder_add(vertices=30, radius=1, depth=5, location=(cx, cy, 0))
        cutter = bpy.context.object
        cutter.scale = (rx, ry, 1)
        cutter.rotation_euler.z = .42 * (1 if side > 0 else -1)
        bpy.context.view_layer.objects.active = leaf
        cut = leaf.modifiers.new("Natural fenestration", "BOOLEAN")
        cut.operation = "DIFFERENCE"
        cut.solver = "EXACT"
        cut.object = cutter
        bpy.ops.object.modifier_apply(modifier=cut.name)
        bpy.data.objects.remove(cutter, do_unlink=True)
    stem("Raised midrib", [Vector(point(t, 0)) + Vector((0, 0, .012)) for t in (0, .22, .47, .71, .92, .99)],
         .010, veins, pivot, (1, .86, .66, .45, .21, .09))
    for side, times in ((-1, (.17, .31, .45, .60, .73)), (1, (.20, .34, .49, .64, .77))):
        for t in times:
            path = [(t, 0), (t + .065, side * .31), (t + .10, side * .64), (t + .115, side * .89)]
            # Veins terminate before crossing a fenestration.
            keep = []
            for tt, ss in path:
                xyz = Vector(point(tt, ss))
                near_hole = any(
                    ((xyz.x - point(ht, hs)[0]) / (rx * 1.45)) ** 2
                    + ((xyz.y - point(ht, hs)[1]) / (ry * 1.18)) ** 2 < 1
                    for ht, hs, rx, ry in holes
                )
                if near_hole:
                    break
                keep.append(xyz + Vector((0, 0, .010)))
            if len(keep) > 1:
                stem("Lateral vein", keep, .0036, veins, pivot, [1 - .26 * i for i in range(len(keep))])


def parent_axis(pivot, at, toward, facing):
    axis = Vector(toward).normalized()
    normal = Vector(facing)
    side = axis.cross(normal).normalized()
    normal = side.cross(axis).normalized()
    from mathutils import Matrix
    pivot.location = at
    pivot.rotation_euler = Matrix((side, axis, normal)).transposed().to_euler()


def pose_track(obj, name, path, keys):
    original = tuple(getattr(obj, path))
    for frame, value in keys:
        setattr(obj, path, value)
        obj.keyframe_insert(data_path=path, frame=frame)
    anim = obj.animation_data
    action = anim.action
    action.name = f"{name} / {obj.name}"
    slot = anim.action_slot
    anim.action = None
    track = anim.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, action)
    strip.action_slot = slot
    track.mute = True
    setattr(obj, path, original)


def make():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 1, 73
    root = empty("Monstera")
    crown = empty("Canopy performance", root)
    crown.location.z = 1.03
    cream = material("Oat-milk satin glaze", "e0b68b", .31, .3)
    unglazed = material("Unglazed fired terracotta", "a65f49", .83)
    celadon = material("Oxidized jade rim", "426b58", .27, .32)
    soil = material("Dark potting soil", "433127", .97)
    stalk = material("Petioles, olive green", "53804b", .40)
    vein = material("Muted yellow-green midrib", "83a462", .46)
    leaf_materials = [material(f"Lamina {i}", color, .40, .16)
                      for i, color in enumerate(("275e45", "367351", "498358", "21543c"))]
    ink = material("Espresso clay inlay", "322821", .38)
    eye_white = material("Warm porcelain", "fff2da", .32)
    iris = material("Chestnut iris", "81532f", .37)
    blush = material("Iron-oxide blush", "c97d64", .70)
    pottery(root, cream, unglazed, celadon)
    sphere("Soil surface", (0, 0, 1.027), (.716, .650, .045), soil, root)
    for i, (x, y, z) in enumerate([(-.43, -.30, 1.066), (.30, -.24, 1.063), (.44, .15, 1.066), (-.10, .43, 1.067)]):
        sphere(f"Soil crumb {i}", (x, y, z), (.052, .032, .021), unglazed, root)

    eyes = []
    for side, (x, tilt) in enumerate(((-.260, -.075), (.256, .090))):
        pivot = empty(f"Eye control {side}", root)
        pivot.location = (x, -.691, .70)
        pivot.rotation_euler.z = tilt
        eyes.append(pivot)
        sphere(f"Porcelain eye {side}", (0, -.020, 0), (.146, .067, .174), eye_white, pivot)
        sphere(f"Iris {side}", (.014, -.076, -.012), (.101, .038, .125), iris, pivot)
        sphere(f"Pupil {side}", (.015, -.106, -.008), (.071, .025, .090), ink, pivot)
        sphere(f"Catchlight {side}", (-.016, -.129, .039), (.031, .012, .033), eye_white, pivot)
        sphere(f"Cheek slip {side}", (x * 1.67, -.622, .515), (.106, .046, .047), blush, root)
        stem(f"Confident brow {side}", [(x - .115, -.691, .897), (x, -.724, .950 + .016 * side),
                                      (x + .106, -.686, .925 + .035 * side)], .025, ink, root, (.54, 1, .42))
    smile = stem("Side smile", [(-.132, -.746, .445), (-.040, -.765, .406), (.062, -.762, .411), (.162, -.741, .477)],
                 .024, ink, root, (.5, 1, 1, .48))
    # Alternating stalks start just inside the soil and reach each individual lamina.
    layouts = [
        ("Left adult", (-.56, -.08, .69), (-.81, .05, .52), (0, -.84, .55), 1.13, .59, 0, .011),
        ("Right adult", (.47, .02, .88), (.80, -.11, .46), (.06, -.87, .49), 1.04, .58, 1, -.016),
        ("Crown adult", (.06, .12, 1.07), (-.24, .05, .97), (.04, -.88, .34), 1.09, .53, 3, .015),
        ("Rear leaf", (-.20, .34, .77), (-.38, .77, .56), (.35, .18, .9), .89, .49, 1, -.013),
        ("Young right", (.36, -.27, .46), (.73, -.36, .34), (.08, -.65, .75), .64, .35, 2, 0),
        ("Young left", (-.32, -.25, .43), (-.72, -.55, .25), (-.15, -.67, .73), .58, .33, 2, 0),
    ]
    for label, at, toward, facing, length, width, tone, bias in layouts:
        start = (.09 if at[0] > 0 else -.09, .06, -.041)
        middle = (at[0] * .42, at[1] * .4, at[2] * .52)
        stem(f"{label} petiole", [start, middle, at], .033, stalk, crown, (1, .81, .64))
        pivot = empty(f"{label} hinge", crown)
        cuts = (.36, .49, .64, .77, .87) if bias else ()
        holes = [(.27, -.35, .055, .089), (.42, .37, .042, .071), (.54, -.31, .034, .050)] if bias else []
        blade(f"{label} lamina", pivot, length, width, leaf_materials[tone], vein, cuts, holes, bias)
        parent_axis(pivot, at, toward, facing)

    clips = {
        "Idle": (73, [(1, 0, 0), (21, .025, -.026), (40, -.018, .033), (57, .018, .009), (73, 0, 0)]),
        "Blink": (11, [(1, 0, 0), (11, 0, 0)]),
        "Notice": (26, [(1, 0, 0), (8, -.10, -.08), (17, -.044, -.035), (26, 0, 0)]),
        "Curious": (38, [(1, 0, 0), (14, -.08, .135), (31, -.07, .105), (38, -.08, .135)]),
        "Concerned": (44, [(1, 0, 0), (16, .23, -.080), (34, .195, -.056), (44, .23, -.080)]),
        "Relieved": (38, [(1, 0, 0), (12, -.09, .033), (30, -.046, .033), (38, -.035, .038)]),
        "Celebrate": (53, [(1, 0, 0), (10, -.11, -.18), (19, .06, .16), (28, -.14, -.12), (39, .03, .08), (53, 0, 0)]),
        "Return to idle": (17, [(1, -.08, .11), (9, .026, -.014), (17, 0, 0)]),
    }
    for name, (end, gestures) in clips.items():
        pose_track(crown, name, "rotation_euler", [(frame, (x, 0, z)) for frame, x, z in gestures])
        if name == "Idle":
            blink = [(1, 1), (33, 1), (35, .08), (38, 1), (73, 1)]
        elif name == "Blink":
            blink = [(1, 1), (4, .06), (7, .14), (11, 1)]
        else:
            expression = {"Notice": 1.16, "Curious": 1.05, "Concerned": .72,
                          "Relieved": .64, "Celebrate": 1.1, "Return to idle": 1}[name]
            blink = [(1, 1), (min(10, end - 2), expression), (end, expression if name in {"Curious", "Concerned", "Relieved"} else 1)]
        for eye in eyes:
            pose_track(eye, name, "scale", [(frame, (1, 1, scale)) for frame, scale in blink])
    pose_track(root, "Celebrate", "location", [(1, (0, 0, 0)), (11, (0, 0, .15)), (19, (0, 0, .01)),
                                              (29, (0, 0, .12)), (39, (0, 0, .015)), (53, (0, 0, 0))])
    pose_track(smile, "Relieved", "rotation_euler", [(1, (0, 0, 0)), (16, (0, -.09, 0)), (38, (0, -.09, 0))])
    scene.frame_set(1)
    return scene, root


def studio(scene):
    ground = material("Studio backdrop", "b4ada0", .93)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, .056))
    bpy.context.object.name = "Backdrop"
    bpy.context.object.data.materials.append(ground)
    scene.world.use_nodes = True
    world = next(n for n in scene.world.node_tree.nodes if n.type == "BACKGROUND")
    world.inputs["Color"].default_value = (.45, .53, .49, 1)
    world.inputs["Strength"].default_value = .30
    for name, position, energy, size, color in [
        ("Softbox", (-3.7, -4.2, 6.0), 510, 4.4, (1, .82, .65)),
        ("Fill", (3.3, -2.5, 3.4), 220, 3.5, (.80, .94, 1)),
        ("Rim", (1.1, 3.1, 4.9), 410, 2.5, (1, .84, .64)),
    ]:
        data = bpy.data.lights.new(name, "AREA")
        data.energy, data.size, data.color = energy, size, color
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = position
        obj.rotation_euler = (Vector((0, 0, 1.2)) - obj.location).to_track_quat("-Z", "Y").to_euler()
    lens = bpy.data.cameras.new("Portrait camera")
    lens.type, lens.ortho_scale = "ORTHO", 4.05
    camera = bpy.data.objects.new("Portrait camera", lens)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 5
    scene.render.resolution_x = scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    return camera


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--glb", type=Path, required=True)
    parser.add_argument("--renders", type=Path, required=True)
    parser.add_argument("--views", nargs="+", default=["three-quarter", "front", "side", "rear"])
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    for path in (args.source.parent, args.glb.parent, args.renders):
        path.mkdir(parents=True, exist_ok=True)
    scene, root = make()
    assets = [root, *root.children_recursive]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in assets:
        obj.select_set(True)
        if obj.animation_data:
            for track in obj.animation_data.nla_tracks:
                track.mute = False
    bpy.context.view_layer.objects.active = root
    status = bpy.ops.export_scene.gltf(
        filepath=str(args.glb.resolve()), export_format="GLB", use_selection=True,
        export_animations=True, export_animation_mode="NLA_TRACKS", export_frame_range=False,
    )
    if status != {"FINISHED"}:
        raise RuntimeError(status)
    for obj in assets:
        if obj.animation_data:
            for track in obj.animation_data.nla_tracks:
                track.mute = True
    camera = studio(scene)
    angles = {"three-quarter": (2.2, -7, 3.48), "front": (0, -7, 3.10),
              "side": (7, 0, 3.10), "rear": (0, 7, 3.10)}
    for view in args.views:
        camera.location = angles[view]
        camera.rotation_euler = (Vector((0, 0, 1.52)) - camera.location).to_track_quat("-Z", "Y").to_euler()
        if view == args.views[0]:
            bpy.context.preferences.filepaths.save_version = 0
            for screen in bpy.data.screens:
                for area in screen.areas:
                    if area.type == "VIEW_3D":
                        area.spaces.active.region_3d.view_perspective = "CAMERA"
            bpy.ops.wm.save_as_mainfile(filepath=str(args.source.resolve()))
        scene.render.filepath = str((args.renders / f"monstera-{view}.png").resolve())
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
