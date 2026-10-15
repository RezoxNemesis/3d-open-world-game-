#!/usr/bin/env python3
"""Original Verdant architectural kit, Blender 4.3+, meters and floor Y=0.

blender --background --factory-startup --python tools/generate_verdant_assets.py
Append ``-- --preview`` for isolated Blender studio renders; no game import.
The mathematical geometry, carved motifs and sculpture are original MIT art.
Named material surfaces share the runtime palette and contain no image data.
"""

import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "assets/models/verdant"
SPEC = importlib.util.spec_from_file_location("celestial_geometry", ROOT / "tools/generate_celestial_assets.py")
KIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(KIT)
KIT.DESTINATION = DESTINATION
BASE = KIT.BASE
PI = math.pi


class Geometry(KIT.Geometry):
    def board(self, mat, center, size, bevel=.035):
        """Eight-sided, chamfered furniture board with actual rounded edges."""
        x, y, z = center
        sx, sy, sz = (value / 2 for value in size)
        b = min(bevel, sx * .3, sy * .3, sz * .4)
        outline = [(-sx + b, -sy), (sx - b, -sy), (sx, -sy + b),
                   (sx, sy - b), (sx - b, sy), (-sx + b, sy),
                   (-sx, sy - b), (-sx, -sy + b)]
        vertices = []
        for height, inset in ((-sz, b), (-sz + b, 0), (sz - b, 0), (sz, b)):
            for dx, dy in outline:
                vertices.append((x + dx * (1 - inset / sx), y + dy * (1 - inset / sy), z + height))
        faces = [tuple(reversed(range(8)))]
        for ring in range(3):
            for index in range(8):
                a, bindex = ring * 8 + index, ring * 8 + (index + 1) % 8
                faces.append((a, bindex, bindex + 8, a + 8))
        faces.append(tuple(range(24, 32)))
        self.add(mat, vertices, faces)

    def sweep(self, mat, points, radii, segments=8):
        """Tapered curved carving, with a transported circular ring frame."""
        vertices = []
        points = [Vector(point) for point in points]
        for index, (point, radius) in enumerate(zip(points, radii)):
            tangent = (points[min(index + 1, len(points) - 1)] - points[max(0, index - 1)]).normalized()
            helper = Vector((0, 0, 1)) if abs(tangent.z) < .9 else Vector((1, 0, 0))
            first = tangent.cross(helper).normalized()
            second = tangent.cross(first).normalized()
            for section in range(segments):
                angle = 2 * PI * section / segments
                vertices.append(point + radius * (math.cos(angle) * first + math.sin(angle) * second))
        faces = [tuple(reversed(range(segments)))]
        for ring in range(len(points) - 1):
            for section in range(segments):
                a, b = ring * segments + section, ring * segments + (section + 1) % segments
                faces.append((a, b, b + segments, a + segments))
        faces.append(tuple(range((len(points) - 1) * segments, len(points) * segments)))
        self.add(mat, vertices, faces, smooth=[False] + [True] * (len(faces) - 2) + [False])


def cloud(geo, mat, x, y, z, width=.6, height=.22, radius=.018):
    """A raised pierced cloud scroll, with space visible through its curls."""
    points = [(x + width * t, y, z + height * (math.sin(PI * t) + .28 * math.sin(3 * PI * t)))
              for t in (-.5, -.375, -.25, -.125, 0, .125, .25, .375, .5)]
    geo.tube(mat, points, radius, 5)


def diamond(geo, mat, x, y, z, width, height, radius=.018):
    geo.tube(mat, [(x, y, z + height / 2), (x + width / 2, y, z),
                  (x, y, z - height / 2), (x - width / 2, y, z),
                  (x, y, z + height / 2)], radius, 4)


def fox_badge(geo, mats, center, scale=.3):
    """Original angular fox mask relief; actual prism ears and cheek planes."""
    x, y, z = center
    outline = [(-.56, .42), (-.55, 1.0), (-.16, .65), (0, .71), (.16, .65),
               (.55, 1.0), (.56, .42), (.39, -.12), (0, -.57), (-.39, -.12)]
    vertices = [(x + a * scale, y + depth, z + b * scale) for depth in (-.015, .015) for a, b in outline]
    faces = [tuple(reversed(range(10))), tuple(range(10, 20))]
    faces.extend((i, (i + 1) % 10, (i + 1) % 10 + 10, i + 10) for i in range(10))
    geo.add(mats["gold"], vertices, faces)
    for sign in (-1, 1):
        geo.tube(mats["jade"], [(x + sign * .15 * scale, y - .027, z + .22 * scale),
                               (x + sign * .35 * scale, y - .027, z + .30 * scale)], .014 * scale / .3, 4)
    geo.ellipsoid(mats["jade"], (x, y - .029, z - .22 * scale), (.065 * scale, .015, .05 * scale), 6, 3)


def scholar_desk(mats):
    geo = Geometry()
    # True 2.3 x 1.1 m tabletop, with beveled corners and gold edge inlay.
    geo.board(mats["timber"], (0, 0, .93), (2.3, 1.1, .14), .04)
    for y in (-.497, .497):
        geo.box(mats["gold"], (0, y, .997), (2.12, .014, .006))
    for x in (-1.06, 1.06):
        geo.box(mats["gold"], (x, 0, .997), (.014, .99, .006))
    # Cabriole legs have shaped knees, tapered shafts and flared carved feet.
    for sign_x in (-1, 1):
        for sign_y in (-1, 1):
            x, y = sign_x * .91, sign_y * .37
            geo.loft(mats["timber"], [(x + sign_x * .035, y, 0, .115, .10),
                                      (x + sign_x * .055, y, .065, .12, .10),
                                      (x - sign_x * .035, y, .18, .065, .06),
                                      (x - sign_x * .04, y, .53, .055, .055),
                                      (x, y, .72, .09, .08),
                                      (x, y, .88, .085, .075)], 8)
            geo.cylinder(mats["gold"], (x, y, .68), (x, y, .72), .094, 8)
            geo.board(mats["gold"], (x + sign_x * .035, y, .035), (.22, .19, .035), .015)
        # Tenon cross braces remain visible beneath the apron.
        geo.board(mats["timber"], (sign_x * .91, 0, .28), (.075, .77, .075), .02)
    geo.board(mats["timber"], (0, .33, .28), (1.82, .07, .075), .02)
    for side in (-1, 1):
        y = side * .40
        geo.board(mats["timber"], (0, y, .80), (1.94, .11, .18), .025)
        geo.box(mats["gold"], (0, y + side * .061, .875), (1.96, .012, .016))
        for x in (-.63, 0, .63):
            cloud(geo, mats["gold"], x, y + side * .067, .73, .54, .12, .013)
    # Three recessed drawer fronts, framed separately, with little bronze pulls.
    for x in (-.61, 0, .61):
        geo.board(mats["timber"], (x, -.468, .80), (.55, .035, .13), .014)
        geo.cylinder(mats["gold"], (x, -.493, .805), (x, -.52, .805), .026, 8)
        geo.tube(mats["gold"], [(x - .052, -.524, .80), (x - .046, -.527, .758),
                               (x + .046, -.527, .758), (x + .052, -.524, .80)], .011, 5)
    return geo


def scroll_shelf(mats):
    geo = Geometry()
    geo.board(mats["timber"], (0, 0, .09), (2.1, .70, .18), .035)
    geo.board(mats["timber"], (0, 0, 2.36), (2.1, .70, .18), .035)
    for x in (-.95, .95):
        geo.board(mats["timber"], (x, 0, 1.22), (.15, .60, 2.27), .025)
        for z in (.23, 2.20):
            geo.box(mats["gold"], (x, -.314, z), (.17, .026, .05))
    geo.box(mats["timber"], (0, .29, 1.25), (1.8, .06, 2.12))
    for z in (.70, 1.25, 1.80):
        geo.board(mats["timber"], (0, -.01, z), (1.83, .61, .085), .02)
        geo.box(mats["gold"], (0, -.326, z + .012), (1.83, .018, .016))
    for x, z in ((-.32, .98), (.35, 1.53), (0, 2.06)):
        geo.box(mats["timber"], (x, .015, z), (.07, .54, .48))
    # Open cubbies contain round scroll bundles, rolled-paper ends and bindings.
    for row, z in enumerate((.38, .92, 1.48, 2.02)):
        for index in range(5 if row != 2 else 4):
            x = -.72 + index * .34 + (row % 2) * .04
            if row == 3 and abs(x) < .13:
                continue
            radius = .065 + .006 * (index % 3)
            geo.cylinder(mats["cream"], (x, -.265, z), (x, .19, z), radius, 8)
            for y in (-.275, .20):
                geo.cylinder(mats["gold"], (x, y, z), (x, y - .019, z), radius * 1.1, 8)
                geo.cylinder(mats["timber"], (x, y - .021, z), (x, y - .025, z), .017, 6)
            geo.cylinder(mats["cloth"], (x, -.04, z), (x, .007, z), radius * 1.025, 8)
    for x in (-.54, .54):
        geo.board(mats["jade"], (x, -.08, 1.92), (.24, .29, .12), .025)
    for x in (-.62, 0, .62):
        cloud(geo, mats["gold"], x, -.335, 2.36, .51, .075, .014)
    return geo


def lattice_screen(mats):
    geo = Geometry()
    for x in (-1.37, 0, 1.37):
        geo.board(mats["timber"], (x, 0, .065), (.24, .60, .13), .025)
    # Three open panels with individual mortised frames and carved low panels.
    for x in (-1., 0., 1.):
        for dx in (-.46, .46):
            geo.board(mats["timber"], (x + dx, 0, 1.28), (.08, .15, 2.30), .02)
        for z in (.23, .87, 2.39):
            geo.board(mats["timber"], (x, 0, z), (.99, .17, .12), .02)
            geo.box(mats["gold"], (x, -.091, z + .032), (.94, .012, .016))
        geo.box(mats["cloth"], (x, .025, .55), (.85, .055, .52))
        fox_badge(geo, mats, (x, -.025, .54), .22)
        for dx in (-.25, .25):
            geo.box(mats["timber"], (x + dx, 0, 1.62), (.035, .08, 1.39))
        for z in (1.10, 1.57, 2.04, 2.27):
            geo.box(mats["timber"], (x, 0, z), (.85, .08, .035))
        for z in (1.34, 1.81, 2.15):
            for dx in (-.25, .25):
                diamond(geo, mats["gold"], x + dx, -.052, z, .40, .38, .014)
        cloud(geo, mats["gold"], x, -.095, 2.37, .75, .06, .012)
    return geo


def fox_guardian(mats):
    geo = Geometry()
    geo.board(mats["stone"], (0, .05, .07), (1.18, 1.48, .14), .05)
    geo.board(mats["gold"], (0, .05, .15), (1.03, 1.31, .04), .025)
    # Seated torso tapers into shoulders; separate haunches and long front legs.
    geo.loft(mats["stone"], [(0, .16, .18, .34, .39), (0, .14, .42, .40, .37),
                             (0, .07, .75, .34, .30), (0, -.02, 1.04, .22, .23),
                             (0, -.09, 1.34, .22, .22), (0, -.10, 1.51, .26, .22)], 12)
    for sign in (-1, 1):
        geo.ellipsoid(mats["stone"], (sign * .28, .24, .48), (.25, .32, .32), 10, 5)
        geo.loft(mats["stone"], [(sign * .20, -.33, .20, .14, .20),
                                 (sign * .18, -.23, .36, .09, .11),
                                 (sign * .16, -.20, .93, .075, .10),
                                 (sign * .17, -.15, 1.07, .11, .12)], 8)
        for toe in (-1, 0, 1):
            geo.tube(mats["jade"], [(sign * .20 + toe * .053, -.509, .215),
                                   (sign * .20 + toe * .053, -.48, .265)], .009, 4)
    # Ring-sculpted head with a narrow wedge muzzle and large pointed fox ears.
    geo.loft(mats["stone"], [(0, -.20, 1.31, .17, .16), (0, -.25, 1.48, .29, .24),
                             (0, -.22, 1.68, .31, .25), (0, -.17, 1.83, .21, .18)], 12)
    geo.sweep(mats["stone"], [(0, -.31, 1.49), (0, -.49, 1.47), (0, -.66, 1.43)], [.20, .145, .065], 8)
    geo.ellipsoid(mats["jade"], (0, -.707, 1.45), (.072, .035, .055), 8, 4)
    for sign in (-1, 1):
        x = sign * .22
        vertices = [(x - .13, -.23, 1.72), (x + .13, -.23, 1.72),
                    (x + sign * .07, -.12, 2.14), (x - .11, -.02, 1.72),
                    (x + .11, -.02, 1.72)]
        geo.add(mats["stone"], vertices, [(0, 1, 2), (1, 4, 2), (4, 3, 2), (3, 0, 2), (0, 3, 4, 1)])
        geo.add(mats["jade"], [(x - .075, -.241, 1.78), (x + .075, -.241, 1.78),
                               (x + sign * .047, -.158, 2.03)], [(0, 1, 2)])
        geo.ellipsoid(mats["jade"], (sign * .205, -.439, 1.66), (.069, .022, .029), 8, 4)
        geo.tube(mats["gold"], [(sign * .13, -.446, 1.695), (sign * .21, -.447, 1.71),
                               (sign * .29, -.39, 1.72)], .017, 5)
        geo.tube(mats["jade"], [(sign * .03, -.65, 1.40), (sign * .17, -.51, 1.386),
                               (sign * .23, -.44, 1.43)], .010, 4)
    # Broad curled tail rises behind the haunch, a modeled flowing flame shape.
    geo.sweep(mats["stone"], [(.17, .45, .31), (.48, .43, .43), (.62, .30, .74),
                               (.62, .19, 1.10), (.51, .20, 1.34), (.34, .31, 1.47),
                               (.34, .40, 1.68)], [.20, .22, .20, .17, .13, .085, .012], 10)
    geo.tube(mats["gold"], [(.53, .083, .73), (.55, .045, .98), (.45, .06, 1.20),
                           (.32, .18, 1.37)], .018, 5)
    geo.lathe(mats["gold"], [(.225, 1.19), (.24, 1.25), (.24, 1.30), (.22, 1.33)], 12, (0, -.08, 0))
    geo.add(mats["cloth"], [(-.19, -.307, 1.26), (.19, -.307, 1.26),
                           (.13, -.334, .96), (0, -.35, .87), (-.13, -.334, .96)], [(0, 1, 2, 3, 4)])
    geo.ellipsoid(mats["gold"], (0, -.36, 1.08), (.05, .023, .05), 8, 4)
    return geo


def post(geo, mats, x, y, top, radius=.14, base_size=.36, bracket_extent=(.82, .82)):
    geo.board(mats["stone"], (x, y, .09), (base_size, base_size, .18), .025)
    geo.cylinder(mats["timber"], (x, y, .16), (x, y, top), radius, 10)
    for z in (.28, top - .20):
        geo.cylinder(mats["gold"], (x, y, z), (x, y, z + .045), radius * 1.06, 10)
    # Layered cross-brackets and diagonal braces show timber construction.
    for z, length in ((top - .20, .58), (top - .08, .82)):
        span_x, span_y = min(length, bracket_extent[0]), min(length, bracket_extent[1])
        geo.board(mats["timber"], (x, y, z), (span_x, .16, .12), .018)
        geo.board(mats["timber"], (x, y, z), (.16, span_y, .12), .018)
        geo.box(mats["gold"], (x, y, z + .055), (span_x, .17, .012))


def bridge_roof(geo, mats):
    # Ridge follows local Z. Geometry stays inside the precise 5.2 x 8 bounds.
    cols, rows = 12, 10
    def point(i, j):
        x = -2.52 + 5.04 * i / cols
        t = abs(x) / 2.52
        return (x, -3.92 + 7.84 * j / rows, 4.0 - 1.15 * t + .31 * t ** 4)
    vertices = [point(i, j) for j in range(rows + 1) for i in range(cols + 1)]
    faces = [(j * (cols + 1) + i, j * (cols + 1) + i + 1,
             (j + 1) * (cols + 1) + i + 1, (j + 1) * (cols + 1) + i)
             for j in range(rows) for i in range(cols)]
    geo.add(mats["slate"], vertices, faces, smooth=True)
    geo.add(mats["timber"], [(x, y, z - .075) for x, y, z in vertices],
            [tuple(reversed(face)) for face in faces], smooth=True)
    for j in range(rows + 1):
        geo.tube(mats["slate"], [(x, y, z + .019) for x, y, z in [point(i, j) for i in range(cols + 1)]], .027, 4)
    for i in (0, cols):
        geo.tube(mats["gold"], [point(i, j) for j in range(rows + 1)], .035, 5)
        geo.tube(mats["timber"], [(x, y, z - .10) for x, y, z in [point(i, j) for j in range(rows + 1)]], .07, 5)
    for j in (0, rows):
        geo.tube(mats["gold"], [point(i, j) for i in range(cols + 1)], .037, 5)
        geo.tube(mats["timber"], [(x, y, z - .095) for x, y, z in [point(i, j) for i in range(cols + 1)]], .055, 5)
    geo.cylinder(mats["gold"], (0, -3.91, 4.05), (0, 3.91, 4.05), .045, 8)
    for y in (-3.70, 3.70):
        geo.sweep(mats["gold"], [(0, y, 4.05), (0, y, 4.19), (.09, y, 4.28), (.17, y, 4.21)], [.055, .05, .035, .012], 6)


def covered_bridge(mats):
    geo = Geometry()
    # The top face is exactly at zero; supports extend underneath the route.
    geo.box(mats["timber"], (0, 0, -.14), (5.2, 8, .28))
    for y in (-3.8, 0, 3.8):
        geo.box(mats["timber"], (0, y, -.29), (5.18, .18, .22))
    for x in (-2.4, 2.4):
        for y in (-3.8, 3.8):
            post(geo, mats, x, y, 2.94, bracket_extent=(.36, .36))
        for z in (.28, 1.04, 2.93):
            geo.box(mats["timber"], (x, 0, z), (.13, 7.6, .13))
        for y in (-2.9, -1.9, -1, 0, 1, 1.9, 2.9):
            geo.box(mats["timber"], (x, y, .65), (.075, .075, .71))
        # Curved brackets stay outside the 3.6-meter walking lane.
        for y in (-3.8, 3.8):
            geo.tube(mats["timber"], [(x, y, 2.41), (x, y * .87, 2.62), (x, y * .78, 2.91)], .065, 6)
        for y in (-2.4, -.8, .8, 2.4):
            for z in (.51, .82):
                geo.box(mats["gold"], (x - math.copysign(.077, x), y, z), (.018, .56, .022))
    for y in (-3.8, 3.8):
        geo.box(mats["timber"], (0, y, 2.96), (4.84, .20, .18))
        geo.box(mats["gold"], (0, y - .11, 2.90), (4.85, .025, .024))
        fox_badge(geo, mats, (0, y - .12, 3.18), .19)
    for y in (-2.8, -1.4, 0, 1.4, 2.8):
        geo.box(mats["timber"], (0, y, 3.03), (4.84, .095, .14))
    bridge_roof(geo, mats)
    return geo


def shrine_roof(geo, mats):
    # Inset roof leaves room for all curl/tube radii inside 10 x 8 m footprint.
    KIT.pagoda_roof(geo, mats, 9.0, 7.0, 5.34, 1.16)
    geo.box(mats["timber"], (0, 0, 4.10), (8.6, 6.15, .11))
    for x in (-3.6, -2.4, -1.2, 0, 1.2, 2.4, 3.6):
        geo.box(mats["gold"], (x, 0, 4.033), (.025, 5.83, .016))
    for y in (-2.7, -1.35, 0, 1.35, 2.7):
        geo.box(mats["gold"], (0, y, 4.031), (8.17, .025, .018))
    KIT.finial(geo, mats, 5.40, .63, .13)


def fox_shrine(mats):
    geo = Geometry()
    geo.box(mats["stone"], (0, 0, -.18), (10, 8, .36))
    for x in (-4.15, 4.15):
        for y in (-2.9, 0, 2.9):
            post(geo, mats, x, y, 3.90, .18, .60)
        geo.box(mats["timber"], (x, 0, 3.93), (.27, 6.2, .26))
        # Wall panels are confined to the sides and rear: both front and center open.
        for y in (-1.45, 1.45):
            geo.box(mats["timber"], (x, y, .48), (.12, 2.6, .84))
            for dy in (-.9, -.45, 0, .45, .9):
                geo.box(mats["timber"], (x, y + dy, 2.12), (.07, .055, 2.34))
            for z in (1.01, 1.56, 2.14, 2.72, 3.31):
                geo.box(mats["timber"], (x, y, z), (.08, 2.6, .055))
            geo.box(mats["gold"], (x - math.copysign(.075, x), y, .88), (.025, 2.59, .025))
    # Rear panels are split by real red columns, not a monolithic pale wall.
    for x in (-2.78, 0, 2.78):
        geo.box(mats["cloth"], (x, 2.9, 1.95), (2.5, .09, 2.58))
        for dx in (-1.25, 1.25):
            geo.box(mats["timber"], (x + dx, 2.83, 1.94), (.10, .13, 2.68))
        for z in (.62, 1.15, 2.76, 3.27):
            geo.box(mats["timber"], (x, 2.82, z), (2.5, .13, .10))
        fox_badge(geo, mats, (x, 2.75, 1.94), .50)
        for dx in (-.76, .76):
            diamond(geo, mats["gold"], x + dx, 2.756, 1.93, .44, .77, .020)
    for y in (-2.9, 2.9):
        geo.box(mats["timber"], (0, y, 3.92), (8.55, .28, .27))
        geo.box(mats["gold"], (0, y - .16, 3.82), (8.56, .025, .026))
    for x in (-3.45, -2.30, 2.30, 3.45):
        BASE.bracket(geo, mats, x, -2.9, 3.69, .58)
    # Front hanging panels frame a 4.8 m open doorway, above head height.
    for x in (-3.15, 3.15):
        geo.box(mats["cloth"], (x, -2.96, 2.84), (.75, .055, 1.42))
        fox_badge(geo, mats, (x, -3.0, 2.92), .30)
        geo.box(mats["gold"], (x, -3.0, 2.15), (.76, .03, .04))
    shrine_roof(geo, mats)
    return geo


def pergola(mats):
    geo = Geometry()
    for x in (-2.5, 2.5):
        for y in (-3.65, 0, 3.65):
            post(geo, mats, x, y, 3.10, .14, .38, bracket_extent=(.56, .66))
        geo.board(mats["timber"], (x, 0, 3.16), (.22, 7.96, .23), .03)
        geo.box(mats["gold"], (x, 0, 3.22), (.235, 7.92, .018))
        for y in (-3.65, 0, 3.65):
            for sign in (-1, 1):
                if abs(y + sign * .68) <= 3.98:
                    geo.tube(mats["timber"], [(x, y, 2.59), (x, y + sign * .32, 2.78),
                                             (x, y + sign * .68, 3.09)], .065, 6)
    for index in range(11):
        y = -3.85 + index * .77
        # Curved-ended open rafters retain actual gaps for sky and hanging vines.
        for sign in (-1, 1):
            geo.tube(mats["timber"], [(0, y, 3.38), (sign * 1.35, y, 3.36),
                                     (sign * 2.40, y, 3.43), (sign * 2.74, y, 3.67)], .06, 5)
            geo.tube(mats["gold"], [(sign * 2.40, y, 3.48), (sign * 2.72, y, 3.72)], .020, 5)
    # Discrete upper rails establish exact requested bounding height/width.
    for x in (-2.72, 0, 2.72):
        geo.box(mats["timber"], (x, 0, 3.75), (.16, 8, .10))
    # Exact outer silhouette x±2.8, height3.8; no walking-lane floor or rail.
    return geo


def dragon_spout(mats):
    geo = Geometry()
    geo.board(mats["stone"], (0, .27, .85), (1.48, .35, 1.70), .10)
    for z in (.15, 1.55):
        geo.box(mats["gold"], (0, .08, z), (1.26, .028, .035))
    # Carved dragon brow and cheeks converge into a genuine hollow mouth ring.
    geo.ellipsoid(mats["stone"], (0, -.04, 1.13), (.51, .41, .45), 12, 6)
    for sign in (-1, 1):
        geo.sweep(mats["stone"], [(sign * .37, -.09, 1.23), (sign * .48, -.33, 1.06),
                                   (sign * .39, -.49, .86), (sign * .24, -.61, .89)], [.19, .17, .12, .06], 8)
        geo.sweep(mats["stone"], [(sign * .31, .0, 1.43), (sign * .41, .09, 1.69),
                                   (sign * .56, .15, 1.77), (sign * .65, .08, 1.91)], [.12, .10, .065, .01], 8)
        geo.ellipsoid(mats["jade"], (sign * .28, -.383, 1.27), (.10, .035, .045), 8, 4)
        geo.tube(mats["gold"], [(sign * .13, -.401, 1.36), (sign * .28, -.397, 1.39),
                               (sign * .44, -.29, 1.37)], .027, 5)
        geo.sweep(mats["gold"], [(sign * .26, -.63, 1.10), (sign * .49, -.59, 1.04),
                                 (sign * .62, -.44, 1.11), (sign * .65, -.36, 1.27)], [.028, .026, .020, .009], 6)
    geo.sweep(mats["stone"], [(0, -.20, 1.19), (0, -.50, 1.13), (0, -.71, 1.15)], [.25, .21, .17], 10)
    # Open annular lips, outer and inner surfaces: no capped muzzle/image card.
    rings = [(0, -.59, 1.01, .28, .20), (0, -.86, 1.01, .27, .18),
             (0, -.93, 1.01, .215, .125), (0, -.70, 1.01, .19, .115)]
    vertices = [(x + rx * math.cos(2 * PI * i / 16), y, z + rz * math.sin(2 * PI * i / 16))
                for x, y, z, rx, rz in rings for i in range(16)]
    faces = [(ring * 16 + i, ring * 16 + (i + 1) % 16,
              (ring + 1) * 16 + (i + 1) % 16, (ring + 1) * 16 + i)
             for ring in range(3) for i in range(16)]
    geo.add(mats["stone"], vertices, faces, smooth=True)
    for sign in (-1, 1):
        geo.sweep(mats["gold"], [(sign * .16, -.87, 1.16), (sign * .14, -.89, 1.07)], [.032, .008], 6)
    geo.tube(mats["gold"], [(0, -.29, 1.52), (0, -.41, 1.46), (0, -.51, 1.36)], .025, 6)
    for x in (-.43, .43):
        cloud(geo, mats["gold"], x, .073, .48, .34, .22, .023)
    return geo


CONTRACTS = {
    "scholar_desk": {"dimensions_y_up_m": [2.3, 1.0, 1.1], "table_top_y_m": 1.0},
    "scroll_shelf": {"dimensions_y_up_m": [2.1, 2.45, .70]},
    "lattice_screen": {"dimensions_y_up_m": [3.0, 2.45, .60]},
    "fox_guardian": {"floor_top_y_m": 0.0, "front": "+Z"},
    "covered_bridge": {"dimensions_y_up_m": [5.2, 4.34, 8.0], "deck_top_y_m": 0.0,
                       "clear_lane_width_m": 3.6,
                       "post_centers_xz_m": [[-2.4, -3.8], [-2.4, 3.8], [2.4, -3.8], [2.4, 3.8]]},
    "fox_shrine": {"footprint_xz_m": [10.0, 8.0], "floor_top_y_m": 0.0,
                   "front": "+Z", "clear_front_entry_width_m": 4.8,
                   "post_centers_xz_m": [[x, z] for x in (-4.15, 4.15) for z in (-2.9, 0, 2.9)]},
    "pergola": {"dimensions_y_up_m": [5.6, 3.8, 8.0]},
    "dragon_spout": {"mouth_outlet_y_up_m": [0.0, 1.01, .93], "front": "+Z"},
}


def studio_preview(names, path, close=False):
    """A separate DCC studio scene; never imports or renders the game project."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    positions = ({"scholar_desk": (-3.2, -.8), "scroll_shelf": (0, .5),
                  "lattice_screen": (3.5, .5), "fox_guardian": (-1.7, -3.4),
                  "dragon_spout": (1.6, -3.4)} if close else
                 {"fox_shrine": (0, 4), "covered_bridge": (11, 3.5), "pergola": (-11, 3.5)})
    for name in names:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(DESTINATION / f"{name}.glb"))
        for obj in set(bpy.data.objects) - before:
            if obj.parent is None:
                obj.location.x += positions[name][0]
                obj.location.y += positions[name][1]
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.525 if not close else -.005))
    plane = bpy.context.object
    material = BASE.material("Studio ground", (.13, .16, .15), roughness=.9)
    plane.data.materials.append(material)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.world.color = (.34, .38, .42)
    for location, energy, size in (((-5, -8, 15), 2200, 10), ((9, 3, 10), 1700, 8)):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.data.energy, light.data.shape, light.data.size = energy, "DISK", size
        light.rotation_euler = (Vector((0, 0, 1)) - light.location).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.camera_add(location=(9, -14, 10) if close else (23, -29, 22))
    camera = bpy.context.object
    target = Vector((0, -.6, 1.0) if close else (0, 3, 1.5))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 12.8 if close else 34
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def main():
    DESTINATION.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0
    if "--preview-only" in sys.argv:
        previews()
        return
    mats = KIT.palette()
    generators = (("scholar_desk", scholar_desk, 4000), ("scroll_shelf", scroll_shelf, 4000),
                  ("lattice_screen", lattice_screen, 3000), ("fox_guardian", fox_guardian, 4000),
                  ("fox_shrine", fox_shrine, 16000), ("covered_bridge", covered_bridge, 10000),
                  ("pergola", pergola, 6000), ("dragon_spout", dragon_spout, 5000))
    selected = sys.argv[sys.argv.index("--asset") + 1] if "--asset" in sys.argv else None
    assert selected is None or selected in CONTRACTS, "Unknown Verdant asset name"
    assets = json.loads((DESTINATION / "manifest.json").read_text())["assets"] if selected else {}
    for name, generator, budget in generators:
        if selected and name != selected:
            continue
        entry = KIT.export_asset(name, generator(mats), budget)
        entry.update(CONTRACTS[name])
        # Dimensions represent serialized extents (including support below floor).
        if name == "covered_bridge":
            entry["dimensions_y_up_m"][1] = round(entry["bounds_max_y_up_m"][1] - entry["bounds_min_y_up_m"][1], 4)
        assets[name] = entry
    manifest = {"generator": "tools/generate_verdant_assets.py", "generator_version": 1,
                "blender_version": bpy.app.version_string, "license": "MIT (original project geometry)",
                "source": "Original mathematical joinery, lattice, carved fox and dragon geometry; no reference pixels",
                "coordinate_system": "glTF Y-up, meters, front +Z, centered floor pivots",
                "collision": "Gameplay authors collision separately; zero-offset floor/deck top at Y=0",
                "textures": [], "palette": "Shared runtime Stone/Timber/Roof/Gold/Jade/Paper/Cloth; no embedded images",
                "floor_offset_y_m": 0.0, "assets": assets}
    (DESTINATION / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    if "--preview" in sys.argv:
        previews()


def previews():
    preview = ROOT / "artifacts/verdant-asset-preview"
    preview.mkdir(parents=True, exist_ok=True)
    studio_preview(["scholar_desk", "scroll_shelf", "lattice_screen", "fox_guardian", "dragon_spout"], preview / "original-furnishings.png", close=True)
    studio_preview(["fox_shrine", "covered_bridge", "pergola"], preview / "original-architecture.png")


if __name__ == "__main__":
    main()
