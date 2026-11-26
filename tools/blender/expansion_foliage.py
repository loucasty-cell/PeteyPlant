"""Species-specific tropical, trailing, and compact foliage for the Petey roster."""

import math
import random
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


LEAF_FINISHES = {
    # Roughness, coat and specular response remain editable and export with glTF.
    'silver-veins': (.49, .12, .34),
    'silver-mottle': (.61, .02, .27),
    'velvet-veins': (.79, .00, .19),
    'zebra': (.47, .13, .34),
    'peltate': (.41, .20, .29),
    'epidermal-window': (.48, .12, .33),
    'heartleaf-veins': (.40, .15, .26),
    'peperomia-cuticle': (.35, .22, .29),
    'net': (.63, .02, .26),
}


def leaf_veins(t, u, seed, *, velvet=False):
    lateral = abs(u)
    sweep = (.15 if velvet else .12) * lateral ** 1.40
    phase = .018 * math.sin(seed + t * 10) * lateral + .021 * u
    stations = (.14, .28, .42, .55, .68) if velvet else (.10, .21, .32, .43, .54, .65, .76, .85)
    primary = max(math.exp(-((t - position - sweep - phase) / (.019 if velvet else .016)) ** 2)
                  for position in stations)
    midrib = math.exp(-(u / .070) ** 2)
    return midrib, primary


def satin_blotches(t, u, spots, seed):
    # The organic mask is authored per blade. Fine contour wobble does not repeat down the vine.
    wobble = .13 * math.sin(t * 67 + u * 19 + seed) + .084 * math.cos(t * 83 - u * 23)
    distance = min(((t - x - shear * (u - y)) / length) ** 2 + ((u - y) / width) ** 2
                   for x, y, length, width, shear in spots)
    blotches = clamp((1.21 - distance + wobble) * 1.35)
    edge = clamp((abs(u) - .87 + .05 * math.sin(t * 18 + seed)) * 7)
    return max(blotches, .50 * edge * math.sin(math.pi * t))


def shading(t, u, top, colors, pattern, seed, spots):
    inner, edge, ink, back = colors
    margin = abs(u)
    away = .29+.32*margin+.10*math.sin(10*t+3*u+seed)
    color = inner.lerp(edge, clamp(away)) if top else back.lerp(edge, .15)
    midrib = math.exp(-(u/.045)**2)
    lateral = max(math.exp(-((t-(.095+i*.108+.11*margin))/.019)**2) for i in range(8))
    if pattern in LEAF_FINISHES:
        midrib, lateral = leaf_veins(t, u, seed, velvet=pattern == 'velvet-veins')
        grain = .020 * math.sin(117 * t + 37 * u + seed) + .013 * math.cos(73 * t - 31 * u)
        if not top:
            # Reverse surfaces carry the petiole's vascular tint, without the upper pigment.
            return color.lerp(inner, .14 * lateral - grain).lerp(edge, .10 * midrib)
        if pattern == 'zebra':
            # Two longitudinal bands narrow toward the lance point and vary in
            # width and pigment at their edges instead of repeating as rulers.
            band = .53 + .065 * math.sin(t * 9 + seed) + .035 * u * math.sin(t * 11)
            reach = .30 - .10 * t + .031 * math.sin(t * 23 - u * 12 + seed)
            silver = clamp((reach - abs(margin - band)) * 8.5)
            green_center = color.lerp(inner, .40 * (1 - margin) + grain)
            return green_center.lerp(ink, silver * (.79 + 2 * grain))
        if pattern == 'heartleaf-veins':
            return color.lerp(inner, .19 + 2 * grain).lerp(
                ink, max(.47 * midrib, .23 * lateral * (1 - .67 * margin)))
        if pattern == 'peperomia-cuticle':
            return color.lerp(inner,.21 + 3 * grain).lerp(ink,.40 * midrib * (1 - .36 * t))
        if pattern == 'net':
            # Angular silver fields resolve between the main midrib and a dark margin.
            cells = math.cos(27*t - 5*u + seed) * math.cos(9*u + 14*t)
            secondary = 1 - .74 * lateral - .58 * midrib
            marble = clamp(.30 + .79 * cells) * clamp((1.04 - margin) * 2.4)
            return color.lerp(ink, clamp(secondary) * marble)
        if pattern == 'silver-mottle':
            blotches = satin_blotches(t, u, spots, seed)
            return color.lerp(edge, .20 * midrib).lerp(ink, blotches * (.89 + grain))
        if pattern == 'silver-veins':
            minor = max(
                math.exp(-((t - (.17 + i * .117 + .088 * margin + .027 * math.cos(13 * u + i))) / .013) ** 2)
                for i in range(7)
            )
            silver = (.93 - .32 * margin ** 2 + grain) * (1 - .74 * lateral) * (1 - .87 * midrib)
            return color.lerp(ink, silver * (1 - .32 * minor)).lerp(edge, .35 * max(lateral, midrib))
        veins = max(.90 * midrib, .74 * lateral * (1 - .63 * margin ** 2))
        return color.lerp(inner, .16 + 2 * grain).lerp(ink, veins)
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
    if pattern in ('cream-flame','silver-lance'):
        boundary = .52 + .072*math.sin(t*37+seed) + .10*math.sin(5*t)
        if pattern == 'cream-flame':
            boundary += .16*math.sin(t*14+u*7+seed) + .085*math.sin(t*73+u*11)
        color = color.lerp(ink,clamp((boundary-margin)*4.4)*(1-.39*lateral))
    elif pattern == 'veins':
        color = color.lerp(ink, max(.91*midrib,.83*lateral))
    elif pattern == 'fenestrated':
        # Veins follow the lamina pigment and stop at the modeled holes.
        arc = t - .105 * margin ** 1.35
        secondaries = max(math.exp(-((arc - (.13 + i * .115)) / .024) ** 2) for i in range(7))
        color = color.lerp(ink, max(.55 * midrib, .32 * secondaries * (1 - .35 * margin)))
    elif pattern == 'pinnate':
        return color.lerp(ink, max(.53 * midrib, .29 * lateral * (1 - .70 * margin)))
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
    elif pattern == 'zebra':
        rows, columns = 15, 16
    elif pattern in ('net', 'heartleaf-veins', 'peperomia-cuticle'):
        rows, columns = (13, 10) if pattern == 'net' else (19, 14)
    elif pattern in LEAF_FINISHES:
        rows, columns = (22, 16) if pattern == 'silver-mottle' else (30, 18)
    elif incisions or pattern == 'cream-flame':
        rows, columns = 34, 14
    elif shape == 'tree':
        rows, columns = 26, 16
    else:
        rows, columns = (13, 10) if length < .52 else (18, 12)
    vertices, faces, pigments, index_map = [], [], [], {}
    colors = tuple(map(linear,palette))
    spots = ()
    if pattern == 'silver-mottle':
        rng = random.Random(seed)
        spots = tuple((rng.uniform(.13, .89), side * rng.uniform(.18, .79),
                       rng.uniform(.047, .11), rng.uniform(.10, .225), rng.uniform(-.14, .14))
                      for side in (-1, 1) for _ in range(rng.randint(5, 8)))
    for sign in (1,-1):
        for row in range(rows+1):
            t = .008 + .984*row/rows
            for col in range(columns+1):
                u = 2*col/columns-1
                width = half_width*width_at(t,shape)
                width *= 1 + .036*math.sin(15*t+u+seed)
                if pattern in ('silver-veins', 'silver-mottle', 'heartleaf-veins', 'peperomia-cuticle'):
                    width *= 1 + .16 * u * math.sin(seed + t * 2.1)
                if incisions:
                    slots = incisions[0 if u < 0 else 1]
                    cut = max((depth * math.exp(-((t - center) / .049) ** 2)
                               for center, depth in slots), default=0)
                    width *= 1 - cut * abs(u) ** .38
                wave = .009*math.sin(t*42+seed+u)*abs(u)**3*math.sin(math.pi*t)
                lamina = fold*u*u*math.sin(math.pi*t)+wave+bend*t*t
                petiole_lobe = .51 if shape == 'arrow' else .27 if shape == 'heart' else 0
                lobe = petiole_lobe*math.exp(-((t-.15)/.14)**2)*abs(u)**1.7
                ribs = .009*u*u*math.sin(t*44+u*4)*math.sin(math.pi*t) if pattern == 'veins' else 0
                if pattern in ('silver-veins', 'velvet-veins'):
                    midrib, lateral = leaf_veins(t, u, seed, velvet=pattern == 'velvet-veins')
                    relief = (.006 * midrib + .0027 * lateral) * math.sin(math.pi * t)
                    ribs += .26 * relief if sign > 0 else -relief
                if pattern in ('cream-flame', 'pinnate'):
                    centerline = math.exp(-(u / .13) ** 2) * math.sin(math.pi * t)
                    ribs += centerline * (.013 if sign < 0 or pattern == 'cream-flame' else -.006) * sign
                point = start+axis*(length*(t-lobe))+side*(u*width)+normal*(lamina+ribs+sign*thickness)
                index_map[(row,col,sign)] = len(vertices)
                vertices.append(point)
                pigments.append(shading(t,u,sign==1,colors,pattern,seed,spots))

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
                  pigment_material(parent, pattern),parent,[pigments[i] for i in used])


def pigment_material(parent, pattern=None):
    finish = pattern if pattern in LEAF_FINISHES else "lamina pigments"
    name = f"{parent.name} / {finish}"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    roughness, coat, specular = LEAF_FINISHES.get(pattern, (.43, .18, .28))
    mat = material(name,'ffffff',roughness,coat)
    tree = mat.node_tree
    shader = next(node for node in tree.nodes if node.type == 'BSDF_PRINCIPLED')
    shader.inputs['Specular IOR Level'].default_value = specular
    pigment = tree.nodes.new('ShaderNodeVertexColor')
    pigment.layer_name = 'Leaf pigments'
    tree.links.new(pigment.outputs['Color'],shader.inputs['Base Color'])
    return mat


FOREST = ('437643','224b39','94b665','43633e')
MOSS = ('517f43','245238','b2c783','466748')
SILVER = ('568b75','244d42','b4cab7','566f56')
CREAM = ('52864c','254b34','e5dfa9','5f7a48')
VELVET = ('2b543a','172f29','d4debf','6c8d66')
ZEBRINA = ('405c45','3e304e','bcc9bc','843e63')
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


def climber(parent, name, style, widths, height=1.42, lean=.22, stagger=.42, *, node_collars=None):
    stem_mat = material(f"{name} climbing vine",'586d3d',.58)
    root_mat = material(f"{name} aerial roots",'7f5940',.69)
    points = [Vector((lean*math.sin(i*.65),.17+.10*math.sin(i*.51),height*i/9-.038)) for i in range(10)]
    if node_collars:
        last = len(widths)
        points = [*points[:last+1], points[last].lerp(points[last+1], .30)]
    tube(parent,f"{name} main climbing vine",points,.047,stem_mat,8)
    for i,(length,width) in enumerate(widths):
        point = points[i+1]
        if node_collars:
            collar(parent, f"{name} petiole collar {i+1}", points, i + 1, .047, node_collars)
        sign = -1 if i%2 else 1
        end = point+Vector((sign*(.22+stagger*(i%3)*.18),-.20-.10*math.sin(i*1.4+.5),.065))
        tube(parent,f"{name} climbing petiole {i+1}",[point,point.lerp(end,.47)+UP*.04,end],.023,stem_mat)
        facing = Vector((.65*math.sin(i*1.61+1),-.84,.49*math.cos(i*1.5+.5)))
        blade(parent,f"{name} alternating lamina {i+1}",end,(sign*.80,-.26-.18*(i%3),.47-.34*(i%3)),facing,
              length,width,style,i+.2)
        if i<4 and i%2==0:
            tube(parent,f"{name} aerial root {i+1}",[point,point+Vector((sign*.061,.03,-.11)),point+Vector((sign*.032,.07,-.22))],.012,root_mat)


def cascade(parent, name, style, leaf_size, trails, *, paired=False, purple=False, crown_leaves=4,
            rootlets=None, stipule=None, tuber=None):
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
            if rootlets and node in (3, 7):
                tube(parent,f"{name} node rootlet {i+1}-{node}",
                     [at, at + Vector((side * .028, .018, -.030)),
                      at + Vector((side * .037, .039, -.069))], .009, rootlets, 6)
            for branch in ((-1,1) if paired else (-1 if (node//2+i)%2 else 1,)):
                vector = Vector((branch*.84,-.48,.20-.75*node/13))
                end = at+vector*.096
                tube(parent,f"{name} trailing petiole {i}-{node}-{branch}",[at,at.lerp(end,.48)+UP*.028,end],.010,stem_mat,6)
                size = 1.15-.31*node/13+.14*math.sin(i+node)
                blade(parent,f"{name} trailing leaf {i}-{node}-{branch}",end,vector,FRONT,
                      leaf_size[0]*size,leaf_size[1]*size,style,i*7+node)
        if stipule:
            direction = (points[-1] - points[-2]).normalized()
            blade(parent, f"New heartleaf stipule {i+1}", points[-1], direction + .22*UP, FRONT,
                  .12, .035, stipule, i+.3)
        if tuber:
            node = 6 + i % 3
            oval(parent, f"String of Hearts aerial tuber {i+1}", points[node],
                 (.031,.029,.026), tuber, points[node+1]-points[node-1])
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
    vine = material('String of Pearls stems','6b7b48',.54)
    leaf_mat = pigment_material(parent, 'epidermal-window')
    young, mature, seam = map(linear, ('82a759','537646','324f39'))
    profile = ((.0,.11), (.17,.58), (.35,.88), (.53,1), (.70,.92),
               (.86,.69), (.98,.40), (1.05,.14))
    for i,(side,length,offset) in enumerate(((-1,.99,-.14),(1,.96,-.11),(-1,.71,.07),
                                           (1,.73,.18),(-1,.51,.27),(1,.53,.30))):
        points = [Vector((side*(.12+.88*math.sin(math.pi*.53*t))+.075*math.sin(4.4*t+i)*t,
                          offset-.25*t+.083*math.sin(5*t+i*.6)*t,
                          .32*math.sin(math.pi*t)-length*t**1.70-.034)) for t in (j/15 for j in range(16))]
        tube(parent,f"Pearl vine {i+1}",points,.016,vine)
        for j in range(2, len(points)):
            point = points[j]
            tangent = (points[j] - points[j-1]).normalized()
            across = tangent.cross(UP).normalized()
            twist = tangent.cross(across)
            turn = j * 2.399963 + i
            axis = (math.cos(turn) * across + math.sin(turn) * twist - .18*tangent).normalized()
            longitude = axis.cross(FRONT).normalized()
            window_direction = longitude.cross(axis)
            radius = .064 - .016*j/15 + .010*math.sin(j*.87+i*1.2)
            tint = mature.lerp(young, .39+.22*math.sin(.62*j+i*2)+.17*j/15)
            vertices, faces, colors = [], [], []
            cols = 12
            for row,(progress,width) in enumerate(profile):
                for col in range(cols):
                    a = TAU * col / cols
                    cross_section = (longitude*math.sin(a) + window_direction*math.cos(a)) * radius * width
                    vertices.append(point + axis*(radius*(2*progress-.05)) + cross_section)
                    window = max(0,math.cos(a)) ** 24
                    window *= math.sin(math.pi * progress) ** 1.6 if progress < 1 else 0
                    color = tint.lerp(young,.11+.09*math.sin(a+row*.53+i))
                    colors.append(color.lerp(seam, .68*window))
            for row in range(len(profile)-1):
                for col in range(cols):
                    a, b = row*cols+col, row*cols+(col+1)%cols
                    faces.append((a,b,b+cols,a+cols))
            for row in (0,len(profile)-1):
                cap = len(vertices)
                progress = -.05 if row == 0 else 2.20
                vertices.append(point + axis*(radius*progress))
                colors.append(tint)
                faces.extend((cap,row*cols+col,row*cols+(col+1)%cols) for col in range(cols))
            finish(f"Pearl leaf with window {i+1}.{j}",vertices,faces,leaf_mat,parent,colors)


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
    stem_mat = material('Pilea curved main stem','607946',.64)
    scar_mat = material('Pilea subdued pale leaf scars','82955d',.69)
    nodes = [Vector((-.06 + .11*t*t, .13+.048*math.sin(t*4), -.06+.94*t))
             for t in (j / 11 for j in range(12))]
    tube(parent, 'Pilea central stem', nodes, .060, stem_mat, 10)
    palette = tuple(map(linear,('5b8551','315b44','8da264','63845a')))
    layout = ((.53,.34,.51),(.59,.36,.54),(.69,.35,.62),(.76,.32,.55),(.86,.35,.55),
              (.98,.32,.49),(1.03,.28,.47),(1.12,.26,.39),(1.20,.22,.30))
    for i,(height,width,reach) in enumerate(layout):
        angle = i*2.399963+.32
        radial = Vector((math.cos(angle),math.sin(angle),0))
        base = nodes[i+2]
        center = radial * reach + UP * height + Vector((0,.065,0))
        normal = (.87*UP+.43*FRONT+radial * (.37+.12*math.sin(i))).normalized()
        underside = center - normal*.028
        tube(parent,f"Pilea centered petiole {i+1}",
             [base,base.lerp(underside,.39)+UP*.103,underside-UP*.056,underside],.019,stalk)
        collar(parent,f"Pilea node collar {i+1}",nodes,i+2,.060,scar_mat)
        side = normal.cross(UP).normalized()
        forward = side.cross(normal).normalized()
        profile = ((.09,-.018),(.33,-.013),(.56,.011),(.79,.028),(.95,.040),
                   (1.0,.037),(.86,.009),(.64,-.009),(.36,-.027),(.075,-.039))
        points,faces,colors = [],[],[]
        cols = 36
        for row,(scale,offset) in enumerate(profile):
            for j in range(cols):
                a = TAU * j / cols
                radius = width * scale * (1+.037*math.cos(3*a+i*.81)+.028*math.sin(5*a+i))
                vascular = (.5+.5*math.cos(8*a+2.2*scale)) ** 3
                relief = .008*vascular*math.sin(math.pi*scale if scale < 1 else 0)
                points.append(center+side*(radius*math.cos(a))+forward*(radius*.94*math.sin(a))
                              +normal*(offset+(.43 if row<6 else -1)*relief))
                if row < 6:
                    tint = palette[0].lerp(palette[1],.16+.47*scale + .07*math.sin(a*3+i+2*scale))
                else:
                    tint = palette[3].lerp(palette[1],.14+.19*scale)
                colors.append(tint.lerp(palette[2],.18 * vascular * (1-.46*scale)))
        for row in range(len(profile)-1):
            for j in range(cols):
                a,b = row*cols+j,row*cols+(j+1)%cols
                faces.append((a,b,b+cols,a+cols))
        for row in (0,len(profile)-1):
            index = len(points)
            points.append(center+normal*profile[row][1])
            colors.append(palette[0].lerp(palette[2],.32))
            faces.extend((index,row*cols+j,row*cols+(j+1)%cols) for j in range(cols))
        finish(f"Pilea peltate coin {i+1}",points,faces,pigment_material(parent,'peltate'),parent,colors)


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
    scars = material('Silver Monstera green node collars','60794c',.62)
    juvenile = ('4f805e','21452f','9cb69c','658c60')
    climber(parent,'Silver Monstera',('heart','silver-veins',juvenile,-.080,.033,.009),
            [(.43,.128),(.52,.151),(.57,.169),(.63,.185),(.57,.164),(.49,.141),(.44,.126)],
            1.52,.15,.39,node_collars=scars)


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
    petiole = material('Alocasia ivory-green petioles','91a273',.57)
    sheath = material('Alocasia dusky basal sheaths','725c56',.68)
    style = ('arrow','velvet-veins',VELVET,.012,.055,.007)
    layout = ((-2.73, .60, .71, .83, .30), (-.45, .58, .79, .80, .28),
              (-1.40, .47, .92, .96, .32), (2.47, .39, 1.02, .86, .27),
              (.68, .47, 1.12, .75, .238), (1.43, .15, 1.28, .50, .165))
    for i, (angle, reach, height, length, width) in enumerate(layout):
        radial = Vector((math.cos(angle), math.sin(angle), 0))
        base = .065 * radial - .047 * UP
        shoulder = .16 * radial + .32 * height * UP
        end = reach * radial + height * UP
        bend = shoulder.lerp(end, .65) + .054 * UP - .037 * radial
        tube(parent, f"Velvet petiole {i+1}", [base, shoulder, bend, end], .031, petiole, 9)
        tube(parent, f"Overlapping basal sheath {i+1}", [base, base.lerp(shoulder, .38), shoulder],
             .040, sheath, 9, taper=(1.15, .84, .61))
        toward_tip = radial + UP * (.23 if i > 2 else -.35)
        facing = .72 * FRONT + .64 * UP if i in (0, 1, 2) else .47 * FRONT + .82 * UP
        blade(parent, f"Sagittate velvet blade {i+1}", end, toward_tip, facing, length, width, style, i+.81)


def heartleaf(parent):
    greens = ('4c7649','28563b','91ad6c','5c8259')
    young_stipule = ('702f30','562d31','b27857','98573d')
    cascade(parent,'Heartleaf Philodendron',('heart','heartleaf-veins',greens,-.084,.040,.010),
            (.51,.22),[(-1,.91,.92,-.09),(1,.88,.72,-.20),(-1,.62,.46,.26)],crown_leaves=4,
            stipule=('lance','plain',young_stipule,.017,.026,.005))


def satin(parent):
    silver_blotches = ('375f46','214c3b','b9c9ba','66846b')
    roots = material('Satin Pothos woody rootlets','77644c',.72)
    cascade(parent,'Satin Pothos',('heart','silver-mottle',silver_blotches,-.04,.046,.010),(.48,.25),
            [(-1,.79,.90,-.07),(1,.78,.72,-.26),(1,.60,.55,.24)],crown_leaves=5,rootlets=roots)


def hoya(parent):
    cascade(parent,'Hoya Carnosa',('obovate','plain',WAX,-.034,.021,.021),(.39,.15),
            [(-1,.71,.74,-.09),(1,.72,.59,-.13)],paired=True,crown_leaves=7)
    peduncle = material('Hoya flower peduncle','6b744c',.62)
    tube(parent,'Flower spur',[(.10,-.09,.12),(.29,-.23,.42),(.53,-.37,.61),(.67,-.49,.53)],.023,peduncle)
    wax_flower(parent,(.67,-.49,.53))


def tradescantia(parent):
    stem = material('Zebrina fleshy plum stems','764a61',.52)
    sheath = material('Zebrina wrapping leaf sheaths','865669',.57)
    roots = material('Zebrina node root initials','b18a70',.74)
    style = ('lance','zebra',ZEBRINA,-.06,.033,.010)
    shoots = ((-1,.82,.70,-.18), (1,.78,.60,-.09), (-1,.61,.44,.24),
              (1,.64,.37,.28), (.20,.46,.04,-.34))
    for shoot, (side, reach, hang, offset) in enumerate(shoots):
        nodes = [Vector((side * (.065 + reach * math.sin(1.61 * t)),
                         offset * t + .07 * math.sin(t * math.pi) + .065 * (shoot % 2),
                         .59 * math.sin(2.34 * t) - hang * t ** 1.36 - .044))
                 for t in (i / 13 for i in range(14))]
        tube(parent, f"Zebrina shoot {shoot+1}", nodes, .025, stem, 8)
        for i, node in enumerate(range(2, 13, 2)):
            root = nodes[node]
            collar(parent, f"Closed leaf sheath {shoot+1}-{i+1}", nodes, node, .027, sheath)
            rank = -1 if (shoot + i) % 2 else 1
            direction = Vector((side * .30 + rank * .48, rank * .69, .38 - .69 * i / 5))
            toward_tip = direction.normalized()
            start = root + toward_tip * .011
            facing = UP * .74 + FRONT * (.70 if rank > 0 else -.43)
            length = .33 + .055 * math.sin(i * .96 + shoot) + (.055 if i < 4 else -.024)
            blade(parent, f"Zebrina striped blade {shoot+1}-{i+1}", start, toward_tip, facing,
                  length, length * .326, style, shoot * 2.0 + i * .69)
            if i == 2 and shoot in (0, 1, 3):
                tube(parent, f"Zebrina root initial {shoot+1}",
                     [root, root + Vector((side*.014,.010,-.025)), root+Vector((side*.024,.024,-.054))],
                     .009, roots, 6)


def hearts(parent):
    tuber = material('Wiry vine corky aerial tubers','8b7167',.78)
    cascade(parent,'String of Hearts',('heart','net',('496f5c','294d41','b9cab8','98507a'),-.038,.025,.011),(.25,.112),
            [(-1,.99,.98,-.21),(1,.97,.81,-.08),(-1,.90,.65,.12),(1,.76,.52,.24)],
            paired=True,purple=True,crown_leaves=4,tuber=tuber)


def peperomia(parent):
    stems = material('Peperomia blushed fleshy stems','777b4a',.55)
    stalk = material('Peperomia dusty rose petioles','9e6a63',.56)
    style = ('obovate','peperomia-cuticle',('4d7940','264c31','85a456','607f54'),-.040,.072,.021)
    layout = ((-2.6, .60, .62), (-.44, .67, .67), (1.4, .49, .84), (2.9,.38,.74))
    for branch, (angle, reach, height) in enumerate(layout):
        radial = Vector((math.cos(angle),math.sin(angle),0))
        across = radial.cross(UP)
        axis = [radial*(.059 + reach*t**1.54)+UP*(height*t-.047)
                for t in (0,.20,.39,.58,.77,1)]
        tube(parent, f"Peperomia leafy branch {branch+1}", axis, .037, stems, 9)
        for index in (2, 3, 5):
            toward_tip = (radial + (.63 if index == 3 else -.25)*across + (.24+.2*index/5)*UP).normalized()
            node = axis[index]
            end = node + .076*toward_tip + .033*UP
            tube(parent,f"Peperomia short petiole {branch+1}-{index}", [node,node.lerp(end,.59),end],.023,stalk)
            root = end - .018*toward_tip + .012*UP
            facing = UP*.90 + FRONT*(.31+.10*math.sin(branch))
            length = (.49 - .046*index/5) * (1 + .15*math.sin(branch+index*.74))
            blade(parent,f"Thick cupped peperomia leaf {branch+1}-{index}",root,toward_tip,facing,
                  length, length*(.49+.016*math.sin(branch)),style,branch*1.2+index)


MODELS = [dict(id=slug,species=species,common=common,note=note,build=builder,fallback=fallback) for
          slug,species,common,note,builder,fallback in (
    ('swiss-cheese-vine','Monstera adansonii','Swiss Cheese Vine','Narrow climbing leaves with enclosed paired fenestrations and aerial roots.',swiss,0),
    ('mini-monstera','Rhaphidophora tetrasperma','Mini Monstera','Flexuous vine with scarred nodes, attached aerial roots, entire young leaves, and staggered marginal splits.',mini,0),
    ('silver-monstera','Monstera siltepecana','Silver Monstera','Unequal juvenile blades with dark reticulate veins on satin silver fields and connected climbing nodes.',silver,0),
    ('split-leaf-philodendron','Thaumatophyllum bipinnatifidum','Split-Leaf Philodendron','A self-heading rosette with deeply pinnatifid, broad leaves.',split_leaf,0),
    ('chinese-evergreen','Aglaonema commutatum','Chinese Evergreen','A silver-splashed lanceolate clump with deep green margins.',aglaonema,7),
    ('dieffenbachia','Dieffenbachia seguine','Dieffenbachia','Scarred upright cane with attached sheathing petioles and broad cream-variegated leaves.',dieffenbachia,7),
    ('flamingo-flower','Anthurium andraeanum','Flamingo Flower','Glossy heart foliage with rose-red heart-shaped spathes and projecting golden spadices.',anthurium,1),
    ('peace-lily','Spathiphyllum wallisii','Peace Lily','Fountain of ribbed narrow leaves with upright cream-white spathes.',peace_lily,7),
    ('arrowhead-plant','Syngonium podophyllum','Arrowhead Plant','Juvenile pointed arrowheads with backward basal lobes and soft center variegation.',arrowhead,1),
    ('green-velvet-alocasia','Alocasia micholitziana','Green Velvet Alocasia','Dark matte sagittate foliage with pale curving veins, greener reverses, and sheathing petioles.',alocasia,7),
    ('heartleaf-philodendron','Philodendron hederaceum','Heartleaf Philodendron','Alternating glossy, subtly veined hearts with free terminal stipules on trailing vines.',heartleaf,1),
    ('satin-pothos','Scindapsus pictus','Satin Pothos','Irregular upper-surface silver blotches, plain pale reverses, and attached rootlets on arching vines.',satin,1),
    ('wax-plant','Hoya carnosa','Wax Plant','Opposite fleshy waxy leaves and a cluster of five-pointed pink flowers.',hoya,1),
    ('silver-inch-plant','Tradescantia zebrina','Silver Inch Plant','Two-ranked silver-striped blades with burgundy reverses, closed sheaths and rooting nodes.',tradescantia,1),
    ('string-of-pearls','Curio rowleyanus','String of Pearls','Pendent stems with attached fleshy bead leaves, pointed tips and narrow epidermal window stripes.',pearls,1),
    ('string-of-hearts','Ceropegia woodii','String of Hearts','Purple wiry vines with opposite silver-etched hearts, violet reverses and small aerial tubers.',hearts,1),
    ('baby-rubber-plant','Peperomia obtusifolia','Baby Rubber Plant','A bush of thick glossy, cupped obovate leaves on branching stems with pink sub-peltate petioles.',peperomia,4),
    ('chinese-money-plant','Pilea peperomioides','Chinese Money Plant','Satin circular leaves with radial veins and centered petiole attachments to a scarred upright stem.',coins,7),
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
    'string-of-hearts': ['https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A95848-1',
                         'https://plants.ces.ncsu.edu/plants/ceropegia-woodii/'],
    'silver-monstera': ['https://plants.ces.ncsu.edu/plants/monstera-siltepecana/',
                       'https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A163959-2/general-information'],
    'mini-monstera': ['https://plants.ces.ncsu.edu/plants/rhaphidophora-tetrasperma/common-name/dwarf-monstera/',
                     'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:88594-1/general-information'],
    'dieffenbachia': ['https://plants.ces.ncsu.edu/plants/dieffenbachia-seguine/',
                     'https://monografiasfloradobrasil.jbrj.gov.br/dieffenbachia.pdf'],
    'split-leaf-philodendron': ['https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A77306988-1/general-information'],
    'satin-pothos': ['https://plants.ces.ncsu.edu/plants/scindapsus-pictus/'],
    'silver-inch-plant': ['https://plants.ces.ncsu.edu/plants/tradescantia-zebrina/'],
    'string-of-pearls': ['https://powo.science.kew.org/taxon/1011412-1',
                        'https://plants.ces.ncsu.edu/plants/curio-rowleyanus/'],
    'chinese-money-plant': ['https://plants.ces.ncsu.edu/plants/pilea-peperomioides/'],
    'heartleaf-philodendron': ['https://plants.ces.ncsu.edu/plants/philodendron-hederaceum/'],
    'baby-rubber-plant': ['https://plants.ces.ncsu.edu/plants/peperomia-obtusifolia/'],
}
for model, palette in zip(MODELS,POT_PALETTES,strict=True):
    model['pot'] = palette
    model['sources'] = IDENTITY_SOURCES.get(model['id'])
    if model['id'] == 'split-leaf-philodendron':
        model['accepted'] = 'Philodendron bipinnatifidum'
