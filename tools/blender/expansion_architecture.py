"""V5 architecture batch: Marantaceae, ferns, palms and woody tropicals."""

import math
from mathutils import Vector

from build_monstera import material, mesh
from build_snake_plant import linear_color


UP = Vector((0, 0, 1))
GOLDEN = math.pi * (3 - math.sqrt(5))


def radial(angle):
    return Vector((math.cos(angle), math.sin(angle), 0))


def pigment(colors):
    return tuple(linear_color(code) for code in colors.split())


def ease(value):
    value = max(0, min(1, value))
    return value * value * (3 - 2 * value)


class Foliage:
    """Accumulate closed leaf and stem surfaces with one pigment material."""

    def __init__(self):
        self.vertices = []
        self.faces = []
        self.colors = []

    def sweep(self, rings, colors, first=None, last=None):
        start = len(self.vertices)
        size = len(rings[0])
        for points, row in zip(rings, colors):
            self.vertices.extend(points)
            self.colors.extend(row)
        loop = first is None
        for row in range(len(rings) if loop else len(rings) - 1):
            a = start + row * size
            b = start + ((row + 1) % len(rings)) * size
            for column in range(size):
                after = (column + 1) % size
                self.faces.append((a + column, a + after, b + after, b + column))
        if loop:
            return
        bottom = len(self.vertices)
        top = bottom + 1
        self.vertices.extend((first, last))
        self.colors.extend((colors[0][size // 4], colors[-1][size // 4]))
        far = start + (len(rings) - 1) * size
        for column in range(size):
            after = (column + 1) % size
            self.faces.extend(((bottom, start + after, start + column), (top, far + column, far + after)))

    def tube(self, points, breadth, shade, taper=.36, sides=8, *, loop=False):
        points = tuple(Vector(point) for point in points)
        rings, colors = [], []
        for index, point in enumerate(points):
            following = (index + 1) % len(points) if loop else min(index + 1, len(points) - 1)
            previous = index - 1 if loop else max(index - 1, 0)
            axis = (points[following] - points[previous]).normalized()
            right = axis.cross(UP if loop else Vector((0, -1, 0)))
            if right.length_squared < .035:
                right = axis.cross(Vector((1, 0, 0)))
            right.normalize()
            front = axis.cross(right).normalized()
            along = index / (len(points) - 1)
            radius = breadth * (1 - (1 - taper) * along)
            rings.append([point + radius * (right * math.cos(math.tau * i / sides) + front * math.sin(math.tau * i / sides))
                          for i in range(sides)])
            colors.append([shade * (.89 + .16 * math.cos(math.tau * i / sides)) for i in range(sides)])
        if loop:
            self.sweep(rings, colors)
        else:
            self.sweep(rings, colors, points[0] - (points[1] - points[0]).normalized() * .002,
                       points[-1] + (points[-1] - points[-2]).normalized() * .002)

    def blade(self, base, tip, width, palette, *, normal=(0, -1, .65), kind="oval", pattern=None,
              seed=0, fold=.07, bow=.08, wave=0, rows=8, columns=5):
        start, end = Vector(base), Vector(tip)
        direction = end - start
        axis = direction.normalized()
        right = axis.cross(Vector(normal)).normalized()
        if right.length_squared < .001:
            right = axis.cross(Vector((0, -1, .2))).normalized()
        front = right.cross(axis).normalized()
        edges = tuple(-1 + 2 * column / (columns - 1) for column in range(columns))
        perimeter = [(u, face) for face, strip in ((1, edges), (-1, reversed(edges))) for u in strip]
        top, highlight, dark, vein, reverse = palette
        rings, colors = [], []
        nest = pattern in {'nest', 'nest-sori'}
        for index in range(rows):
            t = .018 + .963 * index / (rows - 1)
            if kind == 'ribbon':
                breadth = math.sin(math.pi * t ** .56) ** .72
            elif nest:
                breadth = math.sin(math.pi * t ** 1.02) ** .61
            elif kind == 'rounded':
                breadth = math.sin(math.pi * t ** .83) ** .54
            elif kind == 'rubber':
                breadth = math.sin(math.pi * t ** .91) ** .55 * (1 - .49 * ease((t - .86) / .12))
            elif kind == 'fanlet':
                breadth = math.sin(math.pi * t ** 2.1) ** .52
            else:
                breadth = math.sin(math.pi * t ** .80) ** .78
            arch = math.sin(math.pi * t)
            points, tones = [], []
            for u, face in perimeter:
                edge = abs(u)
                ripple = 1 + wave * math.sin(41 * t + 1.8 * u + seed) * edge ** 2
                if kind == 'banana' and edge > .32:
                    cuts = (.49, .68, .78) if u < 0 else (.58, .72, .87)
                    ripple *= 1 - .41 * max(math.exp(-((t - cut) / .015) ** 2) for cut in cuts) * edge ** 2
                x = width * breadth * u * ripple
                thickness = max(.0018, width * .017) * (.63 + .62 * (1 - u * u))
                center = start + direction * t
                if nest:
                    lift = .24 if pattern == 'nest-sori' else .11
                    center = start + Vector((direction.x * t ** .91, direction.y * t ** .91,
                                             direction.z * t + lift * arch))
                    if face < 0:
                        thickness += .012 * math.exp(-((u / .10) ** 2)) * (1 - t)
                center += front * (bow * arch - fold * u * u * arch)
                points.append(center + right * (x + .030 * arch * math.sin(seed)) + front * (face * thickness))
                shade = top.lerp(highlight, ease(.22 + .27 * math.sin(math.pi * t) - .26 * edge + .07 * math.sin(19 * t + u * 7 + seed)))
                stripe = t - .10 * edge + .012 * math.sin(9 * u + seed)
                pigment_band = .5 + .5 * math.cos(math.tau * (stripe * 7.1 + .11 * seed))
                midrib = math.exp(-((u / .066) ** 2))
                if pattern == 'orbifolia':
                    shade = shade.lerp(highlight, .85 * ease((pigment_band - .23) * 1.68))
                elif pattern == 'rattlesnake':
                    paired = (stripe * 8.5 + .15 * (u > 0)) % 1 - .5
                    size = .25 + .074 * math.sin(math.floor(stripe * 8.5) * math.pi / 2)
                    ellipse = (paired / size) ** 2 + ((edge - .53) / .34) ** 2
                    shade = shade.lerp(dark, ease((1.34 - ellipse) * 1.65))
                elif pattern == 'fishbone':
                    shade = shade.lerp(dark, .91 * ease((pigment_band - .43) * 2.7) * ease((edge - .05) * 6))
                elif pattern == 'maranta':
                    shade = shade.lerp(dark, .74 * ease((edge - .15) * 2.1))
                    shade = shade.lerp(vein, .88 * ease((pigment_band - .82) * 5.5) * ease((.93 - edge) * 4))
                elif pattern == 'maidenhair':
                    # Fine forked veins spreading out into each fanlet.
                    ray = .5 + .5 * math.cos(math.pi * u * (3 + 2 * t))
                    shade = shade.lerp(vein, .34 * ray ** 4 * math.sin(math.pi * t))
                elif pattern == 'rubber-venation':
                    ray = .5 + .5 * math.cos(math.tau * (t - .12 * edge ** .84) * 17)
                    shade = shade.lerp(highlight, .15 * ray ** 3 * arch * (1 - edge ** 3))
                elif nest:
                    ray = .5 + .5 * math.cos(math.tau * (t - .10 * edge) * 16)
                    shade = shade.lerp(highlight, .16 * ray ** 3 * arch)
                if not (pattern == 'stromanthe'):
                    shade = shade.lerp(vein, midrib * (.88 if nest else .78 if pattern == 'maranta' else .51))
                shade = shade.lerp(dark, ease((edge - .90) * 6) * .34)
                if face < 0:
                    shade = reverse.lerp(shade, .18 + .12 * midrib)
                    if nest:
                        shade = shade.lerp(vein, .70 * midrib)
                    if pattern == 'nest-sori':
                        mask = ease((t - .50) / .10) * ease((.94 - t) / .13)
                        mask *= ease((edge - .12) / .063) * ease((.59 - edge) / .13)
                        shade = shade.lerp(dark, .74 * mask * ray ** 4)
                tones.append(shade)
            rings.append(points)
            colors.append(tones)
        self.sweep(rings, colors, start, end)

    def finish(self, crown, name, roughness=.48):
        coating = material(name + " pigments", "ffffff", roughness, .135)
        object = mesh(name, self.vertices, self.faces, coating, crown)
        mesh_data = object.data
        color = mesh_data.color_attributes.new(name="Botanical pigments", type="FLOAT_COLOR", domain="POINT")
        mesh_data.color_attributes.active_color = color
        color.data.foreach_set("color", [component for rgb in self.colors for component in (*rgb, 1)])
        shader = next(node for node in coating.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
        attribute = coating.node_tree.nodes.new("ShaderNodeVertexColor")
        attribute.layer_name = color.name
        coating.node_tree.links.new(attribute.outputs["Color"], shader.inputs["Base Color"])
        return object


def prayer(crown, name, pattern, palette, layouts, petiole, *, kind="oval", waviness=.055):
    leaves = Foliage()
    colors = pigment(palette)
    stem_color = linear_color(petiole)
    for index, (at, tip, width, exposure) in enumerate(layouts):
        hinge, tip = Vector(at), Vector(tip)
        root = Vector((at[0] * .13, at[1] * .2, -.047))
        bow = root.lerp(hinge, .62) + Vector((.04, .014, -.035))
        leaves.tube((root, root.lerp(bow, .5), bow, bow.lerp(hinge, .55), hinge + (tip-hinge).normalized() * .030), .023, stem_color)
        leaves.blade(hinge, tip, width, colors, normal=(.13 * math.sin(index * 2), -exposure, .70),
                     kind=kind, pattern=pattern, seed=index * 1.23, wave=waviness, rows=42, columns=17,
                     bow=.13 if kind == "rounded" else .075)
    leaves.finish(crown, name)


def orbifolia(crown):
    prayer(crown, "Orbifolia silver discs", 'orbifolia', "607c4b b8caa0 315b42 aac598 a0ac79", [
        ((-.10,.14,.91),(-.33,.19,1.77),.47,1), ((.33,.09,.71),(.83,.04,1.49),.48,1),
        ((-.39,.04,.64),(-.91,.10,1.32),.47,1), ((.02,-.19,.49),(.09,-.62,1.12),.40,1),
        ((.42,.28,.49),(.96,.45,1.03),.37,-.5), ((-.34,.35,.44),(-.77,.64,.90),.35,-.35),
        ((.20,.24,.97),(.41,.43,1.58),.36,1),
    ], "758a57", kind="rounded", waviness=.04)


def rattlesnake(crown):
    prayer(crown, "Rattlesnake spotted lancelets", 'rattlesnake', "a5b85f c0cf7f 234c34 7d9f51 793a58", [
        ((-.06,.12,.78),(-.28,.26,1.70),.15,1), ((.18,.03,.69),(.75,.02,1.56),.16,1),
        ((-.26,-.01,.58),(-.90,.01,1.31),.17,1), ((.06,-.19,.49),(.30,-.62,1.41),.17,1),
        ((.29,.26,.43),(.98,.61,1.15),.15,-1), ((-.24,.28,.47),(-.86,.61,1.35),.14,-1),
        ((.12,.23,.81),(.26,.69,1.69),.14,1), ((-.13,-.23,.43),(-.39,-.75,1.08),.12,1),
    ], "715951", kind="ribbon", waviness=.14)


def maranta(crown):
    prayer(crown, "Maranta red herringbone", 'maranta', "4c6c43 a8b661 234539 d67773 7c4958", [
        ((-.10,.16,.66),(-.35,.28,1.32),.33,1), ((.36,-.04,.52),(.89,-.20,1.07),.33,1),
        ((-.44,-.02,.48),(-1.00,-.15,.83),.30,1), ((.01,-.33,.35),(.18,-.76,.82),.29,1),
        ((.42,.36,.39),(1.01,.52,.65),.26,-1), ((-.43,.31,.41),(-.97,.51,.63),.27,-.8),
        ((.09,.16,.70),(.40,.47,1.35),.30,1), ((.03,.53,.39),(.05,.95,.75),.25,-.7),
    ], "755640", waviness=.03)


def ctenanthe(crown):
    prayer(crown, "Ctenanthe fishbone bands", 'fishbone', "a4b79a c3caaf 285940 8caa86 754b68", [
        ((-.06,.13,.93),(-.17,.08,1.71),.24,1), ((.19,.03,.83),(.61,-.06,1.50),.22,1),
        ((-.30,.04,.72),(-.68,-.03,1.30),.25,1), ((.02,-.23,.53),(.21,-.53,1.19),.25,1),
        ((.32,.26,.62),(.84,.49,1.10),.24,-1), ((-.33,.31,.64),(-.81,.58,1.14),.23,-.6),
        ((.10,.22,.99),(.40,.54,1.65),.23,1), ((-.28,-.25,.46),(-.67,-.62,1.02),.21,1),
    ], "755a63", waviness=.045)


def stromanthe(crown):
    prayer(crown, "Stromanthe dark emerald and wine", 'stromanthe', "234e39 4b7852 254432 82975d 8c2e57", [
        ((-.05,.12,.85),(-.21,.17,1.79),.23,1), ((.28,.10,.77),(.76,-.01,1.66),.26,1),
        ((-.33,.01,.70),(-.91,.05,1.43),.23,1), ((.10,-.20,.58),(.46,-.55,1.44),.24,1),
        ((.27,.27,.52),(.96,.55,1.27),.22,-1), ((-.31,.29,.58),(-.91,.62,1.25),.23,-1),
        ((.16,.16,.99),(.33,.47,1.81),.22,-1),
    ], "79475c", kind="ribbon", waviness=.055)


def frond_path(start, heading, reach, height, descent):
    return lambda t: start + heading * (reach * (.27 * t + .73 * t ** 1.31)) + UP * (height * math.sin(t * math.pi * .57) - descent * t ** 2)


def pinnate(plants, start, direction, reach, rise, droop, pairs, spread, palette, *, style="fern", seed=0):
    path = frond_path(start, direction, reach, rise, droop)
    edge = Vector((-direction.y, direction.x, 0))
    plants.tube([path(i / 12) for i in range(13)], .014 if style != "palm" else .021,
                palette[3], .14, 7)
    for n in range(pairs):
        t = .26 + .69 * n / (pairs - 1)
        span = spread * (.18 + .82 * math.sin(math.pi * (t - .09)) ** .89)
        for side in (-1, 1):
            stagger = t + side * .011 * math.sin(n * 2.0 + seed)
            base = path(stagger)
            tip = base + edge * (side * span) + direction * (span * (.29 if style == 'fern' else .42))
            tip.z += span * (.17 if style == 'fern' else -.42)
            broad = span * (.155 if style == 'palm' else .22)
            plants.blade(base, tip, broad, palette, normal=(.20 * side, -.38, 1), kind='ribbon',
                         rows=5, columns=3, wave=.14 if style == 'fern' else .024, bow=span * .13, fold=span * .13,
                         seed=seed + n * .72 + side)
    tip = path(1)
    plants.blade(path(.91), tip + direction * .10, spread * .11, palette, normal=(0, -.6, 1), rows=5, columns=3, bow=.017, fold=.017)


def boston(crown):
    fern = Foliage()
    tones = pigment('428552 73ae61 295f43 8fa15f 376948')
    for i in range(10):
        direction = radial(i * GOLDEN + .22)
        layer = i % 3
        pinnate(fern, direction * .047 - UP * .025, direction, (1.09, .89, .63)[layer],
                (.86, 1.18, 1.42)[layer], (.75, .47, .24)[layer], 18 - layer * 2, .21 + layer * .018,
                tones, seed=i * .66)
    fern.finish(crown, "Boston fern arching pinnae", .53)


def bird_nest(crown):
    fern = Foliage()
    mature = pigment('407647 83a758 674e2a 373326 7f9961')
    young = pigment('699950 a6bd65 528249 52482f 8fa66c')
    fern.tube(((0, 0, -.060), (0, 0, .012), (.013, .011, .070)),
              .080, mature[3], .50, 10)
    for i in range(12):
        direction = radial(i * GOLDEN + .09 * math.sin(i * 2.1))
        layer = i % 3
        base = direction * (.027 + i % 2 * .025) - UP * .043
        reach = (1.22, .86, .49)[layer] * (1 + .10 * math.sin(i * 1.8))
        rise = (.74, 1.30, 1.21)[layer] * (1 + .10 * math.cos(i * 1.5))
        tip = direction * reach + UP * rise
        normal = direction * -.64 + UP * .90
        fern.blade(base, tip, (.255, .22, .137)[layer], young if layer == 2 else mature,
                   normal=normal, pattern='nest-sori' if layer == 0 else 'nest',
                   wave=.10 - .028 * layer, rows=52, columns=13, bow=.048, fold=.065, seed=i * .92)
    fern.finish(crown, "Asplenium crown and fronds with rounded backs", .39)


def maidenhair(crown):
    fern = Foliage()
    tones = pigment('6d9c54 aaC479 4d7044 729a51 569150')
    stalk = linear_color('39352e')
    for i in range(8):
        heading = radial(i * GOLDEN + .37)
        across = Vector((-heading.y, heading.x, 0))
        path = frond_path(heading * .045 - UP * .028, heading, .85 + .14 * (i % 3), 1.16 + .13 * (i % 2), .35)
        fern.tube([path(i / 10) for i in range(11)], .012, stalk, .24, 7)
        for j in range(5):
            t = .35 + j * .135
            for side in (-1, 1):
                junction = path(t + .012 * side)
                fan = junction + across * (side * (.38 - .038 * j)) + heading * .10 + UP * .068
                fern.tube((junction, junction.lerp(fan, .55) - UP * .027, fan), .008, stalk, .36, 6)
                for k in range(3):
                    start = junction.lerp(fan, .37 + .26 * k)
                    tip = start + heading * (.13 + .021 * k) + across * (side * (.14 - .021 * k)) + UP * .035
                    fern.blade(start, tip, .087 - j * .005, tones, kind='fanlet', normal=(.10 * side, -.47, .92),
                               pattern='maidenhair', rows=6, columns=5, wave=.11, bow=.018, fold=.019, seed=i + j + k)
    fern.finish(crown, "Maidenhair black wires and fanlets", .59)


def davallia_runner(rhizomes, heading, drift, drop):
    """Create a creeping stem with overlapping, pale-edged papery scales."""
    foot, dark, edge, tip = pigment('9a6e51 624130 c89c78 d8b89a')
    across = UP.cross(heading)
    points = []
    breadth = .041
    taper = .49
    for i in range(21):
        t = i / 20
        sweep = heading * (.09 + .80 * t) + across * (drift * math.sin(t * math.pi * .90))
        sweep.y *= .92
        height = .006 + .115 * ease((t - .46) / .38) - drop * ease((t - .83) / .17)
        points.append(sweep + UP * height)
    rhizomes.tube(points, breadth, foot, taper, 10)

    # Walk by distance so tighter bends and the hanging section stay covered.
    distances = [0.0]
    for previous, current in zip(points, points[1:]):
        distances.append(distances[-1] + (current - previous).length)
    rows = math.ceil(distances[-1] / .029)
    segment = 0
    for i in range(1, rows):
        distance = distances[-1] * i / rows
        while distances[segment + 1] < distance:
            segment += 1
        fraction = (distance - distances[segment]) / (distances[segment + 1] - distances[segment])
        point = points[segment].lerp(points[segment + 1], fraction)
        axis = (points[segment + 1] - points[segment]).normalized()
        side = axis.cross(UP).normalized()
        top = side.cross(axis).normalized()
        radius = breadth * (1 - (1 - taper) * (segment + fraction) / 20)
        scale_edge = edge.lerp(tip, ease((i / rows - .56) / .44))
        for j in range(8):
            angle = math.tau * j / 8 + i * .73
            normal = side * math.cos(angle) + top * math.sin(angle)
            lateral = axis.cross(normal)
            start = point + normal * (radius - .003)
            mid = start + axis * .012 + normal * .006
            apex = start + axis * (.039 + .009 * math.sin(i * 1.81 + j)) + normal * .008
            index = len(rhizomes.vertices)
            rhizomes.vertices.extend((start, mid - lateral * .010, mid + normal * .004,
                                      mid + lateral * .010, apex))
            rhizomes.colors.extend((dark, scale_edge, foot.lerp(dark, .36), scale_edge, scale_edge))
            rhizomes.faces.extend(tuple(index + n for n in face) for face in
                                  ((0, 2, 1), (0, 3, 2), (1, 2, 4), (2, 3, 4)))
    return points


def rabbit_fern(crown):
    fern = Foliage()
    rhizomes = Foliage()
    tones = pigment('3c774e 76a36a 285f45 84a473 668751')
    runners = (
        davallia_runner(rhizomes, radial(-.72), .096, .32),
        davallia_runner(rhizomes, radial(-2.56), -.073, .19),
        davallia_runner(rhizomes, radial(1.12), .112, .28),
    )
    for i, (runner, joint) in enumerate(((0, 3), (1, 4), (2, 2), (0, 7), (1, 8), (2, 6), (2, 10))):
        heading = radial(i * GOLDEN + .2)
        across = Vector((-heading.y, heading.x, 0))
        # The first stipe ring overlaps its own runner with the same sway pivot.
        start = runners[runner][joint] + UP * .016
        path = frond_path(start, heading, .69 + .10 * (i % 3), 1.19 - .14 * (i % 3), .29)
        fern.tube([path(t / 10) for t in range(11)], .015, tones[3], .24)
        for j in range(4):
            t = .34 + j * .17
            for side in (-1, 1):
                at = path(t + side * .010)
                outward = (across * side + heading * .36).normalized()
                length = (.43, .34, .25, .14)[j]
                tip = at + outward * length + UP * .07
                fern.tube((at, at.lerp(tip, .60), tip), .007, tones[3], .27, 6)
                for l in range(4 - (j == 3)):
                    base = at.lerp(tip, .14 + l * .25)
                    for flip in (-1, 1):
                        size = 1 - .11 * l - .13 * j
                        end = base + (outward * .103 + heading * (flip * .10)) * size + UP * .023
                        fern.blade(base, end, .030 * size, tones, normal=(0, -.37, .92), rows=5, columns=3,
                                   bow=.012, fold=.009, wave=.20, seed=i + j + l)
        fern.blade(path(.90), path(1) + heading * .079, .026, tones, normal=(0, -.37, .92),
                   rows=5, columns=3, bow=.008, fold=.008, wave=.13, seed=i)
    fern.finish(crown, "Davallia dissected fronds and attached stipes", .47)
    scales = rhizomes.finish(crown, "Davallia creeping stems and papery scales", .78)
    scales.data.materials[0].use_backface_culling = False


def parlor(crown):
    palm = Foliage()
    colors = pigment('49794d 76a060 2e5e46 8e9d61 52774d')
    for i in range(8):
        direction = radial(i * GOLDEN + .15)
        lean = radial(i % 3 * 2.13) * .18
        height = (.34, .57, .75)[i % 3]
        base = lean + UP * height
        palm.tube((lean * .61 - UP * .023, lean * .88 + UP * height * .49, base), .031 - .004 * (i % 3), colors[3], .74)
        pinnate(palm, base, direction, .78 + .09 * (i % 2), .91 - .06 * (i % 3), .16, 9, .25,
                colors, style='palm', seed=i * .52)
    palm.finish(crown, "Parlor palm clustered fine canes", .49)


def kentia(crown):
    palm = Foliage()
    colors = pigment('376c4e 699368 224e3b 7d9050 4c7351')
    trunk = linear_color('8f7652')
    center = Vector((-.085, .025, .92))
    palm.tube(((0,0,-.035),(-.076,.013,.24),(-.10,.022,.59),center), .089, trunk, .68, 13)
    for i in range(6):
        direction = radial(i * GOLDEN + .4)
        base = center + direction * .031 + UP * (.04 - .06 * (i % 3))
        pinnate(palm, base, direction, 1.10 + .05 * (i % 3), .82 + .05 * (i % 3), .53 - .05 * (i % 3),
                13, .37 - .02 * (i % 3), colors, style='palm', seed=i * 1.34)
    palm.finish(crown, "Kentia single trunk and pendent ribbons", .44)


def lady(crown):
    palm = Foliage()
    palette = pigment('416d47 6a945a 274538 788c55 526e46')
    bark = linear_color('8c7051')
    for i in range(7):
        outer = radial(i * GOLDEN + .44)
        fan_axis = radial(.54 * math.sin(i * 2.0))
        layer = i % 3
        root = outer * .14 - UP * .023
        cane = outer * (.35 + .055 * layer) + UP * (.40 + .24 * layer)
        hub = outer * (.48 + .070 * layer) + UP * (.83 + .22 * layer)
        palm.tube((root, root.lerp(cane, .5), cane), .055, bark, .62, 10)
        palm.tube((cane, cane.lerp(hub, .60), hub + UP * .024), .025, palette[3], .50)
        for finger in range(-3, 4):
            sweep = finger / 3
            rise = .11 + .43 * math.sqrt(1 - .91 * sweep * sweep)
            tip = hub + fan_axis * (sweep * .54) + outer * .18 + UP * rise
            palm.blade(hub + fan_axis * sweep * .028, tip, .085 + .014 * (1 - abs(sweep)), palette,
                       normal=Vector((fan_axis.y, -fan_axis.x, .42)), rows=10, columns=5,
                       kind='ribbon', fold=.037, bow=.028, seed=finger * .55 + i)
    palm.finish(crown, "Lady palm split fans on cane clumps", .46)


def rubber(crown):
    leaves = Foliage()
    stems = Foliage()
    tones = pigment('2f5740 62844e 224633 8f9b69 80946b')
    new_leaf = pigment('597341 8f9960 38593a bf8d73 987b66')
    bark, scar = pigment('826550 ac8e68')
    trunk = [Vector((0, 0, -.052))]
    trunk.extend(Vector((.060 * math.sin(.81 * i), .034 * math.sin(.56 * i), .29 + .182 * i))
                 for i in range(7))
    trunk.append(Vector((-.043, -.018, 1.545)))
    stems.tube(trunk, .067, bark, .45, 12)
    for i, junction in enumerate(trunk[1:-1]):
        heading = radial(i * GOLDEN + .31)
        base = junction + heading * .22 + UP * .056
        tip = base + heading * (.84 - .067 * i) + UP * (.24 - .015 * i)
        stem_end = base + (tip - base).normalized() * .045
        stems.tube((junction, junction.lerp(base, .47), stem_end), .025 - .002 * i, bark, .46)
        leaves.blade(base, tip, .228 + .029 * math.sin(i * .66) - .007 * i,
                     tones if i < 6 else new_leaf, normal=heading * -.35 + UP,
                     kind='rubber', pattern='rubber-venation', rows=45, columns=13,
                     fold=.065, bow=.041, wave=.03, seed=i)
        # Fine lasting traces of shed stipules, registered to the same leader.
        if i < 5:
            axis = (trunk[i + 2] - trunk[i]).normalized()
            side = axis.cross(heading).normalized()
            round_axis = axis.cross(side)
            ring_radius = .067 * (1 - .55 * (i + 1) / 8) + .001
            ring = [junction + ring_radius * (side * math.cos(k * math.tau / 16)
                    + round_axis * math.sin(k * math.tau / 16)) for k in range(16)]
            stems.tube(ring, .0048, scar, 1, 5, loop=True)
    sheath = pigment('a14352 c55c67 71363f b87468 874751')
    leaves.blade(trunk[-1], trunk[-1] + Vector((.034, .025, .40)), .044, sheath,
                 kind='ribbon', rows=16, columns=7, fold=.021, bow=.025)
    stems.finish(crown, "Ficus elastica stipule scars, leader and joined petioles", .62)
    wax = leaves.finish(crown, "Ficus elastica wax blades and single apical sheath", .38)
    shader = next(node for node in wax.data.materials[0].node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Coat Roughness"].default_value = .27


def weeping(crown):
    tree = Foliage()
    tones = pigment('386d41 60914b 2b523b 86a162 577a45')
    bark = linear_color('866c50')
    tree.tube(((0,0,-.033),(-.07,.025,.38),(-.065,.043,.83),(.04,.041,1.45)), .072, bark, .45, 11)
    for i in range(10):
        heading = radial(i * GOLDEN + .17)
        side = Vector((-heading.y, heading.x, 0))
        source = Vector((-.044,.032,.49 + .082 * i))
        spread = .94 - .042 * i
        branch = lambda t: source + heading * (spread * t) + UP * (.43 * math.sin(t * 1.9) - .31 * t ** 2)
        tree.tube([branch(t / 6) for t in range(7)], .023, bark, .21, 7)
        for j in range(5):
            base = branch(.31 + .16 * j)
            swing = -1 if j % 2 else 1
            tip = base + side * (swing * (.28 - .023 * j)) + heading * .19 - UP * (.17 + .014 * j)
            tree.blade(base, tip, .082 - .005 * j, tones, normal=heading * -.35 + UP, rows=7, columns=5,
                       wave=.041, bow=.038, fold=.033, seed=i + j)
    tree.finish(crown, "Weeping fig branches and drip-tip leaves", .42)


def money_tree(crown):
    tree = Foliage()
    tones = pigment('47844b 75a054 2c613e 779658 4a704b')
    bark = pigment('99714d 796445 a48059')
    for i in range(3):
        helix = lambda t: radial(i * math.tau / 3 + t * 5.7) * (.13 - .071 * t) + UP * (t * 1.08 - .027)
        tree.tube([helix(t / 15) for t in range(16)], .065, bark[i], .61, 10)
    for i in range(7):
        heading = radial(i * GOLDEN + .41)
        source = heading * .046 + UP * (.66 + .065 * i)
        center = heading * (.48 - .027 * (i % 3)) + UP * (.98 + .07 * i)
        tree.tube((source, source.lerp(center, .53) - UP * .045, center), .026, tones[3], .58, 7)
        for j in range(-2, 3):
            leaflet = radial(i * GOLDEN + .41 + .55 * j)
            reach = .53 - abs(j) * .105
            tip = center + leaflet * reach + UP * (.13 - .057 * abs(j))
            tree.blade(center + leaflet * .026, tip, .121 - .014 * abs(j), tones, normal=UP + heading * -.44,
                       rows=9, columns=5, fold=.065, bow=.046, seed=i + j)
    tree.finish(crown, "Money tree braided trunks and five-finger leaves", .44)


def umbrella(crown):
    tree = Foliage()
    tones = pigment('4d8250 7fa859 2b593c 78985e 4e7848')
    bark = linear_color('84704c')
    for branch in range(3):
        heading = radial(branch * 2.05 + .3)
        root = heading * .07 - UP * .027
        end = heading * .29 + UP * (1.09 + .17 * branch)
        tree.tube((root, root.lerp(end,.41), end), .050, bark, .51, 9)
        for i in range(3):
            branch_angle = branch * 2.05 + .3 + (i - 1) * 1.05
            outward = radial(branch_angle)
            at = root.lerp(end, .54 + .22 * i)
            center = at + outward * (.32 + .034 * i) + UP * (.21 + .02 * i)
            tree.tube((at, at.lerp(center,.52), center), .021, tones[3], .51, 7)
            for petal in range(7):
                leaflet = radial(branch_angle + math.tau * petal / 7)
                length = .30 + .07 * math.cos(math.tau * petal / 7)
                base = center + leaflet * .023
                tip = base + leaflet * length - UP * .065
                tree.blade(base, tip, .083, tones, normal=UP + outward * -.35, kind='rounded', rows=7, columns=5,
                           fold=.038, bow=.045, seed=branch + i + petal)
    tree.finish(crown, "Dwarf umbrella tree radial whorls", .39)


def strelitzia(crown):
    plant = Foliage()
    tones = pigment('466f52 71965f 2a5a46 8a9e67 547b52')
    for index, (root_x, away, height, spread, broad, exposure) in enumerate([
        (-.19,-1,.91,.40,.29,1), (.15,1,.98,.35,.30,1), (-.12,-1,.61,.52,.30,1),
        (.19,1,.60,.60,.29,1), (.02,1,1.12,.18,.24,-1), (-.07,-1,1.14,.16,.16,1),
    ]):
        root = Vector((root_x, .05 * (index % 3), -.045))
        base = root + Vector((away * spread * .44, .12 * math.sin(index * 2), height))
        tip = base + Vector((away * spread, -.02 + .14 * (index % 2), .68 - .045 * (index % 3)))
        plant.tube((root, root.lerp(base,.37) - UP * .032, root.lerp(base,.69), base.lerp(tip,.12)), .039,
                   tones[3], .43, 10)
        plant.blade(base, tip, broad, tones, normal=(.19 * away, -exposure, .48), kind='banana', rows=39, columns=13,
                    bow=.089, fold=.078, wave=.11, seed=index * 1.67)
    plant.finish(crown, "White bird of paradise split fans", .41)


def model(slug, species, common, note, build, fallback, pot, *, accepted=None, rank="species", sources=()):
    return {"id": slug, "species": species, "common": common, "note": note, "build": build,
            "fallback": fallback, "pot": pot, "accepted": accepted or species, "rank": rank, "sources": sources}


MODELS = [
    model("orbifolia", "Goeppertia orbifolia", "Orbifolia Prayer Plant", "Near-round silver-banded discs on ascending petioles.",
          orbifolia, 6, ("a5b3a2", "527b68"), sources=("https://plants.ces.ncsu.edu/plants/goeppertia-orbifolia/",)),
    model("rattlesnake-plant", "Goeppertia lancifolia", "Rattlesnake Plant", "Narrow rippled blades with alternating oval spots and purple backs.",
          rattlesnake, 6, ("b58b85", "865b68"), accepted="Goeppertia insignis", sources=(
              "https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:77174285-1",
              "https://plants.ces.ncsu.edu/plants/goeppertia-insignis/")),
    model("maranta", "Maranta leuconeura", "Prayer Plant", "Low spreading foliage with red herringbone veins in a red-veined form.",
          maranta, 6, ("b97669", "9a5759"), sources=("https://plants.ces.ncsu.edu/plants/maranta-leuconeura/",)),
    model("fishbone-prayer-plant", "Ctenanthe burle-marxii", "Fishbone Prayer Plant", "Pale oblong leaves with dark fishbone bands and purple backs.",
          ctenanthe, 6, ("8894a5", "575d79"), sources=("https://www.rhs.org.uk/plants/5026/ctenanthe-burle-marxii/details",)),
    model("stromanthe", "Stromanthe sanguinea", "Stromanthe", "Straight-species dark emerald blades with burgundy backs on reddish stems.",
          stromanthe, 6, ("c39d99", "90536c"), accepted="Stromanthe thalia", sources=(
              "https://powo.science.kew.org/taxon/1211666-2", "https://plants.ces.ncsu.edu/plants/stromanthe-thalia/")),
    model("boston-fern", "Nephrolepis exaltata", "Boston Fern", "A layered fountain of long arching fronds with dense paired pinnae.",
          boston, 3, ("a59277", "7b654a")),
    model("birds-nest-fern", "Asplenium nidus", "Bird's Nest Fern", "Three ranks of simple glossy fronds rise from a rosette with rounded dark ribs and distal underside sori.",
          bird_nest, 3, ("d8bd86", "94784c"), sources=("https://plants.ces.ncsu.edu/plants/asplenium-nidus/",)),
    model("maidenhair-fern", "Adiantum raddianum", "Maidenhair Fern", "Small fanlets distributed on near-black wiry branchlets.",
          maidenhair, 3, ("adc0b9", "6a918e")),
    model("rabbits-foot-fern", "Davallia fejeensis", "Rabbit's Foot Fern", "Finely divided fronds rise in separate stipes from three creeping rhizomes with overlapping pale-edged scales.",
          rabbit_fern, 3, ("b8a194", "9a7359"), accepted="Davallia solida var. fejeensis", rank="variety", sources=(
              "https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:17564870-1",
              "https://davalliacea.linnaeana.nl/linnaeus_ng/app/views/species/nsr_taxon.php?epi=150&id=112773")),
    model("parlor-palm", "Chamaedorea elegans", "Parlor Palm", "A pot-grown cluster of slender palms with delicate pinnate fans.",
          parlor, 5, ("c09970", "9d714e"), sources=("https://plants.ces.ncsu.edu/plants/chamaedorea-elegans/",)),
    model("kentia-palm", "Howea forsteriana", "Kentia Palm", "A single trunk and broad, spaced, descending pinnae on arched fronds.",
          kentia, 5, ("859d89", "4c766b")),
    model("lady-palm", "Rhapis excelsa", "Lady Palm", "Multiple cane bases topped by hand-shaped split fans.",
          lady, 5, ("a98a77", "986850")),
    model("rubber-plant", "Ficus elastica", "Rubber Plant", "Waxy elliptic leaves and alternate petioles on a scarred upright leader ending in one red stipule.",
          rubber, 7, ("a76856", "794f50"), sources=("https://plants.ces.ncsu.edu/plants/ficus-elastica/",)),
    model("weeping-fig", "Ficus benjamina", "Weeping Fig", "Fine arched woody branches and small pointed, drooping leaves.",
          weeping, 7, ("b0a49c", "827771"), sources=("https://plants.ces.ncsu.edu/plants/ficus-benjamina/",)),
    model("money-tree", "Pachira aquatica", "Money Tree", "Braided horticultural stems and palmate clusters with long fingers.",
          money_tree, 7, ("c9ac74", "967348")),
    model("dwarf-umbrella-tree", "Heptapleurum arboricola", "Dwarf Umbrella Tree", "Layered umbrellas of seven rounded, glossy leaflets.",
          umbrella, 7, ("b78b79", "9b6859")),
    model("white-bird-of-paradise", "Strelitzia nicolai", "White Bird of Paradise", "Two-ranked long-petioled fans with broad banana-like blades and age splits.",
          strelitzia, 7, ("91a8a4", "668581")),
]
