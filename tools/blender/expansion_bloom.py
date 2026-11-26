"""Botanically distinct crowns for Petey's sculptural and flowering characters."""

from math import cos, exp, pi, sin, tau

from mathutils import Vector
from mathutils.bvhtree import BVHTree

from build_monstera import material, mesh, sphere, stem


def ray(angle, radius=1, height=0):
    return Vector((cos(angle) * radius, sin(angle) * radius, height))


def palette(name, *colors):
    return [material(f"{name} {i + 1}", color, .47, .12) for i, color in enumerate(colors)]


def skin_color(name, roughness, coat=0):
    surface = material(name, "ffffff", roughness, coat)
    nodes = surface.node_tree.nodes
    color = nodes.new("ShaderNodeVertexColor")
    color.layer_name = "Botanical pigments"
    shader = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    surface.node_tree.links.new(color.outputs["Color"], shader.inputs["Base Color"])
    return surface


def pigment(obj, tint, light, variation):
    attribute = obj.data.color_attributes.new(name="Botanical pigments", type="FLOAT_COLOR", domain="POINT")
    obj.data.color_attributes.active_color = attribute
    for vertex, element in zip(obj.data.vertices, attribute.data):
        color = tint.lerp(light, max(0, min(1, variation(vertex.index))))
        element.color = (*color, 1)


def linear_rgb(hex_color):
    components = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return Vector([v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4 for v in components])


def surface_map(obj):
    return BVHTree.FromPolygons(
        [vertex.co for vertex in obj.data.vertices], [polygon.vertices[:] for polygon in obj.data.polygons],
    )


def small_bump(vertices, faces, center, normal, tangent, width, height, sides=6):
    """Closed contact detail with its base recessed into the surface."""
    across = normal.cross(tangent).normalized()
    tangent = across.cross(normal)
    start = len(vertices)
    center = center - normal * (height * .36)
    for i in range(sides):
        phase = tau * i / sides
        vertices.append(center + width * (tangent * cos(phase) + across * (.77 * sin(phase))))
    tip = len(vertices)
    vertices.append(center + normal * height)
    faces.append(tuple(range(start + sides - 1, start - 1, -1)))
    faces.extend((start + i, start + (i + 1) % sides, tip) for i in range(sides))


def closed_rings(name, crown, mat, vertices, sides):
    """Close a sweep of equally sized rings with oppositely wound end caps."""
    faces = [tuple(range(sides))]
    last = len(vertices) - sides
    for start in range(0, last, sides):
        for i in range(sides):
            following = (i + 1) % sides
            faces.append((start + i, start + i + sides, start + following + sides, start + following))
    faces.append(tuple(range(last + sides - 1, last - 1, -1)))
    return mesh(name, vertices, faces, mat, crown)


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
    leaves = skin_color("Longitudinal evergreen leaf cuticle", .53, .075)
    bark = skin_color("Corky grey bottle trunk", .88)
    base_colors = (linear_rgb("78664d"), linear_rgb("b49c73"))
    leaf_colors = (linear_rgb("254531"), linear_rgb("739652"))
    crown_center = Vector((-.075, .035, 1.135))
    body = [
        (-.115, .37), (-.015, .492), (.088, .52), (.198, .499), (.315, .445),
        (.438, .365), (.55, .285), (.662, .197), (.758, .142), (.865, .128),
        (.97, .117), (1.04, .114), (1.10, .127), (1.158, .109),
    ]
    sides = 84
    points, colors = [], []
    for row, (z, radius) in enumerate(body):
        for col in range(sides):
            phi = tau * col / sides
            slant = phi + .072 * sin(4 * z + 2 * phi)
            creases = exp(-34 * sin(13 * slant + 2.2 * z) ** 2)
            furrow = (.038 if z < .55 else .019) * creases
            envelope = radius * (1 + .039 * cos(5 * slant) + .012 * cos(19 * phi + row)) - furrow
            center = crown_center * (max(0, z) / crown_center.z)
            points.append(Vector((center.x + envelope * cos(phi), center.y - .92 * envelope * sin(phi), z)))
            colors.append(.51 - .28 * creases + .12 * sin(5 * phi + 1.2 * row)
                          + .074 * cos(9 * phi - .81 * row))
    trunk = closed_rings("Continuous swollen caudex and tapered neck", crown, bark, points, sides)
    pigment(trunk, *base_colors, colors.__getitem__)
    for i in range(44):
        angle = i * 2.39996
        age = i / 43
        origin = crown_center + ray(angle, .036 + .037 * age, -.032 + .035 * (1 - age))
        reach = .38 + .67 * age + .105 * sin(i * 3.2)
        rise = .17 + .23 * (1 - age) + .051 * cos(i)
        drop = .105 + .65 * age + .12 * sin(i * 4.1)
        width = .032 + .010 * sin(i * 4.3) + .007 * age
        rows, sides = 24, 8
        spine = [
            origin + ray(angle + .24 * t * t * sin(i + t * 4), reach * t ** 1.15,
                         rise * sin(pi * t) - drop * t ** 1.8)
            for t in (row / rows for row in range(rows + 1))
        ]
        points = []
        for row, center in enumerate(spine):
            t = row / rows
            axis = (spine[min(row + 1, rows)] - spine[max(0, row - 1)]).normalized()
            transverse = axis.cross(ray(angle + pi / 2)).normalized()
            side = axis.cross(transverse).normalized()
            taper = .015 + .985 * (1 - t) ** .62
            for j in range(sides):
                phase = tau * j / sides
                lateral = cos(phase)
                points.append(center + side * width * taper * lateral
                              + transverse * taper * (.0047 * sin(phase) + .009 * lateral ** 2))
        ribbon = closed_rings("Recurved strappy blade", crown, leaves, points, sides)

        def tint(index):
            row, col = divmod(index, sides)
            t = row / rows
            phase = tau * col / sides
            midline = exp(-18 * cos(phase) ** 2)
            return .30 + .17 * (1 - age) + .17 * midline + .06 * sin(phase) + .048 * cos(i * 3 + t * 8)

        pigment(ribbon, *leaf_colors, tint)


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
    leaf = skin_color("Satin succulent leaves", .38, .16)
    bark = skin_color("Grey bark and leaf-scar rings", .79)
    shoot = material("Living olive tips", "667739", .68)
    greens = (linear_rgb("1f573e"), linear_rgb("75a351"))
    wood = (linear_rgb("6b5e4c"), linear_rgb("aa9d84"))
    red = linear_rgb("994c49")
    joints = [Vector((0, .03, .48)), Vector((-.19, .05, .86)), Vector((.26, .14, 1.03))]
    for number, (path, start_r, end_r) in enumerate((
        ((Vector((.035, -.012, -.078)), joints[0], joints[1]), .113, .058),
        ((joints[0], Vector((.135, .112, .72)), joints[2]), .081, .047),
    )):
        points, tones = [], []
        ring_count = 14
        for row in range(ring_count + 1):
            t = row / ring_count
            center = path[0].lerp(path[1], t * 2) if t <= .5 else path[1].lerp(path[2], t * 2 - 1)
            radius = start_r * (1 - t) + end_r * t
            scar = .008 if row in (5, 9, 12) else 0
            for col in range(36):
                phi = col * tau / 36
                profile = radius * (1 + .037 * sin(8 * phi + t * 1.6)) + scar
                points.append(center + Vector((profile * cos(phi), -profile * sin(phi), .008 * sin(4 * phi + row))))
                tones.append(.45 + .21 * cos(phi * 7 - .2 * row) + .13 * sin(row * .725 + phi) + .15 * bool(scar))
        axis = closed_rings(f"Aging jade leader {number + 1}", crown, bark, points, 36)
        pigment(axis, *wood, tones.__getitem__)

    for i, (base, angle, radius, h) in enumerate(((0, 3.35, .54, .81), (0, -.44, .61, .82),
                                                  (1, 2.70, .53, 1.18), (1, 4.20, .37, 1.34),
                                                  (2, 1.40, .42, 1.43), (2, .28, .59, 1.34))):
        anchor = joints[base]
        tip = ray(angle, radius, h)
        nodes = [anchor.lerp(tip, .56), anchor.lerp(tip, .80), tip]
        stem("Growth shoot with shared opposite nodes", [anchor, *nodes], .042, shoot, crown,
             [1, .79, .60, .34])
        twig_axis = (tip - anchor).normalized()
        flank = twig_axis.cross(Vector((0, 0, 1))).normalized()
        shoulder = flank.cross(twig_axis).normalized()
        for level, node in enumerate(nodes):
            paired_axis = shoulder if level == 1 else flank
            for side in (-1, 1):
                length = .29 - .047 * level + .025 * sin(i * 4 + side)
                end = node + length * (twig_axis * .53 + paired_axis * .85 * side) + Vector((0, 0, .052))
                sides, rows = 12, 14
                blade = loft("Nearly sessile obovate paired leaf", crown, node, end, length * .405, .034 - .006 * level,
                             [leaf], bulge=(0, 0, .032), rows=rows, sides=sides, form=.48)
                axis = (end - node).normalized()
                across = axis.cross(Vector((0, 0, 1))).normalized()

                def color(index):
                    row, col = divmod(index, sides)
                    t = row / rows
                    phi = tau * col / sides
                    return .24 + .14 * t + .118 * level + .12 * sin(phi) + .07 * sin(6 * t + i + side)

                for v in blade.data.vertices:
                    row, col = divmod(v.index, sides)
                    t = row / rows
                    # Jade is fullest toward the apex, with a narrow cuneate base.
                    v.co += across * length * .17 * (t - .4) * sin(pi * t) * cos(tau * col / sides)
                blade.data.update()
                pigment(blade, *greens, color)
                attr = blade.data.color_attributes["Botanical pigments"]
                if (i + level) % 3 != 0:
                    for index, element in enumerate(attr.data):
                        row, col = divmod(index, sides)
                        t = row / rows
                        margin = abs(cos(tau * col / sides)) ** 22
                        tint = margin * .29 * sin(pi * t) * (.46 + .54 * t)
                        tinted = Vector(element.color[:3]).lerp(red, tint)
                        element.color = (*tinted, 1)


def haworthia(crown):
    cuticle = skin_color("Smooth Haworthiopsis cuticle", .51, .09)
    tubercle = material("Raised ivory epidermis", "e4e6c5", .77)
    dark, light = linear_rgb("214a37"), linear_rgb("588551")
    vertices, faces = [], []
    bands = (.23, .34, .46, .58, .70, .81, .89)
    for ring, (count, spread, rise, width) in enumerate(((10, .72, .56, .113), (7, .52, .80, .097), (5, .29, 1, .078))):
        for i in range(count):
            angle = tau * i / count + ring * .38
            radial = ray(angle)
            base = ray(angle, .038 + .015 * (2 - ring), -.034 + .013 * ring)
            tip = ray(angle + .035 * sin(i), spread * (1 + .07 * sin(3 * i + ring)),
                      rise + .049 * cos(i * 2 + ring))
            bow = ray(angle, .075, .113)
            rows, sides = 18, 12
            blade = loft("Smooth inner crown blade", crown, base, tip, width, .047 - .006 * ring,
                         [cuticle], bulge=bow, normal=radial, form=.54, rows=rows, sides=sides)

            def leaf_tint(index):
                t, c = divmod(index, sides)
                t /= rows
                face = sin(c * tau / sides)
                around_band = min(abs(t - band) for band in bands)
                halo = max(0, face) ** 2 * exp(-850 * around_band ** 2)
                return .19 + .29 * t + .07 * ring + .09 * face + .10 * halo + .046 * sin(i * 2.8 + 9 * t)

            pigment(blade, dark, light, leaf_tint)
            surface = surface_map(blade)
            axis = (tip - base).normalized()
            across = axis.cross(radial).normalized()
            outside = across.cross(axis).normalized()
            for row, t in enumerate(bands):
                if ring == 2 and row >= 5:
                    continue
                for col, u in enumerate((-.72, -.39, -.04, .31, .64)):
                    if (i * 3 + row * 5 + col * 7 + ring) % 17 == 0:
                        continue
                    fraction = t + .018 * sin(2 * col + row + i)
                    line = base.lerp(tip, fraction) + bow * sin(pi * fraction)
                    along = width * sin(pi * fraction) ** .55 * u
                    p, normal, _, _ = surface.ray_cast(line + across * along + outside * .25, -outside, .45)
                    if p is None:
                        raise ValueError("Tubercle missed the outer Haworthiopsis surface")
                    size = (.019 if row < 5 else .013) * (1 - ring * .11) * (1 + .15 * sin(col + i))
                    small_bump(vertices, faces, p, normal, across, size, size * .63)
    mesh("Interrupted rows of outer tubercles", vertices, faces, tubercle, crown)


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
    cuticle = skin_color("Glossy crenate Kalanchoe blades", .40, .14)
    flower = skin_color("Coral salverform petals", .52)
    stalk = material("Fleshy leaf and flower stalks", "507347", .60, .1)
    throat = material("Red corolla tube", "a33247", .58)
    bud = material("Dark closed flower buds", "b44b54", .60)
    eye = material("Restrained cream flower throats", "e6bb6e", .71)
    leaf_colors = (linear_rgb("264b38"), linear_rgb("669559"))
    flower_colors = (linear_rgb("a72146"), linear_rgb("e77778"))
    for n, (x, y, h) in enumerate(((-.31, .04, .88), (.29, .12, 1.00), (.05, -.31, .70))):
        terminal = Vector((x, y, h))
        anchors = [terminal * .06 + Vector((0, 0, -.084)), terminal * .15, terminal * .30, terminal * .49]
        stem("Fleshy stem with decussate leaf nodes", [*anchors, terminal], .039, stalk, crown, [1, .94, .84, .71, .43])
        for level, joint in enumerate(anchors[1:], start=1):
            for sign in (-1, 1):
                angle = n * 2.39996 + level * pi / 2 + (pi if sign < 0 else 0)
                base = joint + ray(angle, .10, -.018)
                tip = base + ray(angle, .49 - .066 * level + .045 * sin(n + sign), .076)
                stem("Short attached opposite Kalanchoe petiole", [joint, base], .022, stalk, crown, [1, .73])
                rows, sides = 20, 12
                blade = loft("Fleshy dark crenate Kalanchoe blade", crown, base, tip, .169 - .023 * level,
                             .034, [cuticle], bulge=(0, 0, .093), teeth=4, form=.57, rows=rows, sides=sides)

                def leaf_tint(index):
                    row, col = divmod(index, sides)
                    t = row / rows
                    c = tau * col / sides
                    rib = exp(-21 * cos(c) ** 2) * max(0, sin(c))
                    return .24 + .072 * level + .14 * t + .22 * rib + .067 * sin(8 * t + n)

                pigment(blade, *leaf_colors, leaf_tint)

        for i in range(9):
            angle = i * 2.39996 + n
            length = .07 if i < 2 else .16 + .029 * sin(3 * i + n)
            base = terminal + ray(angle, length, .069 + .071 * (i < 2) + .024 * sin(i * 6 + n))
            stem("Cluster pedicel anchored to terminal node", [terminal, base], .010, stalk, crown, [1, .71])
            normal = ray(angle, .25, 1).normalized()
            if i in (1, 5):
                stem("Swollen closed bud", [base, base + normal * .052, base + normal * .094],
                     .023, bud, crown, [.60, 1, .29])
                continue
            center = base + normal * .043
            tube = stem("Short coral corolla tube", [base, center], .019, throat, crown, [.58, 1])
            tube.data.bevel_resolution = 1
            along = normal.cross(ray(angle)).normalized()
            across = along.cross(normal).normalized()
            for lobe in range(4):
                phase = angle * .30 + pi / 2 * lobe
                direction = across * cos(phase) + along * sin(phase)
                length = .065 + .009 * cos(i + n) + .006 * sin(lobe + i)
                petal = loft("Rounded four-lobed coral corolla", crown, center + direction * .010,
                             center + direction * length, length * .52, .007, [flower],
                             bulge=normal * .012, normal=normal, form=.46, rows=7, sides=8)

                def petal_tint(index):
                    row, col = divmod(index, 8)
                    return .19 + .57 * row / 7 + .085 * sin(col * tau / 8) + .065 * cos(n + i + lobe)

                pigment(petal, *flower_colors, petal_tint)
            stem("Small cream flower throat", [center - normal * .004, center + normal * .011], .009,
                 eye, crown, [.93, .68])


def bunny_ears(crown):
    skin = skin_color("Satin cactus cuticle", .57, .08)
    cushion = material("Ochre felted areoles", "c79652", .88)
    bristle = material("Short gold glochids", "f0cd8e", .73)
    areoles, areole_faces, tips, tip_faces = [], [], [], []
    shadow, sunlit = linear_rgb("397646"), linear_rgb("81ae60")
    anatomy = (
        ((0, .02, -.12), (-.05, .08, 1.14), .402, .104, -.08),
        ((-.187, .063, .91), (-.63, .03, 1.75), .281, .077, .34),
        ((.106, .062, .90), (.57, .29, 1.72), .270, .079, -.46),
        ((.142, -.02, .55), (.65, -.21, 1.17), .230, .067, .48),
    )
    for i, (base, top, width, thickness, twist) in enumerate(anatomy):
        base, top = Vector(base), Vector(top)
        axis = (top - base).normalized()
        face = Vector((sin(twist), -cos(twist), 0))
        across = axis.cross(face).normalized()
        face = across.cross(axis)
        bow = face * (.033 - .01 * i)
        rows, sides = 25, 24
        pad = loft(f"Oval cladode {i + 1}", crown, base, top, width, thickness, [skin],
                   normal=face, bulge=bow, form=.48, rows=rows, sides=sides)

        def pad_tint(index):
            row, column = divmod(index, sides)
            t, c = row / rows, tau * column / sides
            return .18 + .46 * t + .065 * i + .10 * sin(c) + .05 * sin(13 * t + c * 2 + i)

        pigment(pad, shadow, sunlit, pad_tint)
        surface = surface_map(pad)
        for side in (-1, 1):
            facing = face * side
            for row, t in enumerate((.18, .30, .43, .56, .69, .81, .90)):
                for j in range(4 if row % 2 else 5):
                    u = (-.69 + j * .34) if row % 2 == 0 else (-.52 + j * .34)
                    fraction = t + .017 * sin(i * 2.11 + side + j * 2.34 + row)
                    center = base.lerp(top, fraction) + bow * sin(pi * fraction)
                    lateral = width * sin(pi * fraction) ** .48 * u
                    point, normal, _, _ = surface.ray_cast(center + across * lateral + facing * .23, -facing, .39)
                    if point is None:
                        raise ValueError("Areole missed its cladode")
                    radius = (.022 + .003 * cos(j * 2 + row + i)) * (1 - .07 * i)
                    small_bump(areoles, areole_faces, point, normal, across, radius, radius * .7)
                    tuft_base = point + normal * radius * .36
                    for k in range(7):
                        turn = k * tau / 7 + fraction + i
                        tuft = normal * .88 + .46 * (across * cos(turn) + normal.cross(across) * sin(turn))
                        offset = (across * cos(turn) + normal.cross(across) * sin(turn)) * radius * .39
                        small_bump(tips, tip_faces, tuft_base + offset, tuft.normalized(), across, .0031,
                                   radius * (.84 + .18 * sin(k + j * 2)), sides=3)
    mesh("Felt areoles on both pad faces", areoles, areole_faces, cushion, crown)
    mesh("Short glochid tufts", tips, tip_faces, bristle, crown)


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
    velvet = skin_color("Matte velvet blades", .86)
    petiole = material("Moss petioles and flower stems", "55774a", .81)
    fibers = material("Fine olive trichomes", "859771", .91)
    petal = skin_color("Violet corolla pigments", .64)
    throat = material("Indigo flower cup", "493378", .63)
    pollen = material("Butter-yellow paired anthers", "efce67", .66)
    foliage = (linear_rgb("294d39"), linear_rgb("78915e"))
    corolla = (linear_rgb("40246c"), linear_rgb("ae77d9"))
    hair_points, hair_faces = [], []
    for ring, (amount, extent, height, w) in enumerate([(9, .84, .19, .205), (8, .64, .34, .17), (5, .41, .405, .115)]):
        for i in range(amount):
            angle = tau * i / amount + .25 * ring + .08 * sin(i * 3 + ring)
            base = ray(angle, .25 - .045 * ring, height * .48)
            tip = ray(angle, extent * (1 + .08 * sin(i * 2.9)), height + .027 * cos(i * 3 + ring))
            stalk = stem("Leaf petiole anchored to basal rosette", [ray(angle, .029, -.012), base * .59, base],
                         .027 - .004 * ring, petiole, crown, [1, .88, .71])
            stalk.data.bevel_resolution = 1
            stalk.data.resolution_u = 4
            width = w * (1 + .07 * cos(i * 2 + ring))
            rows, sides = 20, 16
            bow = Vector((0, 0, .094 - .022 * ring))
            blade = loft("Rounded scalloped velvet blade", crown, base, tip, width, .025 - .004 * ring, [velvet],
                         bulge=bow, form=.53, rows=rows, sides=sides)
            axis = (tip - base).normalized()
            lateral = axis.cross(Vector((0, 0, 1))).normalized()
            upper = lateral.cross(axis).normalized()

            def leaf_tint(index):
                row, column = divmod(index, sides)
                t, c = row / rows, tau * column / sides
                u, face = cos(c), sin(c)
                if face < 0:
                    return .42 + .10 * t
                midrib = exp(-32 * u * u) * (.36 - .18 * t)
                secondaries = max(0, cos(tau * (5 * t - .62 * abs(u)))) ** 11
                return .12 + .07 * ring + .08 * t + .14 * secondaries + midrib + .12 * abs(u) ** 5

            for vertex in blade.data.vertices:
                row, column = divmod(vertex.index, sides)
                t, phase = row / rows, tau * column / sides
                u = cos(phase)
                # Round, shallow crenations remain visible without making the rim jagged.
                vertex.co += lateral * (.016 * u ** 5 * sin(pi * t) * cos(tau * 6 * t + u * .41))
                vertex.co -= upper * (.015 * abs(u) ** 3 * sin(pi * t) * cos(tau * (4 * t)))
            blade.data.update()
            pigment(blade, *foliage, leaf_tint)
            surface = surface_map(blade)
            for j in range(7):
                t = .23 + j * .10
                center = base.lerp(tip, t) + bow * sin(pi * t)
                for k in range(7):
                    u = -.76 + .249 * k + .026 * sin(i * 3 + k + j)
                    point, normal, _, _ = surface.ray_cast(center + lateral * width * sin(pi * t) ** .55 * u
                                                           + upper * .19, -upper, .36)
                    if point is None:
                        raise ValueError("Velvet fiber missed its blade")
                    small_bump(hair_points, hair_faces, point, (normal + lateral * .25).normalized(),
                               lateral, .0017, .0058 + .002 * sin(j * 2 + k), sides=3)
    mesh("Short velvet hairs across the upper surfaces", hair_points, hair_faces, fibers, crown)

    for cluster, (x, y, z) in enumerate(((-.30, .05, .66), (.28, .12, .72), (.04, -.27, .52))):
        fork = Vector((x, y, z))
        stem("Primary cyme peduncle", [(0, 0, .023), fork * .56, fork], .022, petiole, crown, [1, .83, .64])
        for i in range(3):
            direction = ray(i * tau / 3 + cluster * .84, .138 + .035 * i, .125 + .017 * i)
            flower_base = fork + direction
            pedicel = stem("Attached branch of three-flower cyme", [fork, flower_base],
                           .013, petiole, crown, [1, .56])
            pedicel.data.bevel_resolution = 1
            facing = Vector((direction.x * .46, -.30 + direction.y, .23 + .04 * i)).normalized()
            across = facing.cross(Vector((0, 0, 1))).normalized()
            up = across.cross(facing).normalized()
            flower_center = flower_base + facing * .024
            stem("Short violet corolla tube", [flower_base, flower_center], .036, throat, crown, [.53, 1])
            for j, (u, v) in enumerate(((-.54, .77), (.54, .77), (.98, -.30), (0, -1), (-.98, -.30))):
                spread = across * u + up * v
                reach = (.109 if j < 2 else .136) * (1 - .09 * i)
                root = flower_center + spread * .020 - facing * .006
                end = flower_center + spread * reach + facing * (.017 - .007 * (j % 2))
                lobe = loft("Two upper and three wider lower violet lobes", crown, root, end,
                            reach * (.44 if j < 2 else .51), .008, [petal], rows=8, sides=8,
                            bulge=facing * .024, normal=facing, form=.49)

                def petal_tint(index):
                    row, column = divmod(index, 8)
                    t = row / 8
                    return .67 * t + .08 * cos(tau * column / 8) ** 2 + .07 * (j % 2)

                pigment(lobe, *corolla, petal_tint)
            for sign in (-1, 1):
                anther = flower_center + facing * .017 + across * sign * .013
                stem("Paired golden anther", [anther, anther + up * .025], .010, pollen, crown, [1, .7])


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
         sources=["https://powo.science.kew.org/taxon/531735-1", "https://plants.ces.ncsu.edu/plants/beaucarnea-recurvata/"],
         note="Continuous grooved, swollen caudex with 44 narrow folded ribbons curling from its crown",
         build=ponytail, fallback=3),
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
         sources=["https://powo.science.kew.org/taxon/273350-1", "https://plants.ces.ncsu.edu/plants/crassula-ovata/"],
         note="Grey leaf-scarred bark, living green shoots and obovate leaf pairs with restrained margin tint",
         build=jade, fallback=4),
    dict(id="zebra-haworthia", species="Haworthiopsis fasciata", common="Zebra Haworthia",
         sources=["https://powo.science.kew.org/taxon/77138009-1", "https://plants.ces.ncsu.edu/plants/haworthiopsis-fasciata/"],
         note="Tapering rosette with smooth inner blade faces and interrupted bands of raised outer tubercles", build=haworthia, fallback=4),
    dict(id="cylindrical-snake", species="Dracaena angolensis", common="Cylindrical Snake Plant",
         sources=["https://powo.science.kew.org/taxon/77182375-1"],
         note="Seven round spears with staggered tips and interrupted gray-green bands", build=cylindrical_snake, fallback=2),
    dict(id="whale-fin", species="Dracaena masoniana", common="Whale Fin Snake Plant",
         sources=["https://powo.science.kew.org/taxon/77183391-1"],
         note="Three broad asymmetric paddle leaves with mottled surfaces and darker rims", build=whale_fin, fallback=2),
    dict(id="flaming-katy", species="Kalanchoe blossfeldiana", common="Flaming Katy",
         sources=["https://powo.science.kew.org/taxon/274279-1", "https://plants.ces.ncsu.edu/plants/kalanchoe-blossfeldiana/"],
         note="Glossy opposite crenate leaves and three attached clusters of coral salverform flowers and buds",
         build=kalanchoe, fallback=4),
    dict(id="bunny-ears", species="Opuntia microdasys", common="Bunny Ears Cactus",
         sources=["https://powo.science.kew.org/taxon/136806-1", "https://plants.ces.ncsu.edu/plants/opuntia-microdasys/"],
         note="Joined paired oval cladodes with two-sided, staggered felt areoles and short gold glochid tufts",
         build=bunny_ears, fallback=4),
    dict(id="golden-barrel", species="Echinocactus grusonii", common="Golden Barrel Cactus",
         accepted="Kroenleinia grusonii", sources=["https://powo.science.kew.org/taxon/77164085-1"],
         pot=("ba8b59", "75513a"),
         note="Globular barrel with twenty ribs and clustered gold spines anchored on felted areoles", build=barrel, fallback=4),
    dict(id="moth-orchid", species="Phalaenopsis amabilis", common="Moth Orchid",
         sources=["https://powo.science.kew.org/taxon/650501-1"], pot=("988aa9", "625572"),
         note="Leathery basal fan, velamen-covered aerial roots, attached flower branches and three-lobed lips", build=moth_orchid, fallback=6),
    dict(id="african-violet", species="Streptocarpus ionanthus", common="African Violet",
         sources=["https://powo.science.kew.org/taxon/77117375-1", "https://plants.ces.ncsu.edu/plants/streptocarpus-ionanthus/"],
         pot=("b17f9a", "73556e"),
         note="Crenate velvet rosette with short hairs, three branching cymes and paired anthers in five-lobed violet flowers",
         build=african_violet, fallback=6),
    dict(id="polka-dot-begonia", species="Begonia maculata", common="Polka Dot Begonia",
         sources=["https://powo.science.kew.org/taxon/105130-1"], pot=("b38584", "6c4b57"),
         note="Upright cane habit with silver-spotted angel wings and claret undersides", build=polka_begonia, fallback=6),
    dict(id="thanksgiving-cactus", species="Schlumbergera truncata", common="Thanksgiving Cactus",
         sources=["https://powo.science.kew.org/taxon/229597-2", "https://plants.ces.ncsu.edu/plants/schlumbergera-truncata/"],
         pot=("83a391", "4d725f"),
         note="Arching chains of claw-toothed pads and oblique tubular pink flowers with projecting stamens",
         build=thanksgiving, fallback=4),
]
