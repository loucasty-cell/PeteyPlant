"""Build Aloe, the observant trail medic, in a fresh Blender process."""
import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_monstera import empty, material, mesh, pose_track, sphere, stem, studio

TAU = math.tau


def leaf(parent, index, angle, length, reach, width, leaf_material, tooth):
    radial = Vector((math.cos(angle), math.sin(angle), 0))
    sideways = Vector((-radial.y, radial.x, 0))
    count = 34
    verts = []
    faces = []
    ring = 8
    for j in range(count):
        t = j / count
        center = radial * (.07 + reach * t ** 1.32)
        center.z = length * t - reach * .31 * t ** 3
        profile = (.43 + .57 * math.sin(math.pi * (t + .18) / 1.18)) * (1 - t) ** .65
        edge = width * profile * (1 + (.15 if j % 3 == 1 else 0) * math.sin(math.pi * t))
        for k in range(ring):
            a = TAU * k / ring
            x = math.cos(a)
            position = center + sideways * (edge * x + .15 * width * t * math.sin(index))
            position.z += profile * (.08 * math.sin(a) + .065 * x * x)
            verts.append(tuple(position))
    for j in range(count - 1):
        for k in range(ring):
            faces.append((j * ring + k, (j + 1) * ring + k,
                          (j + 1) * ring + (k + 1) % ring, j * ring + (k + 1) % ring))
    faces.append(tuple(range(ring)))
    tip = radial * (.07 + reach) + sideways * (.15 * width * math.sin(index))
    tip.z = length - reach * .31
    tip_id = len(verts)
    verts.append(tuple(tip))
    for k in range(ring):
        faces.append(((count - 1) * ring + k, tip_id, (count - 1) * ring + (k + 1) % ring))
    obj = mesh(f"Fleshy tapered blade {index:02}", verts, [tuple(reversed(face)) for face in faces], leaf_material, parent)
    obj.data.materials.append(tooth)
    for face in obj.data.polygons:
        row, side = divmod(face.index, ring)
        if 4 <= row <= 27 and row % 3 == 1 and side in (0, 3, 4, 7):
            face.material_index = 1
    return obj


def planter(root, glaze, body, rim):
    profile = [(0.18, .045), (.53,.045), (.62,.067), (.65,.115), (.66,.19),
               (.67,.28),(.72,.42),(.752,.69),(.751,.92),(.735,1.026),
               (.758,1.04),(.756,1.095),(.709,1.105),(.687,1.076),
               (.694,.91),(.676,.4),(.617,.16),(.18,.16)]
    n = 80
    vertices = [(r * math.cos(a), r * .91 * math.sin(a), z)
                for r, z in profile for a in (TAU * i / n for i in range(n))]
    faces = [(j*n+i, j*n+(i+1)%n, ((j+1)%len(profile))*n+(i+1)%n,
              ((j+1)%len(profile))*n+i) for j in range(len(profile)) for i in range(n)]
    obj = mesh("Round-bellied canteen ceramic", vertices, faces, body, root)
    obj.data.materials.append(glaze)
    obj.data.materials.append(rim)
    for face in obj.data.polygons:
        band = face.index // n
        face.material_index = 2 if 9 <= band <= 12 else 1 if 0 <= band <= 5 else 0


def build():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 1, 73
    root = empty("Aloe trail medic")
    crown = empty("Rosette performance pivot", root)
    crown.location.z = 1.01
    clay = material("Sand satin ceramic", "d8a576", .43, .15)
    sage = material("Olive kiln glaze", "5c754a", .32, .22)
    rim = material("Burnished cinnamon clay", "986045", .48)
    dark = material("Glassy espresso details", "302521", .29)
    bronze = material("Goggle bronze", "c78b47", .34, .24)
    enamel = material("Warm porcelain", "f9e4bf", .32)
    soil = material("Coarse dark potting mix", "43352a", .94)
    leaf_mats = [material(f"Succulent wax tone {i}", hex_color, .45, .17)
                 for i, hex_color in enumerate(("4c7443","5e894d","43683c","719756","365e3b"))]
    tooth = material("Serrated translucent green", "87a75d", .47)
    planter(root, sage, clay, rim)
    sphere("Potting mix surface", (0, 0, 1.003), (.68,.62,.047), soil, root)
    for n, (a, l, r, w) in enumerate([
        (.08,1.10,.66,.18), (1.2,1.38,.54,.16), (2.3,1.31,.77,.19),
        (3.22,1.03,.91,.176),(4.41,.90,.74,.163),(5.36,.93,.87,.176),
        (.79,1.52,.35,.132),(2.02,1.66,.32,.144),(3.56,1.53,.38,.126),
        (4.81,1.30,.38,.129),(5.98,1.51,.34,.128), (2.97,1.83,.19,.116),
    ]):
        leaf(crown, n, a, l, r, w, leaf_mats[n % len(leaf_mats)], tooth)

    stem("Leather goggle strap", [(x, -.598 + .19 * x*x, .851 + x*.06)
                                    for x in (-.64,-.40,-.15,.16,.40,.64)], .046, rim, root)
    # The raised goggles sit on the rim so the face below reads at thumbnail size.
    blue = material("Smoky teal goggle glass", "528688", .22, .39)
    for i, x in enumerate((-.221,.221)):
        z = .940 + .024*i
        stem(f"Goggle frame {i}", [(x + .18*math.cos(a), -.654, z+.146*math.sin(a))
                                    for a in (TAU*j/16 for j in range(17))], .027, bronze, root)
        sphere(f"Goggle lens {i}", (x,-.643,z), (.155,.036,.126), blue, root)
        stem(f"Glass flare {i}", [(x-.075,-.679,z+.043),(x-.042,-.683,z+.065),(x-.015,-.678,z+.074)], .01, enamel, root)
    stem("Goggle bridge", [(-.05,-.651,.95),(0,-.67,.973),(.05,-.651,.96)], .023, bronze, root)
    eyes = []
    for i, x in enumerate((-.218,.218)):
        eye = empty(f"Eye pivot {i}", root)
        eye.location = (x, -.69, .627)
        eyes.append(eye)
        sphere(f"Espresso eye {i}", (0,0,0), (.084,.041,.104), dark, eye)
        sphere(f"Catchlight {i}", (-.022,-.04,.031), (.021,.012,.022), enamel, eye)
    stem("Curved smile", [(-.115,-.699,.445),(-.046,-.71,.410),(.052,-.711,.410),(.112,-.701,.457)], .022, dark, root)
    stem("First aid badge horizontal", [(-.083,-.625,.235),(.083,-.625,.235)], .022, enamel, root)
    stem("First aid badge vertical", [(0,-.624,.177),(0,-.626,.294)], .022, enamel, root)
    clips = {
        "Idle": (73, [(1,0,0),(21,.018,-.018),(49,-.018,.02),(73,0,0)]),
        "Notice": (32, [(1,0,0),(10,-.095,.082),(22,-.045,-.036),(32,0,0)]),
        "Curious": (38, [(1,0,0),(17,-.043,.124),(38,-.041,.10)]),
        "Concerned": (40, [(1,0,0),(20,.157,-.06),(40,.147,-.055)]),
        "Relieved": (32, [(1,0,0),(13,-.072,-.02),(32,-.066,-.012)]),
        "Celebrate": (51, [(1,0,0),(12,-.07,.13),(25,.05,-.12),(39,-.03,.06),(51,0,0)]),
    }
    for name, (duration, keys) in clips.items():
        pose_track(crown, name, "rotation_euler", [(frame, (x, .24*z, z)) for frame,x,z in keys])
        eye_scale = {"Concerned": .76, "Relieved": .61, "Celebrate": 1.13}.get(name, 1)
        for eye in eyes:
            blink = [(1,1),(35,1),(37,.09),(40,1),(73,1)] if name == "Idle" else [(1,1),(11,eye_scale),(duration, eye_scale)]
            pose_track(eye, name, "scale", [(frame,(1,1,scale)) for frame,scale in blink])
    pose_track(root, "Celebrate", "location", [(1,(0,0,0)),(12,(0,0,.13)),(25,(0,0,.01)),(37,(0,0,.08)),(51,(0,0,0))])
    scene.frame_set(1)
    return scene, root


def deliver(create, species, *, target_z, ortho_scale):
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--glb", type=Path, required=True)
    parser.add_argument("--renders", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:])
    for path in (args.source.parent,args.glb.parent,args.renders):
        path.mkdir(parents=True, exist_ok=True)
    scene, root = create()
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
    scene.render.resolution_x = scene.render.resolution_y = 420
    camera.data.ortho_scale = ortho_scale
    bpy.context.preferences.filepaths.save_version = 0
    for i, (name, position) in enumerate((("portrait",(1.78,-6,2.98)),("side",(6,0,2.55)),("rear",(0,6,2.61)))):
        camera.location = position
        camera.rotation_euler = (Vector((0,0,target_z))-camera.location).to_track_quat("-Z","Y").to_euler()
        if i == 0:
            for screen in bpy.data.screens:
                for area in screen.areas:
                    if area.type == "VIEW_3D":
                        area.spaces.active.region_3d.view_perspective = "CAMERA"
            bpy.ops.wm.save_as_mainfile(filepath=str(args.source.resolve()))
        scene.render.filepath = str((args.renders / f"{species}-{name}.png").resolve())
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    deliver(build, "aloe", target_z=1.43, ortho_scale=3.38)
