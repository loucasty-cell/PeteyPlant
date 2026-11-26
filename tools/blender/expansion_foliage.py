"""Species-specific tropical, trailing, and compact foliage for the Petey roster."""

import math
from collections import Counter

import bmesh
import bpy
from mathutils import Matrix, Vector

from build_monstera import material, mesh, sphere

TAU = math.tau
UP = Vector((0, 0, 1))
FRONT = Vector((0, -1, 0))


def linear(code):
    srgb = [int(code[i:i+2], 16)/255 for i in (0, 2, 4)]
    return Vector(tuple(c/12.92 if c < .04045 else ((c+.055)/1.055)**2.4 for c in srgb))


def clamp(value):
    return max(0, min(1, value))


def finish(name, points, faces, mat, parent, pigments=None):
    obj = mesh(name, points, faces, mat, parent)
    topology = bmesh.new()
    topology.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(topology, faces=list(topology.faces))
    topology.to_mesh(obj.data)
    topology.free()
    if pigments:
        colors = obj.data.color_attributes.new(name="Leaf pigments", type="FLOAT_COLOR", domain="POINT")
        obj.data.color_attributes.active_color = colors
        for element, value in zip(colors.data, pigments):
            element.color = (*value, 1)
    return obj


def tube(parent, name, points, radius, mat, sides=7, *, taper=None):
    path = [Vector(p) for p in points]
    verts, faces = [], []
    for i, point in enumerate(path):
        tangent = (path[min(i+1, len(path)-1)]-path[max(i-1, 0)]).normalized()
        reference = FRONT if abs(tangent.dot(FRONT)) < .95 else UP
        side = tangent.cross(reference).normalized()
        normal = tangent.cross(side).normalized()
        for j in range(sides):
            a = TAU*j/sides
            width = radius * (taper[i] if taper else 1 - .44 * i / (len(path) - 1))
            verts.append(point + width*(math.cos(a)*side+math.sin(a)*normal))
    for i in range(len(path)-1):
        start = i*sides
        for j in range(sides):
            k = (j+1)%sides
            faces.append((start+j,start+k,start+k+sides,start+j+sides))
    for endpoint, ring in ((path[0], 0), (path[-1], len(verts)-sides)):
        middle = len(verts)
        verts.append(endpoint)
        faces.extend((middle, ring+j, ring+(j+1)%sides) for j in range(sides))
    return finish(name, verts, faces, mat, parent)


def collar(parent, name, axis, index, radius, mat):
    tangent = (axis[index + 1] - axis[index - 1]).normalized()
    at = axis[index]
    local_radius = radius * (1 - .44 * index / (len(axis) - 1))
    return tube(parent, name, [at - .018 * tangent, at, at + .014 * tangent],
                local_radius, mat, 12, taper=(.86, 1.08, .86))


def oval(parent, name, at, size, mat, axes=None):
    obj = sphere(name, at, size, mat, parent)
    if axes:
        obj.rotation_euler = Vector(axes).to_track_quat('Z','Y').to_euler()
    obj.data.transform(Matrix.Diagonal((*obj.scale,1)))
    obj.scale = (1,1,1)
    return obj


def shading(t, u, top, colors, pattern, seed):
    inner, edge, ink, back = colors
    margin = abs(u)
    away = .29+.32*margin+.10*math.sin(10*t+3*u+seed)
    color = inner.lerp(edge, clamp(away)) if top else back.lerp(edge, .15)
    midrib = math.exp(-(u/.045)**2)
    lateral = max(math.exp(-((t-(.095+i*.108+.11*margin))/.019)**2) for i in range(8))
    if pattern in ('cream-flame', 'pinnate'):
        arc = t - .125 * margin ** 1.18 + .009 * math.sin(25 * t + seed) - .013 * u
        lateral = max(math.exp(-((arc - (.10 + i * .102)) / .022) ** 2) for i in range(8))
    if not top:
        if pattern == 'cream-flame':
            mottled = clamp((.61 - margin + .09 * math.sin(37 * t + u * 6 + seed)) * 2.2)
            color = color.lerp(ink, .18 * mottled + .15 * lateral)
        elif pattern == 'pinnate':
            color = color.lerp(ink, .20 * lateral)
        return color.lerp(ink,.21*midrib)
    if pattern == 'silver-veins':
        color = color.lerp(ink, .93*(1-.63*margin)*(1-.88*lateral)*(1-.86*midrib))
        return color.lerp(edge,.90*max(midrib,lateral*.78))
    if pattern == 'silver-mottle':
        clouds = math.sin(t*48 + u*5 + seed) + .77*math.sin(t*23-u*11) + .50*math.cos(t*71+u*10)
        color = color.lerp(ink,clamp((clouds-.1)*1.15)*(1-.31*margin))
    elif pattern in ('cream-flame','silver-lance'):
        boundary = .52 + .072*math.sin(t*37+seed) + .10*math.sin(5*t)
        if pattern == 'cream-flame':
            boundary += .16*math.sin(t*14+u*7+seed) + .085*math.sin(t*73+u*11)
        color = color.lerp(ink,clamp((boundary-margin)*4.4)*(1-.39*lateral))
    elif pattern == 'zebra':
        stripe = .48 + .05*math.sin(t*10+seed)
        color = color.lerp(ink,clamp((.27-abs(margin-stripe))*8.0))
    elif pattern == 'veins':
        color = color.lerp(ink, max(.91*midrib,.83*lateral))
    elif pattern == 'fenestrated':
        # Veins follow the lamina pigment and stop at the modeled holes.
        arc = t - .105 * margin ** 1.35
        secondaries = max(math.exp(-((arc - (.13 + i * .115)) / .024) ** 2) for i in range(7))
        color = color.lerp(ink, max(.55 * midrib, .32 * secondaries * (1 - .35 * margin)))
    elif pattern == 'pinnate':
        return color.lerp(ink, max(.53 * midrib, .29 * lateral * (1 - .70 * margin)))
    elif pattern == 'net':
        patches = math.sin(28*t-5*u+seed)*math.cos(10*u+12*t)
        color = color.lerp(ink,.66*clamp(.53+patches))
    return color.lerp(ink, .34*midrib+.12*lateral)


def width_at(t, shape):
    spread = math.sin(math.pi*t)**.69
    if shape in ('heart','arrow'):
        spread = math.sin(math.pi*t**.65)**.74
        if shape == 'arrow':
            spread *= 1.22-.55*t
    elif shape == 'tree':
        scallop = (.5+.5*math.cos(TAU*(t*5.15-.24)))**.78
        spread *= (1-.68*scallop*(math.sin(math.pi*t)**.44))
    elif shape == 'spathe':
        spread = math.sin(math.pi*t**.88)**.90
    elif shape == 'obovate':
        spread *= .46 + .70*t
    elif shape == 'lance':
        spread *= 1.18 - .33*t
    return max(.038, spread)


def blade(parent, name, origin, direction, facing, length, half_width, style, seed=0, *, incisions=None):
    shape, pattern, palette, bend, fold, thickness = style
    start = Vector(origin)
    axis = Vector(direction).normalized()
    side = axis.cross(Vector(facing)).normalized()
    normal = side.cross(axis).normalized()
    if shape == 'windows':
        rows, columns = 30, 18
    elif incisions or pattern == 'cream-flame':
        rows, columns = 34, 14
    elif shape == 'tree':
        rows, columns = 26, 16
    else:
        rows, columns = (13, 10) if length < .52 else (18, 12)
    vertices, faces, pigments, index_map = [], [], [], {}
    colors = tuple(map(linear,palette))
    for sign in (1,-1):
        for row in range(rows+1):
            t = .008 + .984*row/rows
            for col in range(columns+1):
                u = 2*col/columns-1
                width = half_width*width_at(t,shape)
                width *= 1 + .036*math.sin(15*t+u+seed)
                if incisions:
                    slots = incisions[0 if u < 0 else 1]
                    cut = max((depth * math.exp(-((t - center) / .049) ** 2)
                               for center, depth in slots), default=0)
                    width *= 1 - cut * abs(u) ** .38
                wave = .009*math.sin(t*42+seed+u)*abs(u)**3*math.sin(math.pi*t)
                lamina = fold*u*u*math.sin(math.pi*t)+wave+bend*t*t
                petiole_lobe = .51 if shape == 'arrow' else .27 if shape == 'heart' else 0
                lobe = petiole_lobe*math.exp(-((t-.15)/.14)**2)*abs(u)**1.7
                ribs = .009*u*u*math.sin(t*44+u*4)*math.sin(math.pi*t) if pattern in ('veins','silver-veins') else 0
                if pattern in ('cream-flame', 'pinnate'):
                    centerline = math.exp(-(u / .13) ** 2) * math.sin(math.pi * t)
                    ribs += centerline * (.013 if sign < 0 or pattern == 'cream-flame' else -.006) * sign
                point = start+axis*(length*(t-lobe))+side*(u*width)+normal*(lamina+ribs+sign*thickness)
                index_map[(row,col,sign)] = len(vertices)
                vertices.append(point)
                pigments.append(shading(t,u,sign==1,colors,pattern,seed))

    def has_hole(row,col):
        if shape != 'windows':
            return False
        t, u = (row+.5)/rows, 2*(col+.5)/columns-1
        for i,(middle,fraction) in enumerate(((.29,.47),(.43,.57),(.57,.45),(.71,.41))):
            stagger = .032*math.sin(seed+i) * (-1 if u < 0 else 1)
            if ((t-middle-stagger)/.048)**2+((abs(u)-fraction)/.19)**2 < 1:
                return True
        return False

    holes = {(r,c) for r in range(rows) for c in range(columns) if has_hole(r,c)}
    # A diagonal-only contact between two holes would produce a pinched shell.
    changed = True
    while changed:
        changed = False
        for row in range(rows-1):
            for col in range(columns-1):
                first = {(row,col),(row+1,col+1)}
                second = {(row+1,col),(row,col+1)}
                for diagonal, other in ((first,second),(second,first)):
                    if diagonal <= holes and not other & holes:
                        holes.remove(max(diagonal))
                        changed = True

    edges = Counter()
    for row in range(rows):
        for col in range(columns):
            if (row,col) in holes:
                continue
            corners = ((row,col),(row+1,col),(row+1,col+1),(row,col+1))
            faces.append(tuple(index_map[(*corner,1)] for corner in corners))
            faces.append(tuple(index_map[(*corner,-1)] for corner in reversed(corners)))
            for a,b in zip(corners,corners[1:]+corners[:1]):
                edges[tuple(sorted((a,b)))] += 1
    for (a,b), count in edges.items():
        if count == 1:
            faces.append((index_map[(*a,1)],index_map[(*b,1)],index_map[(*b,-1)],index_map[(*a,-1)]))
    used = sorted({index for face in faces for index in face})
    remap = {old:new for new,old in enumerate(used)}
    return finish(name,[vertices[i] for i in used],[tuple(remap[i] for i in face) for face in faces],
                  pigment_material(parent),parent,[pigments[i] for i in used])


def pigment_material(parent):
    name = f"{parent.name} / lamina pigments"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = material(name,'ffffff',.43,.18)
    tree = mat.node_tree
    shader = next(node for node in tree.nodes if node.type == 'BSDF_PRINCIPLED')
    shader.inputs['Specular IOR Level'].default_value = .28
    pigment = tree.nodes.new('ShaderNodeVertexColor')
    pigment.layer_name = 'Leaf pigments'
    tree.links.new(pigment.outputs['Color'],shader.inputs['Base Color'])
    return mat


FOREST = ('437643','224b39','94b665','43633e')
MOSS = ('517f43','245238','b2c783','466748')
SILVER = ('568b75','244d42','b4cab7','566f56')
CREAM = ('52864c','254b34','e5dfa9','5f7a48')
VELVET = ('2c5643','172f3a','d9dabb','645952')
PURPLE = ('544d65','2e3748','b4c6be','683660')
WAX = ('3d6e3e','1f4d37','83a367','496d44')


def rosette(parent, name, style, sizes, lean=.17, height=.71, spread=.74, phase=0):
    stem_mat = material(f"{name} petioles",'506d3c',.54)
    for i, (length,width) in enumerate(sizes):
        angle = phase+i*2.399963
        radial = Vector((math.cos(angle),math.sin(angle),0))
        base = radial*(.057+.014*(i%3)) + Vector((0,0,-.026))
        rise = height*(.73+.33*math.sin(1.41*i+.59))
        reach = spread*(.53+.24*math.sin(2.30*i+1))
        end = radial*reach+UP*rise
        mid = base.lerp(end,.48)+UP*.10-radial*.08
        tube(parent,f"{name} petiole {i+1}",[base,base.lerp(mid,.48),mid,mid.lerp(end,.57),end],.022-.004*(i%3),stem_mat)
        ray = radial+UP*(lean+.38*math.sin(i*1.77+1))
        facing = .56*FRONT+.64*UP-radial*.18
        blade(parent,f"{name} lamina {i+1}",end,ray,facing,length,width,style,i+.4)


def climber(parent, name, style, widths, height=1.42, lean=.22, stagger=.42):
    stem_mat = material(f"{name} climbing vine",'586d3d',.58)
    root_mat = material(f"{name} aerial roots",'7f5940',.69)
    points = [Vector((lean*math.sin(i*.65),.17+.10*math.sin(i*.51),height*i/9-.038)) for i in range(10)]
    tube(parent,f"{name} main climbing vine",points,.047,stem_mat,8)
    for i,(length,width) in enumerate(widths):
        point = points[i+1]
        sign = -1 if i%2 else 1
        end = point+Vector((sign*(.22+stagger*(i%3)*.18),-.20-.10*math.sin(i*1.4+.5),.065))
        tube(parent,f"{name} climbing petiole {i+1}",[point,point.lerp(end,.47)+UP*.04,end],.023,stem_mat)
        facing = Vector((.65*math.sin(i*1.61+1),-.84,.49*math.cos(i*1.5+.5)))
        blade(parent,f"{name} alternating lamina {i+1}",end,(sign*.80,-.26-.18*(i%3),.47-.34*(i%3)),facing,
              length,width,style,i+.2)
        if i<4 and i%2==0:
            tube(parent,f"{name} aerial root {i+1}",[point,point+Vector((sign*.061,.03,-.11)),point+Vector((sign*.032,.07,-.22))],.012,root_mat)


def cascade(parent, name, style, leaf_size, trails, *, paired=False, purple=False, crown_leaves=4):
    stem_mat = material(f"{name} trailing stems",'6c4255' if purple else '506b3f',.55)
    for i,(side,reach,length,shift) in enumerate(trails):
        points = []
        for node in range(14):
            t = node/13
            points.append(Vector((side*(.13+reach*math.sin(math.pi*.55*t)), shift-.12*t,
                                  .31*math.sin(math.pi*t)-length*t**1.72-.027)))
        tube(parent,f"{name} trailing stem {i+1}",points,.022 if not paired else .016,stem_mat)
        for node in range(1,13,2):
            at = points[node]
            for branch in ((-1,1) if paired else (-1 if (node//2+i)%2 else 1,)):
                vector = Vector((branch*.84,-.48,.20-.75*node/13))
                end = at+vector*.096
                tube(parent,f"{name} trailing petiole {i}-{node}-{branch}",[at,at.lerp(end,.48)+UP*.028,end],.010,stem_mat,6)
                size = 1.15-.31*node/13+.14*math.sin(i+node)
                blade(parent,f"{name} trailing leaf {i}-{node}-{branch}",end,vector,FRONT,
                      leaf_size[0]*size,leaf_size[1]*size,style,i*7+node)
    if crown_leaves:
        rosette(parent,name+" crown",style,[leaf_size]*crown_leaves,.69,.43,.51,.2)


def spathe(parent, name, origin, tilt, tint, shape, length, width):
    stem_mat = material(f"{name} peduncle",'729754',.62)
    spike_mat = material(f"{name} spadix",'ffe2a0' if shape=='heart' else 'e9d5a0',.67)
    at = Vector(origin)
    tube(parent,f"{name} peduncle",[Vector((at.x*.29,at.y*.46,-.026)),at*.44,at*.77,at],.028,stem_mat)
    palette = (tint,'ad334d','ff988f','b2354c') if shape=='heart' else (tint,'bfd199','ffffda','b0bf9b')
    direction = Vector((tilt,-.17,.91))
    blade(parent,f"{name} glossy bract",at,direction,FRONT,length,width,
          (shape,'plain',palette,-.09,.075,.014),tilt)
    spike_axis = Vector((tilt*.64,-.42,.85)).normalized()
    for i in range(7):
        center = at+Vector((0,-.036,.036))+spike_axis*(.033+i*.032)
        oval(parent,f"{name} spadix segment {i+1}",center,(.037-.0032*i,.037-.0032*i,.023),spike_mat,spike_axis)


def pearls(parent):
    greens = [material('Pearl leaf '+str(i),tint,.38,.28) for i,tint in enumerate(('6a9950','7fa55c','597f46'))]
    vine = material('String of Pearls stems','6b7b48',.54)
    for i,(side,length,offset) in enumerate(((-1,.99,-.14),(1,.96,-.11),(-1,.71,.07),(1,.73,.18),(-1,.51,.27),(1,.53,.30))):
        points = [Vector((side*(.15+.91*math.sin(math.pi*.56*t)),offset-.25*t,
                          .32*math.sin(math.pi*t)-length*t**1.70-.022)) for t in (j/15 for j in range(16))]
        tube(parent,f"Pearl vine {i+1}",points,.016,vine)
        for j,point in enumerate(points[2:]):
            angle = (2.35*j+i)
            at = point+Vector((.049*math.cos(angle),.043*math.sin(angle),.019))
            radius = .064-.014*j/14+.008*math.sin(.61*j+i)
            oval(parent,f"Pearl {i+1}.{j+1}",at,(radius,radius*.97,radius*.96),greens[(i+j)%3])


def wax_flower(parent, center):
    pink = material('Hoya star petal','f0cfcb',.46)
    coral = material('Hoya corona','a64c67',.47)
    center = Vector(center)
    for i in range(7):
        angle = TAU*i/7
        at = center+Vector((.117*math.cos(angle),-.025,.107*math.sin(angle)))
        for j in range(5):
            radial = Vector((math.cos(TAU*j/5),0,math.sin(TAU*j/5)))
            oval(parent,f"Umbel {i+1} petal {j+1}",at+radial*.034,(.026,.020,.053),pink,radial)
        oval(parent,f"Umbel {i+1} corona",at+FRONT*.025,(.028,.018,.028),coral)


def coins(parent):
    stalk = material('Pilea petioles','6b985a',.56)
    for i,(height,width) in enumerate(((.47,.43),(.57,.38),(.68,.35),(.89,.40),(.81,.37),(1.03,.32),(1.10,.27),(.99,.28),(.53,.35))):
        angle = i*2.399963+.32
        radial = Vector((math.cos(angle),math.sin(angle),0))
        base = radial*.092-UP*.022
        center = radial*(.29+.27*abs(math.sin(i+1)))+UP*height
        tube(parent,f"Pilea converging petiole {i+1}",[base,base.lerp(center,.44)+UP*.16,center],.019,stalk)
        normal = (.76*UP+.64*FRONT+radial*.18).normalized()
        side = normal.cross(UP).normalized()
        forward = side.cross(normal).normalized()
        profile = ((.082,-.018),(.40,-.012),(.71,.025),(.96,.045),(1.0,.034),(.82,.012),(.48,-.002),(.082,-.042))
        points,faces,colors = [],[],[]
        swatches = tuple(map(linear,('5d9352','37734c','92b46b','45845c')))
        for row,(scale,offset) in enumerate(profile):
            for j in range(30):
                a = TAU*j/30
                vein = .04*math.cos(8*a)*scale
                points.append(center+side*(width*scale*math.cos(a))+forward*(width*scale*.93*math.sin(a))+normal*(offset+vein))
                colors.append(swatches[0].lerp(swatches[1],scale*.60) if row<5 else swatches[3])
        for row in range(len(profile)-1):
            for j in range(30):
                a,b = row*30+j,row*30+(j+1)%30
                faces.append((a,b,b+30,a+30))
        for row in (0,len(profile)-1):
            index = len(points)
            points.append(center+normal*profile[row][1])
            colors.append(swatches[2])
            faces.extend((index,row*30+j,row*30+(j+1)%30) for j in range(30))
        finish(f"Pilea peltate coin {i+1}",points,faces,pigment_material(parent),parent,colors)


def swiss(parent):
    climber(parent,'Swiss Cheese Vine',('windows','fenestrated',FOREST,-.12,.032,.009),
            [(.62,.22),(.72,.26),(.73,.25),(.76,.27),(.77,.28),(.73,.24),(.65,.22)],1.38,.19)


def mini(parent):
    vine = material('Smooth green Rhaphidophora vine','50683c',.61)
    cork = material('Subtle cork at Rhaphidophora nodes','7e8350',.73)
    roots = material('Rhaphidophora aerial roots','7e6b4c',.75)
    nodes = [Vector(point) for point in ((0,.14,-.06),(-.07,.19,.18),(-.11,.17,.39),
             (-.06,.19,.58),(.03,.16,.78),(.10,.19,1.00),(.12,.16,1.23),(.08,.14,1.43),(.12,.13,1.57))]
    radius = .034
    tube(parent,'Flexuous Rhaphidophora climbing vine',nodes,radius,vine,12)
    # The uppermost leaf is a younger entire blade on this individual shoot.
    layouts = (
        ((-.34,-.22,.25),(-.84,-.36,.25),.49,.22,None),
        ((.26,-.04,.52),(.79,.19,.38),.63,.30,(((.32,.80),),((.39,.78),))),
        ((-.36,.01,.68),(-.88,.16,.45),.77,.32,(((.31,.89),(.54,.83)),((.38,.85),(.64,.73)))),
        ((.34,-.26,.90),(.91,-.42,.19),.83,.36,(((.29,.91),(.50,.81)),((.34,.88),(.60,.87)))),
        ((-.35,-.19,1.13),(-.77,-.31,.57),.78,.34,(((.35,.86),(.61,.79)),((.40,.90),(.67,.73)))),
        ((.36,.22,1.32),(.72,.27,.65),.62,.28,(((.40,.77),),((.31,.81),(.58,.72)))),
        ((-.02,-.04,1.52),(-.21,-.08,1),.41,.16,None),
    )
    for i, (point, direction, length, width, slots) in enumerate(layouts, start=1):
        at = nodes[i]
        end = Vector(point)
        collar(parent,f'Rhaphidophora leaf scar {i}',nodes,i,radius,cork)
        tube(parent,f'Rhaphidophora climbing petiole {i}',
             [at,at.lerp(end,.37)+UP*.026,at.lerp(end,.81)+UP*.019,end],.021,vine,8)
        facing = Vector((.40 * math.sin(i * 1.4), -.81, .37 + .23 * math.cos(i * 1.7)))
        green = ('658f48','315b3b','a5b876','597845') if i == 7 else MOSS
        blade(parent,f'Rhaphidophora {"split" if slots else "entire"} lamina {i}',end,direction,facing,
              length,width,('obovate','pinnate',green,-.069,.043,.008),i * .82,incisions=slots)
    for i, side in ((2, -1), (4, 1), (5, 1)):
        at = nodes[i]
        tube(parent,f'Rhaphidophora node root {i}',[at,at+Vector((side*.053,.029,-.073)),
             at+Vector((side*.070,.048,-.19)),at+Vector((side*.037,.072,-.27))],.012,roots,6)


def silver(parent):
    climber(parent,'Silver Monstera',('lance','silver-veins',SILVER,-.076,.034,.010),
            [(.50,.15),(.56,.17),(.60,.18),(.61,.20),(.63,.19),(.56,.18),(.48,.16)],1.52,.15,.39)


def split_leaf(parent):
    rosette(parent,'Split-Leaf Philodendron',('tree','plain',FOREST,-.13,.062,.013),
            [(1.0,.43),(.98,.46),(1.04,.44),(.91,.39),(.86,.38),(.77,.42),(.76,.35)],.28,.82,.55,.4)


def aglaonema(parent):
    rosette(parent,'Chinese Evergreen',('lance','silver-lance',SILVER,-.086,.043,.010),
            [(.74,.23),(.79,.24),(.71,.21),(.83,.24),(.73,.22),(.65,.21),(.57,.17),(.70,.22),(.57,.18)],.65,.55,.56,1.2)


def dieffenbachia(parent):
    cane = material('Dieffenbachia mature cane','557b53',.72)
    scars = material('Pale annular Dieffenbachia leaf scars','879663',.73)
    sheaths = material('Yellow-green sheathing petiole bases','648b4b',.64)
    radius = .091
    nodes = [Vector(point) for point in ((0,.10,-.058),(-.013,.092,.12),(-.045,.09,.28),(-.056,.09,.44),
             (-.049,.10,.60),(-.033,.11,.78),(-.01,.12,.93),(.015,.14,1.09),(.03,.14,1.19),(.04,.15,1.28))]
    tube(parent,'Annular-scarred upright cane',nodes,radius,cane,12)
    for i in range(1,len(nodes)-1):
        collar(parent,f'Dieffenbachia leaf scar {i}',nodes,i,radius,scars)
    layouts = ((-.23,-.08,.51,.69,.26),(.22,-.19,.69,.80,.30),(-.24,.19,.93,.77,.30),
               (.26,.22,1.10,.73,.28),(-.15,-.16,1.25,.67,.24),(.035,.055,1.34,.49,.151))
    for i, (x,y,z,length,width) in enumerate(layouts, start=3):
        at = nodes[i]
        end = Vector((x,y,z))
        shoulder = at.lerp(end,.36) + UP*.038
        tube(parent,f'Dieffenbachia petiole {i}',
             [at,shoulder,shoulder.lerp(end,.58)+UP*.028,end],.050,sheaths,9,taper=(1.10,.86,.61,.44))
        facing = Vector((.44*math.sin(i*1.7),-.81,.32+.39*math.sin(i*1.5+.75)))
        tip = UP + FRONT*.11 if i == 8 else Vector((x*4.3,2.6*y-.16,.51))
        blade(parent,f'Dieffenbachia cream-splashed blade {i}',end,tip,facing,length,width,
              ('obovate','cream-flame',CREAM,-.115,.039,.010),i * 1.35)


def anthurium(parent):
    rosette(parent,'Anthurium',('heart','plain',WAX,-.09,.062,.014),
            [(.73,.33),(.69,.30),(.72,.32),(.87,.37),(.76,.32),(.68,.28)],.41,.61,.54,.4)
    for i,(at,tilt) in enumerate((((-.45,-.21,1.03),-.35),((.36,-.19,1.19),.29),((.05,.18,1.26),.16))):
        spathe(parent,f"Flamingo bloom {i+1}",at,tilt,'d04258','heart',.52,.25)


def peace_lily(parent):
    rosette(parent,'Peace Lily',('lance','veins',('376645','234937','648a58','486746'),-.18,.060,.009),
            [(.77,.25),(.88,.25),(.85,.24),(.77,.21),(.65,.20),(.69,.24),(.65,.19),(.59,.18),(.55,.17)],.51,.65,.62,.4)
    for i,(at,tilt) in enumerate((((-.43,-.16,.98),-.31),((.33,-.12,1.22),.27),((-.02,.22,1.14),.14))):
        spathe(parent,f"White spathe {i+1}",at,tilt,'f4f0d9','spathe',.58,.208)


def arrowhead(parent):
    rosette(parent,'Juvenile Arrowhead',('arrow','silver-lance',('719d62','4d8053','c8d7a9','7ea774'),-.07,.056,.011),
            [(.71,.31),(.73,.32),(.68,.29),(.65,.31),(.62,.27),(.62,.30),(.57,.28),(.54,.26)],.50,.60,.57,.94)


def alocasia(parent):
    rosette(parent,'Green Velvet Alocasia',('arrow','veins',VELVET,.045,.053,.009),
            [(.83,.36),(.84,.34),(.76,.30),(.81,.34),(.70,.31),(.62,.27)],.63,.90,.56,.30)


def heartleaf(parent):
    cascade(parent,'Heartleaf Philodendron',('heart','plain',('4b8b53','285a3b','95b66d','366642'),-.064,.046,.012),
            (.50,.23),[(-1,.91,.92,-.09),(1,.92,.76,-.13),(-1,.67,.55,.23)],crown_leaves=6)


def satin(parent):
    cascade(parent,'Satin Pothos',('heart','silver-mottle',SILVER,-.04,.046,.012),(.48,.25),
            [(-1,.79,.90,-.07),(1,.78,.72,-.26),(1,.60,.55,.24)],crown_leaves=5)


def hoya(parent):
    cascade(parent,'Hoya Carnosa',('obovate','plain',WAX,-.034,.021,.021),(.39,.15),
            [(-1,.71,.74,-.09),(1,.72,.59,-.13)],paired=True,crown_leaves=7)
    peduncle = material('Hoya flower peduncle','6b744c',.62)
    tube(parent,'Flower spur',[(.10,-.09,.12),(.29,-.23,.42),(.53,-.37,.61),(.67,-.49,.53)],.023,peduncle)
    wax_flower(parent,(.67,-.49,.53))


def tradescantia(parent):
    cascade(parent,'Silver Inch Plant',('lance','zebra',PURPLE,-.09,.037,.008),(.44,.16),
            [(-1,.84,.77,-.04),(1,.81,.70,-.09),(-1,.61,.61,.22),(1,.65,.49,.17)],purple=True,crown_leaves=7)


def hearts(parent):
    cascade(parent,'String of Hearts',('heart','net',('577b68','375e51','adc5b4','92567f'),-.045,.030,.012),(.25,.117),
            [(-1,.99,.96,-.21),(1,.97,.81,-.09),(-1,.93,.69,.10),(1,.76,.61,.19)],paired=True,purple=True,crown_leaves=4)


def peperomia(parent):
    rosette(parent,'Baby Rubber Plant',('obovate','plain',WAX,-.045,.036,.025),
            [(.55,.29),(.49,.27),(.51,.24),(.55,.29),(.57,.31),(.49,.26),(.46,.24),(.42,.22),(.43,.24)],.61,.61,.67,.1)


MODELS = [dict(id=slug,species=species,common=common,note=note,build=builder,fallback=fallback) for
          slug,species,common,note,builder,fallback in (
    ('swiss-cheese-vine','Monstera adansonii','Swiss Cheese Vine','Narrow climbing leaves with enclosed paired fenestrations and aerial roots.',swiss,0),
    ('mini-monstera','Rhaphidophora tetrasperma','Mini Monstera','Flexuous vine with scarred nodes, attached aerial roots, entire young leaves, and staggered marginal splits.',mini,0),
    ('silver-monstera','Monstera siltepecana','Silver Monstera','Juvenile lanceolate leaves with a silver field and dark reticulated ribs.',silver,0),
    ('split-leaf-philodendron','Thaumatophyllum bipinnatifidum','Split-Leaf Philodendron','A self-heading rosette with deeply pinnatifid, broad leaves.',split_leaf,0),
    ('chinese-evergreen','Aglaonema commutatum','Chinese Evergreen','A silver-splashed lanceolate clump with deep green margins.',aglaonema,7),
    ('dieffenbachia','Dieffenbachia seguine','Dieffenbachia','Scarred upright cane with attached sheathing petioles and broad cream-variegated leaves.',dieffenbachia,7),
    ('flamingo-flower','Anthurium andraeanum','Flamingo Flower','Glossy heart foliage with rose-red heart-shaped spathes and projecting golden spadices.',anthurium,1),
    ('peace-lily','Spathiphyllum wallisii','Peace Lily','Fountain of ribbed narrow leaves with upright cream-white spathes.',peace_lily,7),
    ('arrowhead-plant','Syngonium podophyllum','Arrowhead Plant','Juvenile pointed arrowheads with backward basal lobes and soft center variegation.',arrowhead,1),
    ('green-velvet-alocasia','Alocasia micholitziana','Green Velvet Alocasia','Upright sagittate velvet leaves contrast with pale ribs and wavering margins.',alocasia,7),
    ('heartleaf-philodendron','Philodendron hederaceum','Heartleaf Philodendron','Alternating glossy hearts on layered loose climbing and trailing vines.',heartleaf,1),
    ('satin-pothos','Scindapsus pictus','Satin Pothos','Asymmetric silver dappled hearts on arching tails.',satin,1),
    ('wax-plant','Hoya carnosa','Wax Plant','Opposite fleshy waxy leaves and a cluster of five-pointed pink flowers.',hoya,1),
    ('silver-inch-plant','Tradescantia zebrina','Silver Inch Plant','A low violet trailing clump of lance-shaped leaves with two silver-white bands.',tradescantia,1),
    ('string-of-pearls','Curio rowleyanus','String of Pearls','Slender pendent stems studded with round succulent pearl leaves.',pearls,1),
    ('string-of-hearts','Ceropegia woodii','String of Hearts','Thin purple vines of opposite silver-marbled hearts with violet undersides.',hearts,1),
    ('baby-rubber-plant','Peperomia obtusifolia','Baby Rubber Plant','A compact mound of thick spoon-shaped leaves with rounded tips.',peperomia,4),
    ('chinese-money-plant','Pilea peperomioides','Chinese Money Plant','Petiole-centered coin leaves fan out on long fine stems.',coins,7),
)]

POT_PALETTES = (
    ('78968e','3e6453'), ('d5a784','88654e'), ('8a9bac','4e6478'), ('ad8e64','6c493a'),
    ('a2aca6','526957'), ('ba8eaa','73566d'), ('dc995e','905946'), ('77849e','536378'),
    ('92a379','5c6c4b'), ('705986','4c3a59'), ('aa8a79','715045'), ('91a3b3','536d7d'),
    ('d2a4a4','925c6a'), ('b8879a','754e76'), ('ddb57b','a0784b'), ('a687ad','6d4e79'),
    ('cd9471','97664b'), ('95a87c','637a54'),
)
IDENTITY_SOURCES = {
    'arrowhead-plant': ['https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A89152-1'],
    'green-velvet-alocasia': ['https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A84208-1/general-information'],
    'string-of-hearts': ['https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A95848-1'],
    'silver-monstera': ['https://plants.ces.ncsu.edu/plants/monstera-siltepecana/'],
    'mini-monstera': ['https://plants.ces.ncsu.edu/plants/rhaphidophora-tetrasperma/common-name/dwarf-monstera/',
                     'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:88594-1/general-information'],
    'dieffenbachia': ['https://plants.ces.ncsu.edu/plants/dieffenbachia-seguine/',
                     'https://monografiasfloradobrasil.jbrj.gov.br/dieffenbachia.pdf'],
    'split-leaf-philodendron': ['https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A77306988-1/general-information'],
    'satin-pothos': ['https://plants.ces.ncsu.edu/plants/scindapsus-pictus/'],
    'silver-inch-plant': ['https://plants.ces.ncsu.edu/plants/tradescantia-zebrina/'],
    'string-of-pearls': ['https://powo.science.kew.org/taxon/1011412-1'],
}
for model, palette in zip(MODELS,POT_PALETTES,strict=True):
    model['pot'] = palette
    model['sources'] = IDENTITY_SOURCES.get(model['id'])
    if model['id'] == 'split-leaf-philodendron':
        model['accepted'] = 'Philodendron bipinnatifidum'
