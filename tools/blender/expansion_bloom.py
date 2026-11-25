"""Botanically distinct crowns for Petey's sculptural and flowering characters."""

from math import cos, pi, sin, tau

from mathutils import Vector

from build_monstera import material, mesh, sphere, stem


def ray(angle, radius=1, height=0):
    return Vector((cos(angle) * radius, sin(angle) * radius, height))


def palette(name, *colors):
    return [material(f"{name} {i + 1}", color, .47, .12) for i, color in enumerate(colors)]


def loft(name, crown, a, b, width, depth, mat, *, bulge=(0, 0, 0), form=.7,
         normal=(0, 0, 1), markings=None, teeth=0, rows=12, sides=10):
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
            vertices.append(center + taper * (side * width * edge * cos(angle) + up * depth * sin(angle)))
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
    frost = palette("Powdery blue rosette", "93bdb7", "739f99", "b9d5cd", "a989aa")
    for ring, (count, length, width, rise, z) in enumerate([(12, .81, .166, .08, .08),
                                                             (10, .62, .144, .17, .13),
                                                             (8, .43, .118, .26, .17),
                                                             (6, .25, .083, .31, .20)]):
        for i in range(count):
            angle = tau * i / count + .29 * ring
            loft("Fleshy spoon", crown, ray(angle, .034, z), ray(angle, length, z + rise), width,
                 .047 - .006 * ring, [frost[ring % 3], frost[3]], bulge=ray(angle, .03, -.08),
                 form=.54, rows=9, markings=lambda row, col: int(row == 8 and col % 3 == 0))


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
    skin = palette("Deep fluted green", "588253", "719251")
    gold = palette("Golden ribs", "c5a75e", "edce76")
    vertices, faces = [], []
    levels, sides = 20, 112
    for row in range(levels + 1):
        theta = pi * (.013 + .974 * row / levels)
        for j in range(sides):
            a = tau * j / sides
            r = sin(theta) * (.68 + .061 * cos(14 * a))
            vertices.append((r * cos(a), r * sin(a), .60 - .72 * cos(theta)))
    for row in range(levels):
        for j in range(sides):
            a = row * sides + j
            b = row * sides + (j + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.extend([tuple(range(sides - 1, -1, -1)), tuple(range(levels * sides, (levels + 1) * sides))])
    mesh("Fourteen-rib globular barrel", vertices, faces, skin[0], crown)
    for i in range(14):
        a = tau * i / 14
        for j in range(5):
            theta = .72 + j * .37
            p = ray(a, .742 * sin(theta), .60 - .72 * cos(theta))
            for turn in (-1, 1):
                stem("Short golden radial spine", [p, p + ray(a + turn * .63, .09, .037)], .010,
                     gold[j % 2], crown, [1, .19])


def moth_orchid(crown):
    leaves = palette("Leathery basal orchid foliage", "4b795d", "628c68")
    petals_palette = palette("White phalaenopsis", "f5ebdc", "fff6e8", "ca777c", "e9bc61")
    for i in range(5):
        angle = .19 + pi * (i % 2) + .10 * (i // 2)
        loft("Opposite basal fan blade", crown, ray(angle, .035, .04 + .034 * i), ray(angle, .75 - .046 * i, .24 + .046 * i),
             .16, .032, [leaves[i % 2]], bulge=(0, 0, .29), form=.67)
    for n, (bend, h) in enumerate([(.52, 1.46), (-.58, 1.17)]):
        stem("Arching inflorescence", [(0, .07, .08), (-bend * .26, .20, .78), (bend * .38, .16, h - .08),
              (bend, .14, h)], .031, leaves[0], crown, [1, .85, .62, .31])
        for i in range(3):
            p = Vector((bend * (.36 + .34 * i), -.012 - .032 * i, h + .09 - i * .18))
            stem("Short flower spur", [(p.x, .155, h - .08 + i * .036), p], .012, leaves[1], crown)
            size = 1 - .092 * i
            for angle, length, width in ((.13, .21, .092), (2.99, .21, .092), (1.57, .182, .053),
                                         (3.93, .155, .045), (5.50, .155, .045)):
                direction = Vector((cos(angle), 0, sin(angle)))
                loft("White petal or sepal", crown, p + direction * .014, p + direction * length * size,
                     width * size, .013, [petals_palette[i % 2]], bulge=(0, -.035, 0), normal=(0, -1, 0),
                     rows=8, sides=8)
            sphere("Golden orchid column", p + Vector((0, -.017, -.016)), (.029, .023, .034), petals_palette[3], crown)
            loft("Rose-marked orchid lip", crown, p, p + Vector((-.015 * n, -.04, -.11)),
                 .047, .014, [petals_palette[2]], normal=(0, -1, 0), rows=6, sides=8)


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
            loft("Claret-backed angel wing", crown, base, end, .245 - .03 * level, .023, leaves, normal=front,
                 bulge=bulge, form=.66, markings=lambda row, col: 1 if col > 4 else 0)
            for n, (t, u) in enumerate([(.22, -.09), (.32, .08), (.46, -.07), (.53, .12), (.69, -.07), (.78, .05)]):
                taper = .06 + .94 * sin(pi * (.007 + .986 * t)) ** .66
                radius = (.245 - .03 * level) * taper
                roof = .023 * taper * (1 - (u / radius) ** 2) ** .5
                p = base.lerp(end, t) + bulge * sin(pi * t) + tangent * u + normal * (roof + .002)
                sphere("Silver spot", p, (.019 + .003 * (n % 3), .006, .018), silver, crown)


def thanksgiving(crown):
    foliage = palette("Scalloped cladode colors", "397d55", "4e9560", "657733")
    flower = palette("Swept back magenta flower", "b73462", "d55782", "f2b29f", "efd26b")
    for n in range(7):
        angle = n * 2.39996
        points = [ray(angle, r, z) for r, z in [(.04, -.05), (.23, .30), (.47, .46),
                                                    (.73, .42 - .028 * (n % 3)), (.98, .26 - .06 * (n % 4))]]
        for i in range(len(points) - 1):
            loft("Flattened toothed segment", crown, points[i], points[i + 1], .116 - .009 * i, .035,
                 [foliage[(i + n) % 3]], form=.36, normal=(0, -1 + .5 * (n % 2), .6), teeth=3, rows=12, sides=8)
        if n % 2 == 0:
            base = points[-1]
            tip = base + ray(angle, .19, -.06)
            for i in range(7):
                a = tau * i / 7
                off = ray(angle + pi / 2, .115 * cos(a), .13 * sin(a))
                loft("Swept tubular bract", crown, tip, base + off, .051, .018, [flower[i % 3]], rows=6, sides=6)
            for i in range(5):
                a = tau * i / 5
                off = ray(angle + pi / 2, .075 * cos(a), .08 * sin(a))
                loft("Distal pink petal", crown, base, tip + off, .054, .013, [flower[(i + 1) % 3]], rows=6, sides=6)
            stem("Projecting golden floral axis", [base, tip + ray(angle, .06, -.02)], .009, flower[3], crown)


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
         note="Low powder-blue rosette formed by thick spoon-like leaves", build=echeveria, fallback=4),
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
         note="Globular green barrel with fourteen pronounced ribs and golden radial spines", build=barrel, fallback=4),
    dict(id="moth-orchid", species="Phalaenopsis amabilis", common="Moth Orchid",
         sources=["https://powo.science.kew.org/taxon/650501-1"], pot=("988aa9", "625572"),
         note="Leathery basal fan, arching flower sprays, white petals and rose-marked lips", build=moth_orchid, fallback=6),
    dict(id="african-violet", species="Streptocarpus ionanthus", common="African Violet",
         sources=["https://powo.science.kew.org/taxon/77117375-1"], pot=("b17f9a", "73556e"),
         note="Shallow rosette of rounded velvet leaves framing violet five-lobed flowers", build=african_violet, fallback=6),
    dict(id="polka-dot-begonia", species="Begonia maculata", common="Polka Dot Begonia",
         sources=["https://powo.science.kew.org/taxon/105130-1"], pot=("b38584", "6c4b57"),
         note="Upright cane habit with silver-spotted angel wings and claret undersides", build=polka_begonia, fallback=6),
    dict(id="thanksgiving-cactus", species="Schlumbergera truncata", common="Thanksgiving Cactus",
         sources=["https://powo.science.kew.org/taxon/229597-2"], pot=("83a391", "4d725f"),
         note="Arching jointed cladodes with pink swept-back blooms at the tips", build=thanksgiving, fallback=4),
]
