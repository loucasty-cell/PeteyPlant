"""Build the Spider Plant mascot in a fresh Blender background process."""

import argparse
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Color, Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_monstera import empty, material, mesh, pose_track, sphere, studio

TAU = math.tau


def closed_mesh(name, vertices, faces, materials, parent, slots=()):
    obj = mesh(name, vertices, faces, materials[0], parent)
    for mat in materials[1:]:
        obj.data.materials.append(mat)
    for face, slot in zip(obj.data.polygons, slots):
        face.material_index = slot
    topology = bmesh.new()
    topology.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(topology, faces=list(topology.faces))
    topology.to_mesh(obj.data)
    topology.free()
    obj.data.update()
    return obj


def connect_rings(faces, start, rows, ring_size):
    for row in range(rows - 1):
        lower = start + row * ring_size
        upper = lower + ring_size
        for column in range(ring_size):
            following = (column + 1) % ring_size
            faces.append((lower + column, lower + following, upper + following, upper + column))


def tube(name, points, radii, mat, parent):
    path = [Vector(point) for point in points]
    vertices, faces = [], []
    sides = 8
    for i, (point, radius) in enumerate(zip(path, radii)):
        tangent = (path[min(i + 1, len(path) - 1)] - path[max(0, i - 1)]).normalized()
        side = tangent.cross(Vector((0, 1, .12))).normalized()
        normal = tangent.cross(side)
        for column in range(sides):
            angle = TAU * column / sides
            vertices.append(point + radius * (math.cos(angle) * side + math.sin(angle) * normal))
    connect_rings(faces, 0, len(path), sides)
    for offset, center in ((0, path[0]), (len(vertices) - sides, path[-1])):
        index = len(vertices)
        vertices.append(center)
        faces.extend((index, offset + i, offset + (i + 1) % sides) for i in range(sides))
    return closed_mesh(name, vertices, faces, [mat], parent)


def arching_rosette(name, parent, leaves, materials, resolution):
    vertices, faces, slots, pigment = [], [], [], []
    # Shoulders rise above the midline, preserving the blade's lengthwise groove.
    section = ((-1, 0), (-.76, .37), (-.55, .56), (-.39, .59), (-.24, .52),
               (0, .33), (.24, .52), (.39, .59), (.55, .56), (.76, .37), (1, 0),
               (.55, -.32), (.33, -.46), (0, -.50), (-.33, -.46), (-.55, -.32))
    greens = [Vector(Color(rgb).from_srgb_to_scene_linear()) for rgb in
              ((.32, .51, .25), (.25, .44, .23), (.40, .56, .30))]
    stripe = Vector(Color((.89, .88, .70)).from_srgb_to_scene_linear())
    reverse_stripe = Vector(Color((.73, .77, .57)).from_srgb_to_scene_linear())
    for index, (base_radius, angle, reach, lift, fall, width) in enumerate(leaves):
        radial = Vector((math.cos(angle), math.sin(angle), 0))
        across = Vector((-radial.y, radial.x, 0))
        direction = 1 if index % 2 else -1

        def center(t):
            point = radial * (base_radius + reach * t ** 1.45)
            point += across * (width * direction * .95 * t * math.sin(t * math.pi * .8))
            point.z = -.014 + lift * math.sin(math.pi * .82 * t) - fall * t ** 3.1
            return point

        start = len(vertices)
        for row in range(resolution):
            t = row / resolution
            point = center(t)
            tangent = (center(t + .002) - center(max(0, t - .002))).normalized()
            normal = tangent.cross(across).normalized()
            envelope = (.15 + .85 * math.sin(math.pi * t) ** .68) * (1 - t) ** .20
            for u, v in section:
                corrugation = -.115 * u * u + direction * u * t * .32
                vertices.append(point + width * envelope * (across * u + normal * (v * .235 + corrugation)))
                band_center = .035 * math.sin(t * 5 + index * .83)
                band_edge = .37 + .042 * math.sin(t * 6 - index * .61)
                cream = max(0, min(1, (band_edge - abs(u - band_center)) / .20 + .44))
                green = greens[index % len(greens)].copy()
                if v < 0:
                    green *= .79
                green *= .96 + .11 * math.sin(math.pi * t) + .024 * math.sin(t * 19 + u * 6 + index)
                color = green.lerp(reverse_stripe if v < 0 else stripe, cream)
                pigment.append((*color, 1))
        sides = len(section)
        connect_rings(faces, start, resolution, sides)
        slots.extend(int(side >= 10)
                     for _ in range(resolution - 1) for side in range(sides))
        for offset, point in ((start, center(0)), (len(vertices) - sides, center(1))):
            tip = len(vertices)
            vertices.append(point)
            pigment.append(pigment[offset + 5])
            for side in range(sides):
                faces.append((tip, offset + side, offset + (side + 1) % sides))
                slots.append(int(side >= 10))
    rosette = closed_mesh(name, vertices, faces, materials, parent, slots)
    colors = rosette.data.color_attributes.new(name="Ribbon pigments", type="FLOAT_COLOR", domain="POINT")
    colors.data.foreach_set("color", [component for rgba in pigment for component in rgba])
    rosette.data.update()
    return rosette


def pottery(root, glaze, foot, slip):
    # A closed cross-section, from the flat underside through the rolled lip to the inner floor.
    profile = [(0, 0), (.48, 0), (.535, .027), (.554, .070), (.558, .145),
               (.55, .175), (.582, .195), (.647, .295), (.677, .405), (.688, .554),
               (.678, .699), (.662, .775), (.696, .797), (.714, .839), (.707, .891),
               (.677, .914), (.629, .911), (.602, .879), (.601, .817), (.615, .667),
               (.616, .453), (.569, .274), (.48, .211), (0, .211)]
    sides = 64
    vertices = [(0, 0, profile[0][1])]
    faces, slots = [], []
    for row, (radius, z) in enumerate(profile[1:-1]):
        for i in range(sides):
            angle = TAU * i / sides
            flute = .010 * math.cos(12 * angle) if 5 <= row <= 10 else 0
            vertices.append(((radius + flute) * math.cos(angle), radius * math.sin(angle), z))
    connect_rings(faces, 1, len(profile) - 2, sides)
    for row in range(len(profile) - 3):
        slots.extend([1 if row < 5 else 2 if 10 <= row <= 16 else 0] * sides)
    inner_center = len(vertices)
    vertices.append((0, 0, profile[-1][1]))
    inner_ring = inner_center - sides
    for i in range(sides):
        j = (i + 1) % sides
        faces.extend(((0, 1 + i, 1 + j), (inner_center, inner_ring + i, inner_ring + j)))
        slots.extend((1, 0))
    return closed_mesh("Fluted stoneware with rolled slip rim", vertices, faces, [glaze, foot, slip], root, slots)


def build():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 1, 73
    root = empty("Spider Plant")
    crown = empty("Mother crown pivot", root)
    crown.location.z = .888
    clay = material("Pale oatmeal slip", "e8cfa3", .39, .14)
    glaze = material("Glazed lake ceramic", "49789a", .36, .24)
    foot = material("Soft cinnamon ceramic foot", "96654c", .59)
    dark = material("Dark violet glass", "252638", .26, .27)
    cheek = material("Peach underglaze", "dc8e80", .50)
    shine = material("Soft porcelain gleam", "ffecd2", .29)
    soil = material("Dark potting mix", "4a3529", .95)
    stalk = material("Yellow-green runner", "7a8f46", .57)
    leaves = [material("Upper ribbon cuticle", "ffffff", .41, .10),
              material("Diffuse lower ribbon cuticle", "ffffff", .62)]
    for leaf in leaves:
        nodes = leaf.node_tree.nodes
        pigment = nodes.new("ShaderNodeVertexColor")
        pigment.layer_name = "Ribbon pigments"
        shader = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
        leaf.node_tree.links.new(pigment.outputs["Color"], shader.inputs["Base Color"])
    pottery(root, glaze, foot, clay)
    sphere("Potting mix", (0, 0, .861), (.610, .610, .033), soil, root)
    lengths = [(1.09,.87,.43,.112),(1.00,.92,.29,.100),(1.04,.79,.43,.112),
               (1.23,.84,.67,.122),(1.05,.91,.42,.115),(1.16,.80,.49,.109),
               (1.00,.88,.43,.115),(1.20,.79,.60,.099),(.95,1.0,.34,.109)]
    outer = [(.115, i * TAU / len(lengths) + .17 + .14 * math.sin(i), *shape) for i, shape in enumerate(lengths)]
    inner = [(.039, .49 + i * TAU / 7, .59 + .13 * math.cos(i*1.8), .91 + .14 * math.sin(i*1.7),
              .09 + .12 * (i % 3), .083 + .014 * math.cos(i)) for i in range(7)]
    arching_rosette("Mother rosette / sixteen ribbon leaves", crown, outer + inner, leaves, 27)

    daughters = []
    for n, (sign, y, last_z) in enumerate(((-1,-.27,-.268),(1,.13,-.425)), start=1):
        end = (sign * (1.26 + n * .05), y, last_z)
        p0 = Vector((sign * .082, -.02, .001))
        p1 = Vector((sign * .80, y * .45, .56))
        p2 = Vector((sign * 1.26, y * .89, .24))
        p3 = Vector(end)
        points = []
        for i in range(20):
            t = i / 19
            u = 1 - t
            points.append(u**3*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t**3*p3)
        tube(f"Arching stolon {n}", points, [.021 - .012*i/19 for i in range(20)], stalk, crown)
        dancer = empty(f"Plantlet {n} pivot", crown)
        dancer.location = p3
        daughters.append(dancer)
        sphere(f"Plantlet {n} stem node", (0,0,-.009), (.043,.039,.029), stalk, dancer)
        mini = [(.032, .31 + i * TAU / 6 + n * .25, .20 + .11 * (i % 2), .19 + .035*(i % 3),
                 .064 + .013*i, .042 + .007 * (i % 2)) for i in range(6)]
        arching_rosette(f"Daughter rosette {n}", dancer, mini, leaves, 17)
        for i, x in enumerate((-.020, .023)):
            tube(f"Plantlet {n} aerial root {i}", [(x,0,0),(x*1.9,-.005,-.036),(x*2.1,.022,-.077)],
                 (.008,.005,.0025), clay, dancer)

    eyes = []
    for i, sign in enumerate((-1,1)):
        eye = empty(f"Eye {i} pivot", root)
        eye.location = (sign * .222, -.649, .569)
        eyes.append(eye)
        sphere(f"Glass eye {i}", (0,0,0), (.083,.041,.105), dark, eye)
        sphere(f"Eye catchlight {i}", (-.024,-.038,.029), (.021,.012,.022), shine, eye)
        sphere(f"Underglaze cheek {i}", (sign*.354,-.588,.458), (.068,.026,.035), cheek, root)
    tube("Smile inlay", [(-.102,-.681,.459),(-.077,-.687,.435),(-.044,-.690,.417),(0,-.691,.412),
                         (.043,-.691,.416),(.077,-.688,.434),(.101,-.682,.460)], [.015]*7, dark, root)
    for i, point in enumerate(((-.07,-.628,.267),(0,-.607,.225),(.07,-.628,.267))):
        sphere(f"Cream slip fleck {i}", point, (.019,.018,.019), clay, root)

    for obj in root.children_recursive:
        if obj.type == "MESH" and tuple(obj.scale) != (1, 1, 1):
            obj.data.transform(Matrix.Diagonal((*obj.scale, 1)))
            obj.scale = (1, 1, 1)

    clips = {
        "Idle": (73, [(1,0,0),(19,.018,-.033),(53,-.016,.027),(73,0,0)]),
        "Notice": (33, [(1,0,0),(8,-.072,.056),(18,.026,-.035),(33,0,0)]),
        "Curious": (40, [(1,0,0),(16,-.053,.13),(40,-.048,.10)]),
        "Concerned": (44, [(1,0,0),(19,.123,-.045),(44,.116,-.033)]),
        "Relieved": (33, [(1,0,0),(11,-.037,-.041),(22,-.075,.016),(33,-.05,.011)]),
        "Celebrate": (53, [(1,0,0),(12,-.10,.09),(24,.085,-.11),(39,-.049,.061),(53,0,0)]),
    }
    for name, (duration, keys) in clips.items():
        pose_track(crown, name, "rotation_euler", [(f,(x, y, .43*y)) for f,x,y in keys])
        for n, daughter in enumerate(daughters):
            amplification = (1 if n else -1) * 1.30
            pose_track(daughter, name, "rotation_euler", [(f,(.18*x, .57*x, amplification*y)) for f,x,y in keys])
        openness = {"Concerned": .75, "Relieved": .48, "Notice": 1.13, "Celebrate": 1.16}.get(name, 1)
        for eye in eyes:
            blink = [(1,1),(37,1),(39,.10),(43,1),(73,1)] if name == "Idle" else [(1,1),(12,openness),(duration,openness)]
            pose_track(eye, name, "scale", [(f,(1,1,scale)) for f,scale in blink])
    pose_track(root, "Celebrate", "location", [(1,(0,0,0)),(11,(0,0,.12)),(24,(0,0,.01)),(34,(0,0,.065)),(53,(0,0,0))])
    scene.frame_set(1)
    return scene, root


def main():
    parser = argparse.ArgumentParser()
    for option in ("source", "glb", "renders"):
        parser.add_argument(f"--{option}", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    for directory in (args.source.parent, args.glb.parent, args.renders):
        directory.mkdir(parents=True, exist_ok=True)
    scene, root = build()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in (root, *root.children_recursive):
        obj.select_set(True)
        for track in obj.animation_data.nla_tracks if obj.animation_data else []:
            track.mute = False
    bpy.context.view_layer.objects.active = root
    result = bpy.ops.export_scene.gltf(filepath=str(args.glb.resolve()), export_format="GLB",
        use_selection=True, export_animations=True, export_animation_mode="NLA_TRACKS", export_frame_range=False)
    if result != {"FINISHED"}:
        raise RuntimeError(result)
    for obj in (root, *root.children_recursive):
        for track in obj.animation_data.nla_tracks if obj.animation_data else []:
            track.mute = True
    camera = studio(scene)
    bpy.data.objects["Backdrop"].hide_render = True
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = 440
    camera.data.ortho_scale = 3.72
    bpy.context.preferences.filepaths.save_version = 0
    for index, (name, position) in enumerate((("portrait",(1.1,-6,2.45)), ("side",(6,0,2.3)), ("rear",(0,6,2.5)))):
        camera.location = position
        camera.rotation_euler = (Vector((0,0,1.02))-camera.location).to_track_quat("-Z","Y").to_euler()
        if index == 0:
            for screen in bpy.data.screens:
                for area in screen.areas:
                    if area.type == "VIEW_3D":
                        area.spaces.active.region_3d.view_perspective = "CAMERA"
            bpy.ops.wm.save_as_mainfile(filepath=str(args.source.resolve()))
        scene.render.filepath = str((args.renders / f"spider-plant-{name}.png").resolve())
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
