"""Build an editable fiddle-leaf fig companion with a woody branching crown."""
import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_monstera import empty, material, mesh, parent_axis, pose_track, pottery, sphere, stem
from build_aloe import deliver
from build_snake_plant import linear_color

TAU = math.tau
PIGMENT = "Ficus leaf pigment"


def fiddle(parent, name, length, width, cuticle, green, seed):
    rows, across = 46, 14
    # The blade broadens at the base and shoulder, with a waist and blunt apex.
    outline = ((0, .04), (.10, .56), (.23, .82), (.43, .62), (.62, .92), (.79, 1), (.92, .72), (1, .07))
    lower = linear_color("739055")
    upper_vein = linear_color("9ba96c")
    lower_vein = linear_color("b3bd81")
    surface_vertices, underside_vertices, upper_colors, lower_colors = [], [], [], []

    for row in range(rows + 1):
        t = row / rows
        for (a, x), (b, y) in zip(outline, outline[1:]):
            if a <= t <= b:
                f = (t - a) / (b - a)
                profile = x + (y - x) * f * f * (3 - 2 * f)
                break
        envelope = math.sin(math.pi * t)
        for column in range(across + 1):
            u = 2 * column / across - 1
            flank = abs(u)
            # Lateral veins curve toward the apex and alternate along the midrib.
            offset = .09 * flank + .02 * flank**2
            phase = (t - .12 - offset - .013 * u) / .119 + .11 * math.sin(16*t + seed)
            rib = math.exp(-((phase - round(phase)) / .15)**2) * envelope
            rib *= 1 - .44 * flank**3
            midrib = (1 - flank) ** 17 * envelope
            ripple = flank**3 * (.021 * math.sin(25*t + seed + u) + .012 * math.sin(44*t - seed))
            spread = width * profile * u * (1 + .05 * u * math.sin(6*t + seed))
            x = spread + .047 * envelope * math.sin(2.5*t + seed)
            y = length * t + .041 * flank**2 * envelope
            z = .14 * envelope + .08*t*t - .11 * u*u * envelope + ripple
            # Raised panels between the main veins and a thicker central midrib.
            z += .016 * envelope * (1 - rib) * math.sin(math.pi * flank) + .018 * midrib
            thickness = .005 + .008 * (1 - flank) * envelope
            surface_vertices.append((x, y, z))
            underside_vertices.append((x, y, z - thickness - .008 * (midrib + rib * flank)))
            shades = .06 + .035 * math.sin(t * 33 + u * 6 + seed) + .04 * flank
            pigment = green.lerp(lower, shades).lerp(upper_vein, .64 * midrib + .32 * rib)
            upper_colors.append((*pigment, 1))
            pigment = lower.lerp(green, .18 + .09 * flank).lerp(lower_vein, .61 * midrib + .52 * rib)
            lower_colors.append((*pigment, 1))

    count = len(surface_vertices)
    verts = surface_vertices + underside_vertices
    stride = across+1
    faces = []
    for i in range(rows):
        for j in range(across):
            v = i*stride+j
            top = (v,v+1,v+stride+1,v+stride)
            faces.extend((top, tuple(index+count for index in reversed(top))))
    border = ([j for j in range(stride)] + [i*stride+across for i in range(1,rows+1)]
              + [rows*stride+j for j in range(across-1,-1,-1)] + [i*stride for i in range(rows-1,0,-1)])
    faces.extend((b,a,a+count,b+count) for a,b in zip(border,border[1:]+border[:1]))
    blade = mesh(name, verts, faces, cuticle, parent)
    pigments = blade.data.color_attributes.new(name=PIGMENT, type="BYTE_COLOR", domain="POINT")
    blade.data.color_attributes.active_color = pigments
    for attribute, value in zip(pigments.data, upper_colors + lower_colors):
        attribute.color = value


def make():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 1, 73
    root = empty("Ficus archivist")
    crown = empty("Woody crown control", root)
    crown.location.z = 1.02
    clay = material("Honey stoneware", "bf875c", .44, .13)
    foot = material("Unglazed chocolate clay", "704231", .86)
    rim = material("Walnut glaze rim", "643e2e", .35, .19)
    bark = material("Woody stem", "76523d", .72)
    soil = material("Indoor potting mix", "453427", .98)
    ink = material("Brown-black face inlay", "31241e", .36)
    brass = material("Eyeglass frames in aged brass", "aa7647", .35, .27)
    ivory = material("Warm porcelain", "faf3da", .28)
    iris = material("Caramel iris", "925531", .43)
    cuticle = material("Dull green, leathery Ficus cuticle", "ffffff", .56, .08)
    shader = next(node for node in cuticle.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    color = cuticle.node_tree.nodes.new("ShaderNodeVertexColor")
    color.layer_name = PIGMENT
    cuticle.node_tree.links.new(color.outputs["Color"], shader.inputs["Base Color"])
    greens = [linear_color(tone) for tone in ("305740", "3d6346", "294f35", "527246")]
    pot = pottery(root, clay, foot, rim)
    pot.scale = (.94, .98, .93)
    sphere("Soil", (0,0,1.015), (.66,.61,.04), soil, root)
    main = [(.01,.02,-.05),(.02,.06,.26),(-.015,.065,.38),(-.05,.083,.53),
            (-.064,.076,.64),(-.027,.065,.76),(.024,.06,.91),(.064,.076,1.05),(.10,.10,1.21)]
    stem("Tapered, gently leaning trunk", main, .070, bark, crown, (1,.8,.70,.62,.55,.49,.42,.32,.19))
    layouts = [
        ("Lower left",1,(-.43,-.06,.60),(-.9,-.25,.31),(.02,-1,.50),.68,.35),
        ("Lower right",2,(.40,-.12,.63),(.8,-.19,.46),(.11,-1,.55),.75,.36),
        ("Mid left",3,(-.37,.13,.83),(-.85,.07,.49),(.0,-1,.51),.86,.39),
        ("Mid right",4,(.33,.10,.92),(.85,-.1,.63),(.24,-1,.59),.78,.36),
        ("Rearmost",5,(-.04,.39,.99),(-.26,.83,.53),(.3,.2,.94),.65,.31),
        ("Upper center",6,(.045,.055,1.16),(.005,.03,1),(.09,-1,.34),.86,.37),
        ("Upper right",7,(.18,.16,1.31),(.5,.28,.85),(.17,-1,.52),.55,.27),
    ]
    for idx,(name,anchor,at,toward,facing,length,width) in enumerate(layouts):
        # Start each petiole inside the same centerline used by the parent trunk.
        start = main[anchor]
        middle = tuple(a + .48 * (b - a) for a, b in zip(start, at))
        middle = (middle[0], middle[1], middle[2] - .022)
        radius = .036 - idx * .0024
        stem(f"{name} woody petiole", [start,middle,at], radius, bark, crown, (1.05,.72,.54))
        hinge = empty(f"{name} hinge", crown)
        parent_axis(hinge, at, toward, facing)
        fiddle(hinge, name, length, width, cuticle, greens[idx % len(greens)], idx * 1.7)
    eyes=[]
    for i,x in enumerate((-.212,.215)):
        eye=empty(f"Eye pivot {i}",root)
        eye.location=(x,-.677,.653)
        eyes.append(eye)
        sphere(f"Porcelain eye {i}",(0,-.015,0),(.119,.051,.122),ivory,eye)
        sphere(f"Amber iris {i}",(.011,-.058,-.006),(.071,.019,.083),iris,eye)
        sphere(f"Pupil {i}",(.011,-.074,-.007),(.045,.014,.060),ink,eye)
        sphere(f"Catchlight {i}",(-.012,-.09,.024),(.019,.009,.019),ivory,eye)
        stem(f"Round spectacles {i}",[(x+.157*math.cos(a),-.762,.647+.151*math.sin(a))
            for a in (TAU*k/18 for k in range(19))],.016,brass,root)
        stem(f"Spectacle temple {i}",[(x*1.68,-.748,.652),(x*2.24,-.673,.654),(x*2.47,-.528,.623)],.013,brass,root)
    stem("Spectacle bridge",[(-.055,-.763,.663),(0,-.77,.697),(.055,-.762,.663)],.014,brass,root)
    stem("Gentle grin",[(-.122,-.713,.429),(-.048,-.737,.389),(.039,-.737,.397),(.128,-.708,.451)],.023,ink,root)
    bow = material("Oxblood bow satin", "703624", .50)
    for side in (-1,1):
        sphere("Bow wing", (side*.079,-.654,.255), (.084,.046,.062),bow,root)
    sphere("Bow knot",(0,-.688,.255),(.043,.034,.050),bow,root)
    poses = {
        "Idle":(73,[(1,0,0),(23,-.011,.018),(51,.014,-.014),(73,0,0)]),
        "Notice":(28,[(1,0,0),(9,.062,.045),(18,-.026,-.018),(28,0,0)]),
        "Curious":(36,[(1,0,0),(16,-.023,.117),(36,-.022,.095)]),
        "Concerned":(42,[(1,0,0),(19,.12,-.056),(42,.114,-.048)]),
        "Relieved":(38,[(1,0,0),(17,-.05,.033),(38,-.046,.026)]),
        "Celebrate":(51,[(1,0,0),(13,.018,.105),(26,-.048,-.105),(39,.027,.044),(51,0,0)]),
    }
    for name,(end,keys) in poses.items():
        pose_track(crown,name,"rotation_euler",[(frame,(x,0,z)) for frame,x,z in keys])
        size={"Concerned":.72,"Relieved":.62,"Celebrate":1.11}.get(name,1)
        blink=[(1,1),(33,1),(35,.08),(40,1),(73,1)] if name=="Idle" else [(1,1),(10,size),(end,size)]
        for eye in eyes:
            pose_track(eye,name,"scale",[(frame,(1,1,value)) for frame,value in blink])
    scene.frame_set(1)
    return scene,root


if __name__ == "__main__":
    deliver(make, "ficus", target_z=1.58, ortho_scale=3.85)
