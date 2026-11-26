"""Botanically distinct crowns for Petey's sculptural and flowering characters."""

from math import cos, pi, sin, tau

from mathutils import Vector
from mathutils.bvhtree import BVHTree

from build_monstera import material, mesh, sphere, stem


def ray(angle, radius=1, height=0):
    return Vector((cos(angle) * radius, sin(angle) * radius, height))


def palette(name, *colors):
    return [material(f"{name} {i + 1}", color, .47, .12) for i, color in enumerate(colors)]


def loft(name, crown, a, b, width, depth, mat, *, bulge=(0, 0, 0), form=.7,
         normal=(0, 0, 1), markings=None, teeth=0, rows=12, sides=10, wing_bias=0):
    """Closed blade with a curved midline and a continuous oval cross-section."""
    a, b, bulge = Vector(a), Vector(b), Vector(bulge)
    axis = (b - a).normalized()
    up = Vector(normal)
    if abs(axis.dot(up)) > .96:
        up = Vector((0, -1, 0))
    side = axis.cross(up).normalized()
    up = side.cross(axis).normalized()
    vertices, faces = [], []
    for row in range(rows + 1):
        t = row / rows
        center = a.lerp(b, t) + bulge * sin(pi * t)
        taper = .06 + .94 * sin(pi * (.007 + .986 * t)) ** form
        edge = 1 + .13 * sin(tau * teeth * t) if teeth else 1
        for column in range(sides):
            angle = tau * column / sides
            lateral = cos(angle)
            breadth = width * edge * (1 + wing_bias * lateral * (1 - t))
            vertices.append(center + taper * (side * breadth * lateral + up * depth * sin(angle)))
    for row in range(rows):
        for column in range(sides):
            left = row * sides + column
            right = row * sides + (column + 1) % sides
            faces.append((left, left + sides, right + sides, right))
    faces.extend([tuple(range(sides)), tuple(range((rows + 1) * sides - 1, rows * sides - 1, -1))])
    obj = mesh(name, vertices, faces, mat[0], crown)
    for swatch in mat[1:]:
        obj.data.materials.append(swatch)
    if markings:
        for polygon in obj.data.polygons[:-2]:
            polygon.material_index = markings(*divmod(polygon.index, sides))
    return obj


def ponytail(crown):
    leaves = palette("Recurved ribbons", "467844", "68994f", "375c36")
    bark = palette("Caudex", "81654b", "a08660")
    sphere("Swollen water-storage base", (0, 0, .22), (.53, .46, .42), bark[0], crown)
    trunk = stem("Short tapered trunk", [(0, 0, .26), (-.06, 0, .60), (-.13, .06, 1.13)],
                 .29, bark[1], crown, [1.55, .80, .34])
    trunk.data.resolution_u = 5
    for i in range(22):
        angle = i * 2.39996
        origin = Vector((-.13, .06, 1.14)) + ray(angle, .07, .04 * (i % 4))
        end = ray(angle, .67 + .13 * (i % 4), .36 + .14 * (i % 5))
        loft("Fountain ribbon", crown, origin, end, .035 + .008 * (i % 3), .007,
             [leaves[i % 3]], bulge=ray(angle, .26, .45), form=.38, sides=6)


def dragon_tree(crown):
    foliage = palette("Red-edged linear foliage", "2c623f", "41905d", "8d3644")
    wood = palette("Leaf-scarred cane", "806a52", "ae956e")
    for n, (x, y, h) in enumerate([(-.31, .12, 1.30), (.22, .08, .99), (.38, -.17, .67)]):
        direction = Vector((x, y, h))
        stem("Slender cane", [(x * .23, y * .4, -.08), (x * .5, y * .7, h * .48), direction],
             .075, wood[n % 2], crown, [1, .82, .54])
        for i in range(10):
            angle = i * 2.39996 + n * .65
            tip = direction + ray(angle, .48 + .09 * (i % 3), .16 - .13 * (i % 4))
            loft("Narrow burgundy-margin blade", crown, direction + ray(angle, .027), tip,
                 .045, .009, foliage, bulge=ray(angle, .13, .25), rows=9,
                 markings=lambda row, col: 2 if col in (0, 4, 5, 9) else row % 2)


def zz_plant(crown):
    wax = palette("Waxy leaflets", "306740", "478453", "235438")
    rachis = palette("Green rachis", "6d965b")[0]
    for n, (angle, height, spread) in enumerate([(.16, 1.28, .55), (1.4, 1.57, .44),
                                               (2.65, 1.42, .61), (3.9, 1.07, .66), (5.1, .93, .55)]):
        start = ray(angle, .10, -.06)

        def stalk(t):
            return start + ray(angle, spread * t * t, height * t)

        stem("Arching compound-leaf stalk", [stalk(t) for t in (0, .33, .70, 1)], .055, rachis, crown,
             [1.10, .83, .61, .27])
        for i, t in enumerate((.36, .49, .62, .75, .87)):
            for sign in (-1, 1):
                base = stalk(t + .015 * sign)
                tip = base + ray(angle + sign * .99, .36 - i * .024, .10 + i * .006)
                loft("Glossy paired leaflet", crown, base, tip, .098 - i * .008, .022,
                     [wax[(i + n) % 3]], bulge=(0, 0, .045), rows=8, sides=8)
        loft("Terminal leaflet", crown, stalk(.94), stalk(1) + ray(angle, .16, .068), .074, .018, [wax[n % 3]])


def echeveria(crown):
    farina = [
        material("Glaucous outer leaves", "91b5ad", .83),
        material("Silvery middle leaves", "a2c3bb", .80),
        material("Pale young leaves", "b1c9bf", .76),
        material("Warmed leaf tip", "b7adae", .80),
    ]
    for ring, (count, length, width, rise) in enumerate([
        (12, .81, .164, .10), (10, .63, .139, .22),
        (8, .45, .105, .32), (5, .25, .067, .40),
    ]):
        for i in range(count):
            angle = tau * i / count + .31 * ring
            extent = length * (1 + .043 * sin(angle * 3 + ring))
            base = ray(angle, .012, .055 + .019 * ring)
            tip = ray(angle, extent, base.z + rise + .017 * cos(angle * 5))
            loft("Overlapping glaucous spoon", crown, base, tip, width,
                 .052 - .007 * ring, [farina[min(ring, 2)], farina[3]],
                 bulge=ray(angle, -.08, -.047 + .015 * ring), form=.50,
                 rows=12, markings=lambda row, col: int(row == 11 and 1 < col < 4))


def jade(crown):
    leaf = palette("Thick jade foliage", "356b49", "508054", "7fab70")
    bark = palette("Jade twig", "8b7057", "a98b6b")
    joints = [Vector((0, .03, .53)), Vector((-.20, .05, .92)), Vector((.26, .14, 1.04))]
    stem("Woody miniature trunk", [(0, 0, -.07), joints[0], joints[1]], .12, bark[0], crown, [1, .74, .36])
    stem("Second woody leader", [joints[0], (.15, .14, .77), joints[2]], .067, bark[1], crown, [1, .78, .49])
    for i, (base, angle, radius, h) in enumerate([(0, 3.42, .58, .92), (0, -.30, .63, .84),
                                                      (1, 2.75, .48, 1.29), (1, 4.12, .34, 1.42),
                                                      (2, 1.38, .41, 1.42), (2, .30, .52, 1.28)]):
        tip = ray(angle, radius, h)
        stem("Forking twig", [joints[base], joints[base].lerp(tip, .55), tip], .036, bark[i % 2], crown,
             [1, .76, .48])
        for j in range(4):
            node = joints[base].lerp(tip, .62 + .12 * (j // 2))
            out = angle + (-1 if j % 2 else 1) * (1.08 - .35 * (j // 2))
            loft("Opposite succulent leaf", crown, node, node + ray(out, .32, .14 + .035 * j), .10, .033,
                 [leaf[(i + j) % 3]], bulge=(0, 0, .055), rows=8, sides=8)


def haworthia(crown):
    stripe = palette("Outer tubercle bands", "2d5941", "d2d7b2", "427454")
    for ring, (count, length, rise) in enumerate([(11, .65, .59), (9, .42, .84), (5, .20, 1.0)]):
        for i in range(count):
            angle = tau * i / count + ring * .39
            loft("Tapered banded rosette leaf", crown, ray(angle, .05, -.01), ray(angle, length, rise),
                 .102 - ring * .018, .043, stripe, bulge=ray(angle, -.09, .16), normal=ray(angle), form=.46,
                 rows=17, markings=lambda row, col: 1 if row in (4, 7, 10, 13) and 0 < col < 4 else 2 if 5 < col < 9 else 0)


def cylindrical_snake(crown):
    green = palette("Cylindrical leaf bands", "3f6c50", "5b8762", "315841")
    for i, (x, y, h, dx) in enumerate([(-.37, .03, 1.26, -.35), (-.22, .12, 1.65, -.17),
                                           (0, .16, 1.76, -.04), (.25, .12, 1.46, .19),
                                           (.39, -.10, 1.17, .30), (-.04, -.26, 1.06, .22),
                                           (-.26, -.22, .87, -.19)]):
        loft("Round upright spear", crown, (x, y, -.12), (x + dx, y + .11, h), .098 - .004 * (i % 4),
             .087 - .004 * (i % 3), green, normal=(0, -1, 0), bulge=(dx * .3, 0, .09), form=.35,
             rows=19, markings=lambda row, col: 1 if (row + (col >= 4)) % 5 in (0, 1) else 0)


def whale_fin(crown):
    mottled = palette("Mottled fan blade", "325e49", "729679", "233e32")
    for i, (base, tip, width) in enumerate([((-.17, .05, -.08), (-.56, .23, 1.66), .41),
                                             ((.17, .14, -.06), (.55, .36, 1.36), .33),
                                             ((.13, -.18, -.05), (.48, -.22, .85), .23)]):
        loft("Broad paddle with dark rim", crown, base, tip, width, .042, mottled, normal=(0, -1, .17),
             bulge=(.11 * (i - 1), -.115, .08), form=.62, rows=21, sides=12,
             markings=lambda row, col: 2 if col in (0, 5, 6, 11) else int((row + col // 2) % 6 in (1, 2)))


def petals(crown, origin, color, eye, *, count=5, radius=.16, face="front", start=0):
    origin = Vector(origin)
    up = Vector((0, -1, 0) if face == "front" else (0, 0, 1))
    for j in range(count):
        angle = tau * j / count + start
        direction = Vector((cos(angle), 0, sin(angle))) if face == "front" else ray(angle)
        loft("Flower petal", crown, origin + direction * radius * .08, origin + direction * radius,
             radius * .32, radius * .075, [color], bulge=up * radius * .17, normal=up, rows=5, sides=6)
    scale = (radius * .19,) * 3
    sphere("Warm flower center", origin + up * radius * .085, scale, eye, crown)


def kalanchoe(crown):
    foliage = palette("Scalloped succulent foliage", "326646", "498454")
    corolla = palette("Tight coral corymb", "cb5352", "e66c63", "ea9284", "f2c873")
    for i in range(12):
        angle = i * 2.39996
        start = ray(angle, .12, .05 + .11 * (i % 3))
        tip = ray(angle, .64 + .08 * (i % 4), .20 + .14 * (i % 3))
        loft("Broad glossy succulent blade", crown, start, tip, .17, .039, [foliage[i % 2]],
             bulge=(0, 0, .16), teeth=4, rows=17, sides=8)
    for n, (x, y, h) in enumerate([(-.34, .07, 1.10), (.25, .04, 1.24), (.11, -.32, .83)]):
        top = Vector((x, y, h))
        stem("Branched flowering stem", [(0, 0, .04), top * .52, top], .043, foliage[0], crown, [1, .75, .45])
        for i in range(5):
            p = top + ray(tau * i / 5 + n, .14, .01 * i)
            stem("Pedicel", [top - Vector((0, 0, .09)), p], .010, foliage[1], crown)
            petals(crown, p, corolla[(i + n) % 3], corolla[3], count=4, radius=.096, face="up", start=.3 * i)


def bunny_ears(crown):
    pads = palette("Paired velvety pads", "5c9a54", "70a65d", "4f8c50")
    dots = palette("Amber glochid clusters", "ddba70")[0]
    for i, (base, top, width) in enumerate([((0, .02, -.16), (-.03, .12, .98), .42),
                                             ((-.23, .09, .66), (-.70, .15, 1.63), .29),
                                             ((.20, .11, .82), (.50, .25, 1.78), .27),
                                             ((.18, -.23, .22), (.68, -.23, .95), .25)]):
        loft("Flattened cactus pad", crown, base, top, width, .089, [pads[i % 3]], normal=(0, -1, 0),
             form=.47, rows=13, sides=12)
        base, top = Vector(base), Vector(top)
        for j, t in enumerate((.31, .46, .61, .76)):
            for u in (-.5, 0, .5):
                p = base.lerp(top, t) + Vector((u * width, -.079 * sin(pi * t), 0))
                sphere("Raised areole", p, (.022, .014, .018), dots, crown)


def barrel(crown):
    skin = material("Cactus cuticle", "477348", .63, .06)
    areole = material("Felted golden areole", "ac884b", .92)
    spines = [material("Young straw spine", "daba72", .73),
              material("Older amber spine", "bc9353", .77)]
    vertices, faces = [], []
    ribs, levels, sides = 20, 32, 160

    def surface(theta, angle):
        r = sin(theta) * (.66 + .052 * cos(ribs * angle))
        return ray(angle, r, .60 - .72 * cos(theta))

    for row in range(levels + 1):
        theta = pi * (.013 + .974 * row / levels)
        vertices.extend(surface(theta, tau * j / sides) for j in range(sides))
    for row in range(levels):
        for j in range(sides):
            a = row * sides + j
            b = row * sides + (j + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.extend([tuple(range(sides - 1, -1, -1)), tuple(range(levels * sides, (levels + 1) * sides))])
    mesh("Twenty continuous cactus ribs", vertices, faces, skin, crown)
    spine_vertices = [[], []]
    spine_faces = [[], []]
    for i in range(ribs):
        angle = tau * i / ribs
        side = ray(angle + pi / 2)
        for j in range(7):
            theta = .68 + j * .324
            center = surface(theta, angle)
            normal = ray(angle, sin(theta), -cos(theta))
            tangent = normal.cross(side)
            cushion = [center + .018 * (side * cos(k * tau / 6) + tangent * sin(k * tau / 6))
                       for k in range(6)]
            cushion.append(center + normal * .012)
            mesh("Low felt cushion at rib crest", cushion,
                 [(k, (k + 1) % 6, 6) for k in range(6)], areole, crown)
            p = cushion[-1]
            color = int(j < 2)
            points, faces = spine_vertices[color], spine_faces[color]
            for k in range(9):
                turn = k * tau / 8 + .14 * sin(i + j)
                spread = side * cos(turn) + tangent * sin(turn)
                reach = .058 + .016 * sin(k * 2 + j)
                tip = p + normal * (.029 + .010 * (k % 2)) + spread * reach
                radius = .0048
                if k == 8:
                    tip = p + normal * .093 + tangent * .019
                    radius = .0068
                # At this scale a tapered triangular mesh resolves the silhouette.
                axis = (tip - p).normalized()
                across = axis.cross(side).normalized()
                up = axis.cross(across)
                index = len(points)
                points.extend(p + radius * (across * cos(n * tau / 3) + up * sin(n * tau / 3))
                              for n in range(3))
                points.append(tip)
                faces.extend((index + n, index + (n + 1) % 3, index + 3) for n in range(3))
    for i, mat in enumerate(spines):
        mesh("Tapered radial and central spines", spine_vertices[i], spine_faces[i], mat, crown)


def moth_orchid(crown):
    leaves = [material("Mature orchid cuticle", "315e43", .39, .22),
              material("Younger orchid cuticle", "487955", .44, .15)]
    velamen = material("Silver dry velamen", "a4b0a0", .71)
    growing_tip = material("Orchid root growing tip", "769865", .51, .12)
    bark = material("Coarse orchid bark", "69503b", .91)
    for i, angle in enumerate((-.67, -1.52, -2.57, .31, 2.25)):
        # Roots arise at the basal stem before following the bark and pot rim.
        points = [ray(angle, .03, .042 + .018 * i), ray(angle + .12, .21, .12),
                  ray(angle + .28, .46, .075 + .027 * (i % 2)),
                  ray(angle + .38, .69, .11), ray(angle + .53, .77, .105)]
        if i in (0, 2):
            points.append(ray(angle + .60, .812, -.048))
        root = stem("Aerial root with silver velamen", points, .027, velamen, crown,
                    [1.15, 1.07, .91, .86, .80, .71])
        root.data.resolution_u = 5
        tip = points[-1] + (points[-1] - points[-2]).normalized() * .047
        stem("Living green root tip", [points[-1], tip], .023, growing_tip, crown, [.89, .29])
    for i in range(12):
        angle = i * 2.39996
        center = ray(angle, .19 + .106 * (i % 5), .045)
        corners = [center + ray(angle + k * tau / 5, .044 + .013 * ((i + k) % 3),
                               .02 + .01 * sin(k + i)) for k in range(5)]
        corners.append(center + ray(angle + .9, .02, .063))
        chip = mesh("Angular orchid bark chip", corners,
                    [(k, (k + 1) % 5, 5) for k in range(5)], bark, crown)
        for face in chip.data.polygons:
            face.use_smooth = False
    petals_palette = palette("White phalaenopsis", "f5ebdc", "fff6e8", "ca777c", "e9bc61")
    for i in range(5):
        angle = .19 + pi * (i % 2) + .10 * (i // 2)
        loft("Opposite basal fan blade", crown, ray(angle, .035, .04 + .034 * i), ray(angle, .75 - .046 * i, .24 + .046 * i),
             .16, .032, [leaves[i % 2]], bulge=(0, 0, .29), form=.67)
    for bend, height in ((.56, 1.47), (-.62, 1.14)):
        nodes = [Vector((bend * t, .16 - .023 * i, height - .028 * i * i))
                 for i, t in enumerate((.24, .61, .99))]
        stem("Arching flowering spike with pedicel nodes",
             [(bend * .05, .068, .044), (bend * .05, .14, height * .61), *nodes],
             .028, leaves[0], crown, [1.04, .85, .63, .50, .31])
        for i, node in enumerate(nodes):
            p = node + Vector((.039 if bend > 0 else -.039, -.142, -.016))
            stem("Attached flower pedicel", [node, node.lerp(p, .55) + Vector((0, 0, .032)), p],
                 .012, leaves[1], crown, [.91, .7, .5])
            size = 1 - .092 * i
            for angle, length, width in ((.13, .21, .092), (2.99, .21, .092), (1.57, .182, .053),
                                         (3.93, .155, .045), (5.50, .155, .045)):
                direction = Vector((cos(angle), 0, sin(angle)))
                loft("White petal or sepal", crown, p + direction * .014, p + direction * length * size,
                     width * size, .013, [petals_palette[i % 2]], bulge=(0, -.035, 0), normal=(0, -1, 0),
                     rows=8, sides=8)
            sphere("Golden orchid column", p + Vector((0, -.017, -.016)), (.029, .023, .034), petals_palette[3], crown)
            for side in (-1, 1):
                loft("Side lobe of the orchid lip", crown, p + Vector((0, -.019, -.027)),
                     p + Vector((side * .051 * size, -.057, -.040)), .028 * size, .009,
                     [petals_palette[2]], normal=(0, -1, 0), rows=6, sides=8)
            loft("Pale projecting middle lip lobe", crown, p + Vector((0, -.018, -.023)),
                 p + Vector((0, -.097, -.106 * size)), .034 * size, .010,
                 [petals_palette[0], petals_palette[2]], normal=(0, -1, 0), rows=8, sides=8,
                 markings=lambda row, col: int(row < 4 and col in (1, 2, 3)))


def african_violet(crown):
    foliage = palette("Velvet violet leaves", "3e694a", "6b8d5a", "4d804e")
    bloom = palette("Purple violet flowers", "6d4c9d", "9a6cc1", "bc95d8", "f0d172")
    for ring, (amount, extent, height, w) in enumerate([(10, .80, .20, .20), (8, .62, .39, .16)]):
        for i in range(amount):
            angle = tau * i / amount + .25 * ring
            base = ray(angle, .26, height * .55)
            tip = ray(angle, extent, height)
            stem("Fuzzy leaf stalk", [ray(angle, .052, .01), base], .028, foliage[1], crown)
            loft("Rounded velvet blade", crown, base, tip, w, .025, [foliage[(i + ring) % 3]],
                 bulge=(0, 0, .11), form=.58, rows=8, sides=8)
    for i in range(9):
        angle = i * 2.39996
        p = ray(angle, .15 + .06 * (i % 5), .61 + .10 * (i % 4))
        stem("Flower stalk", [(0, 0, .15), p], .017, foliage[1], crown, [1, .72])
        petals(crown, p, bloom[i % 3], bloom[3], radius=.15 - .007 * (i % 3), start=i * .31)


def begonia_spots(leaf, base, end, tangent, normal, silver):
    surface = BVHTree.FromPolygons(
        [vertex.co for vertex in leaf.data.vertices], [polygon.vertices[:] for polygon in leaf.data.polygons],
    )
    axis = (end - base).normalized()
    points, faces = [], []
    positions = ((.20, -.065), (.28, .072), (.40, -.091), (.48, .104), (.63, -.062), (.76, .047))
    for i, (t, u) in enumerate(positions):
        center = base.lerp(end, t) + tangent * u
        radius = (.012 + .003 * (i % 3)) * (1 - .28 * t)
        outline = [center + radius * (
            axis * (1.15 * cos(angle)) + tangent * sin(angle)
        ) for angle in (tau * j / 12 for j in range(12))]
        start = len(points)
        for sample in (center, *outline):
            hit, _, _, _ = surface.ray_cast(sample + normal * .4, -normal, .8)
            if hit is None:
                raise ValueError(f"Silver spot extends beyond {leaf.name}")
            points.append(hit + normal * .0012)
        for j in range(12):
            faces.append((start, start + 1 + (j + 1) % 12, start + 1 + j))
    return mesh("Silver leaf pigmentation", points, faces, silver, leaf)


def polka_begonia(crown):
    leaves = palette("Begonia upper-green and red underside", "31674e", "742f42", "487555")
    silver = palette("Silver leaf spots", "b7c8af")[0]
    for index, (x, y, height) in enumerate([(-.29, .10, 1.28), (.24, .22, 1.46), (.10, -.12, 1.02)]):
        anchors = [
            Vector((x * .61, y * .79, height * .61)),
            Vector((x * .92, y * .96, height * .92)),
        ]
        stem("Leaf-scarred cane", [(x * .2, y * .4, -.07), *anchors, (x, y, height)],
             .049, leaves[1], crown, [1, .85, .65, .51])
        for level, anchor in enumerate(anchors):
            direction = -1 if index == 0 else 1
            base = anchor + Vector((direction * .11, -.10, .022))
            stem("Begonia petiole", [anchor, base], .016, leaves[1], crown, [1, .7])
            end = base + Vector(((-1 if index == 0 else 1) * (.60 - .10 * level), -.24, -.20 + .14 * level))
            axis = (end - base).normalized()
            front = Vector((0, -1, 0))
            tangent = axis.cross(front).normalized()
            normal = tangent.cross(axis).normalized()
            bulge = normal * .09 + Vector((0, 0, .06))
            leaf = loft("Claret-backed angel wing", crown, base, end, .185 - .025 * level, .017, leaves,
                        normal=front, bulge=bulge, form=.66, rows=18, sides=16, wing_bias=.7 * direction,
                        markings=lambda row, col: int(col >= 8))
            begonia_spots(leaf, base, end, tangent, normal, silver)


def thanksgiving(crown):
    foliage = [material("Mature cactus cuticle", "3e7856", .53, .12),
               material("Young cactus cuticle", "568760", .49, .14)]
    flower = palette("Pink flower", "a62d5b", "cf4c78", "ef9ba9", "ecce84")
    # The proximal face is narrow. The shoulders project toward the distal
    # joint with a steep notch behind each point.
    pad_profile = (
        (0, .18), (.10, .39), (.24, .62), (.28, .43), (.42, .80),
        (.48, .59), (.65, 1), (.71, .69), (.86, .95), (.92, .64), (1, .26),
    )
    for n in range(7):
        angle = n * 2.39996
        points = [
            ray(angle, .055, -.04), ray(angle, .24, .31),
            ray(angle + .10, .48, .51 + .034 * (n % 3)),
            ray(angle + .16, .72, .48 + .065 * (n % 2)),
            ray(angle + .22, .99 - .04 * (n % 3), .33 + .08 * (n % 4)),
        ]
        for i, (a, b) in enumerate(zip(points, points[1:])):
            axis = (b - a).normalized()
            side = axis.cross(ray(angle + .77 + .34 * (i % 2), .78, .58)).normalized()
            normal = side.cross(axis).normalized()
            vertices = []
            for t, width in pad_profile:
                # Both neighboring pads overlap at the shared joint.
                center = (a - axis * .012).lerp(b + axis * .012, t)
                center += normal * .026 * sin(pi * t)
                for j in range(8):
                    ring = tau * j / 8
                    vertices.append(center + side * (.125 - .008 * i) * width * cos(ring)
                                    + normal * (.010 + .020 * sin(pi * t)) * sin(ring))
            last = len(vertices) - 8
            faces = [tuple(range(8))]
            for start in range(0, last, 8):
                for j in range(8):
                    k = (j + 1) % 8
                    faces.append((start + j, start + j + 8, start + k + 8, start + k))
            faces.append(tuple(range(last + 7, last - 1, -1)))
            pad = mesh(f"Clawed pad {n + 1}:{i + 1}", vertices, faces, foliage[int(i == 3)], crown)
            for cap in (pad.data.polygons[0], pad.data.polygons[-1]):
                cap.use_smooth = False
        if n % 2 == 0:
            base = points[-1]
            facing = ray(angle + .22)
            side = ray(angle + .22 + pi / 2)
            up = Vector((0, 0, 1))
            bend = base + facing * .10 + up * .055
            throat = base + facing * .23 + up * .145
            stem(f"Flower tube {n + 1}", [base, bend, throat], .044, flower[0], crown, [.42, .91, 1.09])
            # The two lateral sides mirror each other. The lower lip of the
            # corolla extends farther than the recurved upper tepals.
            for anchor, reach, width, tint in ((bend, .10, .048, flower[0]), (throat, .16, .061, flower[1])):
                for across, rise, sweep in ((0, .14, -.065), (.74, .083, -.035),
                                            (-.74, .083, -.035), (1, -.037, .036),
                                            (-1, -.037, .036), (0, -.08, .074)):
                    spread = side * (reach * across) + up * rise
                    start = anchor + spread.normalized() * .023
                    end = anchor + spread + facing * sweep
                    loft("Recurved tepal", crown, start, end, width, .009, [tint],
                         bulge=facing * .055, normal=facing, form=.58, rows=8, sides=8)
            for j in range(5):
                across = (j - 2) * .020
                anther = throat + facing * (.095 + .008 * (2 - abs(j - 2))) + side * across + up * .026
                stem("Exserted filament", [throat, anther], .0045, flower[2], crown, [1, .69])
                stem("Pale golden anther", [anther, anther + facing * .013], .008, flower[3], crown, [.85, .79])
            stem("Projecting style", [throat, throat + facing * .158 + up * .039], .006, flower[2], crown, [1, .70])


MODELS = [
    dict(id="ponytail-palm", species="Beaucarnea recurvata", common="Ponytail Palm",
         sources=["https://powo.science.kew.org/taxon/531735-1"],
         note="Bulbous water-storing base, short cane and a fountain of drooping ribbons", build=ponytail, fallback=3),
    dict(id="dragon-tree", species="Dracaena marginata", common="Madagascar Dragon Tree",
         accepted="Dracaena reflexa var. angustifolia", rank="variety",
         sources=["https://powo.science.kew.org/taxon/77189099-1"], pot=("9485a3", "51445e"),
         note="Three staggered canes with tufts of slender red-edged leaves", build=dragon_tree, fallback=2),
    dict(id="zz-plant", species="Zamioculcas zamiifolia", common="ZZ Plant",
         sources=["https://powo.science.kew.org/taxon/89402-1/general-information"],
         note="Arching compound stalks with paired glossy leaflets and a terminal leaflet", build=zz_plant, fallback=1),
    dict(id="echeveria", species="Echeveria elegans", common="Mexican Snowball",
         sources=["https://powo.science.kew.org/taxon/86934-2"],
         note="Overlapping matte spoon leaves with pale new growth and restrained warm tips", build=echeveria, fallback=4),
    dict(id="jade-plant", species="Crassula ovata", common="Jade Plant",
         sources=["https://powo.science.kew.org/taxon/273350-1"],
         note="Asymmetric branched woody habit with opposite fleshy oval leaves", build=jade, fallback=4),
    dict(id="zebra-haworthia", species="Haworthiopsis fasciata", common="Zebra Haworthia",
         sources=["https://powo.science.kew.org/taxon/77138009-1"],
         note="Tapering rosette leaves with pale bands limited to the outer faces", build=haworthia, fallback=4),
    dict(id="cylindrical-snake", species="Dracaena angolensis", common="Cylindrical Snake Plant",
         sources=["https://powo.science.kew.org/taxon/77182375-1"],
         note="Seven round spears with staggered tips and interrupted gray-green bands", build=cylindrical_snake, fallback=2),
    dict(id="whale-fin", species="Dracaena masoniana", common="Whale Fin Snake Plant",
         sources=["https://powo.science.kew.org/taxon/77183391-1"],
         note="Three broad asymmetric paddle leaves with mottled surfaces and darker rims", build=whale_fin, fallback=2),
    dict(id="flaming-katy", species="Kalanchoe blossfeldiana", common="Flaming Katy",
         sources=["https://powo.science.kew.org/taxon/274279-1"],
         note="Succulent basal foliage with dense clusters of small four-lobed coral flowers", build=kalanchoe, fallback=4),
    dict(id="bunny-ears", species="Opuntia microdasys", common="Bunny Ears Cactus",
         sources=["https://powo.science.kew.org/taxon/136806-1"],
         note="Flattened oval pads with paired offsets and golden raised areoles", build=bunny_ears, fallback=4),
    dict(id="golden-barrel", species="Echinocactus grusonii", common="Golden Barrel Cactus",
         accepted="Kroenleinia grusonii", sources=["https://powo.science.kew.org/taxon/77164085-1"],
         pot=("ba8b59", "75513a"),
         note="Globular barrel with twenty ribs and clustered gold spines anchored on felted areoles", build=barrel, fallback=4),
    dict(id="moth-orchid", species="Phalaenopsis amabilis", common="Moth Orchid",
         sources=["https://powo.science.kew.org/taxon/650501-1"], pot=("988aa9", "625572"),
         note="Leathery basal fan, velamen-covered aerial roots, attached flower branches and three-lobed lips", build=moth_orchid, fallback=6),
    dict(id="african-violet", species="Streptocarpus ionanthus", common="African Violet",
         sources=["https://powo.science.kew.org/taxon/77117375-1"], pot=("b17f9a", "73556e"),
         note="Shallow rosette of rounded velvet leaves framing violet five-lobed flowers", build=african_violet, fallback=6),
    dict(id="polka-dot-begonia", species="Begonia maculata", common="Polka Dot Begonia",
         sources=["https://powo.science.kew.org/taxon/105130-1"], pot=("b38584", "6c4b57"),
         note="Upright cane habit with silver-spotted angel wings and claret undersides", build=polka_begonia, fallback=6),
    dict(id="thanksgiving-cactus", species="Schlumbergera truncata", common="Thanksgiving Cactus",
         sources=["https://powo.science.kew.org/taxon/229597-2", "https://plants.ces.ncsu.edu/plants/schlumbergera-truncata/"],
         pot=("83a391", "4d725f"),
         note="Arching chains of claw-toothed pads and oblique tubular pink flowers with projecting stamens",
         build=thanksgiving, fallback=4),
]
