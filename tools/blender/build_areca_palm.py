"""Build the Areca Palm companion from paired leaflets and clustered canes."""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_monstera import empty, material, mesh, pose_track, sphere, stem
from build_aloe import deliver, planter

TAU = math.tau


def leaflet(center, direction, length, width, droop):
    across = Vector((-direction.y, direction.x, 0)).normalized()
    verts = []
    steps = 8
    for i in range(steps + 1):
        t = i / steps
        p = center + direction * (length * t) + Vector((0, 0, -droop*t*t+.065*math.sin(math.pi*t)))
        spread = width * (.04 + .96*math.sin(math.pi*t)**.75)
        verts.extend((tuple(p-across*spread), tuple(p+Vector((0,0,.013*math.sin(math.pi*t)))),
                      tuple(p+across*spread), tuple(p-Vector((0,0,.012)))))
    faces = [(i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j)
             for i in range(steps) for j in range(4)]
    faces.extend([(3,2,1,0),tuple(range(steps*4,steps*4+4))])
    return verts, [tuple(reversed(face)) for face in faces]


def frond(pivot, name, length, rise, fall, rng, colors, rachis):
    def spline(t):
        return Vector((length*t, .12*t*t*math.sin(rng), rise*t-fall*t*t))

    stem(f"{name} tapered rachis", [spline(i/6) for i in range(7)], .018, rachis, pivot,
         (1,.88,.75,.62,.48,.31,.13))
    verts, faces, pigment = [], [], []
    for i in range(11):
        t = .16 + i*.078
        for side in (-1,1):
            base = spline(t + (.013 if side > 0 else 0))
            span = (.27 + .22*math.sin(math.pi*t)) * (1 - .64*t*t)
            direction = Vector((.50 + .25*t, side*(.87-.26*t), .10 + .08*math.sin(i+rng)))
            lv, lf = leaflet(base, direction, span, (.036+.016*math.sin(math.pi*t))*(1-.62*t), .073+.026*t)
            start = len(verts)
            verts.extend(lv)
            faces.extend(tuple(start+j for j in face) for face in lf)
            pigment.extend([(i + (side > 0) + rng) % len(colors)]*len(lf))
    obj = mesh(f"{name} · paired feather leaflets", verts, faces, colors[0], pivot)
    for color in colors[1:]:
        obj.data.materials.append(color)
    for face, index in zip(obj.data.polygons, pigment):
        face.material_index = index


def wicker(root, light, medium, dark):
    count, courses, steps = 40, 7, 4
    verts, faces, tones = [], [], []
    for z_index in range(courses):
        for i in range(count):
            a = TAU*(i+.5*(z_index%2))/count
            z = .26+.067*z_index
            base = .675+.072*math.sin((z_index+.6)/courses*math.pi/2)
            start = len(verts)
            for u in range(steps + 1):
                t = u/steps
                angle = a + (.5-t)*TAU/count*1.17
                r = base + .025*math.sin(math.pi*t)
                for v in (0,1,2,3):
                    z_local = (v%2-.5)*.056
                    radius = r - (.018 if v>1 else 0)
                    verts.append((radius*math.cos(angle),radius*.91*math.sin(angle),z+z_local))
            for j in range(steps):
                for a0,b0 in ((0,1),(1,3),(3,2),(2,0)):
                    faces.append((start+j*4+a0,start+(j+1)*4+a0,start+(j+1)*4+b0,start+j*4+b0))
            end = start + steps*4
            faces.extend([(start,start+1,start+3,start+2),(end+2,end+3,end+1,end)])
            tones.extend([(i*3+z_index+i//5)%3]*(steps*4+2))
    obj = mesh("Woven rattan sleeve", verts, [tuple(reversed(face)) for face in faces], light, root)
    obj.data.materials.append(medium)
    obj.data.materials.append(dark)
    for face, tone in zip(obj.data.polygons, tones):
        face.material_index = tone
    # Rolled handles and top and bottom binding conceal the woven edge.
    for z, r in ((.238,.682),(.713,.75)):
        stem("Rolled basket binding", [(r*math.cos(a),r*.91*math.sin(a),z)
              for a in (TAU*j/36 for j in range(37))],.024, medium,root)


def make():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene=bpy.context.scene
    scene.render.fps=24
    scene.frame_start,scene.frame_end=1,73
    root=empty("Areca garden host")
    crown=empty("Palm cane performance",root)
    crown.location.z=1.03
    clay=material("Warm buff ceramic", "d5a679", .42, .16)
    band=material("Sienna planter band", "905638", .60)
    rim=material("Honey glaze", "bb8755", .33, .20)
    soil=material("Potting mix", "443529", .96)
    olive=material("Golden split cane", "a0a25b", .57)
    nodes=material("Ochre growth nodes", "777044", .62)
    petiole=material("Chartreuse rachis", "92ad64", .48)
    colors=[material(f"Palm leaflet tone {i}", tone, .47, .12)
            for i,tone in enumerate(("789b45","517839","a1b85b","648d49"))]
    rattan=[material(f"Basket reed {i}", tone, .63)
            for i,tone in enumerate(("c89553","a9733c","b88146"))]
    planter(root,band,clay,rim)
    wicker(root,*rattan)
    sphere("Soil surface",(0,0,1.013),(.68,.62,.044),soil,root)
    for k,(x,y,h) in enumerate(((-.18,.08,1.22),(.14,.10,1.36),(-.02,-.12,1.06),(.21,-.08,.88),(-.24,.18,.93))):
        pts=[(x*.58,y*.6,-.04),(x*.73,y*.8,h*.32),(x*.95,y,h*.67),(x*1.36,y*1.3,h)]
        radius=.063-.005*k
        stem(f"Cluster cane {k}",pts,radius,olive,crown,(1,.9,.75,.41))
        for i in (3, 6):
            t=i/8
            center=Vector(pts[0]).lerp(Vector(pts[-1]),t)
            # Keep these nodes close to the local spine as the stems taper.
            segment=min(2,int(t*3))
            center=Vector(pts[segment]).lerp(Vector(pts[segment+1]),t*3-segment)
            sphere(f"Cane growth ring {k}-{i}",center,(radius*(.97-.31*t),radius*(.97-.31*t),.0145),nodes,crown)
    layouts=[
        ("Broad left split",(-.244,.104,1.22),2.95,1.18,.76,.96),
        ("Forward left spray",(-.027,-.156,1.06),3.76,1.04,.64,1.07),
        ("Tall center sweep",(.19,.13,1.36),1.28,1.11,1.01,1.17),
        ("Broad right split",(.19,.13,1.36),.22,1.25,.58,1.05),
        ("Right foreground fan",(.285,-.104,.88),-.53,1.15,.65,.97),
        ("Back left silhouette",(-.326,.234,.93),2.00,1.06,.71,1.09),
        ("Soft near curtain",(-.027,-.156,1.06),4.92,.84,.52,.90),
    ]
    for idx,(name,at,rotation,length,rise,fall) in enumerate(layouts):
        pivot=empty(name,crown)
        pivot.location=at
        pivot.rotation_euler.z=rotation
        frond(pivot,name,length,rise,fall,idx,colors,petiole)
    ink=material("Coffee face pigment","352821",.36)
    ivory=material("Cream porcelain highlights","fff2d8",.33)
    petal=material("Cotton flower petals","f2dbb5",.67)
    pollen=material("Marigold flower center","c0822e",.52)
    eyes=[]
    for i,x in enumerate((-.214,.217)):
        eye=empty(f"Eye pivot {i}",root)
        eye.location=(x,-.663,.863)
        eyes.append(eye)
        sphere(f"Dark portrait eye {i}",(0,-.017,0),(.087,.036,.099),ink,eye)
        sphere(f"Porcelain shine {i}",(-.021,-.048,.029),(.019,.011,.020),ivory,eye)
    stem("Open smile in ceramic", [(-.137,-.683,.773),(-.063,-.691,.738),(.042,-.692,.741),(.126,-.683,.777)],
          .019,ink,root)
    x,y,z=.446,-.552,.917
    for j in range(5):
        a=TAU*j/5
        ob=sphere(f"Glaze flower petal {j}",(x+.061*math.cos(a),y,z+.061*math.sin(a)),(.048,.024,.028),petal,root)
        ob.rotation_euler.y=-a
    sphere("Flower pin center",(x,y-.018,z),(.039,.029,.038),pollen,root)
    motions={
        "Idle":(73,[(1,0,0),(23,.018,-.027),(51,-.022,.024),(73,0,0)]),
        "Notice":(30,[(1,0,0),(11,-.061,.091),(20,.036,-.043),(30,0,0)]),
        "Curious":(38,[(1,0,0),(15,-.065,.112),(38,-.061,.104)]),
        "Concerned":(41,[(1,0,0),(18,.16,-.046),(41,.148,-.049)]),
        "Relieved":(35,[(1,0,0),(15,-.047,.024),(35,-.039,.017)]),
        "Celebrate":(54,[(1,0,0),(10,-.05,.151),(22,.043,-.113),(34,-.058,.116),(54,0,0)]),
    }
    for name,(end,keys) in motions.items():
        pose_track(crown,name,"rotation_euler",[(frame,(rx,.20*rz,rz)) for frame,rx,rz in keys])
        s={"Concerned":.62,"Relieved":.73,"Celebrate":1.12}.get(name,1)
        blink=[(1,1),(30,1),(33,.09),(38,1),(73,1)] if name=="Idle" else [(1,1),(12,s),(end,s)]
        for eye in eyes:
            pose_track(eye,name,"scale",[(frame,(1,1,v)) for frame,v in blink])
    scene.frame_set(1)
    return scene,root


if __name__ == "__main__":
    deliver(make,"areca-palm",target_z=1.59,ortho_scale=4.11)
