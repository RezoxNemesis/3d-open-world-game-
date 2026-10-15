#!/usr/bin/env python3
"""Original layered temple kit, Blender 4.3+, meters and base-centered GLB.

Run: blender --background --factory-startup --python tools/generate_celestial_assets.py
Only repository-authored mathematical geometry is used. Existing original
surface textures are assigned by the runtime's shared named palette; GLBs do
not embed copies. Geometry is grouped into one surface per palette material.
"""

import importlib.util
import json
import math
import struct
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "assets/models/celestial"
SPEC = importlib.util.spec_from_file_location("temple_geometry", ROOT / "tools/generate_temple_assets.py")
BASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BASE)
PI = math.pi


class Geometry(BASE.Geometry):
    """Pole-safe sculpted volumes plus the reviewed original architectural tools."""

    def ellipsoid(self, mat, center, radii, segments=10, rings=5):
        vertices = [(center[0], center[1], center[2] + radii[2])]
        for ring in range(1, rings):
            phi = PI * ring / rings
            for index in range(segments):
                theta = 2 * PI * index / segments
                vertices.append((center[0] + radii[0] * math.sin(phi) * math.cos(theta),
                                 center[1] + radii[1] * math.sin(phi) * math.sin(theta),
                                 center[2] + radii[2] * math.cos(phi)))
        bottom = len(vertices)
        vertices.append((center[0], center[1], center[2] - radii[2]))
        faces = [(0, 1 + index, 1 + (index + 1) % segments) for index in range(segments)]
        for ring in range(rings - 2):
            for index in range(segments):
                a = 1 + ring * segments + index
                b = 1 + ring * segments + (index + 1) % segments
                faces.append((a, a + segments, b + segments, b))
        last = 1 + (rings - 2) * segments
        faces.extend((last + index, bottom, last + (index + 1) % segments)
                     for index in range(segments))
        self.add(mat, vertices, faces, smooth=True)

    def lathe(self, mat, profile, segments=16, center=(0, 0, 0), caps=True):
        """Z-up open/hollow profiles; caller chooses rim and internal bowl shape."""
        vertices = [(center[0] + radius * math.cos(2 * PI * i / segments),
                     center[1] + radius * math.sin(2 * PI * i / segments), center[2] + height)
                    for radius, height in profile for i in range(segments)]
        faces = []
        for j in range(len(profile) - 1):
            for i in range(segments):
                a, b = j * segments + i, j * segments + (i + 1) % segments
                faces.append((a, b, b + segments, a + segments))
        if caps:
            faces.extend((tuple(reversed(range(segments))),
                          tuple(range((len(profile) - 1) * segments, len(profile) * segments))))
        self.add(mat, vertices, faces, smooth=[True] * (len(faces) - (2 if caps else 0))
                 + ([False, False] if caps else []))

    def loft(self, mat, rings, segments=12):
        """Organic ring sections (x,y,z,rx,ry), closed with two flat caps."""
        vertices = [(x + rx * math.cos(2 * PI * i / segments),
                     y + ry * math.sin(2 * PI * i / segments), z)
                    for x, y, z, rx, ry in rings for i in range(segments)]
        faces = [tuple(reversed(range(segments)))]
        for ring in range(len(rings) - 1):
            for i in range(segments):
                a = ring * segments + i
                b = ring * segments + (i + 1) % segments
                faces.append((a, b, b + segments, a + segments))
        faces.append(tuple(range((len(rings) - 1) * segments, len(rings) * segments)))
        self.add(mat, vertices, faces, smooth=[False] + [True] * (len(faces) - 2) + [False])


def palette():
    names = {
        "stone": ("Stone", (.66, .666, .627), 0, .82),
        "timber": ("Timber", (.475, .091, .056), 0, .43),
        "slate": ("Roof", (.12, .19, .20), .08, .31),
        "gold": ("Gold", (.67, .43, .12), .72, .32),
        "jade": ("Jade", (.14, .32, .27), .15, .35),
        "cream": ("Paper", (.74, .66, .49), 0, .88),
        "cloth": ("Cloth", (.42, .047, .035), 0, .83),
    }
    result = {key: BASE.material(name, color, metallic=metallic, roughness=roughness)
              for key, (name, color, metallic, roughness) in names.items()}
    result["shadow"] = result["slate"]
    return result


def parapet(geo, mats, width, depth, height, post_height=.77):
    """Upper tier galleries; all above the traversable original ground floor."""
    for sign in (-1, 1):
        for elevation in (height + .22, height + post_height):
            geo.box(mats["timber"], (0, sign * depth / 2, elevation), (width, .10, .11))
            geo.box(mats["timber"], (sign * width / 2, 0, elevation), (.10, depth, .11))
        for index in range(9):
            x = -width / 2 + width * index / 8
            geo.box(mats["timber"], (x, sign * depth / 2, height + .47), (.07, .08, .5))
        for index in range(7):
            y = -depth / 2 + depth * index / 6
            geo.box(mats["timber"], (sign * width / 2, y, height + .47), (.08, .07, .5))
    for x in (-width / 2, width / 2):
        for y in (-depth / 2, depth / 2):
            geo.box(mats["gold"], (x, y, height + post_height + .08), (.19, .19, .08))


def upper_room(geo, mats, width, depth, bottom, top):
    geo.box(mats["timber"], (0, 0, bottom), (width + .5, depth + .5, .19))
    for y in (-depth / 2, depth / 2):
        geo.box(mats["timber"], (0, y, top - .12), (width + .3, .2, .25))
        for x in (-width / 2, 0, width / 2):
            BASE.column(geo, mats, x, y, bottom, top - .2, .12)
        for x in (-width / 4, width / 4):
            BASE.lattice(geo, mats, x, y, (bottom + top) / 2, width / 2 - .25, top - bottom - .42)
    for x in (-width / 2, width / 2):
        geo.box(mats["timber"], (x, 0, top - .12), (.2, depth, .25))
        BASE.lattice(geo, mats, x, 0, (bottom + top) / 2, depth - .4, top - bottom - .42, side=True)
    parapet(geo, mats, width + .6, depth + .6, bottom)


def finial(geo, mats, bottom, height, radius):
    profile = [(radius * .8, 0), (radius, height * .08), (radius * .65, height * .15),
               (radius * .45, height * .3), (radius * .64, height * .41),
               (radius * .45, height * .52), (radius * .53, height * .62),
               (radius * .29, height * .76), (radius * .24, height * .87), (.008, height)]
    geo.lathe(mats["gold"], profile, 12, (0, 0, bottom))


def pagoda_roof(geo, mats, width, depth, ridge, drop):
    """Compact roof sampling retains five curved silhouettes under 25k tris."""
    geo.box(mats["timber"], (0, 0, ridge - drop - .015), (width * .77, depth * .77, .075))
    for hip in (False, True):
        for end in (-1, 1):
            columns, rows = (6, 4) if hip else (12, 6)
            vertices = [BASE.roof_point(-1 + 2 * i / columns, j / rows,
                                       width, depth, ridge, drop, hip, end)
                        for j in range(rows + 1) for i in range(columns + 1)]
            faces = []
            for j in range(rows):
                for i in range(columns):
                    a = j * (columns + 1) + i
                    face = (a, a + 1, a + columns + 2, a + columns + 1)
                    faces.append(tuple(reversed(face)) if ((not hip and end < 0) or (hip and end > 0)) else face)
            geo.add(mats["slate"], vertices, faces, smooth=True)
            # Alternating roof ribs, crisp gold eaves and a red fascia retain
            # readable layers without repeating the sanctuary's close-up mesh.
            for index in range(1, columns, 2):
                u = -1 + 2 * index / columns
                points = [BASE.roof_point(u, .03 + .97 * j / rows, width, depth, ridge, drop, hip, end)
                          for j in range(rows + 1)]
                geo.tube(mats["slate"], [(x, y, z + .018) for x, y, z in points], .024, 4)
            eave = [BASE.roof_point(-1 + 2 * index / 8, 1, width, depth, ridge, drop, hip, end)
                    for index in range(9)]
            geo.tube(mats["gold"], eave, .032, 5)
            geo.tube(mats["timber"], [(x, y, z - .10) for x, y, z in eave], .065, 5)
            if not hip:
                for corner in (-1, 1):
                    points = [BASE.roof_point(corner, index / 6, width, depth, ridge, drop, False, end)
                              for index in range(7)]
                    geo.tube(mats["gold"], [(x, y, z + .045) for x, y, z in points], .036, 4)
                    x, y, z = points[-1]
                    geo.tube(mats["gold"], [(x, y, z), (x + corner * .20, y + end * .17, z + .12),
                                            (x + corner * .30, y + end * .23, z + .35)], .045, 5)
    half_ridge = max(width * .5 - depth * .36, width * .16)
    geo.cylinder(mats["gold"], (-half_ridge, 0, ridge + .055), (half_ridge, 0, ridge + .055), .045, 6)


def pagoda_room(geo, mats, size, bottom, top, open_floor=False):
    """Perimeter structure; the ground-floor relic remains fully reachable."""
    for x in (-size / 2, size / 2):
        for y in (-size / 2, size / 2):
            geo.cylinder(mats["timber"], (x, y, bottom), (x, y, top), .12, 8)
            for elevation in (bottom + .10, top - .18):
                geo.cylinder(mats["gold"], (x, y, elevation), (x, y, elevation + .035), .13, 8)
            geo.box(mats["timber"], (x, y, top - .1), (.60, .15, .12))
            geo.box(mats["timber"], (x, y, top - .1), (.15, .60, .12))
        geo.box(mats["timber"], (x, 0, top), (.2, size + .2, .20))
    for y in (-size / 2, size / 2):
        geo.box(mats["timber"], (0, y, top), (size + .2, .2, .20))
    if not open_floor:
        geo.box(mats["timber"], (0, 0, bottom), (size + .5, size + .5, .14))
        for side in (-1, 1):
            BASE.lattice(geo, mats, 0, side * size / 2, (bottom + top) / 2,
                         size - .4, top - bottom - .35)
            BASE.lattice(geo, mats, side * size / 2, 0, (bottom + top) / 2,
                         size - .4, top - bottom - .35, side=True)
        parapet(geo, mats, size + .5, size + .5, bottom, .58)


def sanctuary(mats):
    geo = Geometry()
    for z, width, depth, thickness in ((.11, 11, 8.2, .22), (.30, 10.6, 7.8, .18),
                                      (.49, 10.2, 7.4, .20)):
        geo.box(mats["stone"], (0, 0, z), (width, depth, thickness))
    # Keep the original plinth height and column footprints exactly. No new
    # sculpture, doorway sill or rail blocks the walkable center of this floor.
    for x in (-4.5, 0, 4.5):
        for y in (-3.05, 3.05):
            if x == 0 and y < 0:
                continue
            BASE.column(geo, mats, x, y, .59, 3.95, .20)
    for x in (-4.5, 4.5):
        BASE.column(geo, mats, x, 0, .59, 3.95, .20)
        BASE.lattice(geo, mats, x, 1.5, 1.86, 2.4, 1.65, side=True)
    for x in (-2.25, 2.25):
        BASE.lattice(geo, mats, x, 3.1, 1.9, 3.7, 1.7)
    for y in (-3.05, 3.05):
        geo.box(mats["timber"], (0, y, 3.91), (9.6, .32, .3))
        geo.box(mats["gold"], (0, y, 3.78), (9.65, .34, .035))
    for x in (-4.5, 4.5):
        geo.box(mats["timber"], (x, 0, 3.91), (.32, 6.5, .3))
    for x in (-3.6, -2.4, -1.2, 1.2, 2.4, 3.6):
        BASE.bracket(geo, mats, x, -3.05, 3.73, .75)
    # Separate tier heights give the skyline a tall three-level silhouette.
    BASE.curved_roof(geo, mats, 13.4, 8.8, 5.52, 1.35, 25)
    geo.box(mats["timber"], (0, 0, 4.10), (10.2, 6.7, .12))
    for x in (-4.5, -3, -1.5, 0, 1.5, 3, 4.5):
        geo.box(mats["gold"], (x, 0, 4.033), (.025, 6.45, .018))
    for y in (-3, -1.5, 0, 1.5, 3):
        geo.box(mats["gold"], (0, y, 4.031), (9.75, .025, .018))
    upper_room(geo, mats, 6.6, 4.25, 5.42, 7.62)
    BASE.curved_roof(geo, mats, 9.5, 6.6, 8.73, 1.10, 21)
    geo.box(mats["timber"], (0, 0, 7.66), (7.1, 4.9, .1))
    upper_room(geo, mats, 3.8, 2.8, 8.63, 10.27)
    BASE.curved_roof(geo, mats, 6.25, 4.7, 11.17, .87, 16)
    geo.box(mats["timber"], (0, 0, 10.35), (4.5, 3.3, .1))
    finial(geo, mats, 11.26, 1.25, .22)
    # Golden geometric lotus sign, original motif, deliberately not script text.
    geo.box(mats["jade"], (0, -3.25, 3.77), (2.0, .13, .45))
    BASE.medallion(geo, mats, (0, -3.34, 3.77), .43)
    return geo


def pagoda(mats):
    geo = Geometry()
    for width, z, thickness in ((6.9, .12, .24), (6.5, .31, .14), (6.15, .49, .20)):
        geo.box(mats["stone"], (0, 0, z), (width, width, thickness))
    for level in range(5):
        bottom = .59 + level * 2.67
        size = 4.55 - level * .49
        top = bottom + 2.0
        pagoda_room(geo, mats, size, bottom, top, open_floor=level == 0)
        pagoda_roof(geo, mats, 7.8 - level * .68, 6.9 - level * .61, top + .91, .9 - level * .075)
    finial(geo, mats, 14.22, 1.65, .25)
    return geo


def market_stall(mats):
    geo = Geometry()
    # Open underside and recessed shelves frame wares rather than a solid cube.
    for x in (-1.38, 1.38):
        for y in (-.82, .82):
            geo.box(mats["timber"], (x, y, 1.1), (.095, .095, 2.2))
            geo.box(mats["gold"], (x, y, 1.98), (.11, .11, .065))
    for z in (.18, .91):
        geo.box(mats["timber"], (0, 0, z), (2.9, 1.65, .12))
    for x in (-1.24, -.62, 0, .62, 1.24):
        geo.box(mats["timber"], (x, .72, .52), (.065, .075, .62))
    geo.box(mats["cloth"], (0, -.83, .62), (2.8, .04, .55))
    # Draped canopy surface, raised central ridge, scalloped front valance.
    vertices, faces = [], []
    for j in range(7):
        y = -1.16 + 2.32 * j / 6
        for i in range(13):
            x = -1.6 + 3.2 * i / 12
            z = 2.18 + .34 * (1 - abs(y) / 1.16) - .045 * (1 - (x / 1.6) ** 2)
            vertices.append((x, y, z))
    for j in range(6):
        for i in range(12):
            a = j * 13 + i
            faces.append((a, a + 1, a + 14, a + 13))
    geo.add(mats["cloth"], vertices, faces, smooth=True)
    for edge in (-1, 1):
        geo.tube(mats["gold"], [(-1.6, edge * 1.16, 2.18), (0, edge * 1.16, 2.135),
                                (1.6, edge * 1.16, 2.18)], .018, 5)
        for i in range(10):
            x = -1.6 + 3.2 * i / 10
            geo.add(mats["cloth"], [(x, edge * 1.16, 2.18), (x + .32, edge * 1.16, 2.18),
                                    (x + .25, edge * 1.16, 2.02),
                                    (x + .16, edge * 1.16, 1.99),
                                    (x + .07, edge * 1.16, 2.02)],
                    [(0, 1, 2, 3, 4)] if edge < 0 else [(4, 3, 2, 1, 0)])
    for i, x in enumerate((-1.02, -.54, .03, .62, 1.05)):
        geo.lathe(mats["jade"] if i % 2 else mats["cream"],
                  [(.13, 0), (.19, .12), (.18, .25), (.09, .34), (.10, .39)], 8, (x, -.1, .98))
    geo.box(mats["timber"], (.8, .35, 1.08), (.62, .45, .19))
    for z in (1.18, 1.22, 1.26):
        geo.box(mats["cream"], (.8, .35, z), (.56, .4, .032))
    return geo


def stone_guardian(mats):
    geo = Geometry()
    geo.box(mats["stone"], (0, 0, .1), (1.12, 1.32, .2))
    geo.box(mats["stone"], (0, 0, .23), (1.0, 1.20, .12))
    # Continuous seated chest tapers into the neck; sculpted legs/paws establish
    # a recognizable guardian silhouette rather than separate stacked spheres.
    geo.loft(mats["stone"], [(0, .15, .29, .35, .40), (0, .17, .51, .38, .37),
                              (0, .11, .78, .31, .32), (0, .03, 1.02, .29, .26),
                              (0, -.03, 1.16, .30, .24)], 12)
    for sign in (-1, 1):
        geo.loft(mats["stone"], [(sign * .25, -.36, .28, .17, .26),
                                  (sign * .25, -.32, .41, .15, .21),
                                  (sign * .23, -.24, .77, .10, .12),
                                  (sign * .22, -.14, 1.0, .14, .16)], 8)
        geo.loft(mats["stone"], [(sign * .31, .21, .29, .18, .26),
                                  (sign * .30, .24, .46, .19, .23),
                                  (sign * .25, .21, .67, .15, .20)], 8)
        for toe in (-1, 0, 1):
            geo.tube(mats["jade"], [(sign * .25 + toe * .065, -.57, .33),
                                    (sign * .25 + toe * .065, -.46, .35)], .006, 4)
    # Broad cheek planes, angular muzzle, heavy brows and two pointed ears.
    geo.loft(mats["stone"], [(0, -.045, 1.00, .22, .20), (0, -.075, 1.12, .34, .29),
                              (0, -.10, 1.34, .36, .28), (0, -.07, 1.47, .25, .22)], 12)
    geo.box(mats["jade"], (0, -.352, 1.14), (.36, .065, .11))
    geo.loft(mats["stone"], [(0, -.29, 1.06, .19, .13), (0, -.32, 1.12, .23, .14)], 8)
    for sign in (-1, 1):
        geo.ellipsoid(mats["stone"], (sign * .11, -.31, 1.255), (.16, .13, .10), 8, 4)
        geo.ellipsoid(mats["jade"], (sign * .18, -.314, 1.365), (.052, .026, .036), 8, 4)
        geo.tube(mats["stone"], [(sign * .07, -.337, 1.39), (sign * .18, -.35, 1.42),
                                 (sign * .29, -.30, 1.405)], .035, 6)
        geo.add(mats["stone"], [(sign * .19, -.08, 1.40), (sign * .38, -.03, 1.55),
                                (sign * .34, .12, 1.39), (sign * .20, .07, 1.35)],
                [(0, 1, 2), (0, 2, 3), (0, 3, 1), (1, 3, 2)])
        geo.cylinder(mats["stone"], (sign * .12, -.355, 1.19),
                     (sign * .12, -.355, 1.125), .018, 5, .006)
    geo.ellipsoid(mats["jade"], (0, -.43, 1.285), (.09, .035, .047), 8, 4)
    # Ring of carved swept mane tufts, flattened sculptural wedges.
    for i in range(12):
        angle = 2 * PI * i / 12
        cx, cz = .34 * math.cos(angle), 1.25 + .35 * math.sin(angle)
        tip = (cx * 1.22, .10, cz + .055 * math.sin(angle))
        geo.add(mats["stone"], [(cx * .72, -.02, 1.25 + (cz - 1.25) * .72),
                                (cx - .075 * math.sin(angle), -.005, cz + .075 * math.cos(angle)),
                                tip, (cx + .075 * math.sin(angle), -.005, cz - .075 * math.cos(angle)),
                                (cx, .18, cz)],
                [(0, 1, 2), (0, 2, 3), (1, 4, 2), (2, 4, 3)])
    geo.tube(mats["stone"], [(0, .41, .43), (.27, .58, .49), (.39, .62, .70),
                             (.30, .59, .82), (.19, .54, .76)], .065, 7)
    return geo


def planter(mats):
    geo = Geometry()
    geo.lathe(mats["jade"], [(.29, 0), (.31, .07), (.29, .11), (.43, .18),
                             (.50, .55), (.55, .61), (.55, .69), (.49, .72),
                             (.46, .68), (.45, .57), (.40, .28)], 16)
    for height, radius in ((.105, .31), (.60, .525), (.69, .52)):
        geo.lathe(mats["gold"], [(radius, height), (radius + .008, height + .027)], 16, caps=False)
    geo.cylinder(mats["stone"], (0, 0, .55), (0, 0, .57), .447, 16)
    for i in range(8):
        angle = 2 * PI * i / 8
        geo.tube(mats["gold"], [(.45 * math.cos(angle - .06), .45 * math.sin(angle - .06), .26),
                                (.49 * math.cos(angle), .49 * math.sin(angle), .38),
                                (.50 * math.cos(angle + .06), .50 * math.sin(angle + .06), .50)], .012, 5)
    return geo


def balustrade(mats):
    geo = Geometry()
    for x in (-.91, .91):
        geo.box(mats["stone"], (x, 0, .09), (.18, .27, .18))
        geo.box(mats["timber"], (x, 0, .53), (.11, .14, .88))
        geo.box(mats["gold"], (x, 0, .97), (.18, .20, .07))
        geo.lathe(mats["gold"], [(.075, 0), (.085, .04), (.045, .08), (.008, .12)], 8, (x, 0, 1.0))
    for height in (.30, .88):
        geo.box(mats["timber"], (0, 0, height), (2, .11, .12))
        geo.box(mats["gold"], (0, -.061, height + .035), (1.85, .012, .018))
    for x in (-.62, -.31, 0, .31, .62):
        geo.box(mats["timber"], (x, 0, .59), (.045, .07, .51))
    # Raised square-cut fretwork in each alternate central opening.
    for x in (-.465, .155):
        for height in (.48, .70):
            geo.box(mats["gold"], (x, -.047, height), (.23, .025, .026))
        for dx in (-.115, .115):
            geo.box(mats["gold"], (x + dx, -.047, .59), (.026, .025, .23))
    return geo


def incense_burner(mats):
    geo = Geometry()
    for angle in (0, 2 * PI / 3, 4 * PI / 3):
        x, y = .32 * math.cos(angle), .32 * math.sin(angle)
        geo.cylinder(mats["gold"], (x * 1.2, y * 1.2, .025), (x, y, .38), .07, 8, .055)
    geo.lathe(mats["jade"], [(.20, .22), (.35, .30), (.48, .48), (.47, .65),
                             (.39, .78), (.41, .84), (.36, .88), (.31, .85)], 16)
    for height, radius in ((.35, .405), (.69, .45), (.83, .41)):
        geo.lathe(mats["gold"], [(radius, height), (radius + .012, height + .035)], 16, caps=False)
    # Pierced-looking lid has an open eight-spoke crown rather than flat cap.
    for i in range(8):
        angle = i * 2 * PI / 8
        geo.tube(mats["gold"], [(.39 * math.cos(angle), .39 * math.sin(angle), .89),
                                (.25 * math.cos(angle), .25 * math.sin(angle), 1.12),
                                (.08 * math.cos(angle), .08 * math.sin(angle), 1.20)], .035, 5)
    finial(geo, mats, 1.18, .30, .075)
    for sign in (-1, 1):
        geo.tube(mats["gold"], [(sign * .42, 0, .55), (sign * .67, 0, .67),
                                (sign * .68, 0, .93), (sign * .54, 0, 1.04),
                                (sign * .43, 0, .96)], .048, 6)
    for i in range(8):
        angle = i * PI / 4
        geo.ellipsoid(mats["gold"], (.47 * math.cos(angle), .47 * math.sin(angle), .55),
                      (.035, .035, .035), 6, 3)
    return geo


def accessor_values(gltf, binary, index):
    """Read our tightly packed or strided GLB accessors for serialized QA."""
    accessor = gltf["accessors"][index]
    view = gltf["bufferViews"][accessor["bufferView"]]
    dimensions = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[accessor["type"]]
    component_format = {5121: "B", 5123: "H", 5125: "I", 5126: "f"}[accessor["componentType"]]
    item_format = "<" + component_format * dimensions
    item_size = struct.calcsize(item_format)
    stride = view.get("byteStride", item_size)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return [struct.unpack_from(item_format, binary, start + item * stride)
            for item in range(accessor["count"])]


def export_asset(name, geo, budget):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    objects = geo.objects(name)
    all_vertices = [vertex.co for obj in objects for vertex in obj.data.vertices]
    minimum = [min(co[axis] for co in all_vertices) for axis in range(3)]
    maximum = [max(co[axis] for co in all_vertices) for axis in range(3)]
    triangles = 0
    for obj in objects:
        modifier = obj.modifiers.new("Explicit tangent triangulation", "TRIANGULATE")
        modifier.keep_custom_normals = True
        depsgraph = bpy.context.evaluated_depsgraph_get()
        evaluated = obj.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
        obj.modifiers.clear()
        obj.data = mesh
        # A hip roof starts at a single ridge point. Its rectangular sampling
        # grid contains collapsed apex triangles: remove those zero-area faces
        # before tangent calculation rather than exporting invalid geometry.
        edit_mesh = bmesh.new()
        edit_mesh.from_mesh(mesh)
        collapsed = [face for face in edit_mesh.faces if face.calc_area() <= 1e-10]
        if collapsed:
            bmesh.ops.delete(edit_mesh, geom=collapsed, context="FACES_ONLY")
            unused = [vertex for vertex in edit_mesh.verts if not vertex.link_faces]
            if unused:
                bmesh.ops.delete(edit_mesh, geom=unused, context="VERTS")
        edit_mesh.to_mesh(mesh)
        edit_mesh.free()
        mesh.update()
        assert not mesh.validate(clean_customdata=False), f"Invalid source mesh: {obj.name}"
        mesh.calc_tangents(uvmap="SurfaceMeters")
        assert all(math.isfinite(c) for v in mesh.vertices for c in v.co)
        assert all(math.isfinite(c) for loop in mesh.loops for c in (*loop.normal, *loop.tangent))
        assert all(math.isfinite(c) for uv in mesh.uv_layers.active.data for c in uv.uv)
        assert all(polygon.area > 1e-10 for polygon in mesh.polygons), f"Degenerate face: {obj.name}"
        triangles += len(mesh.polygons)
        obj.select_set(True)
    assert triangles <= budget, f"{name}: {triangles} > {budget} triangle budget"
    assert len(objects) <= 7
    bpy.context.view_layer.objects.active = objects[0]
    path = DESTINATION / f"{name}.glb"
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                             export_yup=True, export_apply=True, export_materials="EXPORT",
                             export_texcoords=True, export_normals=True, export_tangents=True,
                             export_cameras=False, export_lights=False)
    payload = path.read_bytes()
    length, kind = struct.unpack_from("<II", payload, 12)
    assert kind == 0x4E4F534A
    gltf = json.loads(payload[20:20 + length])
    binary_length, binary_kind = struct.unpack_from("<II", payload, 20 + length)
    assert binary_kind == 0x004E4942
    binary = payload[28 + length:28 + length + binary_length]
    assert not gltf.get("images"), "Runtime shared palette must own texture data"
    serialized_triangles = 0
    for mesh in gltf["meshes"]:
        for primitive in mesh["primitives"]:
            serialized_triangles += gltf["accessors"][primitive["indices"]]["count"] // 3
            assert {"POSITION", "NORMAL", "TANGENT", "TEXCOORD_0"} <= set(primitive["attributes"])
            attributes = {key: accessor_values(gltf, binary, value)
                          for key, value in primitive["attributes"].items()}
            assert all(math.isfinite(value) for items in attributes.values() for item in items for value in item)
            assert all(abs(sum(value * value for value in normal) - 1) < .01
                       for normal in attributes["NORMAL"]), "Serialized normals must be unit length"
            assert all(abs(sum(value * value for value in tangent[:3]) - 1) < .01
                       and abs(abs(tangent[3]) - 1) < .001
                       for tangent in attributes["TANGENT"]), "Serialized tangent basis invalid"
            positions = attributes["POSITION"]
            indices = [item[0] for item in accessor_values(gltf, binary, primitive["indices"])]
            for offset in range(0, len(indices), 3):
                a, b, c = (Vector(positions[indices[offset + i]]) for i in range(3))
                assert (b - a).cross(c - a).length > 1e-10, "Serialized degenerate triangle"
    assert serialized_triangles == triangles
    materials = [material["name"] for material in gltf["materials"]]
    assert set(materials) <= {"Stone", "Timber", "Roof", "Gold", "Jade", "Paper", "Cloth"}
    result = {"file": path.name, "triangles": triangles, "triangle_budget": budget,
              "material_surfaces": materials, "draw_call_materials": len(objects),
              "bounds_min_y_up_m": [round(minimum[0], 4), round(minimum[2], 4), round(-maximum[1], 4)],
              "bounds_max_y_up_m": [round(maximum[0], 4), round(maximum[2], 4), round(-minimum[1], 4)],
              "bytes": len(payload), "verified": "finite geometry/normals/tangents/UVs, positive-area triangles, serialized counts"}
    print("CELESTIAL_ASSET " + json.dumps(result, sort_keys=True))
    return result


def main():
    DESTINATION.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0
    mats = palette()
    generators = (("sanctuary", sanctuary, 45000), ("pagoda", pagoda, 25000),
                  ("market_stall", market_stall, 2000), ("stone_guardian", stone_guardian, 2000),
                  ("planter", planter, 2000), ("balustrade", balustrade, 2000),
                  ("incense_burner", incense_burner, 2000))
    assets = {name: export_asset(name, generator(mats), budget) for name, generator, budget in generators}
    manifest = {"generator": "tools/generate_celestial_assets.py", "generator_version": 1,
                "blender_version": bpy.app.version_string, "license": "MIT (original project geometry)",
                "source": "Original mathematical geometry; reference images used for composition only",
                "coordinate_system": "glTF Y-up, meters, centered base pivots; front is +Z",
                "collision": "World authors gameplay collision separately; no embedded physics",
                "textures": [], "palette": "Shared runtime Stone/Timber/Roof/Gold/Jade/Paper/Cloth; no embedded image copies",
                "sanctuary_floor_top_y_m": .59, "assets": assets}
    (DESTINATION / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
